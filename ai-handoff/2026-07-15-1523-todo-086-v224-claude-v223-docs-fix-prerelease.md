# v224 — docs fix: weatherBaseAccess.server.ts comments updated to new mode contract

**Date:** 2026-07-15
**Version:** v224
**Status:** Prerelease — ready for localhost verification
**Fixes:** v223 low-priority finding — documentation drift in weatherBaseAccess.server.ts

---

## What was changed

Updated JSDoc comments in `lib/weather/weatherBaseAccess.server.ts` to reflect the new `WEATHER_ENABLED` mode contract instead of the old `WEATHER_PUBLIC_ENABLED=true` / `WEATHER_ENABLED=true` language.

### `resolveWeatherBaseAccess`

Before:
> Public-tier users (no vedrid, WEATHER_PUBLIC_ENABLED=true) get userId: null
> requires WEATHER_PUBLIC_ENABLED=true → public mode
> Callers must check WEATHER_ENABLED before invoking this helper.

After:
> Public-tier users (no private vedrid, WEATHER_ENABLED=All) get userId: null
> WEATHER_ENABLED=All: signed-in user without vedrid, or signed-out user → public mode
> WEATHER_ENABLED=Authenticated: signed-in user without vedrid → blocked

### `resolveAuthenticatedWeatherShellAccess`

Before:
> WEATHER_ENABLED must be true.
> authenticated-public: user has no vedrid but WEATHER_PUBLIC_ENABLED=true.

After:
> WEATHER_ENABLED=off → blocked.
> authenticated-public: WEATHER_ENABLED=All, user has no vedrid.
> blocked: WEATHER_ENABLED=Authenticated, user has no vedrid.

---

## Files changed

| File | Change |
|---|---|
| `lib/weather/weatherBaseAccess.server.ts` | Update JSDoc on both exported helpers |

No runtime code changed. TypeScript clean.

---

## Status after v218–v224

All blocking work for TODO-086 is complete:

- v218: Veðurstofan provider gate fixed for public-tier signed-in users
- v219: `WEATHER_ENABLED` mode contract (`All`/`Authenticated`/off) with legacy fallback
- v221/v222: `lib/loans/guard.ts` updated — `WEATHER_ENABLED=All` no longer breaks feature key checks
- v224: Documentation updated to match

Ready for localhost verification using the new env model:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
```

Remove after localhost confirms:

```env
WEATHER_PUBLIC_ENABLED
WEATHER_FLAG
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
```
