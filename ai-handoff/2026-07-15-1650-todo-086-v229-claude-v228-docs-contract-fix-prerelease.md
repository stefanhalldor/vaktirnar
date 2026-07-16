# v229 Claude prerelease handoff: v228 doc/contract fixes done

Created: 2026-07-15 16:50
Timezone: Atlantic/Reykjavik
Relevant TODO: todo-086
Previous handoff: 2026-07-15-1607-todo-086-v228-codex-v227-authenticated-mode-review.md

## Status

v228 follow-up implemented. 84 test files, 2553 tests pass (9 new vs v227). TypeCheck clean. Nothing staged, committed, pushed, or deployed.

## What was done

### 1. Fixed stale JSDoc comments in `lib/weather/weatherBaseAccess.server.ts`

`resolveWeatherBaseAccess` — updated bullet list:
- Removed stale "Authenticated: signed-in user without vedrid → blocked"
- Added correct: "Signed-in user without vedrid, WEATHER_ENABLED=Authenticated → authenticated"
- Added: "Signed-out user, WEATHER_ENABLED=Authenticated → blocked"
- Clarified All mode semantics (public, userId: null)

`resolveAuthenticatedWeatherShellAccess` — fixed two stale bullets:
- `authenticated-public`: now correctly says "WEATHER_ENABLED=All or Authenticated, user has no vedrid"
- `blocked`: now correctly says "WEATHER_ENABLED=off, or user is signed out" (not "Authenticated without vedrid")

### 2. Updated `lib/__tests__/weather-public.test.ts`

**Section C** (guest saved-places contract): Updated to say `WEATHER_ENABLED=All` is the primary flag for guest access (not `WEATHER_PUBLIC_ENABLED`); noted legacy fallback.

**Section D** (was "public weather flag contract"): Split into three clear sections:

- `WEATHER_ENABLED mode contract (primary)` — 5 new static tests documenting:
  - `All` → public access for guests
  - `Authenticated` → all signed-in users (no vedrid needed)
  - `Authenticated` → blocks guests
  - vedrid not required for base weather
  - Veðurstofan separately gated

- `weather flag legacy fallback contract` — 2 tests documenting that `WEATHER_ENABLED=true` + `WEATHER_PUBLIC_ENABLED=true` maps to `all`, and `WEATHER_ENABLED=true` alone maps to `authenticated`

- `weather rate limit contract` — 3 tests: routes-only rate limit (unchanged), plus explicit tests for "All mode public users are rate-limited" vs "Authenticated mode bypasses rate limit"

### 3. Updated `lib/__tests__/home-page.test.tsx`

Added 2 explicit tests with new-style env values:
- `WEATHER_ENABLED=All`: signed-in without vedrid sees Veðrið card
- `WEATHER_ENABLED=Authenticated`: signed-in without vedrid sees Veðrið card

Renamed existing legacy test to "legacy fallback for All mode: ...".

### 4. Renamed legacy tests in `lib/__tests__/weather-travel-api.test.ts`

Two tests that use `WEATHER_ENABLED=true + WEATHER_PUBLIC_ENABLED=true` renamed with "legacy fallback for All mode:" prefix so they are clearly not the primary contract.

## What was NOT changed

- Saved-places guards were not refactored (per Codex recommendation)
- No SQL migrations
- No other routes or components touched

## Files modified in v228

Comments/docs:
- `lib/weather/weatherBaseAccess.server.ts`

Tests:
- `lib/__tests__/weather-public.test.ts`
- `lib/__tests__/home-page.test.tsx`
- `lib/__tests__/weather-travel-api.test.ts`

## Full release slice (v226 + v227 + v228) — files to stage

```
app/api/teskeid/weather/saved-places/[id]/route.ts    (M)
app/api/teskeid/weather/saved-places/route.ts         (M)
lib/weather/weatherBaseAccess.server.ts               (?? — new, must git add)
lib/weather/weatherEnabledMode.server.ts              (?? — new, must git add)
lib/__tests__/home-page.test.tsx                      (M)
lib/__tests__/place-search-api.test.ts                (M)
lib/__tests__/weather-public.test.ts                  (M)
lib/__tests__/weather-routes-api.test.ts              (M)
lib/__tests__/weather-saved-places-api.test.ts        (M)
lib/__tests__/weather-travel-api.test.ts              (M)
lib/__tests__/weather-vedurstofan-projector.test.ts   (M)
lib/__tests__/weather-vedurstofan-warmer.test.ts      (M)
```

Do NOT stage other modified files from the worktree — they belong to earlier or unrelated work.

## Localhost checks (unchanged from v226/v227 handoff)

```env
WEATHER_ENABLED=Authenticated
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
```

1. Signed out: `/vedrid` not available, public APIs blocked.
2. Signed in without vedrid (`stebbishj@gmail.com`): Veðrið card visible, `/auth-mvp/vedrid` opens, base MET/Yr works, Veðurstofan hidden.
3. Signed in with `weather-provider-vedurstofan` (`teskeid@gottvibe.is`): `/auth-mvp/vedrid` works, Veðurstofan shows.

Then switch to `WEATHER_ENABLED=All` and verify:
- Signed-out public weather works.
- Signed-in users use `/auth-mvp/vedrid`.
- Veðurstofan still gated.
