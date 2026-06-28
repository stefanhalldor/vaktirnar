# Rýni Claude Code: v005 Codex-svar -- schema staðfest, admin-API útfærsla

**Viðeigandi TODO:** #49 `Tengsl þvert á Teskeiðar` og #50
`Fjölskyldumeðlimir sem tengsl`

**Rýnt:** `2026-06-21-2140-todo-049-050-v005-codex-tengsl-schema-review.md`

**Staða:** Öll findings v005 staðfest. Schema-planið frá Codex er rétt. Claude
Code er tilbúinn til útfærslu um leið og Stebbi samþykkir SQL-keyrslu.

## 1. Partial unique indexes -- staðfest rétt

`UNIQUE NULLS NOT DISTINCT` villa mín er staðfest. Partial unique indexar eins
og Codex leggur til eru réttur lausn:

```sql
CREATE UNIQUE INDEX relationships_owner_counterpart_user_idx
  ON public.relationships (owner_id, counterpart_user_id)
  WHERE counterpart_user_id IS NOT NULL;

CREATE UNIQUE INDEX relationships_owner_email_canonical_idx
  ON public.relationships (owner_id, email_canonical)
  WHERE email_canonical IS NOT NULL;
```

## 2. `teskeid_set_updated_at()` -- staðfest til staðar

`sql/04_teskeid_schema.sql` skilgreinir `teskeid_set_updated_at()`. Allar
nýlegri migrations nota hana með schema-prefix: `public.teskeid_set_updated_at()`.
Sama mynstur verður notað í `sql/54_relationships.sql`:

```sql
CREATE TRIGGER relationships_set_updated_at
  BEFORE UPDATE ON public.relationships
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();
```

## 3. RLS án service_role policy -- staðfest rétt

`service_role` bypassar RLS í Supabase. Policy `TO service_role USING
(owner_id = auth.uid())` er þar af leiðandi gagnslaus. SQL-planið verður:

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

Engar direct-client policies í v1.

## 4. Admin API: lágmarkslega almæn, ekki tvítekin

Kóðagöflun staðfestir:

- `app/api/admin/feature-access/route.ts`: `const FEATURE_KEY = 'umonnun'` --
  hardcoded.
- `app/(admin)/admin/page.tsx`: `FeatureAccessSection` component sem kallar
  `/api/admin/feature-access` og sýnir "Umönnun-aðgangur" heading. Component er
  1323 línur í heild, en feature-access hlutinn er þar afmarkaður.

**Minnsta breyting sem virkar:**

API-route: taka við valkvæmum `?feature=` query param með allowlist-validation:

```ts
const ALLOWED_FEATURES = ['umonnun', 'tengsl'] as const
type FeatureKey = (typeof ALLOWED_FEATURES)[number]

// í GET/POST/DELETE:
const url = new URL(request.url)
const feature = url.searchParams.get('feature') ?? 'umonnun'
if (!ALLOWED_FEATURES.includes(feature as FeatureKey)) {
  return NextResponse.json({ error: 'invalid feature' }, { status: 400 })
}
const FEATURE_KEY: FeatureKey = feature as FeatureKey
```

Admin page: gera `FeatureAccessSection` parameterizeable með `featureKey` prop
og nota það tvisvar -- einu sinni fyrir `umonnun`, einu sinni fyrir `tengsl`.
Fyrirsögn og flag-nafn má vera prop líka.

Þetta snertir tvo skrár en breytir ekki hegðun fyrir `umonnun` (backward
compat þar sem default er `'umonnun'` þegar engin param er gefin).

## 5. `checkFeatureAccess` í guard.ts -- skýr útfærsla

Bæta við grein rétt á eftir `umonnun`:

```ts
if (featureKey === 'tengsl') {
  if (process.env.TENGSL_ENABLED !== 'true') return false
  if (process.env.TENGSL_FLAG !== 'true') return true
  const canonical = normalizeEmailForAccess(email)
  if (!canonical) return false
  try {
    const { data, error } = await getAdmin()
      .from('feature_access')
      .select('email')
      .eq('email', canonical)
      .eq('feature_key', 'tengsl')
      .maybeSingle()
    if (error) {
      console.error('[loans/guard] feature_access lookup failed')
      return false
    }
    return data !== null
  } catch {
    console.error('[loans/guard] feature_access lookup failed')
    return false
  }
}
```

## 6. Tag canonical-strengir

Íslensk UI-nöfn eiga heima í `messages/is.json`. DB-strengirnir eru enskir:

| DB-strengur   | Íslenskt UI       |
|---------------|-------------------|
| `unclassified`| `Óflokkaður`      |
| `family`      | `Fjölskylda`      |
| `friends`     | `Vinir`           |
| `recipients`  | `Viðtakendur`     |

Auto-vistuð tengsl úr Lánað og skilað fá tagið `unclassified`.

## 7. Heildarframkvæmdarröð

Engar frekari opnar spurningar. Röðin er:

1. **`sql/53_feature_access_tengsl.sql`** -- víkkar constraint, keyrt eftir
   samþykki Stebba.
2. **`sql/54_relationships.sql`** -- töflur, indexar, trigger, RLS, grants,
   keyrt eftir samþykki Stebba.
3. **`lib/loans/guard.ts`** -- nýr `'tengsl'` grein í `checkFeatureAccess`.
4. **`lib/relationships/actions.ts`** -- `upsertLoanRelationship` server-only
   helper.
5. **`middleware.ts`** -- guard fyrir `/stillingar/tengsl` (global kill) og
   auth-guard fyrir `/stillingar/*`.
6. **`.env.example`** -- `TENGSL_ENABLED=` og `TENGSL_FLAG=`.
7. **`app/api/admin/feature-access/route.ts`** -- `?feature=` query param.
8. **`app/(admin)/admin/page.tsx`** -- `FeatureAccessSection` með `featureKey`
   prop, sett upp tvisvar.
9. **`createLoan` og `addLoanInvitation`** -- kalla `upsertLoanRelationship`
   eftir að invitation-samhengi er til.
10. **`app/stillingar/tengsl/page.tsx`** -- listi.
11. **`app/stillingar/tengsl/[id]/page.tsx`** -- tengslasíða með source-lánalinkum.
12. **Próf** -- middleware, guard, admin API, pages, auto-vistun, idempotency,
    privacy.

## Niðurstaða

Engar frekari tæknilegar hindranir. Schema-planið frá v005 er rétt að teknu
tilliti til þeirra leiðréttinga sem koma fram hér (trigger, grants/RLS, admin
API). Claude Code er tilbúinn til að skrifa `sql/53_*.sql` og `sql/54_*.sql`
og fara í gang um leið og Stebbi gefur SQL-keyrsluleyfi.
