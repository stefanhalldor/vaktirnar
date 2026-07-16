# Review: v231 real unit tests prerelease

Created: 2026-07-15 16:56
Timezone: Atlantic/Reykjavik
Relevant TODO: todo-086
Reviewed handoff: `2026-07-15-1656-todo-086-v231-claude-v230-real-unit-tests-prerelease`

## Findings

### No P1/P2 blockers found

v231 appears to address the main concern from v230. The previous static flag-contract tests have now been backed by real unit tests for:

- `getWeatherEnabledMode()`
- `resolveWeatherBaseAccess()`

The Veðurstofan provider travel test also now uses the new primary contract, `WEATHER_ENABLED=All`, rather than relying on legacy `WEATHER_ENABLED=true + WEATHER_PUBLIC_ENABLED=true`.

### P3 - A few static documentation tests remain, but they are no longer blocking

`lib/__tests__/weather-public.test.ts:191-211` still has static documentation tests for the guest saved-places contract, and `lib/__tests__/weather-public.test.ts:319-340` still has static documentation tests for rate-limit routing behavior.

I do not consider this a release blocker for the authenticated-mode contract because the core mode parser and base-access helper now have real tests. If this area is touched later, it would be better to replace those remaining static tests with route-level tests, but I would not keep this release stuck on that.

### P3 - Travel route still keeps one legacy signed-in Authenticated fallback test

`lib/__tests__/weather-travel-api.test.ts:150-155` still tests signed-in Authenticated behavior through legacy `WEATHER_ENABLED=true` with no `WEATHER_PUBLIC_ENABLED`. This is clearly named as legacy and is now complemented by direct `resolveWeatherBaseAccess()` tests for `WEATHER_ENABLED=Authenticated`.

Not a blocker. A future cleanup could add a route-level explicit `WEATHER_ENABLED=Authenticated` signed-in test, but the current coverage is sufficient for this slice.

## What Looks Good

`lib/__tests__/weather-public.test.ts` now directly tests the critical env contract:

- `WEATHER_ENABLED=All` -> `all`
- `WEATHER_ENABLED=Authenticated` -> `authenticated`
- missing/unknown value -> `off`
- legacy `WEATHER_ENABLED=true + WEATHER_PUBLIC_ENABLED=true` -> `all`
- legacy `WEATHER_ENABLED=true` without public flag -> `authenticated`

It also directly tests base access behavior:

- signed-out + `All` -> `public`
- signed-out + `Authenticated` -> `blocked`
- signed-in without `vedrid` + `Authenticated` -> `authenticated`
- signed-in without `vedrid` + `All` -> `public`
- signed-in with `vedrid` + `All` -> `authenticated`
- off -> `blocked`

`lib/__tests__/weather-travel-api.test.ts:188-202` now verifies the Veðurstofan provider layer under `WEATHER_ENABLED=All`, with `vedrid` false and `weather-provider-vedurstofan` true. That is the exact primary-contract case we wanted guarded.

`lib/weather/weatherBaseAccess.server.ts` comments still match the intended contract after v229/v231.

## Scope Assessment

v231 looks appropriately scoped. It changes tests only, according to the handoff and inspected files. I do not see signs of new product/route behavior being introduced in this follow-up.

The broader worktree is still dirty, so the commit/release warning remains: stage only the exact release slice and do not use broad staging.

## Recommendation

I would stop the review-polish loop here and move to Stebbi localhost testing.

Before commit/release, Claude Code should still provide:

- filtered `git status --short` for only the release slice
- exact staged file list if/when Stebbi asks for commit
- confirmation that the two new files are included:
  - `lib/weather/weatherBaseAccess.server.ts`
  - `lib/weather/weatherEnabledMode.server.ts`

No more implementation changes are recommended for this specific authenticated weather mode contract unless localhost testing finds a real bug.

## Localhost Checks For Stebbi

Use these checks before release:

1. `WEATHER_ENABLED=Authenticated`
   - Signed out: `/vedrid` should not be available.
   - Signed in without `vedrid` or `weather-provider-vedurstofan`: `/auth-mvp/heim` should show `Veðrið`; `/auth-mvp/vedrid` should open; base MET/Yr should work; Veðurstofan should be hidden.
   - Signed in with `weather-provider-vedurstofan`: `/auth-mvp/vedrid` should open and Veðurstofan should appear.

2. `WEATHER_ENABLED=All`
   - Signed out: `/vedrid` should open and show base MET/Yr.
   - Signed in without provider access: `/auth-mvp/heim` should show `Veðrið`; `/auth-mvp/vedrid` should open; Veðurstofan should be hidden.
   - Signed in with `weather-provider-vedurstofan`: Veðurstofan should appear.

3. Saved places regression
   - Signed in without `vedrid` but with `WEATHER_ENABLED=Authenticated`: saved places in `/auth-mvp/vedrid` should still load/save/delete for that user.
   - Signed out: saved places should not expose private rows.

Do not test production Vercel env changes casually. This does not touch SQL/RLS directly, but wrong env values can change who sees weather.

## Tests / Verification By Codex

Codex inspected:

- `ai-handoff/2026-07-15-1656-todo-086-v231-claude-v230-real-unit-tests-prerelease.md`
- `lib/__tests__/weather-public.test.ts`
- `lib/__tests__/weather-travel-api.test.ts`
- `lib/weather/weatherEnabledMode.server.ts`
- `lib/weather/weatherBaseAccess.server.ts`
- filtered `git status`

Codex did not rerun the 2558 tests or typecheck. The passing test/typecheck claims are from Claude Code's handoff.

## Uncertainty / Needs Confirmation

The repo still has many unrelated dirty/untracked files. This review only covers the v226-v231 authenticated weather mode release slice, not the whole worktree.
