# TODO-086 v546 - Codex handoff: stable map navigation + Mitt veður scrubber

Created: 2026-07-24 00:59  
Timezone: Atlantic/Reykjavik

## Skilningur á samþykki

Stebbi authorized Codex to implement:

1. One stable top navigation row with four pills:
   `Mitt veður`, `Skilaboð`, `Akstur`, `Kort`.
2. A simplified scrubber only for the Mitt veður map overview.
3. No impact on the Akstur scrubber or Akstur flow.

The implementation was conditional on proving that Akstur could remain isolated.

Authorized and performed:

- scoped code and test changes
- local type-check, tests, and production build
- this handoff

Not performed:

- commit
- push
- deploy
- SQL or migration
- Supabase or production action

## Safety conclusion before implementation

The two scrubbers are separate:

- Akstur uses `DepartureHeatmap`.
- The weather overview previously used `WeatherSourceTimeSelector`.

`WeatherSourceTimeSelector` is also consumed by another weather overview, so
Codex did not modify it. Instead, Codex created a new
`WeatherChaseTimeSelector` used only by `RoadMapPrototypeMap` for the Mitt veður
overview.

Final diff checks confirm zero changes in:

- `components/weather/DepartureHeatmap.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`

The Akstur branch inside `RoadMapPrototypeMap` still renders the same
`DepartureHeatmap` with the same route candidates, status overrides, filters,
first-slot label, and selection handlers.

## What was changed

### 1. Stable four-pill navigation

File: `components/weather/RoadMapPrototypeMap.tsx`

The top row now always contains, in order:

```text
Mitt veður · Skilaboð · Akstur · Kort · menu
```

Behavior:

- The row remains in one stable location.
- Opening a panel changes only pill active state.
- Duplicate mobile-only navigation rows were removed from:
  - Mitt veður
  - Skilaboð
  - Akstur
- Fullscreen mobile panels now occupy only the map-area below the stable row.
- Pill controls are 40 px high.
- Emojis were removed from the pill labels to ensure all four pills plus the
  menu fit cleanly at 360 px without horizontal overflow.

Context behavior:

- `Mitt veður` is active while its panel is open.
- `Skilaboð` is active while its panel is open.
- `Akstur` is active while its panel is open.
- `Kort` is active when all panels are closed.
- When Kort is active, the last weather/route context pill is also active:
  - `Kort` + `Mitt veður`, or
  - `Kort` + `Akstur`.
- The last context is not replaced by opening Skilaboð.

### 2. Dedicated Mitt veður scrubber

New file: `components/weather/WeatherChaseTimeSelector.tsx`

This component is deliberately forecast-only and has no props or rendering for:

- Vegagerðin
- Núna/current observations
- provider group headers
- risk/status dots

It renders only:

- previous arrow
- compact two-line day labels
- the forecast times selected in Mitt veður
- next arrow

Example:

```text
Fös.
24.7
```

with the available selected times beneath the date.

The time itself is the selection control. Active time uses primary styling.
There is no decorative gray point.

Mobile behavior:

- Arrow and time controls have 40 px touch targets.
- Content scrolls horizontally inside the component.
- Active time scrolls into view.
- No page-level horizontal overflow is introduced.

### 3. Compact day formatter

File: `lib/weather/forecastSlotHelpers.ts`

Added `formatCompactForecastDay()`:

- Icelandic weekday abbreviations:
  `Sun.`, `Mán.`, `Þri.`, `Mið.`, `Fim.`, `Fös.`, `Lau.`
- Icelandic numeric date, for example `24.7`.
- UTC calendar arithmetic, which is correct for Iceland year-round.
- English fallback uses a short localized weekday and `month/day`.

The existing `groupSlotsByDay()` behavior used by other scrubbers was not
changed.

### 4. Weather map defaults to a forecast time

File: `components/weather/RoadMapPrototypeMap.tsx`

Because Vegagerðin/Núna no longer belongs to the Mitt veður scrubber, the weather
map overview must not remain silently in `now` mode.

When:

- Kort is showing,
- last context is Mitt veður,
- no calculated route summary is controlling the map, and
- forecast slots have loaded,

the overview selects the first available visible Mitt veður forecast time if no
forecast time is already selected.

This also handles slow forecast loading after the user has already opened Kort.

The selected slots continue to come from `mapVisibleHours`, which is controlled
and auto-saved by the Mitt veður preference work.

## Design.md compliance

The implementation follows:

- stable, low-noise header navigation
- mobile-first layout at 360-460 px
- 40 px touch targets
- no duplicated navigation controls
- no horizontal page overflow
- fixed control sizes
- visible active state without moving controls

No navigation route changes were introduced, so no new route loader or pending
state is required.

## Files inspected

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherSourceTimeSelector.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- `components/teskeid/TeskeidMenu.tsx`
- `lib/weather/forecastSlotHelpers.ts`
- relevant tests and translations

