# TODO 086 - Weather Chase UX Polish Plan

Created: 2026-07-23 11:34
Timezone: Atlantic/Reykjavik

## Context

Stebbi likes the current direction for `Elta veðrið` and wants Claude Code to make one more UX pass before release.

This is a plan/handoff only. Codex did not change implementation files in this pass.

Current `git status --short` at handoff creation showed only:

- `.obsidian/workspace.json`

That file appears unrelated to this task and should not be included in a release commit unless Stebbi explicitly wants editor state committed.

## Stebbi's requested product direction

`Elta veðrið` should become a complete primary weather-comparison experience, not a teaser that sends users into a second detail drawer.

The core experience should be:

1. User selects/saves their weather places.
2. Table compares all selected places.
3. Map shows the same selected places.
4. Scrubber controls the forecast time shown on the map.
5. Driving mode remains separate and is where Vegagerðin `Núna` belongs.

## Requested changes

### 1. Remove "Skoða samanburð nánar"

The current `WeatherChasePanel` still has a drawer/detail affordance:

- `viewMoreLabel`
- `drawerOpen`
- comparison drawer opened by "Skoða samanburð nánar"

Stebbi now considers this unnecessary.

Expected behavior:

- No `Skoða samanburð nánar` link in `Elta veðrið`.
- No separate comparison drawer for this feature.
- The main table should be the comparison UI.

Implementation notes:

- In `components/weather/WeatherChasePanel.tsx`, remove or stop rendering the view-more button and drawer.
- If `viewMoreLabel`, `closeLabel`, `comparePreset*`, `drawerOpen`, and `preset` become unused, remove them carefully.
- If shared forecast message keys are still used elsewhere, do not delete those message keys casually.

### 2. Make the header row sticky when more than 3 weather places are selected

For `selectedItems.length > 3`, the table becomes horizontally scrollable with a sticky first column.

Expected behavior:

- Date/time header row stays visible when scrolling the table vertically.
- Place-name first column stays locked horizontally.
- Header and sticky place column should not overlap, jitter, or hide text on mobile.

Implementation notes:

- Current `WeatherChasePanel.renderComparison()` has two branches:
  - `selectedItems.length <= 3`: vertical/day sections
  - `selectedItems.length > 3`: horizontal grid with sticky left column
- Apply sticky header only to the `> 3` branch.
- Likely CSS:
  - top-left empty header cell: `sticky left-0 top-0 z-30`
  - time header cells: `sticky top-0 z-20`
  - station cells: `sticky left-0 z-10`
- Ensure top-left cell has higher z-index than both sticky axes.
- Keep background opaque enough (`bg-background/95` or `bg-background`) so text behind it does not bleed through.

### 3. Move sorting/deleting controls out of the table

Stebbi finds the current per-row up/down/remove controls messy inside the table itself.

Expected behavior:

- The comparison table should focus on weather values.
- Sorting/removing selected places should live in a settings area at the bottom of `Elta veðrið`.
- Preferred UI: drag-and-drop ordering with delete.
- Required fallback: if drag/drop is too large or risky for this release, use a clean list with up/down buttons and delete buttons.

Implementation recommendation:

- Do not add a new drag/drop dependency for this small release unless the project already has one.
- Safer first implementation:
  - Add a bottom section titled something like `Raða stöðum`.
  - Render selected places as a compact list.
  - Each row has:
    - station/place label
    - provider badge
    - up/down icon buttons
    - remove icon/button
  - Use existing `moveItem()` and `removeItem()` logic.
- This gives Stebbi the placement and cleaner table immediately.
- Drag/drop can be a follow-up enhancement if needed.

Message text:

- Any new labels must go into `messages/is.json` and `messages/en.json`.
- Suggested Icelandic copy:
  - `Raða stöðum`
  - `Dragðu staði til eða notaðu örvarnar til að breyta röðinni.`
  - If not implementing actual drag/drop yet, avoid saying `Dragðu`.
  - Safer fallback copy: `Breyttu röðinni eða fjarlægðu staði af kortinu.`

### 4. Map weather values must follow the scrubber

In the general `Elta veðrið` weather-browsing mode, map markers should reflect the same forecast time as the scrubber.

Expected behavior:

- If the user moves the overview/forecast scrubber to a forecast slot, selected weather-chase station markers update to that same time.
- Map and table should not disagree about the active forecast context.
- This applies to general weather-chase mode, not route-driving mode.

Implementation notes:

- Current weather-chase marker row is selected by `selectWeatherChaseMarkerRow(item)`.
- Confirm whether that helper currently picks a static/default row, probably nearest/current/first row.
- It should instead use the active overview time when `overviewActiveMode` is a number.
- When `overviewActiveMode === 'now'`, for pure weather-chase forecast mode choose a sensible current/nearest forecast row from the selected provider data. Do not show Vegagerðin `Núna` in this context.
- Re-render weather-chase map markers when `overviewActiveMode` changes.
- Add `overviewActiveMode` or a derived `weatherChaseMarkerTimeMs` to the marker effect dependency list if needed.

Suggested helper shape:

```ts
function selectWeatherChaseMarkerRow(item: WeatherChaseItem, targetTimeMs: number | null): ForecastDrawerRow | null {
  if (item.rows.length === 0) return null
  if (targetTimeMs === null) {
    // choose nearest forecast row to Date.now(), not Vegagerðin current observation
  }
  // choose nearest forecast row to targetTimeMs with a tolerance similar to table columns
}
```

