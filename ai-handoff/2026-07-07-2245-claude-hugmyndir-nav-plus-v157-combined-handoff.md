# Hugmyndir nav fix + auth hotfix + Phase D tighten — combined prerelease handoff

Created: 2026-07-07 22:45
From: Claude Code
To: Stebbi and Codex
Status: Prerelease. Type-check clean. 58/58 test files pass (1855 tests). Not committed. Awaiting Stebbi permission to commit and push.

## Three work areas in this handoff

### 1. Hugmyndir nav fix (new, quick)

**File changed:** `app/hugmyndir/[slug]/page.tsx`

- Added `<PublicTopNav />` as the first visible element inside `<main>`, after `<PageViewTracker>`
- Removed the `TeskeidLogo` block (the `<div className="flex justify-center mb-8">` with two `<TeskeidLogo>` variants)
- Replaced `TeskeidLogo` import with `PublicTopNav` import

`PublicTopNav` was already used on `/`, `/senda-hugmynd`, and `/innskraning`. It is a sticky top bar with three links: Hugmyndir, Ný hugmynd, Innskráning. Added unconditionally (no user auth check on this page).

**Localhost check:** Open `http://localhost:3000/hugmyndir/<any-slug>`. Expected: sticky nav bar at top with Hugmyndir/Ný hugmynd/Innskráning links; no Teskeið logo below it.

### 2. Auth hotfix — IP rate-limit raised from 10 to env-configurable 250

**Files changed:**
- `lib/auth/ip-rate-limit.ts` — exported `getIpDailyLimit()`: reads `AUTH_CODE_IP_DAILY_LIMIT` env var; default 250; cap 5000; floors decimals; falls back to default on invalid/zero/negative
- `lib/__tests__/ip-rate-limit.test.ts` — 7 new `getIpDailyLimit` tests; updated "p_max_requests" test from 10 to 250; added env-override test

No SQL changes. After deploy, existing IP buckets with count 11-249 unblock automatically. To customize: set `AUTH_CODE_IP_DAILY_LIMIT` env var in Vercel.

### 3. Phase D tighten — all v156 Codex findings addressed

**Files changed:**
- `app/api/teskeid/weather/saved-places/route.ts` — POST returns `500 { error: 'save_failed' }` on insert/update failure; cap queries all have `.eq('user_id', user.id)`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — delete rollback: restores previous saved-places list on non-ok response or catch
- `components/weather/PlaceSearch.tsx` — saved-place rows now show name (primary) and formattedAddress (secondary smaller line)
- `lib/__tests__/sql-saved-places.test.ts` — update/delete RLS tests now assert `USING`/`WITH CHECK` in scoped policy blocks
- `lib/__tests__/weather-saved-places-api.test.ts` — added insert-failure (500) and update-failure (500) tests; fixed cap-query mock chains

## Test results

```
Test Files  58 passed (58)
Tests       1855 passed | 27 skipped | 8 todo (1890)
```

Type-check: clean (`npx tsc --noEmit` exits 0).

## All uncommitted changes

```
M  TODO.md
M  app/auth-mvp/vedrid/FerdalagidClient.tsx
M  app/hugmyndir/[slug]/page.tsx          ← new (hugmyndir nav fix)
M  components/weather/PlaceSearch.tsx
M  components/weather/RouteSelectionStep.tsx
M  lib/__tests__/ip-rate-limit.test.ts
M  lib/auth/ip-rate-limit.ts
M  messages/en.json
M  messages/is.json
?? app/api/teskeid/weather/saved-places/
?? lib/__tests__/sql-saved-places.test.ts
?? lib/__tests__/weather-saved-places-api.test.ts
?? lib/weather/savedPlaces.ts
?? sql/69_weather_saved_places.sql
```

## Migration reminder

`sql/69_weather_saved_places.sql` must be applied to Supabase before saved places work end-to-end. Stebbi applies migrations himself.

## Codex prerelease checklist

- [ ] `app/hugmyndir/[slug]/page.tsx`: `PublicTopNav` renders at top, no logo
- [ ] `getIpDailyLimit()` exported; default 250; cap 5000; env-overridable
- [ ] `checkIpRateLimit` passes `getIpDailyLimit()` to RPC (not hardcoded 10)
- [ ] POST `/api/teskeid/weather/saved-places` returns 500 on DB write failure
- [ ] Cap queries all have `.eq('user_id', user.id)`
- [ ] Delete rollback restores list on failure
- [ ] SQL tests verify scoped `USING`/`WITH CHECK` for update/delete policies
- [ ] Type-check passes
- [ ] All tests pass
