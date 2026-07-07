# todo-067 v118 - Codex handoff: map point time labels

Created: 2026-07-07 06:31  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Relevant TODO: todo-067 weather / Ferðalagið  
Builds on:

- `2026-07-06-2326-todo-067-v117-codex-v116-review-mvp-flow-nav.md`
- Stebbi direction: make it clear what time each route weather point refers to, especially on long routes.

## Product Decision

Add visible time context to route weather points on the audit map.

Stebbi's point:

> Það er smá óskýrt kl. hvað veðurpunktarnir eiga við og það getur skipt sköpum, sérstaklega á langri leið.
> Vaknaði með þá hugmynd að setja hh:mm við hlið hvers punkts á kortinu til þess að þetta sé alveg skýrt.

This is the right trust-building layer. On a long route, a point near Akureyri is not assessed at the same time as a point near Reykjavík. The map should make that obvious.

## Important Semantics

The label should mean:

```text
This route point is assessed around HH:mm for the currently selected departure / timeline slot.
```

It should not mean:

- forecast update time
- current clock time
- same time for every point on the route
- the highlighted issue time only

When a user selects a different time in the timeline/scrubber, the HH:mm labels on the map must update to match that selected candidate. Otherwise the map will look precise while being misleading.

## Current Code Notes

Relevant current files:

