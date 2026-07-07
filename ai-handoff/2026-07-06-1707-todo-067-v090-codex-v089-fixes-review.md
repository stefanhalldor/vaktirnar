# todo-067 v090 - Codex review of Claude v089 fixes

Created: 2026-07-06 17:07  
Timezone: Atlantic/Reykjavik  
Review target: `2026-07-06-1703-todo-067-v089-claude-v088-fixes-done`  
Reviewer: Codex  
Relevant TODO: `todo-067` Ferðalagið weather flow

## Findings

### P1 - Heatmap selection still does not fully synchronize the map data/time window

The v089 fix moves map selection by converting the selected `TravelCandidate` into a `TravelIssue`:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx` lines 146-151 derives `heatmapHighlightedIssue`.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` lines 462-480 passes that issue to `DepartureHeatmap` and `TravelAuditMap`.
- `components/weather/TravelAuditMap.tsx` lines 213-220 moves `selectedIndex` when `highlightedIssue` changes.

That fixes only marker selection for non-green candidate issues. It does not make the selected map point panel describe the selected departure candidate.

Why:

- `TravelAuditMap` builds the selected panel from `weatherPoints[selectedIndex]`.
- `buildPointSummary()` reads values from `pt.summaryForWindow` in `components/weather/travelAuditMap.helpers.ts` lines 181-187.
- `summaryForWindow` is generated server-side once in `lib/weather/travel.ts` lines 622-634 using `summaryCandidate`, usually the best/default candidate, not the heatmap slot the user just tapped.
- For a green slot, `candidateToIssue()` returns `undefined` at `components/weather/travelAuditMap.helpers.ts` line 132, so tapping a green/best slot cannot move or update the map at all.

User-visible result:

1. Tap a red/yellow heatmap slot.
2. The map may select the right marker.
3. The point panel can still show wind/gust/precip/time from the original default or best-window summary, not from the tapped slot.
4. Tap a green slot.
5. The heatmap detail changes, but the map panel does not become a view of that selected green departure.

This misses the trust requirement from v088: selected heatmap slot, map marker and route-point details must all describe the same departure time, metric and location.

Fix direction:

- Do not use `highlightedIssue` as the only bridge from heatmap to map.
- Lift a `selectedCandidate` or `selectedDepartureIso` into `FerdalagidClient`.
- Either:
  - include candidate-specific point summaries in the API response, or
  - compute selected candidate point summaries client-side from data already returned, if enough hourly point data is exposed, or
  - add an endpoint/action to request route point summaries for a selected candidate.
- `TravelAuditMap` should accept selected-candidate context and render point values/times for that candidate.
- Green candidates still need to update the map/panel, even though they have no issue.

Minimum acceptable intermediate fix:

- Red/yellow slot click must show a panel whose metric/value/time equals the slot detail.
- Green slot click should either select destination/current route summary explicitly or say the map continues to show the result's default issue. Silent mismatch is not okay.

### P1 - If return trip is selected, outbound and return must be split instead of blended

When `latestHomeBy` is set, the UI/model should not blend outbound departure and return-trip assessment into one shared heatmap/map explanation. These are two different user decisions:

- outbound: when can I leave for the destination?
- return: when can I drive home safely and still be home by the deadline?

Current UI only renders one `DepartureHeatmap` for `result.travelPlan.outbound.candidates` in `app/auth-mvp/vedrid/FerdalagidClient.tsx` lines 458-469, while the deterministic result can also contain `result.travelPlan.return.candidates`. The result card can show `returnWindowLabel`, but the heatmap/map interaction is still outbound-centric.

That creates a confusing product model when both outbound and return are selected. The user may see one timeline and one audit map, while the answer may be influenced by both legs. It becomes unclear whether a warning, best window, selected marker or route-point values refer to the trip out or the trip home.

Fix direction:

- If no return trip is selected: keep the single outbound view.
- If return trip is selected: render two clearly separated sections:
  - `Útleið` / outbound heatmap, result summary, selected map context.
  - `Heimferð` / return heatmap, result summary, selected map context.
- Do not reuse one selected heatmap index for both legs.
- Do not let a return warning appear as if it belongs to outbound.
- The audit map can be shared visually if needed, but the selected candidate context must say explicitly whether it is showing `Útleið` or `Heimferð`.
- Return-leg distances should be expressed from destination/return start, not from original origin.

Minimum acceptable behavior:

- When `latestHomeBy` exists, the UI labels outbound and return as separate blocks.
- A selected outbound slot updates outbound details only.
- A selected return slot updates return details only.
- The overall status can summarize both, but the detailed evidence cannot blur them together.

