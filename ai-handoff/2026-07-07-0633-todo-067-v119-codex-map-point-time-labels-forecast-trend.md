# todo-067 v119 - Codex handoff: map point ETA labels, forecast time and trend

Created: 2026-07-07 06:33  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Relevant TODO: todo-067 weather / Ferðalagið  
Supersedes:

- `2026-07-07-0631-todo-067-v118-codex-map-point-time-labels.md`

Builds on:

- `2026-07-06-2326-todo-067-v117-codex-v116-review-mvp-flow-nav.md`
- Stebbi direction: make it clear what time each route weather point refers to, especially on long routes.
- Stebbi follow-up: show both the time on the route and the forecast timestamp, and show whether the next forecast value is better or worse.

## Product Decision

Add richer time context to route weather points on the audit map.

Each route weather point should communicate:

1. **Aksturstími / ETA:** approximately when the user reaches that point on the route for the currently selected departure/timeline slot.
2. **Spátími:** the forecast timestamp used for the weather value shown at that point.
3. **Næsta spágildi:** whether the next forecast timestep looks better, worse or about the same.

This is especially important on long routes. A point near Akureyri is not assessed at the same time as a point near Reykjavík, and the forecast value used may be rounded to a nearby met.no forecast hour.

## User-Facing Semantics

The visible map label should mean:

```text
ETA on the route, with forecast timestep in parentheses when readable.
```

Example:

```text
10:42 (11:00)
```

Where:

- `10:42` = estimated time the user reaches this road point.
- `(11:00)` = forecast timestep used for the displayed weather value.

If showing both values on every marker becomes too dense, prioritize:

- ETA on map marker chip
- forecast timestep in the selected point panel
- full `ETA (spá HH:mm)` label for selected/warning points

Do not let the UI imply that:

- all points are assessed at the same time
- the map label is the met.no update time
- the map label is the current clock time
- the parenthesized forecast time is optional trivia; it explains which forecast row was used

## Current Code Notes

Relevant current files:

