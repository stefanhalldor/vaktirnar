# v216 — Authenticated weather shell correction: prerelease

**Date:** 2026-07-15
**Version:** v216
**Status:** Prerelease — ready for localhost verification
**Previous:** v216-codex-authenticated-weather-shell-correction

---

## What was fixed

v214 gave signed-in users without `vedrid` a link to `/vedrid` (guest/public page), losing saved places and sign-in features. The correct behavior: all signed-in users with any base weather access should use `/auth-mvp/vedrid`.

Root cause: the home card used `resolveWeatherBaseAccess` which returns `mode: 'public'` (with `userId: null`) for public-tier signed-in users. That helper is correct for API routes but wrong for UI routes that need user identity.

---

## New helper

`lib/weather/weatherBaseAccess.server.ts` — added `resolveAuthenticatedWeatherShellAccess`:

- `authenticated` — signed-in with private `vedrid`
- `authenticated-public` — signed-in, no vedrid, `WEATHER_PUBLIC_ENABLED=true`
- `blocked` — otherwise (WEATHER_ENABLED off, no email, no access)

Preserves `userId` in both allowed modes. Does NOT affect `resolveWeatherBaseAccess` (API route semantics unchanged).

---

## Files changed

| File | Change |
|---|---|
| `lib/weather/weatherBaseAccess.server.ts` | Added `resolveAuthenticatedWeatherShellAccess` + type |
| `app/auth-mvp/heim/page.tsx` | Use new helper; href always `/auth-mvp/vedrid` for signed-in users |
| `app/auth-mvp/vedrid/page.tsx` | Replace `guardFeatureAccess('vedrid')` with new helper; `notFound()` when blocked |
| `app/api/teskeid/weather/saved-places/route.ts` | `authGuard()` — add `WEATHER_ENABLED` check; allow signed-in public-tier users; guest GET returns empty list (unauthenticated only) |
| `app/api/teskeid/weather/saved-places/[id]/route.ts` | DELETE — add `WEATHER_ENABLED` check; allow signed-in public-tier users |
| `lib/__tests__/home-page.test.tsx` | Fix href expectation: `/vedrid` → `/auth-mvp/vedrid` for no-vedrid public-tier user |
| `lib/__tests__/weather-saved-places-api.test.ts` | Add `WEATHER_ENABLED=true` to beforeEach; add `publicAuthedUser()` helper; add 7 new public-tier tests |

---

## Test results

```
Tests  108 passed (2 files, 0 failed)
TypeScript  clean (tsc --noEmit)
```

---

## Access model after this fix

| User | WEATHER_ENABLED | WEATHER_PUBLIC_ENABLED | Home card | Target | Saved places | Veðurstofan |
|---|---|---|---|---|---|---|
| Signed out | true | true | `/` (public) | `/vedrid` | no | no |
| Signed in, no vedrid | true | false | hidden | blocked | blocked | no |
| Signed in, no vedrid | true | true | visible | `/auth-mvp/vedrid` | yes | no |
| Signed in, has vedrid | true | any | visible | `/auth-mvp/vedrid` | yes | per flag |
| Any | false | any | hidden | blocked | blocked | no |

---

## Localhost Checks for Stebbi

Use:
```
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

1. **Signed in as `stebbishj`** (no vedrid): open `/auth-mvp/heim` — expected: `Veðrið` card visible, clicks to `/auth-mvp/vedrid` (not `/vedrid`), saved places load and can be saved/deleted, Veðurstofan not visible.
2. **Signed in as Stebbi** (has vedrid): same href `/auth-mvp/vedrid`, full feature access.
3. **Signed out**: `/` → `Veðrið` → `/vedrid` (public guest page, unchanged).
4. **`stebbishj` manually visits `/auth-mvp/vedrid`**: expected: allowed (not blocked anymore).
5. **`WEATHER_PUBLIC_ENABLED=false`**: `stebbishj` sees no card, `/auth-mvp/vedrid` returns 404.
6. **`WEATHER_ENABLED=false`**: all weather routes blocked.
