# 2026-07-22 08:01 — TODO-086 v304 — Codex now-first/background route plan

Created: 2026-07-22 08:01  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Related handoff: `2026-07-22-0820-todo-086-v301-claude-v300-done-prerelease.md`  
Related commit from Claude: `4ab8872 feat: road surface detection, loader UX, route choice panel (#86)`

## Purpose

Stebbi tested the v300/v301 flow and clarified the desired user experience:

- Do **not** block the user while Teskeið looks for all route options and road-surface alternatives.
- Show the shortest/current default route as fast as possible.
- Open the map on **Núna** first.
- After the map opens, show that Teskeið is still looking for more routes and calculating forecast departure slots.
- Fix route-station counts, filters, and labels so the new map matches what the user actually sees.

This is an implementation handoff for Claude. Codex did not change code in this v302 step; this file is the requested execution plan.

## Product Behavior To Implement

### 1. Reikna ferð: fastest/shortest route first

On `Reikna`:

- Close the route sidebar immediately.
- Show full Teskeið loader only while calculating the initial route and **Núna** state.
- Call the fastest/default travel calculation first.
- Do **not** wait for `/api/teskeid/weather/travel/routes`.
- Do **not** wait for all route-surface checks.
- As soon as `/api/teskeid/weather/travel` returns, render the route and open the map on **Núna**.

This means v300’s current order should change from:

1. resolve places
2. fetch route options
3. fetch surface summary for up to 6 routes
4. calculate selected route
5. render

to:

1. resolve places
2. calculate default/fastest route via `/travel`
3. render **Núna**
4. in background, fetch route options + surface summaries
5. in background, calculate first 24 hourly forecast slots

### 2. Map opens on Núna, with all route stations visible

When the initial route appears:

- `selectedCandidateIdx` must be `null`.
- The displayed source/state must be **Núna**.
- The status filter must be reset to show all relevant route statuses.
- All route stations for the active **Núna** provider must be visible.
- The pill counts must count the same station set that is visible on the map.

For `Núna`:

- Prefer Vegagerðin current stations when available.
- Use Veðurstofan forecast fallback only if there are no Vegagerðin route stations.
- Do not merge hidden provider counts into the visible pill count.

Expected fix:

- If there are 8 visible Vegagerðin stations on the selected route, the pill count must add up to 8, not 1.
- If all are visible, `Innan marka`, `Óþægilegt`, and `Hættulegt` pills must reflect actual visible route station statuses.

Likely bug sources to inspect:

- `providerStatusCounts`
- `slotStatusOverrides?.[0]`
- `visibleRouteStatusesRef`
- `handleRouteStatusFilterChange(new Set())`
- `applyRouteStatusFilterToMap`
- route layer visibility versus marker/label visibility
- whether counts are coming from fallback `mapData.statusCounts` instead of route station layers

### 3. Background scrubber calculation

After **Núna** is rendered:

- The full-screen loader must disappear.
- In the scrubber area itself, show a small loading row:
  - “Er að búa til stöðuna m.v. brottför á heila tímanum eins langt og spáin nær.”
- Start by calculating/filling the first 24 hours only.
- Add a `Sækja meira` / `Load more` control to fetch/calculate the next 24 hours.
- Do not automatically calculate the full forecast horizon if it creates unnecessary requests or slow UI.

Implementation options:

- If current `/travel` already returns all candidates, first do a UI slice:
  - render first 24 candidates
  - store remaining candidates internally
  - expose `Sækja meira`
  - this is fastest and lowest-risk
- If request time is still high because backend calculates all candidates before responding, split API later:
  - `/travel` returns now/default route first
  - second endpoint returns hourly candidates in 24h pages

For this next Claude step, Codex recommends first doing the UI slice unless the current backend response time proves unacceptable.

### 4. Route options and gravel alternatives in background

After the default route is visible:

- Show a compact “leita fleiri leiða” state in the route-choice panel area.
- Fetch `/api/teskeid/weather/travel/routes` in the background.
- For each returned route option, fetch road-surface summary in the background.
- Update route-choice panel when alternatives are ready.

The route-choice panel should have states:

- `Leita að fleiri leiðum…`
- `Leiðavalkostir fundnir`
- `Valda leiðin fer um möl...`
- `Engin önnur leið fannst sem forðast möl` if relevant
- hidden/quiet if only one route and no surface warning

