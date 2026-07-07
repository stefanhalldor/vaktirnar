# todo-067 v121 - Codex review: v120 scope review

Created: 2026-07-07 06:51  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Relevant TODO: todo-067 weather / Ferðalagið  
Reviewed:

- `2026-07-07-0700-todo-067-v120-claude-v119-scope-review.md`
- `2026-07-07-0633-todo-067-v119-codex-map-point-time-labels-forecast-trend.md`

## Findings

### P1 - Do not accept "detail panel only" as the final answer to Stebbi's map-time request

Claude Code is right that current `TravelAuditMap` uses classic `google.maps.Marker` and that fully styled marker chips are not trivial with the current marker setup.

But v120's proposed option C:

> Sýna ETA og spátíma í detail-panelinum en ekki á kortinu

does not satisfy Stebbi's product request as an endpoint. The recurring problem is that the **map itself** is hard to understand. The panel helps after tapping a point, but the map still leaves the user scanning a cluster of points without time context.

Codex recommendation:

- Use detail panel ETA/spátími as the immediate first layer.
- Also add at least a lightweight map-level time indication for selected/warning points in the same implementation pass.
- Full `ETA (spátími)` chips for every point can be deferred, but selected/warning map-level labels should not be deferred if possible.

Minimum acceptable MVP compromise:

- selected point label on map: `10:42` or `10:42 (11:00)` if readable
- warning/worst point label on map: visible
- every point: time available in marker `title` / accessibility title and selected panel

### P1 - "AdvancedMarkerElement is the only way" is too strong

Claude Code states that `AdvancedMarkerElement` is the only way to attach custom HTML chips to map markers and that this requires a `mapId`.

That is overstated.

Local type definitions show `google.maps.OverlayView` is available from the maps library:

- `node_modules/@types/google.maps/index.d.ts` includes `OverlayView`.
- `components/weather/TravelAuditMap.tsx` already loads `loadMapsLibrary()`.

`OverlayView` can render custom DOM overlays anchored to coordinates without converting every marker to `AdvancedMarkerElement`. This is still work and must be tested, but it means we do not have to block the whole idea on creating a Google Cloud `mapId`.

Recommended decision:

- Do **not** make Google Cloud `mapId` a prerequisite for v120/v121.
- Prefer a small custom `OverlayView` layer for selected/warning labels if classic marker labels are not enough.
- Keep `AdvancedMarkerElement + mapId` as a later clean-up/migration, not a blocker.

### P1 - Filter sync needs a precise map scope, not only lifted filter state

Claude Code correctly identifies that `hiddenStatuses` lives inside `DepartureHeatmap` and must be lifted to `FerdalagidClient`.

But v120 does not fully define the harder semantic issue:

- The timeline filter filters **departure candidates**.
- The map displays **weather points**.
- A yellow timeline slot may be yellow because of one point at one ETA.
- If multiple yellow slots are visible and none is selected, the map cannot honestly show "the yellow points" unless it either:
  - chooses one active candidate, or
  - aggregates point statuses across all visible candidates.

Without this decision, map/filter sync can remain confusing.

Codex recommendation for MVP:

1. If the user selects a specific timeline slot, the map shows point statuses for that slot.
2. If the user changes filters and the current selection is hidden, auto-select the first visible non-green slot, preferring red over yellow if both are visible.
3. If no slot is selected and a warning filter is active, auto-select the first visible warning slot.
4. If `Allt` is active and no slot is selected, use current/default summary state.

This is simpler than aggregate logic and gives the map one clear time context.

Future option:

- aggregate mode can later show "points that become yellow/red at least once in this filtered range", but that is a different visualization and should be labelled as such.

### P2 - De-emphasis is the right first choice, but opacity alone is not enough

Claude's recommendation to de-emphasize green markers instead of hiding them is good for route orientation.

But if green markers remain as colored dots at opacity 30 while warning labels are tiny, the user may still perceive clutter.

