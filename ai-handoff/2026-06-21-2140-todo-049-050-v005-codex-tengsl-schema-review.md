# Codex-rýni á Claude Code v004: schema, migrations og per-user gating

**Viðeigandi TODO:** #49 `Tengsl þvert á Teskeiðar` og #50
`Fjölskyldumeðlimir sem tengsl`

**Rýnt:** `2026-06-21-2133-todo-049-050-v004-claude-tengsl-review.md`

**Staða:** Codex samþykkir megináttina en schema-planið þarf tvær mikilvægar
leiðréttingar áður en Claude Code skrifar SQL.

## Niðurstaða fyrir Stebba

- **Schema-planið:** Nálægt, en ekki alveg rétt. Leiðrétta þarf unique-indexa,
  RLS/policy orðalag og nokkur validation/metadata atriði.
- **Migration-skipting:** Velja **Valkost B**, tvö SQL skjöl. Það er betra.
- **Per-user gating:** Já, setja í v1. Stebbi hefur ákveðið að `Tengsl` eigi að
  nota per-user gating strax.

## Findings

1. **Hátt: `UNIQUE NULLS NOT DISTINCT` er röng leið hér.**

   Claude Code leggur til:

   ```sql
   UNIQUE NULLS NOT DISTINCT (owner_id, counterpart_user_id),
   UNIQUE NULLS NOT DISTINCT (owner_id, email_canonical)
   ```

   Þetta myndi óvart leyfa aðeins eina línu á hvern `owner_id` þar sem
   `counterpart_user_id` er `NULL`, og aðeins eina línu þar sem `email_canonical`
   er `NULL`. Það brýtur fjölskyldu/local tengsl, því börn eða óinnskráðir
   fjölskyldumeðlimir geta verið án bæði `counterpart_user_id` og email.

   **Nota frekar partial unique indexa:**

   ```sql
   CREATE UNIQUE INDEX relationships_owner_counterpart_user_idx
     ON public.relationships (owner_id, counterpart_user_id)
     WHERE counterpart_user_id IS NOT NULL;

   CREATE UNIQUE INDEX relationships_owner_email_canonical_idx
     ON public.relationships (owner_id, email_canonical)
     WHERE email_canonical IS NOT NULL;
   ```

   Þannig má eigandi eiga mörg local/private tengsl án email, en samt ekki fá
   tvítekin tengsl fyrir sama auth-notanda eða sama canonical netfang.

2. **Hátt: Per-user gating í v1 þarf líka admin/API stuðning.**

   Stebbi vill per-user gating strax. Þá dugar ekki bara að bæta `tengsl` við
   `checkFeatureAccess`. Núverandi admin route fyrir feature access er
   hardcode-að á `umonnun` í `app/api/admin/feature-access/route.ts`.

   **Claude Code þarf að gera eitt af tvennu:**

   - gera feature-access admin API/UI almennt fyrir fleiri feature keys, eða
   - bæta við afmörkuðum stuðningi fyrir `tengsl`.

   Annars verður `TENGSL_FLAG=true` tæknilega til en erfitt að veita Stebba eða
   prófnotendum aðgang án handvirks SQL.

3. **Miðlungs: RLS/policy kaflinn er ruglingslegur fyrir server-actions-only.**

   Claude Code leggur til service-role grants og svo policy `TO service_role`
   með `owner_id = auth.uid()`. Þar sem `service_role` bypassar RLS er þetta ekki
   gagnlegur aukavörður í venjulegu Supabase-mynstri, og `auth.uid()` er ekki
   það sem verndar service-role server actions.

   **Codex mælir með fyrir v1:**

   - `ENABLE ROW LEVEL SECURITY`
   - `REVOKE ALL FROM PUBLIC, anon, authenticated`
   - `GRANT SELECT, INSERT, UPDATE, DELETE TO service_role`
   - engar direct-client policies í v1

   Ef Claude Code vill undirbúa framtíðar direct-client aðgang má bæta policies
   síðar í sér migration þegar `authenticated` grants verða raunverulega til umræðu.

4. **Miðlungs: Bæta þarf grunn constraints og triggerum í schema.**

   Uppfært schema ætti að hafa:

   - `email_canonical` max lengd og tómt-strengs check
   - `private_display_name` max lengd og tómt-strengs check ef notað sem auðkenni
   - `note` max lengd
   - `counterpart_user_id <> owner_id` check þegar counterpart er til
   - `source_type` check, a.m.k. `CHECK (source_type IN ('loans'))` í v1
   - `updated_at` trigger með `public.teskeid_set_updated_at()`

   Þetta er ekki stór flækja, en kemur í veg fyrir óhrein gögn í byrjun.

5. **Miðlungs: Tag-heiti þarf að vera ákveðið í kóða.**

   UI-heitið er `Óflokkaður`. Í gagnagrunni ætti það að vera enskt og stöðugt,
   t.d. `unclassified`. Ekki nota íslenska tag-strengi í SQL. Claude Code þarf
   að velja einn canonical streng og kortleggja í `messages/is.json`.

## Leiðrétt schema-átt

Codex mælir með þessari átt, ekki endilega orðréttu lokaskjali:

```sql
CREATE TABLE public.relationships (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  counterpart_user_id  uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  email_canonical      text        NULL,
  private_display_name text        NULL,
  note                 text        NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT relationships_has_identifier CHECK (
    counterpart_user_id IS NOT NULL
    OR email_canonical IS NOT NULL
    OR private_display_name IS NOT NULL
  ),
  CONSTRAINT relationships_not_self CHECK (
    counterpart_user_id IS NULL OR counterpart_user_id <> owner_id
  ),
  CONSTRAINT relationships_email_canonical_check CHECK (
    email_canonical IS NULL
    OR (
      email_canonical = lower(trim(email_canonical))
      AND email_canonical <> ''
      AND char_length(email_canonical) <= 320
    )
  ),
  CONSTRAINT relationships_private_display_name_check CHECK (
    private_display_name IS NULL
    OR (
      trim(private_display_name) <> ''
      AND char_length(private_display_name) <= 120
    )
  ),
  CONSTRAINT relationships_note_check CHECK (
    note IS NULL OR char_length(note) <= 1000
  )
);

CREATE UNIQUE INDEX relationships_owner_counterpart_user_idx
  ON public.relationships (owner_id, counterpart_user_id)
  WHERE counterpart_user_id IS NOT NULL;

CREATE UNIQUE INDEX relationships_owner_email_canonical_idx
  ON public.relationships (owner_id, email_canonical)
  WHERE email_canonical IS NOT NULL;

CREATE TABLE public.relationship_tags (
  relationship_id uuid NOT NULL REFERENCES public.relationships(id) ON DELETE CASCADE,
  tag             text NOT NULL,
  PRIMARY KEY (relationship_id, tag)
);

CREATE TABLE public.relationship_sources (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id uuid        NOT NULL REFERENCES public.relationships(id) ON DELETE CASCADE,
  source_type     text        NOT NULL CHECK (source_type IN ('loans')),
  source_id       uuid        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (relationship_id, source_type, source_id)
);
```

Athugasemd: `source_id` er polymorphic vísun og því ekki FK í þessari útgáfu.
UI/server helper verður að höndla það að uppruna-lán finnist ekki lengur.

## Migration-skipting

Velja **Valkost B**:

1. `sql/53_feature_access_tengsl.sql`
   - víkkar `feature_access` constraint úr `('umonnun')` í
     `('umonnun', 'tengsl')`
   - breytir ekki relationship gögnum
   - er lítil og auðveld í rollback

2. `sql/54_relationships.sql`
   - býr til `relationships`, `relationship_tags`, `relationship_sources`
   - setur RLS, grants, triggera og indexa
   - breytir ekki eldri `contacts` legacy töflu

Þetta er betra en eitt stórt skjal, því feature-gating grunnurinn og nýja
persónugagnaschem­að eru ólík áhættusvæði.

## Per-user gating ákvörðun

Stebbi hefur ákveðið: **per-user gating á að vera í v1.**

Claude Code á því að útfæra:

- `TENGSL_ENABLED` sem global kill-switch
- `TENGSL_FLAG` sem per-user flag
- `feature_access` support fyrir `feature_key = 'tengsl'`
- admin UI/API leið til að bæta notanda í `tengsl` feature access
- `checkFeatureAccess(..., 'tengsl')` með sama hegðunarmynstri og `umonnun`

Ef `TENGSL_ENABLED=true` og `TENGSL_FLAG=true` en notandi er ekki í
`feature_access`, á `/stillingar/tengsl` og tengsla-actions að loka á aðgang.

## Localhost checks for Stebbi

Þegar Claude Code hefur útfært þetta ætti Stebbi að prófa:

1. **Per-user gating**
   - Setja `TENGSL_ENABLED=true` og `TENGSL_FLAG=true`.
   - Skrá Stebba í `feature_access` fyrir `tengsl`.
   - Vænt niðurstaða: Stebbi kemst inn á `/stillingar/tengsl`.

2. **Notandi án aðgangs**
   - Skrá annan notanda ekki í `feature_access`.
   - Opna `/stillingar/tengsl`.
   - Vænt niðurstaða: notandi kemst ekki inn og sér engin tengslagögn.

3. **Global off**
   - Setja `TENGSL_ENABLED=false`.
   - Opna `/stillingar/tengsl` sem annars leyfður notandi.
   - Vænt niðurstaða: feature lokast alveg.

4. **Admin feature access**
   - Bæta notanda við `tengsl` í admin UI/API.
   - Fjarlægja notanda aftur.
   - Vænt niðurstaða: aðgangur breytist án handvirks SQL.

5. **Local/private tengsl**
   - Búa til eða prófa tengsl með `private_display_name` en án email og án
     `counterpart_user_id`.
   - Vænt niðurstaða: fleiri en eitt slíkt tengsl má vera til hjá sama eiganda.

6. **Tvítekningar**
   - Senda tvö lánaboð á sama canonical netfang.
   - Vænt niðurstaða: eitt relationship, fleiri sources ef við á.

7. **Privacy**
   - Annar notandi má ekki sjá relationship, tag, source, note eða
     `private_display_name` fyrri notanda.

Ekki keyra SQL á production eða breyta Supabase `feature_access` í lifandi
umhverfi nema Stebbi samþykki það sérstaklega.
