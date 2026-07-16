# v211 — Codex review of v210 public API fix prerelease

Created: 2026-07-15 13:15  
Timezone: Atlantic/Reykjavik  
TODO: 086 — Veðurstofan / ferðaveður provider work

## Findings

### Blocker — `place/search` bypasses the global weather feature switch

`app/api/place/search/route.ts:28-39` now uses `resolveWeatherBaseAccess(user)`, but it only checks `AUTH_MVP_ENABLED` before that. It does **not** check `WEATHER_ENABLED`.

That conflicts with `lib/weather/weatherBaseAccess.server.ts:17`, which explicitly says callers must check `WEATHER_ENABLED` before invoking the helper. The two travel endpoints do this correctly:

- `app/api/teskeid/weather/travel/routes/route.ts:32-34`
- `app/api/teskeid/weather/travel/route.ts:179-181`

Why this matters:

- If `WEATHER_ENABLED=false` but `WEATHER_PUBLIC_ENABLED=true`, `/api/place/search` can still call the map/geocode provider.
- That makes the global weather kill switch incomplete.
- It can create avoidable Google/provider calls even when weather is supposed to be off.
- It is especially risky because `place/search` is public-capable after this fix.

Required fix:

- Add the same `WEATHER_ENABLED !== 'true' -> 404` guard to `app/api/place/search/route.ts` before `resolveWeatherBaseAccess`.
- Add tests in `lib/__tests__/place-search-api.test.ts` for:
  - `WEATHER_ENABLED=false`, guest, `WEATHER_PUBLIC_ENABLED=true` -> 404 and provider not called.
  - `WEATHER_ENABLED=false`, signed-in without `vedrid`, `WEATHER_PUBLIC_ENABLED=true` -> 404 and provider not called.
  - Prefer setting `process.env.WEATHER_ENABLED = 'true'` in `beforeEach`, matching the weather route tests, so the intended default is explicit.

### Medium — static public-weather contract test is now stale

`lib/__tests__/weather-public.test.ts:222-226` still says authenticated users are exempt from guest rate limit because `checkWeatherGuestRateLimit` only runs when `user?.email` is falsy.

That was true before v210, but v210 intentionally changes the model:

- signed-in + has `vedrid` -> authenticated, not public, no public rate limit
- signed-in + lacks `vedrid` + `WEATHER_PUBLIC_ENABLED=true` -> public tier, `actor: 'public'`, `userId: null`, rate-limited on `/routes`

The test is static documentation, so it may not fail, but it now documents the wrong contract.

Required fix:

- Rewrite that test/comment to say `authenticated users with vedrid are exempt`, while public-tier users, including signed-in users without `vedrid`, are rate-limited on `/routes`.
- Or add a separate static assertion documenting the two authenticated cases.

## What Looks Good

- `lib/weather/weatherBaseAccess.server.ts` centralizes the base access decision instead of copy/pasting route logic.
- Signed-in users without `vedrid` correctly become `{ mode: 'public', userId: null, actor: 'public' }` when `WEATHER_PUBLIC_ENABLED=true`.
- Public-mode users do not get Veðurstofan: final travel only checks `weather-provider-vedurstofan` when `access.mode === 'authenticated'`.
- `/routes` rate-limits public mode, including signed-in users without `vedrid`.
- Final travel intentionally keeps the existing no-rate-limit contract. That matches the previous Codex review, assuming Stebbi still accepts that product decision.
- The new tests cover the original blocker for route options and final travel.

## Files Reviewed

- `ai-handoff/2026-07-15-1310-todo-086-v210-claude-public-api-fix-prerelease.md`
- `lib/weather/weatherBaseAccess.server.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/place/search/route.ts`
- `lib/__tests__/weather-routes-api.test.ts`
- `lib/__tests__/weather-travel-api.test.ts`
- `lib/__tests__/place-search-api.test.ts`
- `lib/__tests__/weather-public.test.ts`

## Commands Run

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
- `git status --short`
- `rg -n "resolveWeatherBaseAccess|WeatherBaseAccess|actor: 'public'|WEATHER_PUBLIC_ENABLED|checkWeatherGuestRateLimit|WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED|weather-provider-vedurstofan" app/api/teskeid/weather app/api/place lib/weather lib/__tests__`
- Targeted `Get-Content` reads of the files listed above.

I did not run the Vitest suite in this review turn. Claude reported 58 passing targeted tests, with unrelated existing failures in Veðurstofan warmer/projector tests.

## Supabase / Auth / RLS Impact

No SQL migration in v210. No Supabase schema/RLS/policy changes.

Auth behavior does change at the API layer:

- signed-in without `vedrid` now gets public/base MET/Yr access when `WEATHER_PUBLIC_ENABLED=true`
- signed-in without `vedrid` still must not get Veðurstofan provider access
- public-mode usage should be recorded with `userId: null`

That auth model looks correct in the two travel endpoints. The remaining blocker is the missing global `WEATHER_ENABLED` guard in `place/search`.

## Recommended Next Step for Claude Code

Small patch only:

1. Add `WEATHER_ENABLED` guard to `app/api/place/search/route.ts`.
2. Add/adjust the place-search tests for weather-disabled public and signed-in-public cases.
3. Update the stale static contract in `lib/__tests__/weather-public.test.ts`.
4. Run:
   - `npm run test:run -- lib/__tests__/place-search-api.test.ts lib/__tests__/weather-public.test.ts lib/__tests__/weather-routes-api.test.ts lib/__tests__/weather-travel-api.test.ts`
   - `npm run type-check`

Do not touch Veðurstofan UI, provider selectors, SQL, Vercel env, Supabase, cron, or migrations in this patch.

## Localhost Checks for Stebbi

After Claude patches the blocker, test these before release:

1. With production-like flags: `AUTH_MVP_ENABLED=true`, `WEATHER_ENABLED=true`, `WEATHER_PUBLIC_ENABLED=true`, `WEATHER_AUTH_ACCESS_REQUIRED=true`, `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`.
2. Logged out: open `/vedrid`, search for origin/destination, and confirm MET/Yr-only weather works.
3. Logged in as a user without `vedrid`: confirm the same MET/Yr-only flow works and no Veðurstofan toggle/card appears.
4. Logged in as Stebbi or another user with `vedrid` + `weather-provider-vedurstofan`: confirm Veðurstofan remains visible under its provider flag.
5. Temporarily set `WEATHER_PUBLIC_ENABLED=false` locally and restart localhost: logged-out and signed-in-without-`vedrid` should be blocked from the weather flow.
6. Temporarily set `WEATHER_ENABLED=false` locally and restart localhost: `/vedrid` weather APIs, including place search, should not call the map provider and should be unavailable.

Do not test production env toggles casually. Any Vercel env changes should be deliberate because they affect public access, provider calls, and possibly Google cost.

## Overall Verdict

Not ready to release yet because of the `place/search` `WEATHER_ENABLED` guard gap.

The core v210 access model is otherwise good and matches the intended product direction: everyone can use public MET/Yr when public weather is enabled, while Veðurstofan stays per-user gated.
