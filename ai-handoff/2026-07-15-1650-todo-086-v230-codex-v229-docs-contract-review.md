# Review: v229 docs/contract fix prerelease

Created: 2026-07-15 16:50
Timezone: Atlantic/Reykjavik
Relevant TODO: todo-086
Reviewed handoff: `2026-07-15-1650-todo-086-v229-claude-v228-docs-contract-fix-prerelease`

## Findings

### P2 - Some "contract tests" are still documentation-only and would not catch a regression

`lib/__tests__/weather-public.test.ts:204-237` now describes the right primary contract, but these tests are mostly hardcoded booleans:

- `const guestPublicAccessEnabled = true`
- `const signedInWithoutVedridAllowed = true`
- `const guestBlockedInAuthenticatedMode = true`
- `const vedridRequiredForBaseMet = false`

That improves documentation, but it does not prove the implementation follows the contract. If `getWeatherEnabledMode()` or `resolveWeatherBaseAccess()` regressed tomorrow, these tests would still pass.

Given how much confusion this flag model has caused, I would ask Claude Code for one narrow follow-up before release:

- Add direct runtime unit tests for `getWeatherEnabledMode()`:
  - `WEATHER_ENABLED=All` -> `all`
  - `WEATHER_ENABLED=Authenticated` -> `authenticated`
  - missing/unknown -> `off`
  - legacy `WEATHER_ENABLED=true + WEATHER_PUBLIC_ENABLED=true` -> `all`
  - legacy `WEATHER_ENABLED=true` without public flag -> `authenticated`
- Add direct runtime unit tests for `resolveWeatherBaseAccess()` or ensure route-level tests cover:
  - signed-out + `All` -> public
  - signed-out + `Authenticated` -> blocked
  - signed-in without `vedrid` + `Authenticated` -> authenticated
  - signed-in without `vedrid` + `All` -> public base access, while authenticated shell remains available elsewhere

This does not need another architecture pass. It should be a small test-quality fix.

### P3 - A stale heading still mentions `WEATHER_PUBLIC_ENABLED` as the main behavior

Top comment in `lib/__tests__/weather-public.test.ts:4-7` still says:

> `B. Public weather env-flag guard — WEATHER_PUBLIC_ENABLED behaviour`

That should be updated to the new wording, for example:

> `B. Weather mode guard — WEATHER_ENABLED=All/Authenticated and legacy fallback`

This is not a runtime issue, but it keeps the old mental model alive.

### P3 - One travel API test still uses legacy fallback without saying so in the test title

`lib/__tests__/weather-travel-api.test.ts:188-192` still uses `WEATHER_PUBLIC_ENABLED=true` with the default `WEATHER_ENABLED=true`, but the test title is:

> `includes vedurstofanLayer for signed-in public-tier user with weather-provider-vedurstofan access`

It should either:

- become an explicit new-mode test using `WEATHER_ENABLED=All`, or
- be renamed as a legacy fallback test.

Because this test covers Veðurstofan provider access for a public-tier signed-in user, I prefer making it explicit `WEATHER_ENABLED=All`. That is the production contract Stebbi is trying to deploy.

## What Looks Good

The stale JSDoc comments in `lib/weather/weatherBaseAccess.server.ts` look fixed:

- `WEATHER_ENABLED=Authenticated` now correctly allows signed-in users without `vedrid` for base weather.
- signed-out users are correctly blocked in `Authenticated`.
- `resolveAuthenticatedWeatherShellAccess` now says `authenticated-public` applies in both `All` and `Authenticated` when the signed-in user lacks private `vedrid`.
- Veðurstofan is still explicitly documented as separately gated.

The home page tests now include explicit new-mode tests:

- `WEATHER_ENABLED=All` signed-in without `vedrid` sees `Veðrið`.
- `WEATHER_ENABLED=Authenticated` signed-in without `vedrid` sees `Veðrið`.

That directly addresses the original localhost bug where an authenticated user without special weather access could not see weather while signed-out users could.

I also agree with v229 not refactoring saved-places guards right now. The current phase should stay narrow.

## Scope / Out-Of-Scope Assessment

v229 appears appropriately scoped. It touched comments and tests only, according to the handoff and the inspected files. I do not see evidence that Claude Code wandered into product or architecture changes in this follow-up.