Recommended behavior:

- filtered-out markers: low opacity, no time chip, lower z-index
- filtered-in markers: normal opacity, clickable, visible label when density permits
- selected/worst/origin/destination: remain visible for orientation
- route polyline remains visible

This gives orientation without letting green dots dominate the warning view.

### P2 - ETA must update with scrubber selection earlier than Claude suggests

Claude asks whether ETA in panel should update with scrubber selection, and suggests maybe v121.

Codex recommendation: do it in the same pass as point ETA/spátími.

Reason:

- If the user chooses a later departure slot and taps a map point, stale ETA is actively misleading.
- The helper is straightforward: `candidate.departureIso`, `candidate.arrivalIso`, `pt.routeFraction`, reverse fraction for return.
- v119 already requires `activeCandidate` and `activeLeg`.

If full marker chips are deferred, dynamic ETA in the selected panel should still ship now.

### P3 - v120 lacks required `Localhost checks for Stebbi` substance

Claude says:

> Ekki á við — þetta er scope-rýni, ekki framkvæmd.

Project rules still require a `Localhost checks for Stebbi` section. For a scope review, it can say there is no new localhost behavior to test yet, but it should still preserve the exact required heading and explain what Stebbi should test after the recommended implementation.

This is process cleanup, not a product blocker.

## Recommended Answers To Claude's Questions

### 1. Map marker chips vs. detail panel

Recommended answer: **A modified A, not pure A or B.**

Do now:

- Add ETA/spátími/next forecast trend in `PointDetailsPanel`.
- Add map-level labels for selected and warning/worst points.
- Use `OverlayView` or another lightweight overlay if classic marker labels are insufficient.
- Do not require Google Cloud `mapId` yet.

Defer:

- full AdvancedMarkerElement migration
- all-point styled chips at every zoom level

Why:

- panel-only is too weak for Stebbi's map trust goal
- mapId/AdvancedMarker migration is too heavy to block this
- selected/warning labels give immediate value without turning the whole map into label soup

### 2. Filter-sync: de-emphasize or hide?

Recommended answer: **A - de-emphasize, but strongly.**

Use:

- opacity reduction
- no ETA chip on filtered-out markers
- lower z-index
- keep route and endpoints for orientation

For warning-only filters, yellow/red points must visually dominate.

### 3. ETA update with scrubber selection

Recommended answer: **A - yes, in this pass.**

Do not defer dynamic ETA to a later pass. It is the core of the feature: "hvenær er ég á þessum punkti miðað við valinn brottfarartíma?"

## Recommended Execution Scope

Claude Code should not try to deliver every possible v119 visual refinement at once. Use this scope:

### Phase 1 - Must ship now

1. Keep/finish v117 top navigation rules:
   - `Niðurstöður` clickable when `result !== null`
   - no API call when returning to existing result
   - dirty threshold drafts require recalculation
2. Add server data:
   - `etaIso`
   - `forecastTimeIso`
   - `nextForecast`
3. Add dynamic `activeCandidate` / `activeLeg` to `TravelAuditMap`.
4. Selected point panel shows:
   - ETA on route
   - forecast value used
   - next forecast trend
5. Lift timeline filter state up.
6. Sync map marker emphasis with active filter and active candidate.
7. Add selected/warning map-level time labels, using the simplest reliable implementation.

### Phase 2 - Later, after localhost validation

1. Full all-point marker chips.
2. Optional `Sýna tíma á öllum punktum` toggle.
3. AdvancedMarkerElement migration if mapId is added.
4. Aggregate map mode for all visible warning candidates.

## Implementation Notes For Claude Code

### Active candidate derivation

In `FerdalagidClient.tsx`, derive one active candidate:

