# v210 — Public API Access Fix: Prerelease Handoff

**Date:** 2026-07-15
**Version:** v210
**Status:** Prerelease — ready for localhost verification
**Previous:** v210-codex-v209-public-api-fix-plan-review

---

## What was done

Implemented the shared `resolveWeatherBaseAccess` helper (as recommended by Codex v210) and updated all three weather API routes to use it, fixing the blocking issue where signed-in users without `vedrid` could not access public MET/Yr weather even when `WEATHER_PUBLIC_ENABLED=true`.

---

## Files changed

### New file
- `lib/weather/weatherBaseAccess.server.ts` — shared helper, returns `{ mode: 'authenticated' | 'public' | 'blocked' }`

### Updated routes
- `app/api/teskeid/weather/travel/routes/route.ts` — uses helper; rate limit on public path; `actor`/`userId` from access object
- `app/api/teskeid/weather/travel/route.ts` — uses helper; no rate limit (intentional: rate limit is on /routes only); Vedurstofan gated by `access.mode === 'authenticated'`
- `app/api/place/search/route.ts` — uses helper; 401 on blocked (was previously 401 only for unauthenticated — now also for signed-in without vedrid when public is off)

### Updated tests
- `lib/__tests__/weather-routes-api.test.ts` — fixed `actor: 'guest'` -> `actor: 'public'` in all usage-event assertions; added `publicAuthedUser()` tests (200 on public path, 401 when public off, 429 when rate limited)
- `lib/__tests__/weather-travel-api.test.ts` — added `delete process.env.WEATHER_PUBLIC_ENABLED` to beforeEach; added new describe block "auth / public access" with 3 tests (401 blocked, 200 public path, no Vedurstofan on public path)
- `lib/__tests__/place-search-api.test.ts` — added `delete process.env.WEATHER_PUBLIC_ENABLED` to beforeEach; updated "returns 404 when user lacks vedrid" -> 401; added guest and signed-in-without-vedrid public path tests

---

## Test results

```
Tests  58 passed (3 files, 0 failed)
TypeScript  clean (tsc --noEmit)
```

Full suite: 8 failures in `weather-vedurstofan-projector.test.ts` and `weather-vedurstofan-warmer.test.ts` — confirmed pre-existing on main, not introduced by these changes.

---

## Access model summary

`resolveWeatherBaseAccess(user)` returns:

| User state | WEATHER_PUBLIC_ENABLED | Result |
|---|---|---|
| Signed in + has vedrid | any | `{ mode: 'authenticated', userId, actor: 'authenticated' }` |
| Signed in, no vedrid | true | `{ mode: 'public', userId: null, actor: 'public' }` |
| Signed in, no vedrid | false/absent | `{ mode: 'blocked' }` |
| Unauthenticated | true | `{ mode: 'public', userId: null, actor: 'public' }` |
| Unauthenticated | false/absent | `{ mode: 'blocked' }` |

Rate limit applies only on `/routes` (route options) for public-mode users. Final travel submit has no rate limit (intentional — documented in code).

Vedurstofan layer is only attempted when `access.mode === 'authenticated'`. Public-mode users get MET/Yr only.

---

## Env for localhost testing

```
AUTH_MVP_ENABLED=true
WEATHER_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true        # require per-user vedrid gate
WEATHER_PUBLIC_ENABLED=true              # open public/guest MET/Yr path
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true   # vedurstofan per-user gate
```

### Scenarios to verify

1. **Signed in with vedrid** — full access, Vedurstofan layer if applicable
2. **Signed in without vedrid** — MET/Yr weather works (routes + travel + place search), no Vedurstofan layer
3. **Not signed in** — MET/Yr weather works (routes + travel + place search)
4. **Set WEATHER_PUBLIC_ENABLED=false** — scenarios 2 and 3 should be blocked with 401

---

## Notes

- `actor: 'public'` is used for both unauthenticated guests and signed-in users without vedrid on the public path. This is consistent with the access model — both are in the same "public tier".
- `userId: null` for all public-mode users regardless of session state (privacy: no user tracking on public path).
- No migration needed. No Vercel env changes needed for this fix — existing `WEATHER_PUBLIC_ENABLED=true` in Vercel is already correct per v206 handoff.