## Files changed by this implementation

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChaseTimeSelector.tsx` (new)
- `lib/weather/forecastSlotHelpers.ts`
- `lib/__tests__/forecast-slot-compact-day.test.ts` (new)
- `lib/__tests__/weather-chase-time-selector.test.tsx` (new)
- `ai-handoff/2026-07-24-0059-todo-086-v546-codex-stable-map-nav-weather-scrubber-prerelease.md` (new)

## Existing uncommitted work preserved

The worktree already contained uncommitted changes including:

- `.obsidian/workspace.json`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `lib/weather/chasePreferences.ts`

Codex layered this work onto the current `RoadMapPrototypeMap` and did not revert
the existing auto-save/panel work. `WeatherChasePanel.tsx` and
`chasePreferences.ts` were not changed in this implementation turn.

## Tests added

### `forecast-slot-compact-day.test.ts`

- Confirms Icelandic Friday renders as `Fös.` + `24.7`.
- Confirms UTC day handling at midnight.

### `weather-chase-time-selector.test.tsx`

- Confirms compact day/date rendering.
- Confirms time-only selection.
- Confirms no Vegagerðin heading.
- Confirms no Veðurstofan heading.
- Confirms active time state.
- Confirms direct time selection callback.

## Commands and results

1. Scoped dependency/diff inspection
   - exit code 0.
2. `npm.cmd run type-check`
   - exit code 0.
3. Scoped tests
   - 2 files, 4 tests passed.
4. `npm.cmd run test:run`
   - exit code 0.
   - 132 test files passed.
   - 3584 tests passed, 27 skipped, 8 todo.
5. First `npm.cmd run build`
   - source compiled and type/lint completed.
   - page-data collection temporarily failed to find existing `/contacts` and
     `/home` build artifacts.
6. Immediate unchanged `npm.cmd run build` retry
   - exit code 0.
   - full production build and 100 static pages completed.
7. After the final slow-load forecast guard:
   - type-check exit code 0.
   - scoped tests: 2 files, 4 tests passed.
8. Final `npm.cmd run build` on the exact final source
   - exit code 0.
   - full production build completed.
   - only existing lint warnings remain.
9. `git diff --check`
   - exit code 0.
10. Akstur safety diff:
    - `DepartureHeatmap.tsx`: no diff.
    - `FerdalagidClient.tsx`: no diff.

No dev server was started or restarted.

## What was not changed

- Akstur `DepartureHeatmap`.
- Akstur route candidate generation.
- Akstur status filters.
- Akstur now/forecast switching.
- Route API or provider matching.
- Shared `WeatherSourceTimeSelector`.
- `WeatherOverviewClient`.
- SQL, RLS, auth, preferences schema, or production data.

## Supabase / auth / production impact

- No SQL written or run.
- No migration written or run.
- No Supabase query changed.
- No RLS, grant, function, auth, secret, billing, or user-data change.
- No commit, push, deploy, or production action.

## Route intelligence check

- This is presentation and navigation state only.
- No route, segment, route family, control point, caution, station matching,
  cache key, or provider contract changed.
- No route information is stored or counted.
- No `IcelandRoadmap.md` or `lib/iceland-routes/` update is needed.

## Remaining risk

- Browser-level verification is still required for exact 360/390/460 px fit and
  active-state appearance.
- If a calculated route already exists, the existing route summary continues to
  own the map/route scrubber. This implementation does not clear or mutate route
  state when the user opens Mitt veður, specifically to avoid affecting Akstur.
- Existing older hook dependency warnings in `RoadMapPrototypeMap` remain; this
  implementation added no new final warning.

## Localhost checks for Stebbi

Page:

`http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Test at:

- 360 px
- 390 px
- 460 px
- desktop

### Stable navigation

1. Confirm one row always shows:
   `Mitt veður`, `Skilaboð`, `Akstur`, `Kort`, and the menu.
2. Confirm the row fits without horizontal scrolling or clipped labels.
3. Open each panel in turn.
4. Confirm only active styling changes; no pill moves into a panel header.
5. Confirm there is no duplicate mobile navigation row inside any panel.
6. From Mitt veður, click Kort.
7. Confirm both Kort and Mitt veður show active context.
8. From Akstur, click Kort.
9. Confirm both Kort and Akstur show active context.
10. Open and close Skilaboð.
11. Confirm it does not erase the last Mitt veður/Akstur context.

### Mitt veður scrubber

1. In Mitt veður settings, select a known set such as `6`, `12`, and `18`.
2. Click Kort while no calculated route summary is active.
3. Confirm the scrubber shows only selected forecast times.
4. Confirm there is no:
   - Vegagerðin section
   - Núna item
   - “Veðurstofan (spá)” header
   - gray/status point
5. Confirm dates render in two compact lines, for example:

```text
Fös.
24.7
```

6. Tap each time and confirm:
   - the time itself receives active styling
   - the map weather changes to that forecast time
7. Use previous/next arrows and confirm selection moves one available slot.
8. Reload and confirm the auto-saved visible hours still drive the scrubber.
9. With a slow network, open Kort before forecasts finish loading and confirm the
   first available selected forecast becomes active when data arrives.

### Akstur regression

1. Open Akstur and calculate a route.
2. Confirm route summary and route layers work as before.
3. Open the Akstur departure-time section.
4. Confirm its `DepartureHeatmap` still contains its existing:
   - Núna behavior
   - route status data
   - filters
   - forecast expansion
5. Select route departure slots and confirm route markers/status update.
6. Confirm the new `Fös. / 24.7` weather-only selector does not appear inside
   Akstur.
7. Confirm opening/closing Kort does not clear the calculated route.

Expected:

- Mitt veður is simplified.
- Akstur is behaviorally unchanged.
- No panel/header overlap or horizontal overflow.

No Supabase, migration, auth, production data, deployment, secrets, or billing
action is needed for these checks.

## Suggested next step

Stebbi should complete the localhost checks and send screenshots of:

- the stable pill row at 360/390 px
- Kort + Mitt veður active
- Kort + Akstur active
- the new weather-only scrubber
- the unchanged Akstur scrubber

Commit, push, and deploy require separate explicit permission.

## Óvissa / þarf að staðfesta

- Confidence: high that Akstur code and scrubber behavior are isolated and
  unchanged.
- Confidence: high in static/type/test/build correctness.
- Confidence: medium-high on exact mobile visual fit until Stebbi checks real
  browser screenshots.