The larger repo is still very dirty, so the main release risk remains staging discipline, not v229 itself.

## Recommended Next Step

Before release, ask Claude Code for a very small v231 test cleanup:

1. Convert the key `weather-public.test.ts` static contract checks into real tests of `getWeatherEnabledMode()` and/or `resolveWeatherBaseAccess()`.
2. Update the stale top comment in `weather-public.test.ts`.
3. Make the provider-access public-tier travel test use explicit `WEATHER_ENABLED=All`, or rename it as legacy fallback.
4. Re-run the targeted tests and typecheck.
5. Return a filtered `git status` for only the release slice.

If Claude Code pushes back, I would still at minimum require item 1 for `getWeatherEnabledMode()`, because that is the core env contract Stebbi is about to configure in Vercel.

## Suggested Copy/Paste To Claude Code

```text
Claude Code, Codex rýni á v229 er í `ai-handoff/2026-07-15-1650-todo-086-v230-codex-v229-docs-contract-review.md`.

Vinsamlega gerðu mjög þrönga v231 follow-up fyrir test quality, ekki architecture/refactor:

1. Í `lib/__tests__/weather-public.test.ts`, breyttu lykil "contract tests" sem eru bara `const true/false` í raunveruleg tests á `getWeatherEnabledMode()` og/eða `resolveWeatherBaseAccess()`.
   Lágmarks coverage:
   - WEATHER_ENABLED=All -> all
   - WEATHER_ENABLED=Authenticated -> authenticated
   - missing/unknown -> off
   - legacy WEATHER_ENABLED=true + WEATHER_PUBLIC_ENABLED=true -> all
   - legacy WEATHER_ENABLED=true án public flag -> authenticated
   - signed-out + All -> public
   - signed-out + Authenticated -> blocked
   - signed-in án vedrid + Authenticated -> authenticated

2. Lagaðu stale toppkomment í `weather-public.test.ts` sem talar enn um `WEATHER_PUBLIC_ENABLED behaviour` sem aðalcontract.

3. Í `lib/__tests__/weather-travel-api.test.ts`, testið `includes vedurstofanLayer for signed-in public-tier user with weather-provider-vedurstofan access` notar enn legacy `WEATHER_PUBLIC_ENABLED=true`. Gerðu það explicit `WEATHER_ENABLED=All`, eða rename-aðu sem legacy fallback. Ég mæli með explicit `All`.

4. Ekki refactora saved-places eða route logic nema test cleanup krefjist þess.

5. Keyrðu targeted tests og typecheck ef þarf, og skilaðu handoff með nákvæmum skrám, skipunum, exit codes og filtered `git status`.

Ekki stage-a, commit-a, push-a eða deploya.
```

## Localhost Checks For Stebbi

No new localhost behavior should change from v229/v230 if Claude Code only improves tests/docs.

Still, before release, Stebbi should verify the actual product contract:

1. With `WEATHER_ENABLED=All`
   - Signed out: `/vedrid` opens and shows MET/Yr.
   - Signed in without provider access: `/auth-mvp/heim` shows `Veðrið`; `/auth-mvp/vedrid` opens; Veðurstofan is hidden.
   - Signed in with `weather-provider-vedurstofan`: Veðurstofan appears.

2. With `WEATHER_ENABLED=Authenticated`
   - Signed out: `/vedrid` is not available.
   - Signed in without `vedrid`: `/auth-mvp/heim` shows `Veðrið`; `/auth-mvp/vedrid` opens and saved places remain available.
   - Veðurstofan remains hidden unless `weather-provider-vedurstofan` access exists.

Do not test Vercel/production env casually until the final env variable list is confirmed. Wrong values can change who sees weather, even though this change does not touch SQL/RLS directly.

## Tests / Verification By Codex

Codex read the v229 handoff and inspected the relevant code/test files. Codex did not rerun the 2553 tests or typecheck. Test-pass claims are from Claude Code's handoff.

## Uncertainty / Needs Confirmation

The repo worktree remains very dirty with many unrelated modified/untracked files. Before any commit, Claude Code must provide a filtered release-slice status and avoid broad staging.
