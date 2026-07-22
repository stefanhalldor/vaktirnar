# 2026-07-22 12:53 - TODO 086 v323 - Codex now-first Vegagerdin + opt-in forecast prerelease

## Context

Stebbi asked Codex to review `2026-07-22-1440-todo-086-v322-claude-v321-review-diagnosis` and fix the reported localhost issues:

- Remove departure time from the route-driving form.
- Make `Núna` selected by default when the route opens.
- Clicking departure-time opt-in in the scrubber should start forecast calculation instead of immediately showing an error.
- Route wind for `Núna` must use current Vegagerdin observations only, not Vedurstofan/MET forecast values.

Execution permission was explicit. No SQL, env, commit, push, deploy, Supabase, or production action was performed.

## Plan

1. Read v322 diagnosis and the current RoadMapPrototype flow.
2. Remove route-form departure time from state, UI, and `/api/teskeid/weather/travel` request body.
3. Force route-open `Núna` mode to use Vegagerdin current observations only.
4. Avoid the race where route rendering builds before overview Vegagerdin data has arrived.
5. Make scrubber forecast opt-in build a small first batch: `Núna`, next whole 10-minute departure, next 6 whole-hour departures, then more hourly slots for `Sækja fleiri spátíma`.
6. Verify with typecheck/tests/build as far as possible.

## What Changed

### 1. Removed departure time from driving form

File: `components/weather/RoadMapPrototypeMap.tsx`

- Removed `departureAt` React state.
- Removed `setDepartureAt('')` from clear route.
- Removed `earliestDepartureAt` from the travel API request body.
- Removed the `<input type="datetime-local">` field from the route panel.
- `renderVedurstofanStations()` now defaults to `Date.now()` unless a scrubber-selected departure timestamp is explicitly passed.

Result: the route form is now route + thresholds only. Departure-based forecast lives in the scrubber opt-in flow.

### 2. Made `Núna` strictly Vegagerdin-current

File: `components/weather/RoadMapPrototypeMap.tsx`

- `handleSelectCandidateIdx(0)` now always switches to `routeWeatherMode = 'now'`.
- It counts only `routeVegagerdinPointsRef.current`.
- It no longer falls back to `renderVedurstofanStations(... Date.now())` when Vegagerdin has no points.
- Route calculation now sets `nowRouteMode` to `'now'` unconditionally.
- `nowStatusCounts` is now Vegagerdin counts or `{}`. It no longer uses Vedurstofan counts as fallback.

Result: `Núna` should not show forecast stations or old MET/Yr-style 80-point counts. If Vegagerdin current data is unavailable, the route Now layer should show no current stations rather than silently showing forecast data.

### 3. Added route-scoped Vegagerdin current fetch

File: `components/weather/RoadMapPrototypeMap.tsx`

- Added `fetchVegagerdinCurrentForRoute(signal)`.
- If overview Vegagerdin data is already loaded, it reuses it.
- If it is not loaded yet, route calculation fetches `/api/teskeid/weather/vegagerdin/current` directly before building the client route layer.
- The client route-layer builder now accepts explicit `currentData`.

Reason: v322 strongly suggested a race or unavailable overview state. This change makes route calculation less dependent on whether the overview map fetch happened to finish first.

### 4. Changed departure forecast opt-in timeline

File: `components/weather/RoadMapPrototypeMap.tsx`

- `ROUTE_TIMELINE_INITIAL_SLOT_COUNT` is now `8`.
- `ROUTE_TIMELINE_TOTAL_SLOT_COUNT` is `25`.
- Timeline generation now creates:
  - slot 0: `Núna`,
  - slot 1: next whole 10-minute boundary,
  - slots 2-7: next 6 whole-hour departures,
  - remaining slots: hourly slots for `Sækja fleiri spátíma`.
- Existing route API candidates are used as the seed, but the prototype now builds this deterministic opt-in timeline itself.

Result: clicking the scrubber opt-in should show a loading message and then expose the first useful batch, without forcing full forecast work before opening the map.

### 5. Cleaned opt-in retry state

File: `components/weather/RoadMapPrototypeMap.tsx`

- Retry now appears only for `unavailable` or `error`.
- It no longer appears in idle state.

### 6. Updated scrubber loading copy

Files:

- `messages/is.json`
- `messages/en.json`

Changed the loading text from “as far as forecast reaches” to a more accurate first-batch message:

- IS: `Er að búa til stöðuna m.v. brottför eftir 10 mínútur og næstu heilu klukkutíma.`
- EN: `Building the situation for leaving in 10 minutes and the next whole hours.`