### P2 - Reverse geocode BFF is still public by default

`app/api/place/reverse-geocode/route.ts` now has a kill switch and best-effort per-IP rate limit. That is a real improvement.

But the endpoint is still unauthenticated and enabled unless `ENABLE_REVERSE_GEOCODE=false`:

```ts
const ENABLED = process.env.ENABLE_REVERSE_GEOCODE !== 'false'
```

For production this means an unset env var leaves a public proxy to Nominatim active. The route also does not check `AUTH_MVP_ENABLED`, current user, or `vedrid` feature access, even though the weather travel flow itself is gated.

Fix direction:

- If this endpoint is only for `/auth-mvp/vedrid`, add the same auth + feature gate as the travel endpoint.
- If it is intended to be public later, default it to disabled until the public traffic strategy is explicit.
- Prefer `ENABLE_REVERSE_GEOCODE=true` opt-in rather than "not false" opt-out for production safety.

### P2 - Heatmap slots need visible day/date context while scrolling

The departure heatmap currently shows times like `18:37`, `19:07`, `19:37`, etc., but no visible day/date per slot or group. When the user scrolls horizontally, especially across midnight or a multi-day forecast window, they cannot tell which day is currently in view.

This is a trust and usability issue. A slot at `01:07` can mean tonight, tomorrow night, or a later forecast day depending on the search window. The UI needs to make that impossible to misread.

Fix direction:

- Add visible day context to the heatmap, for example:
  - sticky day headers while horizontally scrolling,
  - date separators between days,
  - compact labels like `Mán 6. júl` above slot groups,
  - or slot labels that include day when crossing into a new date.
- The selected slot detail should also show full day/date, not only clock time.
- Localized labels should come from `messages/is.json` and `messages/en.json`.

## Resolved from v088

The following v088 findings look resolved in code:

- Trailer-aware gust threshold logic is now used in `lib/weather/travel.ts` and `components/weather/DepartureHeatmap.tsx`.
- Route selection line now has a dedicated effect depending on both origin and destination in `components/weather/RouteSelectionStep.tsx`.
- `RoutePointRow` now hides hviður when gust is not greater than wind.
- `lib/weather/travel.ts` facts now hide hviður when gust is not greater than wind.

## Verification run by Codex

```text
npm run type-check -> exit 0
npm run test:run -> exit 0
52 files passed, 1703 tests passed, 27 skipped, 8 todo
```

## Recommended next step

Ask Claude Code for one focused fix pass on the remaining P1 only:

- make heatmap slot selection drive the actual map point values/time,
- include green slots in the interaction model,
- split outbound and return views when return trip is selected,
- add tests or at least a clearly documented manual check for red/yellow/green slot selection.

The reverse-geocode endpoint can be fixed in the same pass if production readiness is the goal.

## Localhost checks for Stebbi

After the next fix pass, test `/auth-mvp/vedrid` on localhost.

### Heatmap and map synchronization

1. Choose origin/destination and set `latestArrivalBy` so the heatmap appears.
2. Tap a yellow or red departure slot.
3. Expected: slot detail and map point panel show the same metric, value, threshold and time.
4. Tap a different yellow/red slot.
5. Expected: the selected marker and panel update to that slot.
6. Tap a green/best slot.
7. Expected: the map/panel clearly represents that green departure, or the UI explicitly says the map is showing the default/worst point instead.
8. Deselect the slot.
9. Expected: the map returns to the original result/default highlighted issue.
10. Scroll horizontally across the heatmap.
11. Expected: it is always clear which day/date the visible slots belong to, including after midnight.

### Outbound versus return

1. Select a route with `latestArrivalBy` and `latestHomeBy`.
2. Expected: outbound and return are shown as separate sections, not one blended heatmap.
3. Tap an outbound slot.
4. Expected: only outbound details/map context update.
5. Tap a return slot.
6. Expected: only return details/map context update, with distance from destination/return start where relevant.
7. Expected: overall status can mention both legs, but detailed evidence always says whether it belongs to `Útleið` or `Heimferð`.

### Reverse geocode safety

1. With reverse geocode enabled, click a few middle route points.
2. Expected: labels load through `/api/place/reverse-geocode`.
3. Temporarily set `ENABLE_REVERSE_GEOCODE=false` and restart dev.
4. Expected: labels fail gracefully without breaking the result screen.
5. Before production, confirm whether this endpoint is auth-gated or intentionally public.
