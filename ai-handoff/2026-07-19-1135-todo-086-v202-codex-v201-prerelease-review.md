# 2026-07-19 11:35 - TODO 086 v202 - Codex review of v201, release blocker

Created: 2026-07-19 11:35
Timezone: Atlantic/Reykjavik

## Scope

Review of `2026-07-19-1131-todo-086-v201-claude-v200-done-prerelease` and release decision.

Codex did not change product code, SQL, migrations, commits, pushes, deploys, or production data. This file is a review note only.

## Findings

### High - Do not release v201 yet: dirty flag likely hides the save-default button again

`components/weather/WeatherThresholdBar.tsx:108` resets `dirty` to `false` whenever `thresholds.cautionWindMs` or `thresholds.redWindMs` changes.

In always-open mode, both inputs call `onApply()` immediately when the draft is valid:

- caution input: `components/weather/WeatherThresholdBar.tsx:173`
- danger input: `components/weather/WeatherThresholdBar.tsx:189`

On `/vedrid`, `onApply()` calls `setOverrides()`:

- `components/weather/WeatherOverviewClient.tsx:899`

`setOverrides()` updates `thresholds` through `useWeatherThresholds()`:

- `lib/weather/useWeatherThresholds.ts:37`
- `lib/weather/useWeatherThresholds.ts:38`

That means the normal valid typing path is:

1. user edits input
2. `setDirty(true)`
3. valid input calls `onApply()`
4. `setOverrides()` changes `thresholds`
5. `WeatherThresholdBar` sync effect runs
6. `setDirty(false)`
7. `showSaveButton` becomes false because it requires `dirty`

So v201 appears to reintroduce the exact class of bug v198/v199 were trying to fix: the map updates immediately, but the "save as default" button can disappear before Stebbi can click it.

The current tests do not catch this because they do not exercise the component lifecycle with immediate `onApply()` and prop updates.

## Recommended Fix

Do not reset dirty merely because `thresholds` changed. The component needs to distinguish:

- internal live-apply updates caused by typing
- external sync updates caused by reset, server-loaded saved defaults, or auth-return save

Simplest safe approaches:

1. Remove `setDirty(false)` from the threshold-sync effect and explicitly clear dirty only on:
   - reset button click
   - successful `onSaveDefault` flow if parent can signal saved thresholds changed
   - initial mount if needed

2. Or track the last draft values applied by this component and skip dirty reset when the new thresholds equal the current draft caused by typing.

3. Or move the "touched" state up to `WeatherOverviewClient`, where it can compare draft values against saved defaults independently of live-applied thresholds.

Preferred minimal fix:

- Keep `dirty` true after valid typing.
- Clear `dirty` after explicit save click and after reset.
- Do not clear `dirty` from every `thresholds` prop change.

Also add a test around this exact behavior, preferably with React Testing Library:

- render always-open `WeatherThresholdBar`
- simulate valid input edit
- parent updates `thresholds` in response to `onApply`
- assert save button remains visible

## Release Recommendation

No, do not release after v201 as-is.

Release after Claude Code fixes the dirty reset issue and re-runs:

- `npm run type-check`
- targeted tests
- preferably a new component test for save-button visibility across parent threshold updates

The earlier conditional release stance still applies after this fix:

- SQL82 required for saved wind thresholds
- SQL83 required for Vegagerðin history fallback
- SQL86 required for route-memory
- SQL87 optional and not yet wired
- SQL85 must not be run

## Route Intelligence Check

This v201 handoff did not implement the route-variant dominance or `Varasöm leið` wiring requested in v201 Codex handoff. Claude Code explicitly deferred both.

That is okay for release only if Stebbi accepts them as post-release polish:

- `Leið 1` can still appear beside `Um Hellisheiði`.
- `Varasöm leið` cannot appear because `routeCautionIds` remains `[]`.

For the next route-quality pass, use `2026-07-19-1130-todo-086-v201-codex-route-variant-dominance-and-cautions-handoff.md`.

## Commands Run

- `Get-Content -Encoding UTF8 'ai-handoff/README.md'` - exit 0
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-19-1131-todo-086-v201-claude-v200-done-prerelease.md'` - exit 0
- `git status --short` - exit 0, with Git config ignore permission warnings only
- `Get-Content -Encoding UTF8 'components/weather/WeatherThresholdBar.tsx'` - exit 0
- `Get-Content -Encoding UTF8 'lib/iceland-routes/routeMemory.server.ts'` - exit 0
- `Get-Content -Encoding UTF8 'sql/87_weather_route_memory_route_cautions.sql'` - exit 0
- `Get-Content -Encoding UTF8 'components/weather/WeatherOverviewClient.tsx'` - exit 0
- `Get-Content -Encoding UTF8 'lib/weather/useWeatherThresholds.ts'` - exit 0
- `npm run type-check` - exit 0
- `npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-observation.test.ts` - exit 0, 3 files / 76 tests passed

## Localhost Checks for Stebbi

After Claude Code fixes this:

1. Open `/vedrid` as logged-out user.
2. Confirm `Vista sem sjálfgefin vindmörk` is hidden on initial load.
3. Change `Óþægilegt` or `Hættulegt` to a valid different value.
4. Expected: map updates immediately and save-default button remains visible.
5. Click save-default button.
6. Expected: login redirect happens only on click.
7. Repeat logged in with no saved defaults.
8. Repeat logged in with saved defaults:
   - initial load hides save button
   - valid edit shows save button
   - reverting to saved values hides save button
   - after successful save, button hides
9. Test reset:
   - changing values shows save button
   - clicking reset clears overrides and hides save button

Do not run production SQL, deploy, push, trigger production cron, or touch production data as part of this localhost check.

