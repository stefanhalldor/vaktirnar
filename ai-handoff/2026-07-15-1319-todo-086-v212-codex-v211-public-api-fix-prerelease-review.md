# v212 — Codex review of v211 public API fix prerelease

Created: 2026-07-15 13:19  
Timezone: Atlantic/Reykjavik  
TODO: 086 — Veðurstofan / ferðaveður provider work

## Findings

No release-blocking issues found in the v211 patch.

The blocker from Codex v211 is fixed: `app/api/place/search/route.ts:33-35` now checks `WEATHER_ENABLED` before calling `resolveWeatherBaseAccess`, so the global weather switch also closes autocomplete/geocode access.

The stale static contract test is also fixed: `lib/__tests__/weather-public.test.ts:222-230` now correctly says only authenticated users with `vedrid` are exempt from the public `/routes` rate limit, while signed-in users without `vedrid` are public-tier users and rate-limited.

## Review Notes

- `app/api/place/search/route.ts:29-42` now has the right guard order:
  - `AUTH_MVP_ENABLED`
  - `WEATHER_ENABLED`
  - `resolveWeatherBaseAccess`
  - blocked public/auth fallback -> `401`
- `lib/__tests__/place-search-api.test.ts:51-82` now explicitly sets `WEATHER_ENABLED=true` in `beforeEach` and covers both weather-disabled public cases:
  - guest + `WEATHER_PUBLIC_ENABLED=true` still returns `404`
  - signed-in without `vedrid` + `WEATHER_PUBLIC_ENABLED=true` still returns `404`
  - both assert the geocode provider is not called
- The shared base access model from v210 still looks correct:
  - signed-in with `vedrid` -> authenticated mode
  - signed-in without `vedrid` + public enabled -> public mode, `userId: null`
  - guest + public enabled -> public mode, `userId: null`
  - public mode does not grant Veðurstofan

## Files Reviewed

- `ai-handoff/2026-07-15-1320-todo-086-v211-claude-public-api-fix-prerelease.md`
- `app/api/place/search/route.ts`
- `lib/__tests__/place-search-api.test.ts`
- `lib/__tests__/weather-public.test.ts`
- `lib/weather/weatherBaseAccess.server.ts`

## Commands Run

- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-15-1320-todo-086-v211-claude-public-api-fix-prerelease.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
- `git status --short`
- Targeted `Get-Content` reads of the reviewed route/test files
- `rg -n "resolveWeatherBaseAccess|WEATHER_ENABLED|WEATHER_PUBLIC_ENABLED|authenticated users|vedrid users|public tier|rate limit" ...`

I did not run the test suite in this Codex review turn. Claude reports:

```text
Tests  81 passed (4 files, 0 failed)
TypeScript  clean (tsc --noEmit)
```

## Supabase / Auth / RLS Impact

No SQL migration. No Supabase schema/RLS/policy changes.

Auth/API contract after v211:

- Everyone can use base MET/Yr public weather when `WEATHER_ENABLED=true` and `WEATHER_PUBLIC_ENABLED=true`.
- Signed-in users without `vedrid` are treated as public-tier users for base weather.
- Veðurstofan remains gated separately through authenticated mode and `weather-provider-vedurstofan`.
- `WEATHER_ENABLED=false` should now close the base weather APIs, including place search.

## Process Note

Claude’s handoff has localhost scenarios, but it does not use the exact required heading `Localhost checks for Stebbi`. Not a release blocker, but please keep the exact heading in future handoffs so the workflow stays consistent and searchable.

## Localhost Checks for Stebbi

Use the intended production-like flags locally:

```text
AUTH_MVP_ENABLED=true
WEATHER_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

Suggested checks:

1. Logged out: open `/vedrid`, search for a route, and confirm MET/Yr-only weather works.
2. Logged in as a user without `vedrid`: confirm route search, final weather calculation, and place search work, but Veðurstofan does not appear.
3. Logged in as Stebbi or a user with `vedrid` + `weather-provider-vedurstofan`: confirm Veðurstofan still appears under its provider flag.
4. Temporarily set `WEATHER_PUBLIC_ENABLED=false` locally and restart localhost: logged-out and signed-in-without-`vedrid` users should be blocked from public weather.
5. Temporarily set `WEATHER_ENABLED=false` locally and restart localhost: weather APIs, including place search/autocomplete, should be unavailable.

Do not casually change Vercel env or production flags while testing. Those can affect public access and Google/provider calls.

## Verdict

Ready for Stebbi localhost verification.

From a code-review perspective, v211 resolves the v210/v211 public API blocker without weakening Veðurstofan’s per-user gate.
