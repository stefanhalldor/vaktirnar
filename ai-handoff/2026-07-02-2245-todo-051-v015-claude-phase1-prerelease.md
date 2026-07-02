# TODO #51 - Claude Code v015 - Phase 1 pre-release handoff

Created: 2026-07-02 22:45
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Pre-release handoff til Stebba og Codex

Refs:
- ai-handoff/2026-07-02-2230-todo-051-v014-codex-v013-prerelease-review.md
- ai-handoff/2026-07-02-2221-todo-051-v013-claude-phase1-prerelease.md

---

## Hvad var lagad fra v013

Codex v014 fann thrjar villur. Allar thrjar eru lagadar.

### Blocker 1: `facebook-oauth` var ekki leyfdan feature key

`feature_access` taflan hafdi CHECK constraint sem leyfdi eingongu
`('umonnun', 'tengsl')`. Per-user gating fyrir `facebook-oauth` hefdi fallid
a DB-stiginu.

Lagfaering:
- `sql/66_feature_access_facebook_oauth.sql` (ny skra) - widening constraint
  til `('umonnun', 'tengsl', 'facebook-oauth')`.
- `app/api/admin/feature-access/route.ts` - `ALLOWED_FEATURES` uppfaert til
  ad innihalda `'facebook-oauth'`.

SQL migration hefur EKKI verid keyrð. Stebbi keyrir hana sjalfur eftir rýni.

### Blocker 2: Legacy guard test brast

`lib/__tests__/legacy-guard.test.ts` bjost vid 307 redirect fra `/auth/callback`
en `/auth/callback` var fjarlaegt ur `LEGACY_UI_PREFIXES` (reitt fix - callback
route er infrastructure, ekki legacy UI). Testin var uppfaert til ad stadfesta
ad `/auth/callback` sé EKKI blokkad.

### Blocker 3: Engin test fyrir facebook-oauth

Baett vid testum fyrir:
- `lib/__tests__/guard.test.ts` - 16 ny test i thremur describe blokkum:
  - `checkFeatureAccess — facebook-oauth (global kill-switch)` (4 test)
  - `checkFeatureAccess — facebook-oauth (per-user FLAG=true)` (5 test)
  - `guardFeatureAccess — facebook-oauth` (5 test, medh redirect verification)
- `lib/__tests__/teskeid-profile-route.test.ts` - 3 ny test:
  - `facebook_oauth_allowed: false` thegar FACEBOOK_OAUTH_ENABLED ekki sett
  - `facebook_oauth_allowed: true, facebook_connected: false` thegar enabled
    en engin Facebook identity
  - `facebook_connected: true` thegar enabled og Facebook identity til stadar

---

## Test nidustadur

```
npm run test:run
43 test files passed (43)
1399 passed | 22 skipped | 8 todo
0 failed

npm run type-check
tsc --noEmit passed (exit 0)
```

---

## Allar skrar sem eru breyttar (diff fra main)

### Framkvaemdaskrar (v013 + v015)

| Skra | Breytingar |
|------|-----------|
| `middleware.ts` | Fjarlaegt `/auth/callback` ur `LEGACY_UI_PREFIXES` |
| `app/auth/callback/route.ts` | `safeNext()` open redirect fix + Facebook fallback |
| `.env.example` | `FACEBOOK_OAUTH_ENABLED` og `FACEBOOK_OAUTH_FLAG` |
| `lib/loans/guard.ts` | `'facebook-oauth'` case i `checkFeatureAccess` |
| `app/api/teskeid/profile/route.ts` | GET skilar `facebook_oauth_allowed` og `facebook_connected` |
| `app/api/teskeid/profile/facebook/route.ts` | NY - POST unlink handler |
| `app/auth-mvp/minn-profill/page.tsx` | Facebook state, link/unlink handlers, Facebook section UI |
| `messages/is.json` | `teskeid.profile.facebook.*` strengir |
| `messages/en.json` | `teskeid.profile.facebook.*` strengir |
| `app/api/admin/feature-access/route.ts` | `ALLOWED_FEATURES` + `'facebook-oauth'` (v015) |

