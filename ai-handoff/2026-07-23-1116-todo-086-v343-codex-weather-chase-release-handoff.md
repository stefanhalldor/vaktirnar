# TODO 086 - Codex Weather Chase Release Handoff

Created: 2026-07-23 11:16
Timezone: Atlantic/Reykjavik

## Context

Stebbi asked Codex to prepare a handoff so Claude Code can review and release the latest Road Intelligence / Elta veðrið changes.

This handoff covers the small follow-up after `2026-07-23-1049-todo-086-v342-codex-weather-chase-defaults-criteria-prerelease.md`:

- precipitation criteria stepper should move by `0,1`
- precipitation criteria input should accept both comma and dot
- only the individual metric value that fails criteria should dim, not the whole table cell
- closing `Elta veðrið` on `/vedrid` must not reveal every weather station; the map should stay scoped to the user's selected/saved weather-chase stations

## Plan for this pass

1. Adjust the `Hámarksúrkoma` control in `WeatherChasePanel` to support comma/dot decimal input and explicit +/- step buttons.
2. Move criteria dimming from row/cell level to individual metric level: temperature, wind, precipitation.
3. Keep selected weather-chase stations as the visible map scope when the panel is closed, instead of falling back to all overview stations.
4. Add required Icelandic/English labels for the new stepper buttons.
5. Run TypeScript and test suite.

## What Codex changed

### `components/weather/WeatherChasePanel.tsx`

- Added `decreasePrecipitationLabel` and `increasePrecipitationLabel` to `WeatherChaseLabels`.
- Replaced row-level `rowMatchesCriteria()` dimming with `metricFailsCriteria()` so only the failed value dims:
  - temperature dims only if below `minTemperatureC`
  - wind dims only if above `maxWindMs`
  - precipitation dims only if above `maxPrecipitationMmPerHour`
- Added a local precipitation draft string so the precipitation field accepts both `0,4` and `0.4`.
- Added explicit `-` and `+` step buttons for precipitation.
- Step size is `0.1`, clamped at `0`.
- On Icelandic locale, stepper output formats decimal comma, e.g. `0,4`.

### `components/weather/RoadMapPrototypeMap.tsx`

- Added `weatherChaseSelectedItemsRef` so overview marker visibility can reliably know whether weather-chase selections exist.
- `handleWeatherChaseSelectedItemsChange()` now updates that ref.
- Closing the weather-chase panel no longer clears weather-chase map markers immediately.
- Weather-chase markers render when:
  - map is ready
  - no route is active
  - the route/search panel is not open
  - selected weather-chase items exist
- Overview marker visibility now requires no route, weather-chase panel closed, and no weather-chase selection.
  This prevents the old fallback where closing `Elta veðrið` exposed all stations on the map.
- Passed the new precipitation stepper labels into `WeatherChasePanel`.

### `messages/is.json`

Added:

- `roadMapPrototypeWeatherChaseDecreasePrecipitation`: `Lækka úrkomumark`
- `roadMapPrototypeWeatherChaseIncreasePrecipitation`: `Hækka úrkomumark`

### `messages/en.json`

Added:

- `roadMapPrototypeWeatherChaseDecreasePrecipitation`: `Lower precipitation limit`
- `roadMapPrototypeWeatherChaseIncreasePrecipitation`: `Raise precipitation limit`

## Files inspected

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

## Files changed by Codex in this pass

- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

## Other dirty files

`git status --short` also shows:

- `.obsidian/workspace.json`

Codex did not modify this file in this pass. Claude Code should avoid including it in release commit unless Stebbi explicitly wants editor state committed.

## Commands run

```powershell
Get-Content -Encoding UTF8 WORKFLOW.md
Get-Content -Encoding UTF8 Design.md
Get-Content -Encoding UTF8 ai-handoff/README.md
git status --short
git diff --stat
git diff -- components/weather/RoadMapPrototypeMap.tsx components/weather/WeatherChasePanel.tsx messages/is.json messages/en.json
npm run type-check
npm run test:run
Get-Date -Format "yyyy-MM-dd HH:mm"
```

## Command results

- `npm run type-check`: passed
- `npm run test:run`: passed
  - 129 test files passed
  - 3577 tests passed
  - 27 skipped
  - 8 todo

There were recurring `jsdom` console messages:

```text
Not implemented: navigation to another Document
```

These appeared during tests but did not fail the suite.

## SQL / Supabase

No SQL was written or run in this pass.

Important release dependency:

- `sql/90_weather_chase_preferences.sql` exists for authenticated user persistence of `Elta veðrið` defaults.
- Codex did not run SQL90.
- Before production release, Claude Code should confirm whether SQL90 has already been applied to the target Supabase project.
- If SQL90 is not applied, persistent authenticated save for weather-chase defaults may fail or fall back depending on the current API/UI handling.

