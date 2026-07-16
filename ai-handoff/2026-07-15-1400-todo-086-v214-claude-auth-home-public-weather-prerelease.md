# v214 — Auth home public weather card fix: prerelease

**Date:** 2026-07-15
**Version:** v214
**Status:** Prerelease — ready for localhost verification
**Previous:** v214-codex-auth-home-public-weather-card-handoff

---

## What was fixed

Signed-in users without `vedrid` could not see the `Veðrið` card on the authenticated home page (`/auth-mvp/heim`), even though public MET/Yr weather was available to them on `/vedrid`.

Root cause: the home page used `checkFeatureAccess('vedrid')` to decide both (a) whether the card is visible, and (b) which href to use. That gate is correct for the private `/auth-mvp/vedrid` route, but wrong for deciding base weather card visibility.

---

## Files changed

### `app/auth-mvp/heim/page.tsx`

- Added `resolveWeatherBaseAccess` import
- Replaced the third `checkFeatureAccess('vedrid')` call with `resolveWeatherBaseAccess` (after `WEATHER_ENABLED` guard)
- Derived `weatherCardEnabled` and `weatherCardHref` from the access result:
  - `authenticated` mode (has vedrid) → enabled, href `/auth-mvp/vedrid`
  - `public` mode (no vedrid, public enabled) → enabled, href `/vedrid`
  - `blocked` → disabled, card hidden

### `lib/__tests__/home-page.test.tsx`

- Added `LAUNCHED_VEDRID_IDEA` fixture constant
- Added `vedridAccess` param to `setupGuard` (defaults to `false`, backwards compatible)
- Added `WEATHER_ENABLED` and `WEATHER_PUBLIC_ENABLED` save/restore in `beforeEach`/`afterEach`
- Added new describe block `HeimPage — Veðrið card access` with 4 tests:
  1. No vedrid + `WEATHER_PUBLIC_ENABLED=true` → card visible, href `/vedrid`
  2. Has vedrid → card visible, href `/auth-mvp/vedrid`
  3. No vedrid + `WEATHER_PUBLIC_ENABLED` off → card hidden
  4. `WEATHER_ENABLED` off → card hidden (wins over `WEATHER_PUBLIC_ENABLED=true`)

---

## Test results

```
Tests  82 passed (1 file, 0 failed)
TypeScript  clean (tsc --noEmit)
```

---

## What did NOT change

- `app/auth-mvp/vedrid/page.tsx` — private route guard unchanged; direct access still requires `vedrid`
- `app/vedrid/page.tsx` — public page unchanged
- Provider gates (Veðurstofan) — unchanged, still per-user
- No SQL, no Vercel env, no migrations

---

## Localhost Checks for Stebbi

Use:
```
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

1. **Signed in as `stebbishj` (no vedrid)**: open `/auth-mvp/heim` — expected: `Veðrið` card visible, clicks to `/vedrid`, base MET/Yr weather works, no Veðurstofan.
2. **Signed in as Stebbi (has vedrid)**: open `/auth-mvp/heim` — expected: `Veðrið` card visible, clicks to `/auth-mvp/vedrid`.
3. **Signed out**: `/` page — expected: `Veðrið` card visible (unchanged behavior).
4. **Manually visit `/auth-mvp/vedrid` as `stebbishj`**: expected: still blocked/redirected (route guard unchanged).
5. **Temporarily set `WEATHER_PUBLIC_ENABLED=false`**: `stebbishj` should not see the `Veðrið` card.
6. **Temporarily set `WEATHER_ENABLED=false`**: `Veðrið` card should not appear for any user.