Important: This still uses Google route options today. Do not present it as the final open-road-graph routing engine. Use language like “leita fleiri leiða” / “slitlag greint” rather than promising guaranteed gravel avoidance.

### 5. Wind labels and station names on route

For the route view:

- Show wind value for **all Vegagerðin route stations** in `Núna`.
- Do not apply the same aggressive label density rules to Vegagerðin route labels.
- If overlap becomes bad, keep all wind values visible but optionally reduce station-name labels.

Recommended label policy:

- Vegagerðin current route stations:
  - Always show wind value label.
  - Include station name when zoom/density allows.
  - If compact label is needed, show `5 m/s`; on hover/click show full station name.

- Veðurstofan forecast route stations:
  - Use density rules for station-name labels.
  - Always show dangerous/uncomfortable labels.
  - For selected slot, ensure enough labels to understand the route.

### 6. Place labels on route

Stebbi wants route context:

- Always try to show departure place and destination place.
- Show intermediate place labels when there is room.
- Existing `ROAD_MAP_PLACES` and route-place marker logic can be reused.

Recommended first step:

- In route mode, do not hide all place markers.
- Instead, show:
  - origin label
  - destination label
  - high-importance places near route or inside route bbox
- Use zoom/density gating to avoid clutter.

Do not build a new POI system in this step. Reuse `ROAD_MAP_PLACES` and existing map marker helpers where possible.

## Concrete Technical Plan

### A. Restructure route submit flow in `RoadMapPrototypeMap.tsx`

Current v300 added:

- `fetchRouteSurfaceChoices`
- `calculateResolvedRoute`
- full-screen loader
- route-surface choices

Change `handleRouteBridgeSubmit`:

1. Resolve origin/destination.
2. Set:
   - `setIsPanelOpen(false)`
   - `setRouteBridgeStatus('loading')`
   - `setSelectedCandidateIdx(null)`
   - `setRouteSurfaceChoices([])`
   - new `routeSurfaceChoicesStatus = 'idle' | 'loading' | 'ready' | 'error'`
   - new `routeForecastBuildStatus = 'idle' | 'loading' | 'ready' | 'error'`
3. Call `calculateResolvedRoute` **without** a selected route id.
4. Once rendered, set route status success.
5. Start background promises:
   - `fetchRouteSurfaceChoices`
   - first 24-hour forecast/candidate preparation if not already available

Do not let background failures put the whole route into `routeBridgeStatus='error'`.

### B. Split route state from background state

Keep `routeBridgeStatus` for the initial map render only.

Add separate states:

- `routeSurfaceChoicesStatus`
- `routeForecastBuildStatus`
- `visibleRouteCandidateLimit` or `visibleRouteCandidateWindowDays`
- `allRouteCandidates`
- `displayedRouteCandidates`

Avoid using full-screen loader for `routeSurfaceChoicesStatus` or `routeForecastBuildStatus`.

### C. Fix visible status reset

On successful route render:

- Reset `selectedCandidateIdx` to `null`.
- Reset `visibleRouteStatusesRef.current` to a set that means “show all statuses”.
- Make sure `WindStatusFilterPills` receives the same status counts that active route markers use.

Be careful: `new Set()` may currently mean either “none selected” or “default/all” depending on helper semantics. Make this explicit.

Recommended:

- Add a helper like `allWindStatusSet()` or `routeVisibleStatusesForCounts(counts)`.
- Do not rely on empty set ambiguity.

### D. Fix route station count source

For **Núna**:

- If `vegagerdinRender.count > 0`, counts should be `vegagerdinRender.statusCounts`.
- Else if `vedurstofanRender.count > 0`, counts should be `vedurstofanRender.statusCounts`.
- Else fallback to `mapData.statusCounts`.

Do not merge Vegagerðin + Veðurstofan counts if only one provider is visible.

If both are intentionally visible in a future mode, then merge counts only in that mode.

### E. Show all Vegagerðin wind labels on route

Review:

- `renderVegagerdinStations`
- `createVegagerdinRouteLabel`
- `updateVegagerdinLabelMarkerState`

Ensure:

- All `validPoints` get a label marker in route mode.
- Hidden/filtered state only responds to user-selected pills.
- Label marker state is synced after mode/filter changes.
- Point click lookup does not depend only on label markers if labels are ever hidden.