- `components/weather/TravelAuditMap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `lib/weather/travel.ts`
- `lib/weather/types.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`

Useful existing data:

- `RouteWeatherPoint.routeFraction`
- `RouteWeatherPoint.distanceFromOriginM`
- `RouteWeatherPoint.summaryForWindow.decisiveTimeIso`
- `TravelCandidate.departureIso`
- `TravelCandidate.arrivalIso`

Current limitation:

- `selectedCandidatePointStatuses` only contains non-green per-point statuses.
- It does not contain a full per-point assessment time.
- Therefore, if the user selects a scrubber slot, map colors can update, but a naive marker time label based only on `summaryForWindow.decisiveTimeIso` would not necessarily match the selected slot.

## Recommended Implementation

### 1. Pass the active candidate into `TravelAuditMap`

Instead of trying to encode all point times into `CandidatePointStatus`, pass the currently active candidate to the map.

Suggested new prop shape:

```ts
activeCandidate?: TravelCandidate
activeLeg?: 'outbound' | 'return'
```

In `FerdalagidClient.tsx`, derive it from the same state that drives `selectedCandidatePointStatuses`:

- return slot selected -> `returnCandidates[selectedReturnHeatmapIdx]`, `activeLeg = 'return'`
- outbound slot selected -> `outboundDisplayCandidates[selectedHeatmapIdx]`, `activeLeg = 'outbound'`
- no slot selected -> use the default displayed candidate, probably `result.travelPlan.outbound.leavingAt`, `activeLeg = 'outbound'`

### 2. Compute point ETA in the map helper

Add helper, likely in `travelAuditMap.helpers.ts`:

```ts
export function estimatePointAssessmentTimeIso(
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
- assessment/ETA ms = `depMs + etaFraction * durationMs`

Then format as `HH:mm` with the existing `formatKlTime`.

This gives a clear route-relative time for every point and avoids inflating the server response.

### 3. Render HH:mm labels beside route weather markers

Current route markers are classic `google.maps.Marker` with circle symbols. Classic marker labels are limited and already used for origin/destination labels, so for readable `HH:mm` chips Claude Code should consider either:

- `AdvancedMarkerElement` with custom HTML content for route weather points, or
- a paired lightweight marker/overlay for the time chip anchored beside each route marker.

Preferred UX:

- route dot remains the status color
- time chip sits just beside/above the dot
- selected point and warning points have slightly stronger label emphasis
- origin/destination labels still remain understandable

Example visual direction:

```text
● 08:42
● 09:15
● 10:03
```

Use compact chips:

- `font-size: 10px` or `11px`
- white or warm-card background
- dark text
- subtle border
- small radius
- no heavy shadow

### 4. Do not let labels destroy the map on long routes

Stebbi wants the time next to each point because it builds trust. That is the target.

But long routes can have 80+ route weather points on a 360px-wide phone. If every label is always rendered at every zoom, the map may become unreadable.

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
3. If all labels are hidden due to density, still make the time visible:
   - in marker title/tooltip
   - in the selected point panel
   - in warning/selected labels

If Claude Code chooses to show every label unconditionally for MVP, test Akureyri-length routes carefully at 360px. If it becomes unreadable, add the toggle/density rule immediately rather than shipping visual clutter.

### 5. Selected point panel should use the same wording

The selected point detail already shows `pointTimeLine` using `decisiveTime`.

Make the copy clearer if needed:

Icelandic:

```json
"pointTimeLine": "Metið um kl. {time}"
```

English:

```json
"pointTimeLine": "Assessed around {time}"
```

That is better than just `kl. {time}`, because it explains what the time means.

### 6. Timeline selection must update labels

Manual test target:

1. Open a long route, e.g. Garðabær -> Akureyri.
2. Look at map labels.
3. Select a later timeline/scrubber slot.
4. Expected: HH:mm labels on route points shift later.
5. Select another slot.
6. Expected: labels update again.

If labels do not change with selected slot, the implementation is not correct enough.

## Relationship To v117

This should be implemented after or together with v117:

- v117 hides the explicit time step from MVP and adds top step navigation.
- v118 makes the map explain time even without asking the user for a time first.

These two fit together well:

- MVP does not ask the user a time question up front.
- Result still shows how the assessment moves along the route over time.

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

## Suggested Implementation Plan For Claude Code

1. Complete v117 MVP flow/nav first, unless Stebbi explicitly asks to prioritize time labels first.
2. Add active candidate derivation in `FerdalagidClient.tsx`.
3. Pass `activeCandidate` and `activeLeg` into `TravelAuditMap`.
4. Add ETA/assessment time helper in `travelAuditMap.helpers.ts`.
5. Add tests for the helper:
   - outbound routeFraction `0`, `0.5`, `1`
   - return routeFraction `0`, `0.5`, `1`
   - UTC/Iceland HH:mm formatting expectation
6. Render compact HH:mm labels beside route weather markers.
7. Ensure labels update when selected timeline candidate changes.
8. Keep selected point panel in sync with the same selected/active candidate.
9. Add/adjust i18n keys if copy changes.
10. Run:
    - `npm run type-check`
    - `npm run test:run`

## Localhost checks for Stebbi

After Claude Code implements:

1. Open `/auth-mvp/vedrid`.
2. Choose a long route, e.g. `Garðabær -> Akureyri`.
3. Continue through the MVP flow to results.
4. On the audit map, confirm route weather points show HH:mm context.
5. Confirm the time labels make it clear that points later on the route are assessed later than points near the start.
6. Tap a point.
7. Confirm the selected point panel shows the same time concept, preferably as `Metið um kl. HH:mm`.
8. Use the timeline/scrubber to select a later departure slot.
9. Confirm map time labels update.
10. Select a warning/yellow/red slot if available.
11. Confirm warning point label is visible and readable.
12. Test on 360px, 390px and 460px wide viewports:
    - labels do not make the map unusable
    - selected/warning label remains legible
    - zoom controls and Google attribution are not covered
    - no horizontal overflow appears

No Supabase, RLS, SQL migration, production, deployment, billing, API key, secret or user-data changes should be needed.

## Óvissa / þarf að staðfesta

- Exact rendering technique depends on Google Maps marker support in the current setup. `AdvancedMarkerElement` may be better for custom time chips, but classic markers may be enough if paired with separate overlays.
- Literal "label every point always" may be visually noisy on long routes. Codex recommends aiming for every point when readable, while always showing selected/warning/endpoints and offering a force-show-all toggle if needed.
- Codex did not run tests because this is a planning/handoff artifact only.
