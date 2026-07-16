# Codex review: v208 flag prerelease before localhost

Created: 2026-07-15 12:40
Timezone: Atlantic/Reykjavik
TODO: todo-086
Reviewed handoff: `2026-07-15-1235-todo-086-v208-claude-prerelease.md`

## Findings

### Blocking: signed-in users without `vedrid` still cannot reliably use public MET/Yr

Stebbi's stated product rule is:

- everyone, signed-in and public, should see the current MET/Yr forecast
- selected users should additionally see Veðurstofan and the Vegagerðin-coming-soon affordance

The current flag model protects `/auth-mvp/vedrid` correctly, but the public product path still has API gates that can block signed-in users who do not have `feature_access = 'vedrid'`.

Relevant code:

- `app/vedrid/page.tsx:4-13` exposes the public weather page when `WEATHER_PUBLIC_ENABLED=true`.
- `app/api/teskeid/weather/travel/routes/route.ts:39-48` treats any authenticated user as the authenticated path and requires `checkFeatureAccess(..., 'vedrid')`.
- `app/api/teskeid/weather/travel/route.ts:185-195` does the same for the final weather result API.
- `app/api/place/search/route.ts:33-42` requires an authenticated user with `vedrid`.
- `components/weather/PlaceSearch.tsx:86-90` uses `/api/place/search` as the server fallback when browser Google Places fails/times out.

Impact:

- Signed-out users can hit the guest branch of the travel APIs when `WEATHER_PUBLIC_ENABLED=true`.
- Signed-in users without `vedrid` are not treated as public users. They can load `/vedrid`, but route option calculation and final MET/Yr calculation can return 404.
- Public place search fallback is also not truly public; it can fail for signed-out users and for signed-in users without `vedrid` if Google browser autocomplete is unavailable.

This contradicts the desired release posture. I would not call this production-ready until fixed or explicitly accepted as a temporary limitation.

Recommended fix:

- Keep `/auth-mvp/vedrid` gated by `WEATHER_AUTH_ACCESS_REQUIRED=true`.
- For base MET/Yr APIs, allow access when either:
  - user has `vedrid`, or
  - `WEATHER_PUBLIC_ENABLED=true`
- If an authenticated user lacks `vedrid`, treat them like the public/base-weather path, not as forbidden.
- Keep saved places, admin-only functions, Veðurstofan refresh/freshness and Veðurstofan layer behind the authenticated feature/provider gates.
- Add rate limiting to public fallback paths where Google/server-side APIs can cost money.

Tests to add before release:

- signed-out + `WEATHER_PUBLIC_ENABLED=true` can use route options and final MET/Yr result
- signed-in without `vedrid` + `WEATHER_PUBLIC_ENABLED=true` can use route options and final MET/Yr result, with no Veðurstofan layer
- signed-in without `vedrid` remains blocked from `/auth-mvp/vedrid`
- signed-in with `vedrid` but without `weather-provider-vedurstofan` gets MET/Yr only
- signed-in with both rows gets Veðurstofan layer
- `/api/place/search` public fallback behavior is intentional and tested

### Medium: v208 test run is too narrow for the actual release risk

`2026-07-15-1235-todo-086-v208-claude-prerelease.md:18-22` reports only:

```text
npx vitest run lib/__tests__/guard.test.ts -> 91 passed
```

That validates the core guard function, but the release risk is in API composition: whether public weather, authenticated weather and provider layers combine correctly. The current issue above is exactly outside `guard.test.ts`.

Before release, after fixing the blocker, run at least:

```text
weather-routes-api
weather-travel-api
place-search-api
feature-access-api
guard
typecheck
```

### Low: Vercel env checklist is good, but SQL76 must be confirmed in the target database

`app/api/admin/feature-access/route.ts:7` allows `weather-provider-vedurstofan`, and guard uses that key. This requires the production `feature_access` CHECK constraint to include `weather-provider-vedurstofan`.

