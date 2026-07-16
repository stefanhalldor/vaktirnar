# Review: v227 authenticated weather mode fix

Created: 2026-07-15 16:07
Timezone: Atlantic/Reykjavik
Relevant TODO: todo-086
Reviewed handoff: `2026-07-15-1602-todo-086-v227-claude-v226-done-prerelease`

## Findings

### P1 - Commit/staging risk is high because the worktree is much dirtier than the v227 handoff scope

`git status --short` shows many unrelated modified/untracked files in the repo. The v227 handoff lists a narrow set of files, but the overall worktree contains a much larger pile of earlier weather/admin/handoff/docs changes. This does not prove Claude Code went out of scope in v227, but it means commit/release risk is high if anyone stages broadly.

Do not use `git add .`, broad folder staging, or a broad commit. Before any commit, Claude Code should show a narrowly filtered `git status --short -- <expected files>` and stage only the files that belong to this specific release slice.

Relevant v227 files currently visible in status:

- `app/api/teskeid/weather/saved-places/route.ts`
- `app/api/teskeid/weather/saved-places/[id]/route.ts`
- `lib/weather/weatherBaseAccess.server.ts` (untracked)
- `lib/weather/weatherEnabledMode.server.ts` (untracked)
- relevant weather/home tests

### P2 - Runtime fix looks right, but the inline access-contract comments still say the old/wrong behavior

In `lib/weather/weatherBaseAccess.server.ts`, the code now allows signed-in users without `vedrid` when `WEATHER_ENABLED=Authenticated`, which is what Stebbi wanted. But the doc comments still say the opposite:

- `lib/weather/weatherBaseAccess.server.ts:24` says `WEATHER_ENABLED=Authenticated: signed-in user without vedrid -> blocked`
- `lib/weather/weatherBaseAccess.server.ts:59-60` says `authenticated-public` is only `WEATHER_ENABLED=All`, and `Authenticated` blocks users without `vedrid`

That is now stale and dangerous. The code is okay; the contract text is wrong. This should be fixed before commit because this exact area has already caused confusion between public, authenticated, and per-user provider access.

Correct contract should be:

- `WEATHER_ENABLED=All`: signed-out users get public MET/Yr; signed-in users get authenticated shell/API behavior and saved places.
- `WEATHER_ENABLED=Authenticated`: signed-in users get base MET/Yr and saved places even without `vedrid`; signed-out users are blocked.
- `vedrid` is no longer required for base weather when mode is `All` or `Authenticated`; it can remain as private/legacy stronger access, but must not block the base weather shell.
- Veðurstofan remains separate under `weather-provider-vedurstofan`.

### P2 - A static test still documents the old `WEATHER_PUBLIC_ENABLED` contract

`lib/__tests__/weather-public.test.ts:203-209` still says guest access requires both `WEATHER_ENABLED=true` and `WEATHER_PUBLIC_ENABLED=true`.

That is legacy fallback behavior, not the new primary contract. The new primary contract is `WEATHER_ENABLED=All` for public + authenticated and `WEATHER_ENABLED=Authenticated` for signed-in only.

This test is not necessarily breaking runtime, but it is documenting the wrong product/config contract. It should be updated before commit so future agents do not keep resurrecting `WEATHER_PUBLIC_ENABLED` as the main switch.

### P2 - Tests still lean too much on legacy env values instead of the new explicit modes

Several important tests still use `WEATHER_ENABLED='true'` with `WEATHER_PUBLIC_ENABLED` rather than explicit `WEATHER_ENABLED='All'` or `WEATHER_ENABLED='Authenticated'`.

Examples:

- `lib/__tests__/home-page.test.tsx:1231-1252`
- `lib/__tests__/weather-travel-api.test.ts:150-168`

It is okay to keep one or two legacy fallback tests, but the primary behavior should be tested with the new values. Otherwise tests can pass because fallback compatibility works, while the actual Vercel/env contract remains under-tested.

Minimum expected coverage:

- signed-out user sees public `/vedrid` when `WEATHER_ENABLED=All`
- signed-in user without `vedrid` sees `/auth-mvp/vedrid` and saved places when `WEATHER_ENABLED=All`
- signed-in user without `vedrid` sees `/auth-mvp/vedrid` and saved places when `WEATHER_ENABLED=Authenticated`
- signed-out user is blocked when `WEATHER_ENABLED=Authenticated`
- Veðurstofan is still hidden unless `weather-provider-vedurstofan` per-user access is present

### P3 - Saved-places guard works, but it duplicates the auth contract instead of using the shared helper

The saved places routes now allow signed-in users when mode is `all` or `authenticated`:

- `app/api/teskeid/weather/saved-places/route.ts:31-40`
- `app/api/teskeid/weather/saved-places/[id]/route.ts:14-27`

This appears functionally okay. But it repeats part of the access logic instead of using `resolveAuthenticatedWeatherShellAccess`, so it can drift again. Not a blocker for this fix if time is tight, but the next cleanup should either centralize saved-places access through the shared helper or add tests that make drift unlikely.

