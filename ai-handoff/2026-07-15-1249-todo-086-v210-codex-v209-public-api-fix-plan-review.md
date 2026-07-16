# Codex review: v209 public API fix plan

Created: 2026-07-15 12:49
Timezone: Atlantic/Reykjavik
TODO: todo-086
Reviewed handoff: `2026-07-15-1300-todo-086-v209-claude-public-api-fix-plan.md`

## Findings

### Medium: plan says "same pattern" for all three routes, but final travel endpoint has an existing no-rate-limit contract

The direction is right: a signed-in user without `vedrid` should be allowed to use base/public MET/Yr when `WEATHER_PUBLIC_ENABLED=true`.

But `v209` says the same pattern should apply to all three routes and shows `checkWeatherGuestRateLimit(ip)` in the common snippet. That conflicts with the existing documented contract:

- `app/api/teskeid/weather/travel/route.ts:191-195` explicitly says guest path requires `WEATHER_PUBLIC_ENABLED` with "no rate limit increment here".
- `lib/__tests__/weather-public.test.ts:212-220` documents that rate limit increments only on the route-options endpoint, not on final travel.

This needs a conscious decision before implementation.

Two acceptable options:

1. Preserve current contract:
   - `/api/teskeid/weather/travel/routes` rate-limits public/base users.
   - `/api/place/search` uses its existing in-memory rate limit.
   - `/api/teskeid/weather/travel` does not increment the public IP quota.
   - Update only auth branching, not rate-limit behavior, in final travel.

2. Change the contract intentionally:
   - Rate-limit final travel too, because direct POSTs can call Google/MET work.
   - Update `lib/__tests__/weather-public.test.ts`.
   - Consider `WEATHER_PUBLIC_IP_DAILY_LIMIT`, because default is 5/day and counting both route-options and final-submit could make one normal public trip consume two quota units.
   - Add usage event expectations for final-rate-limited public calls.

I lean toward option 1 for the immediate release because it fixes the blocker with less behavior churn. Then handle broader public-cost hardening as a separate follow-up.

### Medium: add a shared helper or the three routes will drift again

The plan repeats access logic in three routes. This is the exact sort of logic that already drifted.

Recommended helper shape, server-only:

```ts
type WeatherBaseAccess =
  | { mode: 'authenticated'; user: User; hasVedrid: true; userId: string; actor: 'authenticated' }
  | { mode: 'public'; user: User | null; hasVedrid: false; userId: null; actor: 'public' }
  | { mode: 'blocked'; response: NextResponse }
```

It should answer only the base MET/Yr question:

- `WEATHER_ENABLED` must be true before using it.
- If user has `vedrid`, return authenticated mode.
- If user lacks `vedrid` but `WEATHER_PUBLIC_ENABLED=true`, return public mode.
- If no user and `WEATHER_PUBLIC_ENABLED=true`, return public mode.
- Otherwise return blocked.

Do not use this helper for:

- `/auth-mvp/vedrid` page guard
- saved places
- Veðurstofan refresh/freshness
- Veðurstofan provider layer access

This keeps the product rule clear: public/base weather is broad, extras remain gated.

### Medium: tests must cover the exact blocker, not only guest/auth split

Add tests that explicitly cover signed-in users without `vedrid`.

Minimum tests:

- `weather-routes-api`: signed-in user without `vedrid`, `WEATHER_PUBLIC_ENABLED=true` -> 200, no Veðurstofan, actor public/base, rate-limited according to chosen contract.
- `weather-routes-api`: signed-in user without `vedrid`, `WEATHER_PUBLIC_ENABLED` missing -> 401/404 blocked.
- `weather-travel-api`: signed-in user without `vedrid`, `WEATHER_PUBLIC_ENABLED=true` -> 200 base MET/Yr, no Veðurstofan product-table read.
- `weather-travel-api`: signed-in user without `vedrid`, `WEATHER_PUBLIC_ENABLED` missing -> blocked.
- `place-search-api`: signed-out and signed-in-without-`vedrid` public fallback succeeds when `WEATHER_PUBLIC_ENABLED=true`.
- Existing tests: signed-in without `vedrid` still blocked from `/auth-mvp/vedrid`.

The current v209 plan lists the right manual localhost checks, but the automated tests should lock this down before release.