Stebbi has previously reported SQL76 was run successfully, so this is probably already fine. Still, before production release, confirm the target Supabase project has SQL76 applied. Otherwise admin insert of provider access can fail even if the UI and env flags look correct.

## What Looks Correct

- `lib/loans/guard.ts:70-80` implements `WEATHER_AUTH_ACCESS_REQUIRED` precedence correctly.
- `lib/loans/guard.ts:92-100` keeps Veðurstofan per-user by default.
- `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` is no longer read by guard.
- `app/api/admin/feature-access/route.ts:7` includes `weather-provider-vedurstofan`.
- `lib/__tests__/guard.test.ts:955-960` has the improved test name from v208.
- v208 handoff now clearly says to remove old local/Vercel flags instead of mapping one specific old value.

## Release Recommendation

Do not release this as final yet if the product requirement is "all signed-in and public users can use MET/Yr".

Next best step:

1. Let Stebbi run localhost checks now if desired, but include the signed-in-without-`vedrid` public `/vedrid` case first.
2. If that case fails as expected, Claude Code should patch the API access model so public/base MET/Yr is allowed when `WEATHER_PUBLIC_ENABLED=true`, regardless of whether the request has an auth cookie.
3. Keep `/auth-mvp/vedrid` and Veðurstofan provider access restricted.

## Localhost Checks For Stebbi

Use these checks before deciding release readiness:

1. Signed-out public user:
   - Open `/vedrid`.
   - Search origin/destination.
   - Calculate route and MET/Yr result.
   - Expected: works, no Veðurstofan controls/layer.

2. Signed-in user without `vedrid`:
   - Open `/vedrid`, not `/auth-mvp/vedrid`.
   - Search origin/destination.
   - Calculate route and MET/Yr result.
   - Expected product behavior: works exactly like public MET/Yr, no Veðurstofan.
   - Current risk: likely fails on route option or final result API.

3. Signed-in user without `vedrid`:
   - Open `/auth-mvp/vedrid`.
   - Expected: blocked/redirected.

4. Signed-in user with `vedrid` but without `weather-provider-vedurstofan`:
   - Open `/auth-mvp/vedrid`.
   - Expected: MET/Yr works, Veðurstofan hidden.

5. Signed-in user with both `vedrid` and `weather-provider-vedurstofan`:
   - Open `/auth-mvp/vedrid`.
   - Expected: MET/Yr works and Veðurstofan layer is available.

6. Optional fallback check:
   - Temporarily force Google Places browser autocomplete to fail only in local/dev if easy.
   - Expected for public `/vedrid`: server fallback should not require `vedrid` if `WEATHER_PUBLIC_ENABLED=true`, or the limitation should be explicit.

Do not test production feature rows casually while changing this. Provider access rows affect who can see experimental Veðurstofan data.

## Commands Run By Codex

Read-only review commands:

```powershell
Get-Content WORKFLOW.md
Get-Content ai-handoff/README.md
Get-Content ai-handoff/2026-07-15-1235-todo-086-v208-claude-prerelease.md
git status --short
Get-Content app/api/admin/feature-access/route.ts
Get-Content lib/loans/guard.ts
Get-Content lib/__tests__/guard.test.ts
Get-Content .env.example
rg WEATHER_PUBLIC_ENABLED/WEATHER_AUTH_ACCESS_REQUIRED/provider access references
Get-Content app/vedrid/page.tsx
Get-Content app/api/teskeid/weather/travel/routes/route.ts
Get-Content app/api/teskeid/weather/travel/route.ts
Get-Content app/api/place/search/route.ts
Get-Content components/weather/PlaceSearch.tsx
Get-Date -Format 'yyyy-MM-dd HH:mm'
```

Codex did not run tests and did not change app code, SQL, env, Supabase, commits, push or deploy.

## Óvissa / þarf að staðfesta

I did not run the browser flow. The blocker is inferred from code paths and should be confirmed quickly on localhost with a signed-in user who has no `vedrid` row.