RLS/auth note:

- This pass did not change RLS, grants, auth, or service-role behavior.
- Existing SQL90 is service-role only and stores only provider IDs/labels/optional coords/simple criteria, not raw routes or third-party payloads.

## Design / UX notes

This pass follows `Design.md` in the touched UI:

- Inputs remain `text-base`, preserving mobile behavior and avoiding iOS zoom.
- New stepper controls are explicit buttons with `aria-label`.
- Touch targets are compact but stable.
- User-facing strings are in `messages/is.json` and `messages/en.json`.
- Dimming is now more precise and less confusing: failed values are deemphasized without hiding context.

## Release readiness assessment

Codex confidence: medium-high for this follow-up.

Why:

- Type-check and full test suite passed.
- The diff is narrowly scoped.
- The biggest behavioral change is marker visibility state, which needs manual map testing because it depends on MapLibre runtime state and marker refs.

Not included:

- No commit.
- No push.
- No deploy.
- No migration run.
- No production or Vercel changes.

## Risk / things Claude Code should review

1. Marker state when `Elta veðrið` closes:
   - The intended behavior is: selected weather-chase stations remain visible, all overview stations do not appear.
   - Claude should verify there is no stale marker state when switching into route mode and back.

2. Weather-chase markers and route panel:
   - Markers are hidden when `isPanelOpen` is true, to avoid mixing the route-search UI with weather-chase markers.
   - Confirm this matches Stebbi's desired flow.

3. Selected station count:
   - `stationCount` may still reflect overview marker counts in some states.
   - The release-critical issue was map visibility, not necessarily count UI. If the count looks wrong in manual testing, fix before deploy.

4. Precipitation input:
   - `+/-` uses 0.1 steps.
   - Text input accepts comma and dot.
   - Invalid values become `null`, which means no precipitation criterion.
   - Confirm the UX feels okay while typing partial decimal values.

5. SQL90:
   - Confirm production database state before relying on authenticated persistence.

## Localhost checks for Stebbi

Open:

```text
http://localhost:<port>/auth-mvp/vedrid/road-map-prototype
```

Use an authenticated user with `ROAD_INTELLIGENCE_V1_ENABLED=true` and access to `road-intelligence-v1`.

### Check 1: precipitation criteria stepper

1. Open `Elta veðrið`.
2. In `Hvernig veðri ertu að leita að?`, find `Hámarksúrkoma`.
3. Enter `0,4`.
4. Confirm the value is accepted and table values react.
5. Enter `0.4`.
6. Confirm the value is accepted.
7. Click `+`.
8. Expected: value increases by `0,1` in Icelandic UI, e.g. `0,5`.
9. Click `-`.
10. Expected: value decreases by `0,1` and never goes below `0`.

### Check 2: only failed metric dims

1. Set criteria so only one metric fails in some table cells, for example:
   - max precipitation low enough that some precipitation values fail
   - wind and temperature still acceptable
2. Expected:
   - only the failed precipitation value dims
   - temperature and wind in the same cell remain readable
3. Repeat with wind and temperature criteria.
4. Expected:
   - only wind dims when wind fails
   - only temperature dims when temperature fails

### Check 3: closing Elta veðrið does not show every station

1. Select or load a saved set of weather-chase stations.
2. Confirm only those selected stations are shown on the map.
3. Close the `Elta veðrið` panel.
4. Expected:
   - map does not reveal every weather station in Iceland
   - selected/saved weather-chase stations remain the map focus
5. Re-open `Elta veðrið`.
6. Expected:
   - selection and table are still intact
   - nearby-station focus is reset only if the panel was closed

### Check 4: route mode regression

1. Click the car icon.
2. Expected:
   - weather-chase markers do not interfere with route input mode
3. Calculate a route.
4. Expected:
   - route-specific Vegagerðin/Veðurstofan behavior still works as before
   - weather-chase marker visibility does not leak into route mode

### Check 5: persistence dependency

If testing authenticated persistence:

1. Confirm SQL90 has been applied in the local/dev database.
2. Save `Elta veðrið` defaults.
3. Refresh.
4. Expected:
   - selected items and criteria reload.

Do not test SQL90 casually against production unless Stebbi explicitly approves running/applying that migration.

## Suggested Claude Code next step

Claude Code should:

1. Review the four-file diff.
2. Confirm `.obsidian/workspace.json` is excluded from the release commit unless Stebbi says otherwise.
3. Confirm SQL90 production/dev migration state.
4. Run local checks above, especially the map close/reopen behavior.
5. If all good, prepare release commit/push/deploy only with Stebbi's explicit approval.