Be careful not to mutate row arrays or trigger extra provider fetch loops.

### 5. Remove "Vegagerðin Núna" from this general weather-chase view

Stebbi's clarification:

- `Vegagerðin Núna` is relevant for driving mode.
- In the general `Elta veðrið` / weather browsing view, the scrubber should be forecast-oriented.
- The selected places on the map should be the weather-chase places and values, not all stations and not Vegagerðin current observations.

Expected behavior:

- The general weather-chase map should not show a `Vegagerðin Núna` measurement slot as the primary current weather comparison state.
- Driving mode can still use Vegagerðin current observations as before.

Implementation notes:

- Be careful here: do not break route mode.
- Existing overview scrubber and route scrubber may share components/state.
- Keep the separation:
  - route active: Vegagerðin current for `Núna`, Veðurstofan forecast for departures
  - weather chase / general browse: selected provider forecast places follow active forecast time

## Files likely touched

- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

Possibly:

- `components/weather/ForecastTimeScrubber.tsx` or related scrubber component, only if needed for removing/hiding `Vegagerðin Núna` in this specific context.

## What not to do

- Do not run SQL90 or any migration as part of this UI pass.
- Do not change Supabase/RLS/auth.
- Do not commit `.obsidian/workspace.json`.
- Do not replace route-driving behavior while adjusting weather-chase map behavior.
- Do not reintroduce "show all weather stations" fallback when closing `Elta veðrið`.
- Do not add heavy drag/drop dependency unless clearly justified and reviewed.

## Design notes

Relevant `Design.md` guidance:

- Mobile-first app experience.
- Inputs and controls must not cause mobile zoom or horizontal page overflow.
- Touch targets should generally be at least 40x40 px.
- Text must not overlap.
- Use semantic tokens and restrained styling.
- User-facing strings belong in `messages/is.json` and `messages/en.json`.

The table is allowed to have internal horizontal scrolling because this is a data comparison surface, but the page itself should not gain unwanted horizontal overflow.

## Suggested implementation sequence

1. Remove detail drawer/view-more code from `WeatherChasePanel`.
2. Extract a small `SelectedWeatherChaseOrderList` or equivalent internal render function at the bottom of the panel.
3. Move up/down/remove controls into that bottom section.
4. Make table header sticky in the `selectedItems.length > 3` branch.
5. Update weather-chase marker row selection to use active scrubber/forecast time.
6. Remove/hide `Vegagerðin Núna` from the general weather-chase forecast view while preserving route mode.
7. Run type-check and tests.

## Specific review points for Codex/Claude

1. Does closing `Elta veðrið` still keep selected places on map instead of showing all stations?
2. Does route mode still show Vegagerðin current observations for `Núna`?
3. Does weather-chase map follow the forecast scrubber?
4. Does the sticky header work on 377-460 px mobile widths without hiding row labels?
5. Did we avoid adding risky drag/drop dependency before release?

## Localhost checks for Stebbi

Open:

```text
http://localhost:<port>/auth-mvp/vedrid/road-map-prototype
```

Use:

- authenticated user
- `ROAD_INTELLIGENCE_V1_ENABLED=true`
- user has `road-intelligence-v1` feature access

### Check 1: no detail drawer

1. Open `Elta veðrið`.
2. Select at least two places.
3. Expected:
   - no `Skoða samanburð nánar` link
   - no extra comparison drawer is needed
   - table itself shows the comparison

### Check 2: sticky table header for more than 3 places

1. Select at least 4 weather places.
2. Scroll the table horizontally.
3. Expected:
   - place-name column remains visible
4. Scroll the panel vertically if there is enough content.
5. Expected:
   - date/time header remains visible in the table area
   - no text overlap or flicker

### Check 3: ordering/removal moved out of table

1. Look at the comparison table.
2. Expected:
   - no up/down/remove controls inside weather-value rows/cells
3. Scroll to bottom of `Elta veðrið`.
4. Expected:
   - a clear ordering/settings section exists
   - places can be moved up/down or drag/dropped, depending on implementation
   - places can be removed
5. Remove one place.
6. Expected:
   - table and map both update to remove it

### Check 4: map follows scrubber

1. Select a few weather-chase places.
2. Move the forecast scrubber to a different time.
3. Expected:
   - map marker values update to that time
   - table/map values are consistent enough for the same provider/time
4. Move to another forecast slot.
5. Expected:
   - marker values update again, no stale values

### Check 5: no Vegagerðin Núna in general weather chase

1. Stay in general weather-chase mode, not driving mode.
2. Expected:
   - no `Vegagerðin Núna` current-observation slot is used as the general weather comparison context
   - selected weather places still show forecast values
3. Switch to driving mode and calculate a route.
4. Expected:
   - route mode still uses Vegagerðin current observations for route `Núna`

### Check 6: no all-station fallback

1. Select/save a small set of weather places.
2. Close `Elta veðrið`.
3. Expected:
   - map does not show all weather stations in Iceland
   - it remains scoped to selected/saved weather-chase places

## Test commands for Claude Code

Recommended before release:

```powershell
npm run type-check
npm run test:run
```

If Claude Code changes layout heavily, Stebbi should also manually check mobile widths around 377 px, 390 px, 430 px and desktop.

## Release note

This is a UI/product polish pass. It should not require SQL, Supabase, auth, Vercel env, or deployment setting changes.

Before commit/release, exclude `.obsidian/workspace.json` unless Stebbi explicitly wants it.