### Testaskrar (v015)

| Skra | Breytingar |
|------|-----------|
| `lib/__tests__/guard.test.ts` | 16 ny facebook-oauth test |
| `lib/__tests__/legacy-guard.test.ts` | `/auth/callback` test uppfaert |
| `lib/__tests__/teskeid-profile-route.test.ts` | 3 ny facebook field test |

### SQL migration (keyrð ekki)

| Skra | Innihald |
|------|---------|
| `sql/66_feature_access_facebook_oauth.sql` | Widening CHECK constraint - Stebbi keyrir |

### TODO.md

Inniheldur planleggingu fra tidlegri vinnu (v001-v010). Er hluti af dirty
worktree en er EKKI hluti af Phase 1 release scope. Er ekki i sama commit.

---

## Feature flag logik - per-user gating

Sama mynstur og `umonnun` og `tengsl`:

```
FACEBOOK_OAUTH_ENABLED=false (eda absent) -> allir loka (global kill-switch)
FACEBOOK_OAUTH_ENABLED=true, FACEBOOK_OAUTH_FLAG absent -> allir opnir
FACEBOOK_OAUTH_ENABLED=true, FACEBOOK_OAUTH_FLAG=true -> per-user via feature_access
```

Til ad nota per-user gating:
1. Keyra `sql/66_feature_access_facebook_oauth.sql` i Supabase.
2. Setja `FACEBOOK_OAUTH_FLAG=true` i `.env.local`.
3. Bata vid Stebbi netfang gegnum admin API:
   `POST /api/admin/feature-access?feature=facebook-oauth` med `{ "email": "..." }`.

---

## Hvad er eftir (utan scope Phase 1)

- Supabase Dashboard: kveikja `manual_linking_enabled` (Authentication > Sign In / Up > Linked Identities).
- Supabase Dashboard: Facebook provider (App ID + Secret).
- Facebook Developer App: stofna app, Facebook Login product, callback URL.
- Meta App Review: fyrir production live mode. Serstakt verkefni.
- Phase 2: `profiles.facebook_verified_at` dalkar + loan RPC badge. Bídur.

---

## Localhost checks for Stebbi

Forsendur:
1. `sql/66_feature_access_facebook_oauth.sql` hefur verid keyrð (ef per-user gating).
2. Supabase og Facebook stillingar eru tilbunar (sja v013 handoff).

Prófanir:

1. `FACEBOOK_OAUTH_ENABLED=true` i `.env.local`, server endurraesa.
2. Opna `/auth-mvp/minn-profill` - Facebook section a ad birtast.
3. Stadfesta "Ekki tengt vid Facebook" og "Tengja Facebook" takki.
4. Smella "Tengja Facebook" - takki a ad fara i "Tengist..." og breydd breytist ekki.
5. Klara OAuth sem Facebook test user - stadfesta return a minn-profill.
6. Stadfesta "Tengt vid Facebook" stada.
7. Refresh - stadfesta stadan helst.
8. Smella "Aftengja Facebook" - stadfesta "Ekki tengt".
9. Proba OAuth cancel - stadfesta villuskil a minn-profill, ekki `/login`.
10. Opna `/innskraning` - stadfesta engan Facebook valkost.
11. Proba OTP login - stadfesta ad thad virki enn.
12. Innskra sem notandi utan flag (ef per-user) - Facebook section a ekki ad birtast.
13. `POST /api/teskeid/profile/facebook` sem notandi utan flag - a ad skila 404.
14. Mobile 360, 390 og 460 px - enginn zoom, overlap eda overflow.

---

## Ahaetur og ovissa (obreytt fra v013)

- Feature flag er ekki hard Supabase block. Taeknilega faerinn notandi getur
  kallad `linkIdentity` beint. Flag stjornar UI, API response og server action.
- `manual_linking_enabled` i Supabase Dashboard - ostadfest hvort thad er
  thegar virkt i thessum project.
- Nakvam Supabase hegdun vid OAuth cancel - ostadfest. Callback route
  medalhandlar baedar leidir (missing code og exchange failure).