### Low: actor naming should be deliberate

`v209` suggests:

```ts
const actor = hasVedrid ? 'authenticated' : 'public'
const userId = user?.id ?? null
```

For privacy and analytics, I would keep unauthorised-base-weather usage as `userId: null` even if the browser has an auth session, unless Stebbi explicitly wants to track signed-in users who are using public mode.

Recommended:

- `hasVedrid=true`: `actor='authenticated'`, `userId=user.id`
- `hasVedrid=false`: `actor='public'`, `userId=null`

That matches the mental model: no provider/user-level weather entitlement means the request is treated as public/base weather.

## What Looks Good

- The plan correctly identifies the root cause.
- It correctly keeps `/auth-mvp/vedrid` gated by `vedrid`.
- It correctly keeps Veðurstofan freshness/refresh behind `weather-provider-vedurstofan`.
- It correctly includes `/api/place/search`, which matters because `PlaceSearch` falls back to it when browser Google Places fails.
- Vercel env target is aligned with the desired release posture:
  - public MET/Yr open
  - auth weather gated
  - Veðurstofan provider gated
  - Vegagerðin key prepared but not active

## Suggested Implementation Instruction For Claude Code

Do not implement "same pattern" by copy/paste into three routes.

Instead:

1. Introduce a small shared server helper for base weather API access.
2. Use it in:
   - `app/api/teskeid/weather/travel/routes/route.ts`
   - `app/api/teskeid/weather/travel/route.ts`
   - `app/api/place/search/route.ts`
3. Keep `/auth-mvp/vedrid`, saved places and Veðurstofan APIs unchanged.
4. Preserve existing final-travel rate-limit contract unless Stebbi explicitly approves changing it.
5. Add the signed-in-without-`vedrid` tests before calling it done.

## Localhost Checks For Stebbi

Before fix:

1. Sign in as a user without `vedrid`.
2. Open `/vedrid`.
3. Try to search and calculate a MET/Yr route.
4. Expected current behavior: likely fails with route/final API 404.

After fix:

1. Signed-out:
   - Open `/vedrid`.
   - Calculate a MET/Yr route.
   - Expected: works, no Veðurstofan.

2. Signed-in without `vedrid`:
   - Open `/vedrid`.
   - Calculate a MET/Yr route.
   - Expected: works like public/base weather, no Veðurstofan.

3. Signed-in without `vedrid`:
   - Open `/auth-mvp/vedrid`.
   - Expected: blocked/redirected.

4. Signed-in with `vedrid`, without `weather-provider-vedurstofan`:
   - Open `/auth-mvp/vedrid`.
   - Expected: MET/Yr works, Veðurstofan hidden.

5. Signed-in with both rows:
   - Open `/auth-mvp/vedrid`.
   - Expected: Veðurstofan layer visible.

6. Place search fallback:
   - If possible, test with browser Google Places unavailable or simulate server fallback.
   - Expected on public `/vedrid`: place search can still return results when `WEATHER_PUBLIC_ENABLED=true`.

Do not test provider graduation by setting `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false` during this fix. That is a separate production decision.

## Commands Run By Codex

Read-only review commands only:

```powershell
Get-Content ai-handoff/2026-07-15-1300-todo-086-v209-claude-public-api-fix-plan.md
Get-Content ai-handoff/README.md
Get-Date -Format 'yyyy-MM-dd HH:mm'
git status --short
Get-Content app/api/teskeid/weather/travel/route.ts
Get-Content lib/__tests__/weather-travel-api.test.ts
Get-Content lib/__tests__/weather-routes-api.test.ts
Get-Content lib/__tests__/place-search-api.test.ts
Get-Content lib/weather/ip-rate-limit.server.ts
Get-Content lib/__tests__/weather-public.test.ts
rg reverseGeocode/reverse-geocode/ENABLE_REVERSE_GEOCODE
rg checkWeatherGuestRateLimit/rate_limited_guest/weather usage events
```

Codex did not change app code, SQL, env, Supabase, commits, push or deploy.

## Óvissa / þarf að staðfesta

The final decision is whether public/base users should consume one daily quota unit per route-options call only, or also on final-submit. Current tests document route-options only. I recommend keeping that for this release and doing broader abuse/cost hardening separately.
