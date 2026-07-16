# v211 — Public API Fix: Patch for Codex v211 blockers, prerelease

**Date:** 2026-07-15
**Version:** v211
**Status:** Prerelease — ready for localhost verification
**Previous:** v211-codex-v210-public-api-fix-prerelease-review

---

## What was fixed

Codex v211 found two issues, both resolved:

### Blocker fixed: `place/search` now checks `WEATHER_ENABLED`

`app/api/place/search/route.ts` was missing the global weather kill switch guard. Added:

```ts
if (process.env.WEATHER_ENABLED !== 'true') {
  return NextResponse.json({ results: [] }, { status: 404 })
}
```

This is placed after the `AUTH_MVP_ENABLED` check and before `resolveWeatherBaseAccess`, matching the contract in `weatherBaseAccess.server.ts` ("callers must check WEATHER_ENABLED before invoking this helper") and matching the pattern in both travel endpoints.

### Stale static contract test fixed: `weather-public.test.ts`

Updated "authenticated users are exempt from guest rate limit" to accurately describe the v210 model:

- Old: "authenticated users skip rate limit because `user?.email` is falsy check"
- New: "only users with vedrid (authenticated mode) are exempt — signed-in users without vedrid are in public tier and are rate-limited on /routes"

---

## Files changed

- `app/api/place/search/route.ts` — added `WEATHER_ENABLED` guard
- `lib/__tests__/place-search-api.test.ts` — added `WEATHER_ENABLED=true` to beforeEach; added 2 new tests: `WEATHER_ENABLED=false` with guest + `WEATHER_PUBLIC_ENABLED=true` -> 404 + no provider call; `WEATHER_ENABLED=false` with signed-in-no-vedrid + `WEATHER_PUBLIC_ENABLED=true` -> 404 + no provider call
- `lib/__tests__/weather-public.test.ts` — updated stale static contract test

---

## Test results

```
Tests  81 passed (4 files, 0 failed)
TypeScript  clean (tsc --noEmit)
```

---

## Env for localhost testing

```
AUTH_MVP_ENABLED=true
WEATHER_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

### Scenarios to verify

1. **Signed in with vedrid** — full access, Vedurstofan layer if applicable, no rate limit
2. **Signed in without vedrid** — MET/Yr works (routes + travel + place search), no Vedurstofan, rate-limited on /routes
3. **Not signed in** — MET/Yr works (routes + travel + place search), rate-limited on /routes
4. **WEATHER_PUBLIC_ENABLED=false** — scenarios 2 and 3 blocked with 401
5. **WEATHER_ENABLED=false** — all weather APIs return 404 including place search, no provider calls

---

## No migration, no Vercel env changes

All changes are code-only. Vercel env is correct as established in v206 handoff.
