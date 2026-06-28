# Rýni Claude Code: v004 Codex-svar um tengsl

**Viðeigandi TODO:** #49 `Tengsl þvert á Teskeiðar` og #50
`Fjölskyldumeðlimir sem tengsl`

**Rýnt:** `2026-06-21-2128-todo-049-050-v004-codex-tengsl-review.md`

**Staða:** Claude Code staðfestir öll findings Codex með kóðagagnagöflun og
leggur til uppfært schema-plan og tvær lagfærðar spurningar um migration-skiptingu.
Schema-planið er tilbúið til samþykkis Stebba.

## Staðfesting á findings Codex

### 1. `contacts`-nafnaárekstur -- staðfest

`sql/01_schema.sql` lína 87: `CREATE TABLE contacts` er til í legacy-schema með
dálkunum `child_a_id`, `child_b_id`, `status`. RLS policies eru á henni
(línur 178, 209-215). Nafnið `contacts` er með öllum tökum uppteknið.

**Nafnið verður `relationships`, `relationship_tags`, `relationship_sources`.**

### 2. Feature-flag tvílaga mynstur -- staðfest

`lib/loans/guard.ts` sýnir nákvæmlega tvílaga mynstur:

- `lanad-og-skilad`: bara `LOANS_ENABLED` (allir innskráðir fá aðgang þegar
  flag er kveikt).
- `umonnun`: `UMONNUN_ENABLED` (global kill) + valkvæmt `UMONNUN_FLAG`
  (per-user DB-uppfletting í `feature_access`).
- `checkFeatureAccess` skilar `false` fyrir óþekktan `featureKey` (engin
  accidental allow-by-default).

Til að bæta `tengsl` við þarf:

- Nýr grein í `checkFeatureAccess`: `if (featureKey === 'tengsl') { ... }`
  með sama tvílaga logic og `umonnun`.
- `feature_access` constraint (`sql/52_feature_access.sql` lína 8):
  `CHECK (feature_key IN ('umonnun'))` þarf að víkka í
  `CHECK (feature_key IN ('umonnun', 'tengsl'))`.

### 3. Schema -- uppfært plan

Constraint-spurning Codex um fjölskyldumeðlimi er rétt. Uppfært schema:

```sql
-- sql/53_relationships.sql

CREATE TABLE public.relationships (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  counterpart_user_id   uuid        NULL     REFERENCES auth.users(id) ON DELETE SET NULL,
  email_canonical       text        NULL,
  private_display_name  text        NULL,
  note                  text        NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_has_identifier CHECK (
    counterpart_user_id IS NOT NULL
    OR email_canonical IS NOT NULL
    OR private_display_name IS NOT NULL
  ),
  UNIQUE NULLS NOT DISTINCT (owner_id, counterpart_user_id),
  UNIQUE NULLS NOT DISTINCT (owner_id, email_canonical)
);

CREATE TABLE public.relationship_tags (
  relationship_id  uuid  NOT NULL REFERENCES public.relationships(id) ON DELETE CASCADE,
  tag              text  NOT NULL,
  PRIMARY KEY (relationship_id, tag)
);

CREATE TABLE public.relationship_sources (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id  uuid        NOT NULL REFERENCES public.relationships(id) ON DELETE CASCADE,
  source_type      text        NOT NULL,  -- 'loans'
  source_id        uuid        NOT NULL,  -- loan_items.id
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (relationship_id, source_type, source_id)  -- idempotency
);
```

RLS og grants:

```sql
ALTER TABLE public.relationships        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_tags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_sources ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.relationships        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.relationship_tags    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.relationship_sources FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.relationships        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.relationship_tags    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.relationship_sources TO service_role;
```

Varnarundirbúningur RLS (aukavörður ef service_role er sniðgengið):

```sql
CREATE POLICY "relationships_owner"
  ON public.relationships FOR ALL TO service_role
  USING (owner_id = auth.uid());
```

### 4. Auto-vistun í bæði `createLoan` og `addLoanInvitation` -- samþykkt

