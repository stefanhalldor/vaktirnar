# TODO #45 -- Per-user feature access (feature_access tafla + admin UI)

**Agent:** Claude Code
**Fyrir:** Stebbi (localhost-prófun og samþykki fyrir commit)
**Dagsetning:** 2026-06-17
**Staða:** Framkvæmt, bíður localhost-prófunar
**Byggir á:** v002-codex-feature-access-review

## Hvað var gert

Allar kröfur Codex-yfirferðar (v002) eru uppfylltar.

### 1. `lib/auth/email-normalization.ts` (ný)

Shared helper `normalizeEmailForAccess(email)`:
- Trim + lowercase
- Gmail/googlemail.com: fjarlægir punkta úr local-part, canonical domain `gmail.com`
- Önnur lén: punktar óbreyttir
- Skilar `null` fyrir ógilt input

### 2. `sql/52_feature_access.sql` (ný -- EKKI keyrð)

```sql
CREATE TABLE IF NOT EXISTS public.feature_access (
  feature_key text NOT NULL,
  email       text NOT NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_key, email),
  CHECK (feature_key IN ('umonnun')),       -- Phase A: hardcoded
  CHECK (email = lower(trim(email)) AND email <> '')
);
```

- RLS enabled, engar policies
- `REVOKE ALL FROM PUBLIC, anon, authenticated`
- `GRANT SELECT, INSERT, DELETE TO service_role`

### 3. `lib/loans/guard.ts` -- `checkFeatureAccess` uppfært

Þrjú ástand fyrir umonnun:

| `UMONNUN_ENABLED` | `UMONNUN_FLAG` | Niðurstaða |
|---|---|---|
| ósett/false | hvað sem er | false |
| true | ósett/false | true (allir) |
| true | true | DB-lookup via feature_access |

- `_email` param endurnefnt `email` (notað núna)
- `getAdmin()` importað og kallað aðeins þegar FLAG=true
- Supabase `{ data, error }` pattern: ef `error`, skilar `false` og loggar generic villu án email
- Gmail canonicalization áður en DB-lookup

### 4. `app/api/admin/feature-access/route.ts` (ný)

API route með `createClient()` + `requireAdmin()` í hverju methodi:

- `GET` -- listar canonical email fyrir umonnun
- `POST` -- `{ email }` in body, canonicalizes, INSERT
- `DELETE` -- `{ email }` in body, canonicalizes, DELETE

Client getur EKKI sent arbitrary `feature_key` -- route hardcodes `'umonnun'`.

HTTP status:
- `400` ógilt/vantar email
- `401` óinnskráður
- `403` non-admin
- `200` duplicate grant (idempotent)
- `201` nýtt grant
- `500` DB-villa (engin detail til client)

### 5. `app/(admin)/admin/page.tsx` -- `FeatureAccessSection` bætt við

Nýr component fyrir ofan neðri `/admin` lokunartag:
- Sækir lista við mount
- Input + "Gefa aðgang" button
- "Fjarlægja" við hliðina á hverju email
- `useTransition` fyrir pending state
- Sýnir canonical email í lista
- Staðfestingarmeddelelse eftir grant

### 6. Prófanir

**`lib/__tests__/email-normalization.test.ts`** (ný) -- 13 próf:
- Gmail punkta-canonicalization
- googlemail.com → gmail.com
- Önnur lén: punktar óbreyttir
- Null-tilfelli: tómt, engin @, vantar local/domain, domain án punkts, whitespace

**`lib/__tests__/guard.test.ts`** -- umonnun-blokkur skipt í tvennt:
- `checkFeatureAccess — umonnun (global kill-switch)` -- 4 próf (ENABLED=false/unset, FLAG unset/false)
- `checkFeatureAccess — umonnun (per-user FLAG=true)` -- 5 próf (row finnst, row vantar, DB error, ógilt email, Gmail dots)
- `guardFeatureAccess — umonnun` -- 5 próf (ENABLED false, FLAG=true án row, FLAG=true með row)
- Mock á `getAdmin()` bætt við (v.hoisted)

**`lib/__tests__/sql-migration.test.ts`** -- 8 ný static próf fyrir sql/52:
- BEGIN/COMMIT, CREATE TABLE IF NOT EXISTS, RLS enabled
- feature_key CHECK IN ('umonnun'), PRIMARY KEY (feature_key, email)
- REVOKE ALL FROM PUBLIC/anon/authenticated, GRANT service_role only
- Engar CREATE POLICY

**`lib/__tests__/feature-access-api.test.ts`** (ný) -- 13 próf:
- GET: 401 óinnskráður, 403 non-admin, 200 admin
- POST: 401/403 auth, 400 vantar/ógilt email, 201 valid, 200 duplicate, arbitrary feature_key hundsað
- DELETE: 401/403 auth, 400 ógilt email, 200 success

