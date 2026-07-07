# TODO #67 + hotfixes — v160 — session complete

Created: 2026-07-07 23:00
From: Claude Code
To: Stebbi and Codex
Status: Shipped. Two commits on main. Awaiting Supabase migration for saved places.

## Commits this session

### `2b33c79` — feat: saved route places, auth IP limit fix, hugmyndir nav (#67)

**Saved/recent places (Phase D) — code complete, migration pending:**
- `sql/69_weather_saved_places.sql` — migration file (see below)
- `lib/weather/savedPlaces.ts` — `SavedWeatherPlace` type, `makeWeatherPlaceKey`, `normalizeSavedPlaceInput`, `savedPlaceToRoutePlace`
- `app/api/teskeid/weather/saved-places/route.ts` — GET (12 most recent) + POST (upsert + 50-row cap, scoped by `user_id`, 500 on failure)
- `app/api/teskeid/weather/saved-places/[id]/route.ts` — DELETE with RLS
- `components/weather/PlaceSearch.tsx` — shows saved places (name + address) when input is empty; X to delete; optional props, existing callers unaffected
- `components/weather/RouteSelectionStep.tsx` — passes `savedPlaces` + `onDeleteSavedPlace` to both origin and destination `PlaceSearch`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — fetch on mount; save on place selection (best-effort, never blocks UX); optimistic delete with rollback on failure; ferry port clicks are NOT auto-saved
- `lib/__tests__/sql-saved-places.test.ts` — 16+ static SQL checks
- `lib/__tests__/weather-saved-places-api.test.ts` — GET/POST/DELETE auth, validation, write-failure (500), happy paths
- `messages/is.json` + `messages/en.json` — saved places + ferry i18n keys

**Auth hotfix — no SQL required, live immediately after deploy:**
- `lib/auth/ip-rate-limit.ts` — `getIpDailyLimit()` exported; reads `AUTH_CODE_IP_DAILY_LIMIT` env var; default 250, cap 5000, floors decimals, falls back on invalid values; replaces hardcoded `MAX_REQUESTS = 10`
- `lib/__tests__/ip-rate-limit.test.ts` — 7 new `getIpDailyLimit` unit tests; updated RPC args test

**Hugmyndir nav fix — live immediately after deploy:**
- `app/hugmyndir/[slug]/page.tsx` — adds `<PublicTopNav />`, removes centered `TeskeidLogo` block

### `765b8ef` — fix: make sql/69 trigger idempotent, note saved-places migration in TODO (#67)

- `sql/69_weather_saved_places.sql` — added `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER` so the migration is safe to rerun
- `lib/__tests__/sql-saved-places.test.ts` — asserts drop-before-create order; 18 tests total
- `TODO.md` — release note under #67: saved-places code is shipped, feature not live until `sql/69` is applied

## Current state

```
Tests       1855 passed | 27 skipped | 8 todo   (58 test files)
Type-check  clean
Build       not re-run this session; last Codex build (v156) was clean
```

## What is live after Vercel deploy

- Auth IP rate-limit raised from 10 → 250 (env-overridable via `AUTH_CODE_IP_DAILY_LIMIT`)
- Hugmyndir idea detail pages have sticky top nav, no logo
- Saved-places API routes exist and compile, but return 401 (no table yet)

## What requires Supabase migration before it works end-to-end

`sql/69_weather_saved_places.sql` must be applied once:

```sql
-- Run in Supabase SQL editor after review
-- Rollback: DROP TABLE IF EXISTS public.weather_saved_places;
```

Creates: `public.weather_saved_places` with RLS, user-scoped policies, lat/lon Iceland constraints, coordinate dedup key, `updated_at` trigger.

## Localhost checks for Stebbi

### Auth hotfix (no migration needed)
1. Open login flow and request code for several different emails from same network.
2. Expected: no `Prófaðu aftur kl. 00:00` after fewer than 250 attempts.

### Hugmyndir nav
1. Open `/hugmyndir/<any-slug>` while logged out.
2. Expected: sticky top nav at top; no centered Teskeið logo.
3. Click Hugmyndir → `/`, Ný hugmynd → `/senda-hugmynd`, Innskráning → `/innskraning`.

### Saved places (after `sql/69` is applied)
1. Log in with `vedrid` access, open `/auth-mvp/vedrid`.
2. Select origin and destination via PlaceSearch.
3. Return to route step, click into either field.
4. Expected: recently selected places appear under "Nýlegir staðir".
5. Click a saved place — selects without typing.
6. Click X next to a saved place — disappears immediately; gone after refresh.
7. Log in as second user — first user's places are not visible.
8. Select Vestmannaeyjar, pick ferry port — port NOT saved to recent places.

## Open items

- `sql/69_weather_saved_places.sql` — pending Stebbi approval to run
- `#68` — Public top nav after logout (separate issue, see TODO.md row 1)
- `#67` — Óæskilegur keyrslutími dags (next Ferðalagið feature)
