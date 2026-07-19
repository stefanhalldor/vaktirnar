# TODO-086 v517 - Codex review of v516 + IcelandRoadmap foundation

Reviewed handoff:
`ai-handoff/2026-07-18-1800-todo-086-v516-claude-v514-v515-done-prerelease.md`

Related roadmap/TODO:

- `TODO.md` #90 - Veður: eigið Íslandsleiðarkerfi og vegkaflagrunnur
- `IcelandRoadmap.md`

## Findings

1. **Medium: `/vedrid` can boot into an empty "Núna" layer even when Veðurstofan forecast data is available**

   In `components/weather/WeatherOverviewClient.tsx`, `activeMode` defaults to `'now'` (line 96). The Vegagerðin provider is visible only when `activeMode === 'now'` (line 398), while Veðurstofan is visible only when `typeof activeMode === 'number'` (line 198). If Vegagerðin is restricted, disabled, or returns no usable current cache, the overview can initially show no map layer even though forecast slots exist and Veðurstofan could render after a click.

   Fix: add a guarded fallback effect. If `activeMode === 'now'`, Vegagerðin has settled with no usable layer or restricted state, and `forecastSlotStatuses[0]` exists, switch to that first forecast slot. Do not override a user-selected mode after the user has clicked.

2. **Low: Veðurstofan station detail still exposes raw ISO-ish timestamps in metadata**

   `StationDetail` still renders `station.atimeIso`, `station.fetchedAtIso`, and `station.expiresAtIso` directly in the metadata block (`components/weather/WeatherOverviewClient.tsx`, lines 628-643). v516 fixed the forecast-row display, but this metadata remains less polished than the rest of the UI.

   Fix: use `formatCompactDateTime(..., locale)` or remove these metadata fields from the public-facing preview card if they are not important for the overview experience.

3. **Low/UX: forecast selector only shows hour labels visually, so day context can disappear across midnight**

   `WeatherSourceTimeSelector` derives `hourLabel` with `toISOString().slice(11, 13)` and renders only the hour (`components/weather/WeatherSourceTimeSelector.tsx`, lines 115-136). The aria-label has the full date, but visual users lose day context when the scrubber spans multiple days.

   Fix: keep the compact layout, but add a small day marker at day boundaries or above the first slot per day, similar to the prior scrubber behavior.

## What v516 did well

- Good direction: `selectForecastRowAt()` centralizes the forecast-row selection semantics in `lib/weather/windDisplayStatus.ts`.
- Good direction: map marker color for current observations is now wind-threshold driven, not freshness-driven.
- Good direction: `WeatherSourceTimeSelector` starts aligning `/vedrid` overview with `/ferdalagid` source/time mental model.
- Good direction: status filter counts are exclusive to the selected mode, avoiding mixed "Núna + spá" counts.

## Codex changes made in this pass

Stebbi explicitly asked Codex to:

- add this recurring concern to workflow
- create a separate `IcelandRoadmap.md`
- create a code landing place for this gradually-built Iceland route system
- do this alongside the v516 review

Implemented:

- Updated `WORKFLOW.md` with a required `IcelandRoadmap / leiðartengd vinna` section.
- Added `IcelandRoadmap.md` at repo root.
- Added `lib/iceland-routes/README.md`.
- Added `lib/iceland-routes/types.ts`.
- Added `lib/iceland-routes/index.ts`.

No runtime behavior is changed by the new `lib/iceland-routes/` package. It only establishes typed contracts and a landing zone.

No SQL was run.
No migration was run.
No commit, push, deploy, Vercel change or Supabase production action was performed.

## New workflow rule

Any route-related Weather work now needs a short `Route intelligence check`.

This includes work on:

- route options
- curated routes
- road segments
- control points
- route cautions
- provider-station matching
- route-cache
- interest heatmap
- `/vedrid` overview map
- `/vedrid/ferdalagid`

The check should answer whether the change teaches Teskeið reusable Iceland-road knowledge that belongs in `IcelandRoadmap.md` or `lib/iceland-routes/`.

## Route intelligence check for v516

- Route/segment touched: no specific road segment; this is overview source/time selection and provider map-status work.
- Should update registry: no, because v516 does not add road knowledge.
- Should update roadmap: yes, because the broader thread is moving toward a reusable Iceland route core.
- Provider-neutrality: partially good. `WeatherOverviewShell` remains provider-neutral, but `WeatherOverviewClient` is still the adapter that wires Vegagerðin/Veðurstofan behavior.
- Privacy/cost: no new persistence or external route calls in this Codex pass.

## Recommended next large Claude step

Do one combined hardening pass, then continue toward the next IcelandRoadmap phase:

1. Fix the `activeMode === 'now'` fallback so `/vedrid` never appears blank just because Vegagerðin is restricted/empty while forecast data exists.
2. Format or remove the raw Veðurstofan metadata ISO timestamps in `StationDetail`.
3. Add visual day context to `WeatherSourceTimeSelector` forecast slots without causing horizontal page overflow.
4. Add tests for the fallback behavior and the shared forecast-row selector if missing from v516 coverage.
5. Start R1 only as a small registry skeleton after the above is clean:
   - add `lib/iceland-routes/segments.ts` with a tiny first draft for the known critical segment IDs, or
   - create a plan if Claude Code thinks the existing `lib/weather/routeControlPoints.ts` and `routeCautions.ts` need to be moved more carefully.

Important: do not migrate existing route logic into `lib/iceland-routes/` in the same pass unless it is a pure move with tests. The first useful step is a clear seam and typed registry, not a risky rewrite.

## Files reviewed

- `ai-handoff/2026-07-18-1800-todo-086-v516-claude-v514-v515-done-prerelease.md`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherSourceTimeSelector.tsx`
- `components/weather/WeatherOverviewShell.tsx`
- `lib/weather/windDisplayStatus.ts`
- `messages/is.json`
- `messages/en.json`
- `WORKFLOW.md`
- `TODO.md`

## Files changed by Codex

- `WORKFLOW.md`
- `IcelandRoadmap.md`
- `lib/iceland-routes/README.md`
- `lib/iceland-routes/types.ts`
- `lib/iceland-routes/index.ts`

## Validation run by Codex

- `npm run type-check` - pass, exit code 0

I did not run the full test suite.
I did not run localhost/browser tests.

## Localhost checks for Stebbi

For the Codex foundation files, there is no user-visible behavior to test.

For v516 before release or next prerelease:

1. Open `/vedrid` as public and authenticated.
2. Test when both Vegagerðin and Veðurstofan have data.
   - Expected: `Núna` shows Vegagerðin; selecting a forecast slot shows Veðurstofan/Yr.
3. Test with Vegagerðin unavailable/restricted/empty if possible.
   - Expected after the next fix: page should fall back to the first Veðurstofan forecast slot instead of looking empty or broken.
4. Scroll forecast slots across midnight.
   - Expected after the next fix: the user can tell when the day changes.
5. Open a Veðurstofan station detail.
   - Expected after the next fix: timestamps are formatted like the rest of Teskeið, not raw ISO strings.

No SQL, Supabase, migration, Vercel, production or secrets checks apply to the Codex foundation changes.

## Open uncertainty

- I did not verify v516 visually on localhost.
- I did not inspect every changed file in the very large dirty working tree.
- The `activeMode` fallback concern should be validated against real local data because the current behavior depends on provider flags and cache state.