```ts
const activeOutboundCandidate =
  selectedHeatmapIdx !== null
    ? outboundDisplayCandidates[selectedHeatmapIdx]
    : result?.travelPlan?.outbound.leavingAt

const activeReturnCandidate =
  selectedReturnHeatmapIdx !== null
    ? returnCandidates[selectedReturnHeatmapIdx]
    : undefined

const activeCandidate = activeReturnCandidate ?? activeOutboundCandidate
const activeLeg = activeReturnCandidate ? 'return' : 'outbound'
```

Then pass this into `TravelAuditMap`.

### Filter state

Move the hidden/visible status state from `DepartureHeatmap` into `FerdalagidClient`.

Be careful: outbound and return heatmaps should not accidentally share one filter if both are visible. Use separate filter states for outbound and return, or a keyed structure.

### Auto-selection on filter

When the filter changes:

- if current selected candidate remains visible, keep it
- if not, select first visible red candidate if any
- else select first visible yellow candidate if any
- else select first visible candidate
- else clear selection and show empty-state copy

This gives the map a deterministic candidate context.

### Map labels without mapId

Implementation options in order:

1. `OverlayView` label layer for selected/warning labels.
2. Classic marker `label` only for selected/warning if acceptable.
3. Marker `title` + selected panel as fallback.

Do not block on `mapId`.

## Design Notes

This follows `Design.md`:

- mobile-first clarity
- status color is not the only meaning
- controls and labels must not overlap
- text must remain readable at 360px, 390px and 460px
- user-visible copy belongs in `messages/is.json` and `messages/en.json`
- navigation must feel like app navigation, not a one-way form

## Localhost checks for Stebbi

After Claude Code implements the chosen scope:

1. Open `/auth-mvp/vedrid`.
2. Choose a long route, e.g. `Garðabær -> Akureyri`.
3. Continue to results.
4. Click a map point.
5. Confirm the point panel shows:
   - ETA on route
   - forecast time used
   - next forecast trend if available
6. Select a later timeline slot.
7. Confirm ETA in the point panel changes for the selected slot.
8. Filter timeline to `Varúð`.
9. Confirm the map de-emphasizes green points and makes warning points understandable.
10. From results, click `Veðurmörk` in top navigation.
11. Without changing thresholds, click `Niðurstöður`.
12. Confirm no loading/fetch/recompute happens.
13. Change one threshold value.
14. Confirm the UI requires recalculation before the new threshold affects results.
15. Test 360px, 390px and 460px widths:
    - no horizontal overflow
    - labels do not cover map controls or Google attribution
    - selected/warning labels remain legible

No Supabase, RLS, SQL migration, production, deployment, billing, API key, secret or user-data changes should be needed.

## Commands Run By Codex

```text
Get-Content -Encoding UTF8 WORKFLOW.md
Get-Content -Encoding UTF8 ai-handoff/README.md
Get-Content -Encoding UTF8 ai-handoff/2026-07-07-0700-todo-067-v120-claude-v119-scope-review.md
Get-Content -Encoding UTF8 ai-handoff/2026-07-07-0633-todo-067-v119-codex-map-point-time-labels-forecast-trend.md
Get-Content -Encoding UTF8 Design.md
Get-Content -Encoding UTF8 components/weather/TravelAuditMap.tsx
Get-Content -Encoding UTF8 components/weather/DepartureHeatmap.tsx
Get-Content -Encoding UTF8 lib/weather/googleMaps.client.ts
rg -n "OverlayView|AdvancedMarkerElement|MarkerLibrary|mapId" node_modules/@types node_modules/@googlemaps components lib app 2>$null
Get-Date -Format 'yyyy-MM-dd HH:mm'
```

Codex did not run tests because this is a scope review / planning artifact only.

## Óvissa / þarf að staðfesta

- Codex has not browser-tested an `OverlayView` label layer in this app. It is available in local Google Maps types, but implementation still needs localhost validation.
- If Stebbi wants all point labels visible at all zoom levels, that may still require a heavier map-label pass or explicit density toggle. Codex recommends selected/warning labels first.
