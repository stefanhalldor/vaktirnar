# Post-release: TODO #47, #48, #49/#50 — Loan edit fix, root redirect, Tengsl foundation

**Handoff:** Claude Code → Stebbi
**Date:** 2026-06-22
**TODOs closed:** #47, #48, #49, #50

---

## Hvað var gert

### TODO #47 — Loan edit save error fixed
SQL function `update_loan_with_diff` returned `TABLE (status text, ...)` and had an EXISTS subquery referencing `status` without a table alias. PostgreSQL raised `42702: column reference "status" is ambiguous`. Fixed with alias `li.status`.

**SQL written and run manually already:** `sql/48_update_loan_with_diff.sql` (run in a previous session).

### TODO #48 — Root redirect for authenticated users
Middleware now redirects authenticated users from `/` to `/auth-mvp/heim` when `AUTH_MVP_ENABLED=true`. Unauthenticated users still see the landing page.

### TODO #49/#50 — Tengsl foundation (passive data collection only)

The feature collects relationship data silently in the background when loans are created or invitations added. Per-user gating enforced at every layer. No UI is shown until `TENGSL_ENABLED=true` is set in env.

---

## Breyttar skrár

| Skrá | Hvað breyttist |
|------|----------------|
| `middleware.ts` | TENGSL_ENABLED kill for `/stillingar/tengsl`, `/stillingar/*` auth guard, `/` → `/auth-mvp/heim` redirect |
| `lib/loans/guard.ts` | `checkPerUserAccess()` DRY helper, `tengsl` branch in `checkFeatureAccess` |
| `lib/loans/actions.ts` | Calls `upsertLoanRelationship` after invitation sent in `createLoan` and `addLoanInvitation` |
| `lib/relationships/actions.ts` | **Ný skrá.** `upsertLoanRelationship`, `getRelationships`, `getRelationship` |
| `app/stillingar/tengsl/page.tsx` | **Ný skrá.** List page, guarded by `guardTeskeidSession` + `guardFeatureAccess('tengsl')` |
| `app/stillingar/tengsl/[id]/page.tsx` | **Ný skrá.** Detail page, verifies source loan access via `get_my_loans` before rendering links |
| `app/api/admin/feature-access/route.ts` | `?feature=` query param (allowlist: `umonnun`, `tengsl`), `GET` now takes `NextRequest` |
| `app/(admin)/admin/page.tsx` | `FeatureAccessSection` takes `featureKey/heading/flagName` props, rendered twice |
| `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx` | "Bæta við aðila" CTA when `showAddParty` is true |
| `messages/is.json` | `teskeid.stillingar.tengsl.*` keys |
| `messages/en.json` | `teskeid.stillingar.tengsl.*` keys |
| `.env.example` | `TENGSL_ENABLED=` and `# TENGSL_FLAG=true` added |
| `sql/53_feature_access_tengsl.sql` | **Ný skrá. EKKI keyrt.** Widens feature_access constraint to allow `tengsl`. |
| `sql/54_relationships.sql` | **Ný skrá. EKKI keyrt.** Creates `relationships`, `relationship_tags`, `relationship_sources`. |

**Tests (allt viðbætur, engar eyðileggingar):**

| Skrá | Hvað bætt við |
|------|---------------|
| `lib/__tests__/sql-migration.test.ts` | Tests for sql/53 and sql/54 (static) |
| `lib/__tests__/middleware.test.ts` | Tests for `/stillingar/tengsl` kill + auth guard, `/` redirect |
| `lib/__tests__/feature-access-api.test.ts` | Tests for `?feature=tengsl`, unknown feature → 400, updated GET to pass request |
| `lib/__tests__/admin-page.test.tsx` | Updated for two FeatureAccessSection (getAllByText), generic error message |
| `lib/__tests__/actions.test.ts` | Added `checkFeatureAccess: vi.fn().mockResolvedValue(false)` to guard mock |
| `lib/__tests__/loan-pages.test.tsx` | "Bæta við aðila" CTA tests (3 new tests) |

---

## Keyrðar skipanir og exit codes

```
npx vitest run
# 40 passed (40) | 1180 passed | 22 skipped | 8 todo (1210) | exit 0

npx tsc --noEmit
# exit 0 (clean)
```

---

## SQL var EKKI keyrt

`sql/53_feature_access_tengsl.sql` og `sql/54_relationships.sql` eru tilbúnar en **bíða eftir samþykki Stefáns** áður en þær eru keyrðar í Supabase.

---

## Localhost checks fyrir Stebbi

Þessar athuganir þarf að gera á localhost áður en gefið er út:

**TODO #47 (loan edit):**
- [ ] Opna lán sem skráður eigandi, breyta heiti/nótu, smella Vista — villan "Ekki tókst að vista" á ekki að koma

**TODO #48 (root redirect):**
- [ ] Skráðu þig inn, farðu á `/` — á að fara á `/auth-mvp/heim`
- [ ] Skráðu þig út, farðu á `/` — á að sjá lendingarsíðuna

**TODO #49/#50 Tengsl (eftir að sql/53 og sql/54 eru keyrð):**
- [ ] Settu `TENGSL_ENABLED=` (eða ekki true) — `/stillingar/tengsl` → `/`
- [ ] Settu `TENGSL_ENABLED=true`, farðu á `/stillingar/tengsl` án þess að vera skráður inn → `/innskraning`
- [ ] Skráðu þig inn, farðu á `/stillingar/tengsl` — tóm listi ("Engin tengsl")
- [ ] Búðu til nýtt lán með tölvupóstfangi → lánið vistast, engin villa (upsertLoanRelationship er no-op á meðan TENGSL_FLAG=true og notandi er ekki í feature_access)
- [ ] Admin síðan (`/admin`) sýnir bæði "Umönnun-aðgangur" og "Tengsl-aðgangur" kafla

---

## Supabase/RLS/grants — sql/53 og sql/54

**Þetta þarf Stebbi að keyra í Supabase SQL editor eftir samþykki:**

### sql/53_feature_access_tengsl.sql

- Víkkar CHECK constraint á `feature_access.feature_key` frá `('umonnun')` til `('umonnun', 'tengsl')`
- Engar breytingar á grantum, RLS, eða gögnum
- **Rollback:** Sjá athugasemdir efst í skránni

### sql/54_relationships.sql

- Búar til þrjár nýjar töflur: `relationships`, `relationship_tags`, `relationship_sources`
- **RLS:** Virkt á öllum þremur töflum
- **Grants:** Eingöngu `service_role` (REVOKE ALL frá PUBLIC/anon/authenticated)
- **Engar RLS policies:** `service_role` framhjákynnir RLS sjálfkrafa
- **Partial unique indexes** (ekki UNIQUE NULLS NOT DISTINCT) til að leyfa margar "private-only" tengslafærslur á sama eiganda
- **Trigger:** `teskeid_set_updated_at()` á `relationships.updated_at` (fall er þegar til frá sql/04)
- **Rollback:** Sjá athugasemdir efst í skránni (DROP TABLE CASCADE í réttri röð)

**Keyrsluröð:**
1. sql/53 fyrst (þarf að vera til áður en app code reynir að setja inn `tengsl` í `feature_access`)
2. sql/54 næst

**Eftir keyrslu:** Settu `TENGSL_ENABLED=true` í Vercel env og redeploy til að kveikja á feature.

---

## Env vars sem þarf að bæta við Vercel (ef/þegar kveikt á Tengsl)

```
TENGSL_ENABLED=true
# TENGSL_FLAG=true   ← setja BARA ef á að gating per-user (leyfir alla þegar óstillt)
```
