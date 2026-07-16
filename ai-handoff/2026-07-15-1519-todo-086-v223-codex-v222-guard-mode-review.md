# v223 Codex review of v222 guard mode fix

Created: 2026-07-15 15:19
Timezone: Atlantic/Reykjavik
Relevant TODO: todo-086
Reviewed handoff: `2026-07-15-1510-todo-086-v222-claude-v221-guard-mode-fix-prerelease.md`

## Findings

No blocking findings.

Low: `lib/weather/weatherBaseAccess.server.ts` still has comments that describe `WEATHER_PUBLIC_ENABLED` as the main public-tier control. The runtime code now uses `getWeatherEnabledMode()` and the new `WEATHER_ENABLED=All | Authenticated | off` contract, so this is documentation drift rather than a functional bug. It is safe to fix later, but it would reduce future flag confusion.

## Review Summary

The v222 fix addresses the v221 blocker correctly.

Codex specifically checked for the risky path where `lib/loans/guard.ts` might import `getWeatherEnabledMode()` from `weatherBaseAccess.server.ts` and create a circular dependency. Claude Code avoided that by extracting a neutral helper:

- `lib/weather/weatherEnabledMode.server.ts`

That file has no dependency on `lib/loans/guard.ts`, and both `guard.ts` and `weatherBaseAccess.server.ts` can safely import from it.

The old hard gate `process.env.WEATHER_ENABLED !== 'true'` is gone from the weather feature access branches in `lib/loans/guard.ts`. The weather feature keys now use `getWeatherEnabledMode() === 'off'` as the global closed state:

- `vedrid`
- `ferdalagid`
- `elta-vedrid`
- `weather-provider-vedurstofan`

The provider-specific gate is also still properly separate:

- Base MET/Yr access is controlled by `WEATHER_ENABLED`.
- Auth-private weather access is controlled by `WEATHER_AUTH_ACCESS_REQUIRED`.
- Veðurstofan layer access is controlled by `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` plus `feature_access.weather-provider-vedurstofan`.

This matches Stebbi's desired model.

## Important Behavior Confirmed

With the new mode model:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

Expected behavior is:

- Signed-out users can use `/vedrid` with base MET/Yr only.
- Signed-in users without private `vedrid` can use `/auth-mvp/vedrid` and keep authenticated shell behavior such as saved places, but still only see base MET/Yr.
- Signed-in users with `weather-provider-vedurstofan` can see the Veðurstofan layer even if they do not have private `vedrid`.
- Veðurstofan is not opened globally unless `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false`.

That last point is important for `teskeid@gottvibe.is`: a user with `weather-provider-vedurstofan` should now be able to see the Veðurstofan layer even without private `vedrid`.

## Commands Run By Codex

```bash
npm run test:run -- lib/__tests__/guard.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/weather-routes-api.test.ts lib/__tests__/weather-saved-places-api.test.ts lib/__tests__/place-search-api.test.ts lib/__tests__/home-page.test.tsx
```

Result:

```text
Test Files  6 passed (6)
Tests       265 passed (265)
Exit code   0
```

```bash
npm run type-check
```

Result:

```text
tsc --noEmit
Exit code 0
```

Codex also searched for lingering direct weather flag checks in app/lib source. No remaining functional `WEATHER_ENABLED !== 'true'` blocker was found in non-test app/lib code.

## Env Recommendation For Localhost After v222

After pulling/restarting localhost with v222, Stebbi can switch local env to the new intended model:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
```

Remove from local env after confirming v222 is loaded:

```env
WEATHER_PUBLIC_ENABLED
WEATHER_FLAG
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
```

Keep all unrelated required secrets and app vars as-is:

- Supabase URL/anon/service-role
- mail/auth secrets
- Google Maps keys
- `AUTH_MVP_ENABLED`
- `LOANS_ENABLED`
- `UMONNUN_*`
- `TENGSL_*`
- `WEATHER_AI_ENABLED`
- `METNO_USER_AGENT`
- `WEATHER_MAP_PROVIDER`
- `CRON_SECRET`

## Vercel Recommendation After Localhost Passes

Do not change Vercel until localhost confirms the four-user matrix below.

Then set:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
```

Remove:

```env
WEATHER_PUBLIC_ENABLED
WEATHER_FLAG
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
```

Do not remove `WEATHER_AUTH_ACCESS_REQUIRED` or `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`; those are now the descriptive control knobs.

## Localhost checks for Stebbi

Use the new env model locally:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
```

Restart localhost after editing `.env.local`.

Check these exact cases:

1. Signed out:
   - Open `/vedrid`.
   - Expected: base MET/Yr weather works.
   - Expected: no Veðurstofan provider controls/layer.

2. Signed in as `stebbishj@gmail.com` without `vedrid` and without `weather-provider-vedurstofan`:
   - Open the home screen.
   - Expected: Veðrið card appears.
   - Click it.
   - Expected: opens `/auth-mvp/vedrid`, not `/vedrid`.
   - Expected: saved/auth shell behavior remains available.
   - Expected: no Veðurstofan layer.

3. Signed in as `teskeid@gottvibe.is` with `weather-provider-vedurstofan`:
   - Open `/auth-mvp/vedrid`.
   - Run a route search.
   - Expected: Veðurstofan provider appears.
   - Expected: Veðurstofan data can be toggled into the route.
   - Expected: saved/auth shell behavior remains available.

4. Signed in as `stefanhalldor@gmail.com`:
   - Open `/auth-mvp/vedrid`.
   - Expected: full current behavior unchanged.

5. Temporary safety check:
   - Set `WEATHER_ENABLED=Authenticated`.
   - Restart localhost.
   - Signed out `/vedrid` should redirect/close.
   - Signed-in user without `vedrid` should not get base weather unless deliberately granted private `vedrid`.
   - Restore `WEATHER_ENABLED=All` afterward.

Do not test env changes directly in production first. Vercel env edits should happen only after localhost confirms the above matrix.

## Recommendation

Codex considers v222 ready for localhost verification.

If localhost passes, this is safe to deploy with the new env model, provided Vercel is updated in the same release window so old/dead flags do not keep confusing the state.