Codex er rétt. `createLoan` sendir boð þegar `recipient_email` er til og fær
`invitation_id` til baka úr `create_loan` RPC. Bæði þurfa tengslavistun.

Tillaga að innra helper:

```ts
// lib/relationships/actions.ts (server-only)
async function upsertLoanRelationship(
  ownerUserId: string,
  emailCanonical: string,
  loanItemId: string,
): Promise<void>
```

Kölluð úr `createLoan` og `addLoanInvitation` eftir að invitation-samhengi er
til, en **á ekki að fella aðalflæðið ef hún mistekst** -- logga
`'[relationships] upsert failed'` (static string) og halda áfram.

### 5. Idempotency í `relationship_sources` -- staðfest

`UNIQUE (relationship_id, source_type, source_id)` í schema-planinu hér að ofan
gerir `ON CONFLICT DO NOTHING` öruggt. Sama lán getur aldrei búið til tvær
eins `relationship_sources` færslur fyrir sama tengsl.

### 6. Syntactically gilt en efnislega rangt netfang -- samþykkt

Codex er rétt. Zod kemur aðeins í veg fyrir syntactically ógild netföng. Rangt
en gilt netfang (t.d. `ariel.petursson@gmail.com`) getur búið til tengsl.

UI þarf í v1 að bjóða upp á að **fela eða eyða** auto-vistuðu tengsli. Þarf
ekki að vera flókið: einföld "Fela" / "Eyða" action á `/stillingar/tengsl/[id]`
dugar.

## Tvær spurningar um migration-skiptingu

v004 gefur til kynna allt í einum `sql/53_*.sql`. Claude Code veltir upp hvort
skipta eigi í tvo:

**Valkostur A -- eitt skjal:**
`sql/53_relationships.sql` inniheldur bæði `feature_access` constraint-víkkun
og nýjar relationship-töflur.

Kosti: einfaldara. Galli: ef `feature_access`-breytingin veldur vandræðum þarf
rollback á bæði.

**Valkostur B -- tvö skjöl:**
- `sql/53_feature_access_tengsl.sql`: víkkar constraint
- `sql/54_relationships.sql`: nýjar töflur

Kosti: hægt að keyra 53 og bíða með 54. Galli: fleiri migrations.

**Mæling Claude Code:** Valkostur B -- tvö skjöl. `feature_access`-constraint-
breytingin er minni og reversible á eigin forsendum. Relationship-töflurnar eru
stærra schema-skip. Ef Stebbi vill geta prófað `TENGSL_FLAG` per-user gating
áður en töflurnar eru tilbúnar er það auðveldara með aðskildar migrations.

## Rollback-röð (Valkostur B)

```
1. Slökkva TENGSL_ENABLED í env (strax, engin deployment þarf)
2. Redeploya app án tengsl-actions ef þær eru komnar út
3. DROP TABLE public.relationship_sources CASCADE;
   DROP TABLE public.relationship_tags CASCADE;
   DROP TABLE public.relationships CASCADE;
4. Þrengja constraint aftur:
   ALTER TABLE public.feature_access
     DROP CONSTRAINT feature_access_feature_key_check,
     ADD CONSTRAINT feature_access_feature_key_check
       CHECK (feature_key IN ('umonnun'));
```

## Þarf samþykki Stebba á eftirfarandi áður en SQL er skrifað

1. **Schema-planið** (hér að ofan) -- lítur rétt út?
2. **Migration-skipting:** Valkostur A (eitt skjal) eða B (tvö skjöl)?
3. **TENGSL_FLAG per-user gating í v1?** Ef Stebbi vill opna tengsl fyrir alla
   strax þegar TENGSL_ENABLED=true (eins og lán) er `TENGSL_FLAG` ekki
   nauðsynlegt í v1 og má bíða.

Þegar Stebbi hefur svarað þessum þremur atriðum er Claude Code tilbúinn til að
skrifa SQL og byrja á kóðaframkvæmd.
