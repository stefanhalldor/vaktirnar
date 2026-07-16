# v222 — guard.ts mode fix: WEATHER_ENABLED=All now works for all weather feature keys

**Date:** 2026-07-15
**Version:** v222
**Status:** Prerelease — ready for localhost verification
**Fixes:** v221 review finding — `lib/loans/guard.ts` still used `WEATHER_ENABLED !== 'true'`

---

## What was fixed

`lib/loans/guard.ts` had 4 places that checked `process.env.WEATHER_ENABLED !== 'true'` as a kill-switch for weather feature keys:
- `vedrid`
- `ferdalagid`
- `elta-vedrid`
- `weather-provider-vedurstofan`

With `WEATHER_ENABLED=All`, these checks returned false, blocking all weather feature access despite the new mode being fully valid.

---

## Solution: neutral extraction to avoid circular import

Importing `getWeatherEnabledMode` directly from `weatherBaseAccess.server.ts` in `guard.ts` would create a circular dependency (`guard.ts` ← `weatherBaseAccess.server.ts` ← `guard.ts`).

New file: `lib/weather/weatherEnabledMode.server.ts`

Contains only `getWeatherEnabledMode()` and the `WeatherEnabledMode` type. No imports from `lib/loans/` or `lib/weather/weatherBaseAccess.server.ts`.

Import graph after this fix:

```
lib/weather/weatherEnabledMode.server.ts  (standalone)
  ↑
lib/loans/guard.ts                        (imports getWeatherEnabledMode)
lib/weather/weatherBaseAccess.server.ts   (re-exports getWeatherEnabledMode, imports from guard.ts)
app/* route files                         (import getWeatherEnabledMode via weatherBaseAccess.server)
```

No circular dependency.

---

## Files changed

| File | Change |
|---|---|
| `lib/weather/weatherEnabledMode.server.ts` | New — standalone mode helper |
| `lib/weather/weatherBaseAccess.server.ts` | Remove inline impl, import + re-export from new file |
| `lib/loans/guard.ts` | Import `getWeatherEnabledMode`; replace 4 `WEATHER_ENABLED !== 'true'` checks |
| `lib/__tests__/guard.test.ts` | Add tests for `WEATHER_ENABLED=All` and `WEATHER_ENABLED=Authenticated` |

---

## Test results

```
Tests  258 passed (6 files, 0 failed)
TypeScript  clean (tsc --noEmit)
```

New tests added (5):
- `vedrid`: passes kill-switch when `WEATHER_ENABLED=All`, no access flag (open to all)
- `vedrid`: passes kill-switch when `WEATHER_ENABLED=Authenticated`, no access flag
- `elta-vedrid`: passes kill-switch when `WEATHER_ENABLED=All` (still requires `WEATHER_ELTA_VEDRID_FLAG`)
- `weather-provider-vedurstofan`: passes kill-switch when `WEATHER_ENABLED=All`, no row → false
- `weather-provider-vedurstofan`: passes kill-switch when `WEATHER_ENABLED=All`, row exists → true

---

## Localhost checks for Stebbi

### Phase 1 — regression with current env (legacy mode)

Keep:

```env
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

- Signed out: `/vedrid` works, no Veðurstofan
- `stebbishj@gmail.com`: `/auth-mvp/vedrid` works, no Veðurstofan
- `teskeid@gottvibe.is`: `/auth-mvp/vedrid` works, Veðurstofan appears (v218 fix)
- `stefanhalldor@gmail.com`: full access unchanged

### Phase 2 — new mode

Update local `.env.local`:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

Remove/comment out:
```
WEATHER_PUBLIC_ENABLED
WEATHER_FLAG
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
```

Repeat the same four-user matrix — expected identical results.

### Phase 3 — Authenticated-only mode

```env
WEATHER_ENABLED=Authenticated
WEATHER_AUTH_ACCESS_REQUIRED=true
```

- Signed out: `/vedrid` redirects to `/`
- `stebbishj@gmail.com` (no vedrid): `/auth-mvp/vedrid` returns 404
- `stefanhalldor@gmail.com` (has vedrid): works

### Phase 4 — Off

```env
WEATHER_ENABLED=
```

- All weather routes blocked/redirected

### After localhost verification

Remove from Vercel: `WEATHER_PUBLIC_ENABLED`, `WEATHER_FLAG`, `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`, `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`

Set in Vercel:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
```