- `components/weather/TravelAuditMap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `lib/weather/travel.ts`
- `lib/weather/types.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`

Useful existing data:

- `RouteWeatherPoint.routeFraction`
- `RouteWeatherPoint.distanceFromOriginM`
- `RouteWeatherPoint.summaryForWindow.decisiveTimeIso`
- `TravelCandidate.departureIso`
- `TravelCandidate.arrivalIso`
- `TravelPointForecast.hours` inside `buildRouteWeatherPoints`

Current limitation:

- `selectedCandidatePointStatuses` only contains non-green per-point statuses.
- It does not contain per-point ETA or forecast timestep.
- Client does not receive all `pt.hours`, so the "next forecast value is better/worse" comparison should be computed server-side in `buildRouteWeatherPoints`.

## Data Model Recommendation

Extend `RouteWeatherPoint.summaryForWindow` in `lib/weather/types.ts`.

Suggested shape:

```ts
summaryForWindow?: {
  status: WeatherStatus
  worstWindMs: number
  worstGustMs: number
  worstPrecipMmPerHour: number
  decisiveMetric?: 'wind' | 'gust' | 'precipitation' | 'data'

  /** Estimated time the driver reaches this route point for the assessed candidate. */
  etaIso?: string

  /** Forecast timestep used for the displayed/decisive weather value. */
  forecastTimeIso?: string

  /** Keep as alias or migrate existing code carefully. */
  decisiveTimeIso?: string

  nextForecast?: {
    timeIso: string
    status: WeatherStatus
    trend: 'better' | 'worse' | 'same'
    windMs: number
    gustMs: number
    precipMmPerHour: number
    decisiveMetric?: 'wind' | 'gust' | 'precipitation' | 'data'
    reasonCode?: string
  }
}
```

Notes:

- Keep `decisiveTimeIso` temporarily if existing components rely on it.
- Prefer `forecastTimeIso` as the clearer name going forward.
- `etaIso` should be candidate-specific and should update with timeline selection.

## Recommended Server Implementation

In `lib/weather/travel.ts`, `buildRouteWeatherPoints` already computes:

- `routeFraction`
- `etaMs`
- `hrs = getHoursNearEta(pt.hours, etaMs)`
- `worstWindMs`
- `worstGustMs`
- `worstPrecipMmPerHour`
- `decisiveMetric`
- `decisiveTimeIso`

Update it to also compute:

1. `etaIso = new Date(etaMs).toISOString()`
2. `forecastTimeIso = decisiveTimeIso`
3. `nextForecast`

### How To Pick The Current Forecast Timestep

Current code picks `decisiveTimeIso` as:

- precipitation: hour with highest precipitation in the ETA window
- otherwise: hour with highest max(wind, gust) in the ETA window

That is acceptable for now, but name it clearly as the forecast timestep used for the displayed decisive value.

### How To Compare The Next Forecast Timestep

For the same forecast point (`pt.hours`):

1. Find the hour with `time === forecastTimeIso`.
2. Find the next hour after it.
3. Evaluate that next hour using the same `evalDrivingLeg` thresholds:
   - wind = `next.windSpeedMs`
   - gust = `next.windGustMs`
   - precipitation = `next.precipitationMmPerHour`
4. Compare current status vs next status:
   - `graent -> gult/rautt` = worse
   - `gult -> rautt` = worse
   - `rautt -> gult/graent` = better
   - `gult -> graent` = better
   - same status = compare decisive metric value with a small tolerance

Suggested severity order:

```ts
const severity = { graent: 0, gult: 1, rautt: 2 }
```

For same-status trend:

- If decisive metric value increases meaningfully -> `worse`
- If it decreases meaningfully -> `better`
- Else -> `same`

Use a small tolerance to avoid noise:

- wind/gust tolerance: around `0.5 m/s`
- precipitation tolerance: around `0.2 mm/klst`

If there is no next forecast hour, omit `nextForecast`.

## Recommended Client Implementation

### 1. Pass the active candidate into `TravelAuditMap`

Instead of trying to encode all point times into `CandidatePointStatus`, pass the currently active candidate to the map.

Suggested props:

```ts
activeCandidate?: TravelCandidate
activeLeg?: 'outbound' | 'return'
```

In `FerdalagidClient.tsx`, derive it from the same state that drives `selectedCandidatePointStatuses`:

- return slot selected -> `returnCandidates[selectedReturnHeatmapIdx]`, `activeLeg = 'return'`
- outbound slot selected -> `outboundDisplayCandidates[selectedHeatmapIdx]`, `activeLeg = 'outbound'`
- no slot selected -> `result.travelPlan.outbound.leavingAt`, `activeLeg = 'outbound'`

### 2. ETA helper for selected slot

Add helper, likely in `travelAuditMap.helpers.ts`:

```ts
export function estimatePointEtaIso(
  candidate: TravelCandidate,
  pt: RouteWeatherPoint,
  leg: 'outbound' | 'return',
): string
```

Logic:

- `depMs = Date.parse(candidate.departureIso)`
- `arrivalMs = Date.parse(candidate.arrivalIso)`
- `durationMs = arrivalMs - depMs`
- outbound ETA fraction = `pt.routeFraction`
- return ETA fraction = `1 - pt.routeFraction`
- ETA ms = `depMs + etaFraction * durationMs`

This helper is still useful even if server also sends `etaIso`, because the map must update immediately when the selected timeline candidate changes.

### 3. Render ETA and forecast time

Map marker label priority:

1. selected point: show `ETA (forecast)` if both exist
2. highlighted/worst point: show `ETA (forecast)`
3. yellow/red points: show `ETA (forecast)` or at least ETA
4. origin/destination-nearest: show ETA
5. green points: show all only if density allows

Suggested visual examples:

```text
10:42 (11:00)
10:42
```

Selected point panel should be more explicit:

```text
Áætlað á leið: 10:42
Spágildi notað: 11:00
Næsta spágildi: betra kl. 12:00
```

Do not rely only on color for better/worse. Use text and a small arrow/icon if useful.

### 4. Suggested i18n keys

Add in `messages/is.json` and `messages/en.json`.

Icelandic:

```json
"pointEtaLabel": "Áætlað á leið",
"pointForecastTimeLabel": "Spágildi notað",
"pointNextForecastLabel": "Næsta spágildi",
"forecastTrendBetter": "betra",
"forecastTrendWorse": "verra",
"forecastTrendSame": "svipað"
```

English:

```json
"pointEtaLabel": "Estimated on route",
"pointForecastTimeLabel": "Forecast value used",
"pointNextForecastLabel": "Next forecast value",
"forecastTrendBetter": "better",
"forecastTrendWorse": "worse",
"forecastTrendSame": "similar"
```

Also update existing vague key if desired:

Icelandic:

```json
"pointTimeLine": "Metið um kl. {time}"
```

English:

```json
"pointTimeLine": "Assessed around {time}"
```

## Map Rendering Guidance

Current route markers are classic `google.maps.Marker` with circle symbols. Classic marker labels are limited and origin/destination already use marker labels, so for readable ETA chips Claude Code should consider:

- `AdvancedMarkerElement` with custom HTML content for route weather points, or
- a paired lightweight marker/overlay for the time chip anchored beside each route marker.

Preferred UX:

- route dot remains the status color
- ETA chip sits just beside/above the dot
- selected/warning points have stronger label emphasis
- forecast time in parentheses is shown where readable
- origin/destination remain understandable

Compact chip style:

- `font-size: 10px` or `11px`
- white or warm-card background
- dark text
- subtle border
- small radius
- no heavy shadow

## Density Rules For Long Routes

Stebbi wants time next to each point because it builds trust. That is the target.

But long routes can have 80+ route weather points on a 360px-wide phone. If every marker shows `10:42 (11:00)` at all zoom levels, the map may become unreadable.

Recommended density behavior:

1. Always show labels for:
   - selected point
   - highlighted/worst point
   - yellow/red points
   - origin and destination-nearest point
2. Show all point labels when:
   - route point count is modest, for example `<= 30`, or
   - map zoom is high enough, or
   - the user enables a `Sýna tíma á öllum punktum` toggle.
3. If dense labels are hidden, the selected point panel must still show:
   - ETA
   - forecast timestep used
   - next forecast trend if available

If Claude Code chooses to show every label unconditionally for MVP, test Akureyri-length routes carefully at 360px. If it becomes unreadable, add the density rule before shipping.

## Timeline Selection Must Update Labels

Manual behavior requirement:

1. Open a long route, e.g. Garðabær -> Akureyri.
2. Look at map labels.
3. Select a later timeline/scrubber slot.
4. Expected: ETA labels on route points shift later.
5. Expected: forecast-time parentheses also update where the selected slot changes the chosen forecast timestep.
6. Select another slot.
7. Expected: labels update again.

If labels do not change with selected slot, the implementation is not correct enough.

## Timeline Filters Must Also Filter Map Points

The timeline/scrubber filter below the map must also affect the map markers themselves.

Stebbi example:

> Þarna er t.d. filterað á gult eingöngu en samt skil ég ekkert í kortinu því þar eru allir grænu punktarnir ennþá.

Expected behavior:

- If the user filters the timeline to `Varúð` only, the map should show/emphasize only the yellow route points for the selected/visible timeline scope.
- Green points should not remain equally prominent when green is filtered out.
- Red/yellow filters should make the map easier to understand, not just reduce the chips in the scrubber.
- Filter counts should still be based on the same candidate/period as the visible timeline.

Recommended map behavior:

1. Active filter state should be passed from `DepartureHeatmap` / parent state into `TravelAuditMap`.
2. `TravelAuditMap` should use the same selected candidate and filter state to decide marker visibility or emphasis.
3. Markers outside the active filter should either:
   - be hidden, or
   - be heavily de-emphasized, for example low opacity and no time label.
4. Markers inside the active filter should remain clickable and labelled.
5. Selected point, highlighted/worst point and origin/destination may remain visible for orientation, but should not drown out the filtered result.

Suggested behavior by filter:

- `Allt`: show all relevant points.
- `Gott veður`: show green points, de-emphasize or hide yellow/red unless selected/highlighted.
- `Varúð`: show yellow points, hide/de-emphasize green, keep red only if `Allt` or red is also active.
- `Ekki mælt`: show red points, hide/de-emphasize green/yellow unless selected/highlighted.
- Multiple filters active: show points matching any active filter.

This must be based on the same status model as the timeline:

- If a timeline candidate is selected, use that candidate's per-point statuses.
- If no candidate is selected, use `summaryForWindow`.
- Because `CandidatePointStatus` is delta-encoded and omits green points, absent status means green when a selected candidate is active.

Important edge case:

- If a filter is active but no map points match it, show an empty-state hint near the map/timeline rather than leaving the user staring at an unchanged map.

This filter sync is part of the same trust goal as ETA/spátími labels. The scrubber and map must be two views of the same filtered assessment, not independent widgets.

## Top Navigation Must Allow Returning To Existing Results

The new top step navigation from v117 must support moving both backward and forward through already-available wizard state.

Stebbi example:

> Ég var kominn í niðurstöður og gat smellt á "Veðurmörk" og vil því geta smellt aftur á "Niðurstöður" í stað þess að reikna allt aftur.

Expected behavior:

- If no result exists yet, `Niðurstöður` is disabled until calculation has run.
- If a result exists, `Niðurstöður` is clickable from earlier steps and returns to the existing result view.
- Clicking `Veðurmörk` from results should let the user inspect/edit thresholds.
- If the user does not change threshold values, clicking `Niðurstöður` should return to the existing result without re-fetching/recomputing.
- If the user changes thresholds, the UI should clearly require `Reikna ferðina` / recompute before showing updated results.

Important state rule:

- Navigation to an already-computed result should not call the travel API.
- Only explicit calculation/recalculation should call the travel API.

Recommended implementation:

1. Keep a `hasDirtyAssumptions` or more specific dirty flag for threshold edits.
2. Top nav item `Niðurstöður` is enabled when `result !== null`.
3. If the current step is `thresholds` and drafts differ from the last submitted thresholds:
   - either disable `Niðurstöður` and show a small hint, or
   - allow returning but make clear the shown result uses previous thresholds.
4. Best MVP behavior: if draft thresholds are dirty, keep the primary action as `Reikna ferðina`; if not dirty and `result` exists, top nav can return to `Niðurstöður`.
5. If an API error exists but no valid result exists, `Niðurstöður` can return to the error result screen only if that is useful. Otherwise keep it disabled.

This makes the stepper feel like app navigation rather than a one-way form.

## Relationship To v117

This should be implemented after or together with v117:

- v117 hides the explicit time step from MVP and adds top step navigation.
- v119 makes the map explain time even without asking the user for a time first.

These fit together well:

- MVP does not ask the user a time question up front.
- Result still shows how the assessment moves along the route over time.
- The map explains the timing instead of leaving it implicit.

## Design Notes

This follows `Design.md`:

- Mobile-first clarity.
- Operational UI, not decorative map art.
- Status color is not the only meaning; time labels add context.
- Text must not overlap badly or cause horizontal overflow.
- Touch targets and selected-point behavior must remain usable.
- All user-visible copy belongs in `messages/is.json` and `messages/en.json`.

Avoid:

- tiny unreadable labels just to say "we show all times"
- labels that overlap controls, Google logo, zoom buttons or route summary panels
- hardcoded copy
- using the same time for all points on a long route
- labels that stay stale when the scrubber selection changes
- comparing "next forecast value" on the client without enough data
- timeline filters that hide scrubber items but leave all green map points fully visible
- top navigation that allows moving back to earlier steps but cannot return to already-computed results

## Suggested Implementation Plan For Claude Code

1. Complete v117 MVP flow/nav first, unless Stebbi explicitly asks to prioritize map time labels first.
2. Extend `RouteWeatherPoint.summaryForWindow` with ETA, forecast time and optional next-forecast trend.
3. Compute server-side `etaIso`, `forecastTimeIso` and `nextForecast` in `buildRouteWeatherPoints`.
4. Add helper tests for next forecast trend:
   - green -> yellow = worse
   - yellow -> green = better
   - red -> yellow = better
   - same status but higher decisive metric = worse
   - same status but nearly equal value = same
5. Add active candidate derivation in `FerdalagidClient.tsx`.
6. Pass `activeCandidate` and `activeLeg` into `TravelAuditMap`.
7. Add/adjust ETA helper in `travelAuditMap.helpers.ts`.
8. Render compact ETA / forecast-time labels beside route weather markers.
9. Ensure labels update when selected timeline candidate changes.
10. Thread active timeline filter state into `TravelAuditMap`.
11. Make map marker visibility/emphasis follow the same filter as the timeline/scrubber.
12. Update top step navigation so completed/available steps are clickable in both directions.
13. Make `Niðurstöður` clickable when `result` exists, without calling the API again.
14. Track dirty threshold drafts so stale results are not silently presented as updated.
15. Update selected point panel to show:
    - route ETA
    - forecast timestep used
    - next forecast trend
16. Add i18n keys in both languages.
17. Run:
    - `npm run type-check`
    - `npm run test:run`

## Localhost checks for Stebbi

After Claude Code implements:

1. Open `/auth-mvp/vedrid`.
2. Choose a long route, e.g. `Garðabær -> Akureyri`.
3. Continue through the MVP flow to results.
4. On the audit map, confirm route weather points show ETA/time context.
5. Confirm it is clear which time is route ETA and which time is the forecast timestep.
6. Tap a point.
7. Confirm selected point panel shows:
   - `Áætlað á leið: HH:mm`
   - `Spágildi notað: HH:mm`
   - `Næsta spágildi: betra/verra/svipað kl. HH:mm` when available
8. Use the timeline/scrubber to select a later departure slot.
9. Confirm ETA labels on the map update.
10. Confirm forecast-time parentheses update when the forecast timestep changes.
11. Filter the timeline to `Varúð` only.
12. Confirm the map also hides or clearly de-emphasizes green points, so yellow points are understandable.
13. Filter to `Gott veður` again.
14. Confirm green points can be shown again for confidence/sanity checking.
15. Select a warning/yellow/red slot if available.
16. Confirm warning point label is visible and readable.
17. From results, click `Veðurmörk` in the top navigation.
18. Without changing threshold values, click `Niðurstöður`.
19. Confirm the existing result screen returns immediately without a new loading/fetch cycle.
20. Go back to `Veðurmörk`, change one threshold value.
21. Confirm it is clear that the result needs recalculation before the changed threshold applies.
22. Test on 360px, 390px and 460px wide viewports:
    - labels do not make the map unusable
    - selected/warning label remains legible
    - zoom controls and Google attribution are not covered
    - no horizontal overflow appears

No Supabase, RLS, SQL migration, production, deployment, billing, API key, secret or user-data changes should be needed.

## Óvissa / þarf að staðfesta

- Exact rendering technique depends on Google Maps marker support in the current setup. `AdvancedMarkerElement` may be better for custom time chips, but classic markers may be enough if paired with separate overlays.
- Literal `ETA (forecast)` on every point may be visually noisy on long routes. Codex recommends aiming for every point when readable, while always showing selected/warning/endpoints and offering a force-show-all toggle if needed.
- Current `summaryForWindow` values can combine worst wind/gust/precipitation from nearby forecast hours inside the ETA window. For v119, the parenthesized forecast time should refer to the decisive/displayed metric, not necessarily every value in the row.
- Codex did not run tests because this is a planning/handoff artifact only.
