# v227 Claude prerelease handoff: v226 authenticated-mode contract fix done

Created: 2026-07-15 16:02
Timezone: Atlantic/Reykjavik
Relevant TODO: todo-086
Previous handoff: 2026-07-15-1536-todo-086-v226-codex-authenticated-mode-contract-fix.md

## Status

v226 fix implemented. All 2544 tests pass (84 test files). TypeCheck clean.

## What was done

### Core fix: WEATHER_ENABLED=Authenticated now allows all signed-in users

`lib/weather/weatherBaseAccess.server.ts`:

**`resolveWeatherBaseAccess`** — signed-in users in `authenticated` mode now get `authenticated` access (not blocked):
```ts
if (user?.email) {
  const hasVedrid = await checkFeatureAccess(user.id, user.email, 'vedrid').catch(() => false)
  if (hasVedrid || mode === 'authenticated') {
    return { mode: 'authenticated', userId: user.id, actor: 'authenticated' }
  }
}
if (mode === 'all') return { mode: 'public', userId: null, actor: 'public' }
return { mode: 'blocked' }
```

**`resolveAuthenticatedWeatherShellAccess`** — signed-in users without vedrid in either `all` or `authenticated` mode get shell access:
```ts
if (mode === 'all' || mode === 'authenticated') return { mode: 'authenticated-public', userId: user.id, hasPrivateVedrid: false }
return { mode: 'blocked' }
```

### Saved-places API guards updated

`app/api/teskeid/weather/saved-places/route.ts` — `authGuard`:
```ts
if (hasVedrid || weatherMode === 'all' || weatherMode === 'authenticated') return { supabase, user }
```

`app/api/teskeid/weather/saved-places/[id]/route.ts` — DELETE guard:
```ts
if (!hasVedrid && weatherMode !== 'all' && weatherMode !== 'authenticated') { return 404 }
```

### Test updates

9 tests updated to reflect the new contract:

**`home-page.test.tsx`**: Renamed test — signed-in user without vedrid now SEES the weather card in `authenticated` mode (no PUBLIC flag needed).

**`weather-routes-api.test.ts`** (2 tests): Changed from "user lacks vedrid and PUBLIC off → 401" to "WEATHER_ENABLED is off → 404" (using `delete process.env.WEATHER_ENABLED`).

**`weather-saved-places-api.test.ts`** (4 tests): Same approach — changed all "PUBLIC off → blocked" scenarios to "WEATHER_ENABLED off → blocked" using `delete process.env.WEATHER_ENABLED`.

**`place-search-api.test.ts`**: Same — changed "lacks vedrid and PUBLIC off → 401" to "WEATHER_ENABLED off → 404".

**`weather-travel-api.test.ts`**: Already fixed in the previous session (before context compaction).

### Bonus fix: vedurstofan history mock missing in two test files

The projector and warmer implementations write to `vedurstofan_forecasts_history` (added in an earlier session), but two test mocks didn't handle that table. Result: `TypeError` caught by `catch { errors++ }`, causing `projected: 0` in 8 tests.

Fixed by adding a best-effort no-op stub for `vedurstofan_forecasts_history` in:
- `lib/__tests__/weather-vedurstofan-projector.test.ts`
- `lib/__tests__/weather-vedurstofan-warmer.test.ts`

## What was NOT changed

- Veðurstofan provider gate is intact (`WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`).
- `getWeatherEnabledMode()` in `weatherEnabledMode.server.ts` unchanged.
- `lib/loans/guard.ts` unchanged (already fixed in v222).
- No SQL migrations.

## Files modified

Code:
- `lib/weather/weatherBaseAccess.server.ts`
- `app/api/teskeid/weather/saved-places/route.ts`
- `app/api/teskeid/weather/saved-places/[id]/route.ts`

Tests:
- `lib/__tests__/home-page.test.tsx`
- `lib/__tests__/weather-routes-api.test.ts`
- `lib/__tests__/weather-saved-places-api.test.ts`
- `lib/__tests__/place-search-api.test.ts`
- `lib/__tests__/weather-vedurstofan-projector.test.ts`
- `lib/__tests__/weather-vedurstofan-warmer.test.ts`

## Localhost checks (from v226 handoff)

```env
WEATHER_ENABLED=Authenticated
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
```

1. Signed out: `/vedrid` not available. Public APIs blocked.
2. Signed in as `stebbishj@gmail.com` (no private vedrid): `/auth-mvp/heim` shows Veðrið. Clicking opens `/auth-mvp/vedrid`. Base MET/Yr works. Veðurstofan hidden.
3. Signed in as `teskeid@gottvibe.is` (has `weather-provider-vedurstofan`): `/auth-mvp/vedrid` works. Veðurstofan shows.
4. Signed in as `stefanhalldor@gmail.com`: Full behavior unchanged.

Then switch back to `WEATHER_ENABLED=All` and re-verify public + authenticated paths.

## Ready to commit

Stebbi needs to give commit permission. The commit will include all modified files plus the two previously untracked files:
- `lib/weather/weatherBaseAccess.server.ts` (new, untracked in git)
- `lib/weather/weatherEnabledMode.server.ts` (new, untracked in git)