Possible bug:

- Current popup point lookup may use `routeVegagerdinLabelMarkersRef`. If labels are filtered/hidden, point lookup can fail. Keep a separate `routeVegagerdinEntriesRef` like Veðurstofan has.

### F. Move the hourly loading text into scrubber

Remove `roadMapPrototypeScrubberCalculatingHourly` from full-screen loader titles.

Use it only in the bottom scrubber area while `routeForecastBuildStatus === 'loading'`.

Loader titles should stay focused on:

- finding route
- fetching current/latest data
- calculating station positions for now

### G. Add 24h / load more behavior

Lowest-risk first implementation:

- Use existing `routeCandidates`.
- Render only the first 24 hourly candidates in `DepartureHeatmap`.
- Add `Sækja meira` button after the rendered range if more candidates exist.
- On click, increase visible limit by 24.

If `DepartureHeatmap` assumes all candidates, either:

- pass sliced candidates + sliced overrides, or
- extend it with `visibleLimit` and `onLoadMore`.

Remember to keep `selectedCandidateIdx` mapping correct when slicing.

## Files Claude Will Likely Touch

- `components/weather/RoadMapPrototypeMap.tsx`
- possibly `components/weather/DepartureHeatmap.tsx`
- `messages/is.json`
- `messages/en.json`
- maybe a test file if route candidate slicing is extracted to helper

No SQL expected.

## Suggested Tests / Checks

Run:

- `npm run type-check`
- Targeted tests if any helper is added:
  - `npm run test:run -- <new-helper-test-name>`

Manual browser checks are more important here because the bugs are visual/state-sync issues.

## Localhost checks for Stebbi

Open:

- `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Prereqs:

- Authenticated user with `road-intelligence-v1`.
- `.env.local` has `ROAD_INTELLIGENCE_V1_ENABLED=true`.

### Test 1 — Shortest route opens fast

1. Open the 🚗 route panel.
2. Enter `Akureyri` → `Egilsstaðir`.
3. Click `Reikna`.
4. Expected:
   - sidebar closes
   - full Teskeið loader appears briefly
   - map opens on the default/shortest route without waiting for all route alternatives
   - route-choice area can say it is still looking for more routes

### Test 2 — Núna is truly selected first

1. After route opens, inspect the scrubber.
2. Expected:
   - `Núna` is selected
   - no future departure slot is selected automatically
   - all current route stations are visible unless Stebbi manually changes pill filters

### Test 3 — Station counts match visible dots/labels

1. Count visible route station markers/labels manually on a short route.
2. Compare with pill counts.
3. Expected:
   - if 8 route stations are visible, pill counts add up to 8
   - not “1” unless only one station is actually visible

### Test 4 — Vegagerðin wind values

1. Test a route with Vegagerðin stations.
2. Expected:
   - all Vegagerðin route stations show wind values in `Núna`
   - station name appears where there is room
   - clicking any dot/label opens details for the correct station

### Test 5 — Forecast background scrubber

1. Keep the route open after `Núna` renders.
2. Expected:
   - no full-screen loader blocks the map
   - scrubber area shows a background calculation/loading message if hourly data is still preparing
   - first 24 hours are available first
   - `Sækja meira` loads the next 24 hours if more forecast slots exist

### Test 6 — Route alternatives

1. Use a route likely to have multiple alternatives or gravel.
2. Expected:
   - the first/default route appears first
   - route-choice panel later updates with alternatives
   - selecting another route recalculates and preserves `Núna` first

## Risks / Review Questions For Codex After Claude Implements

1. Does any background failure incorrectly replace the already-rendered route with an error state?
2. Are visible pill counts derived from the active rendered provider, not hidden fallback layers?
3. Is empty `visibleRouteStatuses` semantics explicit and safe?
4. Does sliced 24h candidate rendering keep `selectedCandidateIdx` aligned with the correct candidate?
5. Does the route-choice background fetch avoid race conditions if Stebbi starts a second route before the first background work finishes?
6. Does the UI copy avoid promising fully Google-free/open-graph gravel avoidance before that exists?

## Not In Scope For This Step

- Replacing Google Routes API with our own open road graph.
- Building graph-backed “avoid gravel” routing.
- SQL or Supabase migrations.
- Production deployment.

Those should remain separate phases.