**`lib/__tests__/admin-page.test.tsx`** -- 3 ný próf:
- Umönnun-aðgangur heading birtist
- Empty state "Enginn í lista." birtist
- "Gefa aðgang" takki birtist

## Niðurstöður prófa og type-check

```
npm run type-check        → exit 0
npm run test:run          → 40 test files, 1134 passed, 22 skipped, 0 failed
```

## Breyttar/nýjar skrár

Nýtt:
- `lib/auth/email-normalization.ts`
- `sql/52_feature_access.sql` (EKKI keyrt)
- `app/api/admin/feature-access/route.ts`
- `lib/__tests__/email-normalization.test.ts`
- `lib/__tests__/feature-access-api.test.ts`

Breytt:
- `lib/loans/guard.ts`
- `app/(admin)/admin/page.tsx`
- `lib/__tests__/guard.test.ts`
- `lib/__tests__/sql-migration.test.ts`
- `lib/__tests__/admin-page.test.tsx`
- `TODO.md` (#45 bætt við)
- `.env.example` (UMONNUN_FLAG skýring)

## Localhost checks fyrir Stebbi

Stebbi keyrir dev server sjálfur. SQL migration er EKKI keyrð.

### Setup

Hafa í `.env.local`:
```
UMONNUN_ENABLED=true
```

Til að prófa per-user farveg:
```
UMONNUN_FLAG=true
```

Til að prófa "opið öllum" (án migration):
```
# UMONNUN_FLAG ósett eða false
```

### Test 0 -- UMONNUN_FLAG ósett: allir sjá Umönnun

1. Hafa `UMONNUN_ENABLED=true`, `UMONNUN_FLAG` ósett
2. Innskrá og fara á `/heim`

Vaent: Umönnun birtist eins og áður. Engin DB-villa.

### Test 1 -- /admin sýnir Umönnun-aðgang hlutann

1. Fara á `/admin`
2. Skruna niður

Vaent: "Umönnun-aðgangur" fyrirsögn, "Enginn í lista.", email input og "Gefa aðgang" takki.

### Test 2 -- Gefa aðgang

1. Setja `UMONNUN_FLAG=true` og keyra `sql/52_feature_access.sql` á local Supabase
2. Fara á `/admin`
3. Slá inn netfang og smella "Gefa aðgang"

Vaent: Canonical email birtist í lista. "Aðgangur veittur: ..." sýnist.

### Test 3 -- Notandi með aðgang sér Umönnun

1. Skrá inn sem sá notandi
2. Fara á `/heim`

Vaent: Umönnun birtist.

### Test 4 -- Notandi án aðgangs sér ekki Umönnun

1. Skrá inn sem annar notandi (ekki í feature_access)
2. Fara á `/heim` og reyna `/auth-mvp/umonnun` beint

Vaent: Umönnun birtist ekki. Beint á `/auth-mvp/umonnun` redirectar á `/`.

### Test 5 -- Gmail punktar

1. Admin bætir við `nafn.punktur@gmail.com`
2. Canonical form `nafnpunktur@gmail.com` birtist í lista
3. Notandi með `nafnpunktur@gmail.com` login sér Umönnun

Vaent: Báðar útgáfur fá sama aðgang.

### Test 6 -- Fjarlægja aðgang

1. Smella "Fjarlægja" á email í lista
2. Notandi refreshar `/heim`

Vaent: Umönnun hverfur. Beint á `/auth-mvp/umonnun` redirectar á `/`.

### Test 7 -- Non-admin API villa

1. Opna DevTools, kalla `fetch('/api/admin/feature-access')` sem venjulegur notandi
   (á slóð sem er ekki `/admin`)

Vaent: `401` eða redirect til innskráningar.

### Hvað á ekki að prófa kæruleysislega

- Ekki keyra `sql/52_feature_access.sql` á production án sérstakrar leyfisbeiðni
- Ekki setja `UMONNUN_FLAG=true` í production áður en migration er keyrð
- Ekki birta raunveruleg netföng í handoff, logs eða test output

## Áhættumat

**Heildaráhætta: Lág.**

- DB-call aðeins þegar `UMONNUN_FLAG=true` (flestir munu byrja með það ósett)
- DB-villa → `false` (fail-closed), ekki crash
- `requireAdmin()` í hverju methodi (ekki bara layout)
- `feature_key` hardcoded, client getur ekki injected annað
- Email canonicalized áður en DB INSERT/SELECT/DELETE

## Tillaga að næsta skrefi

1. Stebbi staðfestir UI á `/admin` (Test 1) án migration
2. Stebbi keyrir `sql/52_feature_access.sql` á local Supabase ef hann vill prófa full virkni (Test 2-7)
3. Ef allt er gott: commit og deploy
4. Setja `UMONNUN_FLAG=true` í Vercel ENV EFTIR migration á production
