# v220 — v218 + v219 done: provider bug fix + WEATHER_ENABLED mode contract

**Date:** 2026-07-15
**Version:** v220
**Status:** Prerelease — ready for localhost verification
**Implements:** v218 (provider access bug) + v219 (WEATHER_ENABLED mode contract)

---

## What was fixed / added

### v218 — Veðurstofan provider missing for public-tier signed-in user

Root cause: `travel/route.ts` gated the Veðurstofan provider check on `access.mode === 'authenticated'`. Public-tier signed-in users (`WEATHER_PUBLIC_ENABLED=true`, no private `vedrid`) get `mode: 'public'` from `resolveWeatherBaseAccess`, so their provider check was silently skipped.

Fix: removed the `access.mode === 'authenticated' &&` guard. The check now runs for any user with a real `id` and `email`.

```ts
// Before (broken for public-tier):
access.mode === 'authenticated' && user?.id && user?.email
  ? checkFeatureAccess(user.id, user.email, 'weather-provider-vedurstofan').catch(() => false)
  : Promise.resolve(false)

// After:
user?.id && user?.email
  ? checkFeatureAccess(user.id, user.email, 'weather-provider-vedurstofan').catch(() => false)
  : Promise.resolve(false)
```

Signed-out guests never have `user`, so they still receive no provider data.

### v219 — WEATHER_ENABLED mode contract

Added `getWeatherEnabledMode()` to `lib/weather/weatherBaseAccess.server.ts`:

```ts
export type WeatherEnabledMode = 'all' | 'authenticated' | 'off'

export function getWeatherEnabledMode(): WeatherEnabledMode {
  switch (process.env.WEATHER_ENABLED) {
    case 'All':        return 'all'
    case 'Authenticated': return 'authenticated'
    case 'true':
      // Legacy fallback (transition period only)
      return process.env.WEATHER_PUBLIC_ENABLED === 'true' ? 'all' : 'authenticated'
    default:           return 'off'
  }
}
```

Updated both access helpers to use the mode internally instead of `WEATHER_ENABLED !== 'true'` / `WEATHER_PUBLIC_ENABLED === 'true'` comparisons:
- `resolveWeatherBaseAccess` — uses `mode === 'off'` and `mode === 'all'`
- `resolveAuthenticatedWeatherShellAccess` — same

Replaced all scattered direct env checks in route files:
- `app/vedrid/page.tsx` — `getWeatherEnabledMode() !== 'all'` replaces the two-flag check
- `app/api/place/search/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/saved-places/route.ts` — `authGuard` and guest GET
- `app/api/teskeid/weather/saved-places/[id]/route.ts` — DELETE
- `app/api/teskeid/weather/vedurstofan/stations/route.ts`
- `app/api/teskeid/weather/vedurstofan/freshness/route.ts`
- `app/api/teskeid/weather/vedurstofan/refresh/route.ts`
- `app/api/cron/warm-vedurstofan/route.ts`

Updated `.env.example` with new mode documentation.

---

## Files changed

| File | Change |
|---|---|
| `lib/weather/weatherBaseAccess.server.ts` | Add `WeatherEnabledMode`, `getWeatherEnabledMode()`; update both helpers |
| `app/api/teskeid/weather/travel/route.ts` | v218 provider gate fix; v219 mode check |
| `app/api/teskeid/weather/travel/routes/route.ts` | v219 mode check |
| `app/api/place/search/route.ts` | v219 mode check |
| `app/api/teskeid/weather/saved-places/route.ts` | v219 mode checks in `authGuard` and guest GET |
| `app/api/teskeid/weather/saved-places/[id]/route.ts` | v219 mode checks |
| `app/api/teskeid/weather/vedurstofan/stations/route.ts` | v219 mode check |
| `app/api/teskeid/weather/vedurstofan/freshness/route.ts` | v219 mode check |
| `app/api/teskeid/weather/vedurstofan/refresh/route.ts` | v219 mode check |
| `app/api/cron/warm-vedurstofan/route.ts` | v219 mode check |
| `app/vedrid/page.tsx` | v219 combined check → `getWeatherEnabledMode() !== 'all'` |
| `lib/__tests__/weather-travel-api.test.ts` | Updated stale comment; added v218 regression test |
| `.env.example` | Document new mode values; note WEATHER_PUBLIC_ENABLED superseded |

---

## Test results

```
Tests  162 passed (5 files, 0 failed)
TypeScript  clean (tsc --noEmit)
```

New test added: `includes vedurstofanLayer for signed-in public-tier user with weather-provider-vedurstofan access`

---

## Legacy fallback (transition period)

Old values continue to work unchanged — no test rewrites required:

| Old env | Resolved mode |
|---|---|
| `WEATHER_ENABLED=true` + `WEATHER_PUBLIC_ENABLED=true` | `all` |
| `WEATHER_ENABLED=true` (no public flag) | `authenticated` |
| `WEATHER_ENABLED=false` or unset | `off` |

New values (target after localhost verification):

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

---

## Localhost checks for Stebbi

Use current local env first (`WEATHER_ENABLED=true`, `WEATHER_PUBLIC_ENABLED=true`) to confirm no regression, then switch to new mode.

### 1. Regression check (current env, legacy mode)

Verify everything still works as before v218/v219:

- Signed out: `/vedrid` works, met.no/Yr only, no Veðurstofan
- `stebbishj@gmail.com` (no vedrid, no provider): `/auth-mvp/vedrid` works, no Veðurstofan
- `stefanhalldor@gmail.com` (has vedrid + Veðurstofan): full access, Veðurstofan appears
- `teskeid@gottvibe.is` (no vedrid, has Veðurstofan provider): **this is the v218 fix** — Veðurstofan should now appear

### 2. New mode test (`WEATHER_ENABLED=All`)

Update local `.env.local`:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

Remove or comment out `WEATHER_PUBLIC_ENABLED`.

- Signed out: `/vedrid` accessible
- `stebbishj@gmail.com`: `/auth-mvp/vedrid` accessible, saved places work
- `teskeid@gottvibe.is`: Veðurstofan appears
- `stefanhalldor@gmail.com`: full access unchanged

### 3. Authenticated-only mode test (`WEATHER_ENABLED=Authenticated`)

```env
WEATHER_ENABLED=Authenticated
WEATHER_AUTH_ACCESS_REQUIRED=true
```

- Signed out: `/vedrid` redirects to `/`, no weather
- `stebbishj@gmail.com` (no vedrid): blocked (notFound on `/auth-mvp/vedrid`)
- `stefanhalldor@gmail.com` (has vedrid): works

### 4. Off test

```env
WEATHER_ENABLED=
```

- All weather routes return 404/blocked
- No public `/vedrid`
- No authenticated weather

### 5. After localhost verification

Remove from Vercel: `WEATHER_PUBLIC_ENABLED`, `WEATHER_FLAG`, `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`, `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`

Set in Vercel:

```env
WEATHER_ENABLED=All
```

(All other flags already set from previous releases.)

---

## Product rule preserved

In `WEATHER_ENABLED=All` mode, a signed-in user without private `vedrid` still has full base weather access through `/auth-mvp/vedrid`, including saved places. The provider gate is independent of base access — provider check uses real session `user.id`/`user.email`, not `access.mode`.