## What Looks Good

I do not see evidence, in the inspected v227 files, that Claude Code went wildly out of functional scope. The central runtime change in `resolveWeatherBaseAccess` and `resolveAuthenticatedWeatherShellAccess` matches Stebbi's intended behavior:

- Public users can keep seeing MET/Yr when weather is public.
- Signed-in users without `vedrid` can still use the authenticated weather shell.
- Saved places can work for signed-in users without special `vedrid`.
- Veðurstofan remains separately gated.

The long runtime/token use seems more likely caused by test repair and existing dirty worktree complexity than by an obviously oversized feature implementation. Still, commit scope must be handled very carefully.

## Recommended Next Step

Ask Claude Code for a very small follow-up, not a new architecture pass:

1. Fix stale comments in `lib/weather/weatherBaseAccess.server.ts`.
2. Update stale/static tests so the main contract uses `WEATHER_ENABLED=All` and `WEATHER_ENABLED=Authenticated`.
3. Keep legacy fallback tests only where they are explicitly named as legacy fallback.
4. Re-run the already relevant test subset, or full test suite if Claude Code thinks that is necessary.
5. Return a new handoff with a filtered list of exactly which files belong to this release slice.

Do not ask Claude Code to refactor saved-places guard right now unless it can be done in a very small, obvious way. The current guard appears to work, and more refactor could create a new rabbit hole.

## Suggested Copy/Paste To Claude Code

```text
Claude Code, rýni Codex á v227 er í `ai-handoff/2026-07-15-1607-todo-086-v228-codex-v227-authenticated-mode-review.md`.

Vinsamlega gerðu aðeins þrönga follow-up lagfæringu:

1. Laga stale comments í `lib/weather/weatherBaseAccess.server.ts` þannig að þau lýsi nýja samningnum rétt:
   - WEATHER_ENABLED=All: public + authenticated fá base MET/Yr
   - WEATHER_ENABLED=Authenticated: aðeins innskráðir fá base MET/Yr
   - `vedrid` má ekki loka base weather þegar mode er All eða Authenticated
   - Veðurstofan er áfram sér-gated með `weather-provider-vedurstofan`

2. Laga stale/static tests sem segja gamla `WEATHER_PUBLIC_ENABLED` contractinn.
   Primary tests eiga að nota `WEATHER_ENABLED=All` og `WEATHER_ENABLED=Authenticated`.
   Legacy `WEATHER_ENABLED=true` + `WEATHER_PUBLIC_ENABLED` má aðeins vera í sérstaklega merktum legacy fallback tests.

3. Ekki fara í nýja architecture/refactor nema það sé augljóst og mjög lítið.
   Saved-places guard virðist functional; ekki breyta honum nema test/doc cleanup krefjist þess.

4. Skilaðu handoff með nákvæmlega:
   - hvaða skrár breyttust
   - hvaða test voru keyrð
   - filtered `git status` fyrir v227/v228 skrárnar
   - staðfestingu á að ekkert hafi verið staged/committed/pushed/deployed

Ekki nota broad staging eða `git add .`.
```

## Localhost Checks For Stebbi

After Claude Code finishes the small follow-up, Stebbi should test these exact flows on localhost:

1. `WEATHER_ENABLED=All`
   - Signed out: open `/vedrid`.
   - Expected: MET/Yr weather is visible.
   - Signed in without `vedrid`: open `/auth-mvp/heim`.
   - Expected: `Veðrið` card is visible and opens `/auth-mvp/vedrid`; saved places remain available.
   - Expected: Veðurstofan does not appear unless that user has `weather-provider-vedurstofan`.

2. `WEATHER_ENABLED=Authenticated`
   - Signed out: open `/vedrid`.
   - Expected: public weather is blocked/not visible.
   - Signed in without `vedrid`: open `/auth-mvp/heim`.
   - Expected: `Veðrið` card is visible and opens `/auth-mvp/vedrid`; saved places remain available.

3. Veðurstofan provider gate
   - Signed in without `weather-provider-vedurstofan`: base MET/Yr works, Veðurstofan hidden.
   - Signed in with `weather-provider-vedurstofan`: Veðurstofan layer/filter appears.

Do not casually test production env changes until the exact Vercel variables are reviewed. This touches auth/weather access, not Supabase schema or RLS directly, but wrong env values can change who sees weather.

## Tests / Verification By Codex

Codex reviewed the handoff and inspected relevant files locally. Codex did not rerun the 2544 tests or typecheck in this review. The claim that all tests pass comes from Claude Code's handoff, not from a fresh Codex run.

## Uncertainty / Needs Confirmation

- I did not inspect every file in the very dirty worktree, only the v227-relevant files and tests. There may be older unrelated changes waiting from previous handoffs.
- The runtime behavior looks aligned, but the stale comments and stale static test contract should be fixed before release because this has already been a repeated source of confusion.
