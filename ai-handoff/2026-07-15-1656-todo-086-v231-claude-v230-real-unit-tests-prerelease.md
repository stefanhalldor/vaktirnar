# v231 Claude prerelease handoff: real unit tests for getWeatherEnabledMode + resolveWeatherBaseAccess

Created: 2026-07-15 17:00
Timezone: Atlantic/Reykjavik
Relevant TODO: todo-086
Previous handoff: 2026-07-15-1650-todo-086-v230-codex-v229-docs-contract-review.md

## Status

v231 implemented. 84 test files, 2558 tests pass (+5 vs v229). TypeCheck clean. Nothing staged, committed, pushed, or deployed.

## What was done

### 1. Converted static contract tests to real unit tests in `lib/__tests__/weather-public.test.ts`

**File-level comment** (top): Updated section B description from "WEATHER_PUBLIC_ENABLED behaviour" to "hashWeatherIp — distinct from auth hashes", and added new sections D, E, F to the coverage list.

**Section D — `getWeatherEnabledMode` (6 real tests):**
- `WEATHER_ENABLED=All` → `'all'`
- `WEATHER_ENABLED=Authenticated` → `'authenticated'`
- missing `WEATHER_ENABLED` → `'off'`
- unknown value → `'off'`
- legacy: `WEATHER_ENABLED=true` + `WEATHER_PUBLIC_ENABLED=true` → `'all'`
- legacy: `WEATHER_ENABLED=true` without PUBLIC → `'authenticated'`

Each test uses `saveEnv` to restore env state in afterEach.

**Section E — `resolveWeatherBaseAccess` (6 real tests):**
- signed-out + All → `public` (userId: null)
- signed-out + Authenticated → `blocked`
- signed-in without vedrid + Authenticated → `authenticated`
- signed-in without vedrid + All → `public` (userId: null)
- signed-in with vedrid + All → `authenticated`
- any user + off → `blocked`

Added `mockCheckFeatureAccess` hoisted mock and `vi.mock('@/lib/loans/guard', ...)` so `resolveWeatherBaseAccess` can be called without Supabase.

**Section F — rate limit contract** (3 tests): Kept as static documentation but updated comments to note the behavior is now also covered by the resolveWeatherBaseAccess suite.

### 2. Updated Veðurstofan provider travel test in `lib/__tests__/weather-travel-api.test.ts`

Test `includes vedurstofanLayer for signed-in public-tier user with weather-provider-vedurstofan access`:
- Was: `process.env.WEATHER_PUBLIC_ENABLED = 'true'` (legacy fallback)
- Now: `process.env.WEATHER_ENABLED = 'All'` (explicit primary contract)
- Renamed: added "(WEATHER_ENABLED=All)" to title

## What was NOT changed

- No route/implementation files touched
- No SQL migrations
- Saved-places guards not refactored

## Files modified in v231

- `lib/__tests__/weather-public.test.ts`
- `lib/__tests__/weather-travel-api.test.ts`

## Full release slice (v226 + v227 + v228 + v229 + v231) — exact files to stage

```
?? lib/weather/weatherBaseAccess.server.ts      (new — must git add)
?? lib/weather/weatherEnabledMode.server.ts     (new — must git add)
 M app/api/teskeid/weather/saved-places/[id]/route.ts
 M app/api/teskeid/weather/saved-places/route.ts
 M lib/__tests__/home-page.test.tsx
 M lib/__tests__/place-search-api.test.ts
 M lib/__tests__/weather-public.test.ts
 M lib/__tests__/weather-routes-api.test.ts
 M lib/__tests__/weather-saved-places-api.test.ts
 M lib/__tests__/weather-travel-api.test.ts
 M lib/__tests__/weather-vedurstofan-projector.test.ts
 M lib/__tests__/weather-vedurstofan-warmer.test.ts
```

Do NOT stage other modified files in the worktree — they belong to earlier or unrelated work.

## Localhost checks (unchanged from v226/v227)

```env
WEATHER_ENABLED=Authenticated
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
```

1. Signed out: `/vedrid` not available, public APIs blocked.
2. Signed in without vedrid (`stebbishj@gmail.com`): Veðrið card visible, `/auth-mvp/vedrid` opens, base MET/Yr works, Veðurstofan hidden.
3. Signed in with `weather-provider-vedurstofan` (`teskeid@gottvibe.is`): Veðurstofan shows.

Then switch to `WEATHER_ENABLED=All` and verify public + authenticated paths.