## Files Read

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-22-1440-todo-086-v322-claude-v321-review-diagnosis.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/road-intelligence/routeSlotStatuses.ts`
- `messages/is.json`
- `messages/en.json`

## Files Changed

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

No SQL files changed. No migrations run. No env files changed.

## Commands Run

- `rg -n ... components/weather/RoadMapPrototypeMap.tsx`
  - Exit code: 0
- `rg -n ... lib components app -g "*.ts" -g "*.tsx"`
  - Exit code: 0
- `git diff --name-only`
  - Exit code: 0
- `npm run type-check`
  - Exit code: 0
- `npm run test:run -- road-intelligence-route-slot-statuses`
  - Exit code: 0, 1 file passed, 25 tests passed
- `git diff --check`
  - Exit code: 0, only existing CRLF warnings
- `npm run test:run -- road-intelligence`
  - Exit code: 0, 10 files passed, 126 tests passed
- `npm run build`
  - Exit code: 1
  - Compile and lint/type validation completed, but Next failed during page-data collection:
    - `Cannot find module for page: /contacts`
    - `Cannot find module for page: /home`
    - `Failed to collect page data for /contacts`

## Verification Result

Green:

- TypeScript typecheck.
- Road-intelligence route-slot unit test.
- Broader road-intelligence test suite.
- Diff whitespace check.

Not green:

- `npm run build` is blocked by missing `/contacts` and `/home` page modules during Next page data collection. This does not look introduced by this change, but it still blocks a clean production build until investigated or confirmed as pre-existing.

## Decisions

- `Núna` should prefer correctness over graceful fallback. Showing no Vegagerdin current stations is better than silently showing forecast values and calling them Now.
- Forecast slots are opt-in only. We do not compute them before the map opens.
- The prototype can synthesize departure candidates from the current route seed because the actual provider slot status is computed by `buildProviderSlotStatusOverrides()`.
- Kept the existing reusable `DepartureHeatmap` instead of creating a new scrubber component.

## Risk / Things For Claude To Review

1. **If `/api/teskeid/weather/vegagerdin/current` is gated or restricted for the testing user**, route Now will correctly show no current stations. That is better than forecast fallback, but Stebbi may perceive it as “missing stations”. Confirm feature access includes `weather-provider-vegagerdin`.
2. **If server-side `vegagerdinLayer` exists but has zero points**, the client fallback fetch is used. If the travel API returns a partial but non-empty incorrect server layer, the client fallback is skipped by design.
3. **Timeline candidates are synthetic.** This is acceptable for first prototype because provider slot overrides own the displayed statuses, but future routing engine should produce native departure candidates.
4. **Build blocker remains outside this change.** Claude should verify whether `/contacts` and `/home` missing pages are already known or need a separate hotfix before release.
5. **No browser automation was run.** Stebbi runs localhost manually per project rules.

## Suggested Next Step

Claude should review the changed route flow and then Stebbi should test locally. If the local map still does not show Vegagerdin stations for Now, next debugging should log these exact values after route calculation:

- `serverVegagerdinLayer?.points.length`
- `currentVegagerdinData?.status`
- `currentVegagerdinData?.stations.length`
- `vegagerdinRender.count`
- `routeVegagerdinPointsRef.current.length`
- whether the current user has `weather-provider-vegagerdin`

If those are populated but the map still shows no station labels, the next bug is layer visibility / marker display. If those are empty, the bug is provider access, current endpoint payload, or station-to-route matching radius.

## Supabase / Auth / RLS / Production Notes

- No SQL written or run.
- No Supabase policies, grants, RLS, functions, auth, or user data changed.
- No production API, Vercel setting, env var, billing, or deployment action performed.
- The code does call same-origin `/api/teskeid/weather/vegagerdin/current` during route calculation if overview data is not ready. That endpoint already existed and remains subject to its existing auth/feature-access rules.

## Route Intelligence Check

- The change moves Road Intelligence closer to provider-native behavior by making current route view depend on Vegagerdin current observations only.
- It does not introduce Google route persistence or new Google dependencies.
- It still uses the existing travel API route result as seed and map geometry; fully provider-native road-graph routing is not implemented in this step.
- Feature flag and per-user gating were not changed.

## Localhost Checks For Stebbi

Open:

- `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Required state:

- Logged-in user with `road-intelligence-v1`.
- `ROAD_INTELLIGENCE_V1_ENABLED=true` in local env.
- Ideally user also has `weather-provider-vegagerdin` access so Now can show current Vegagerdin stations.

Test 1: route form

1. Open the route panel.
2. Confirm there is no departure-time input in the driving form.
3. Enter `Akureyri` to `Egilsstaðir` or another known route.
4. Click `Reikna`.

Expected:

- Full Teskeið loader appears only while finding the route and Now status.
- Map opens on the route with `Núna` visually selected.
- Status pills count only current route Vegagerdin stations.
- No Veðurstofan/MET-style 80-point count appears in Now.

Test 2: Now data source

1. With route open, inspect station dots and labels.
2. Click the `Núna` chip again.

Expected:

- Only current Vegagerdin route stations are visible.
- If zero stations appear, check whether `/api/teskeid/weather/vegagerdin/current` is accessible for the user before assuming route matching failed.
- No forecast stations should appear merely because Now was selected.

Test 3: departure forecast opt-in

1. Click `Skoða brottfarartíma`.
2. Watch the scrubber area.

Expected:

- It first shows the loading copy: `Er að búa til stöðuna m.v. brottför eftir 10 mínútur og næstu heilu klukkutíma.`
- Then it shows `Núna`, next 10-minute slot, and the next 6 whole-hour slots.
- Clicking a future slot switches to forecast mode and should use Veðurstofan provider forecast along the route.
- `Sækja fleiri spátíma` should reveal more hourly slots if available.

Test 4: regression checks

1. Toggle Einfalt/Nánar.
2. Filter status pills.
3. Switch between route alternatives if shown.
4. Clear route and return to overview.

Expected:

- Filters apply to the visible provider mode only.
- Clearing route restores overview markers.
- Switching route alternatives should not require full route-form input again.
- No production/Supabase data is written by these checks.
