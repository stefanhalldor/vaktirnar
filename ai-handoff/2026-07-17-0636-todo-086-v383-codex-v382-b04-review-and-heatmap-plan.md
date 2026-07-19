# 2026-07-17 06:36 — TODO-086 v383 — Codex review of v382 B0.4 + route-cache/heatmap phase placement

Created: 2026-07-17 06:36  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Reviewed handoff: `2026-07-17-0631-todo-086-v382-claude-v381-b04-done-prerelease`  
Related plan to preserve: `2026-07-17-0627-todo-086-v382-codex-route-cache-and-interest-heatmap`

## Findings

1. **Medium: `providerMatchingPointsFrom()` can still return more than the endpoint cap of 1000 points**

   In `lib/weather/google.server.ts:97-103`, the last-resort stride cap pushes the final point after striding:

   ```ts
   for (let i = 0; i < rdp.length; i += step) strided.push(rdp[i])
   const last = rdp[rdp.length - 1]
   if (strided[strided.length - 1] !== last) strided.push(last)
   ```

   If `rdp.length` is an exact multiple that fills the cap, e.g. 2000 with `step = 2`, this creates 1000 strided points and then pushes the actual final point as item 1001. The route-selection endpoint rejects `routePoints.length > 1000` in `app/api/teskeid/weather/travel/provider-stations/route.ts:57-61`, and the client silently turns non-ok responses into `null` in `app/auth-mvp/vedrid/FerdalagidClient.tsx:473-484`. Result: the Veðurstofan route-selection layer can disappear on long/detailed routes with no user-visible explanation.

   **Fix:** use the same replacement pattern as `samplePoints()` in `lib/weather/google.server.ts:60-68`: if cap is full, replace the last sampled point with the actual last point instead of pushing beyond cap. Add a regression test that a dense RDP output above 1000 always produces `<= 1000` providerMatchingPoints and preserves first/last.

2. **Medium: `ProviderStationPreviewCard` is still provider-specific despite the shell comment**

   `components/weather/ProviderStationPreviewCard.tsx:6-7` imports `ForecastRowLine`, `selectUpcomingRows`, and `ProviderStationPoint`, and lines 35 and 63-79 render Veðurstofan forecast rows directly. The comment says provider-neutral shell, but the component contract still requires Veðurstofan-style `forecastRows`.

   This is fine for the current Veðurstofan-only route-selection layer, but it is not yet reusable for Vegagerðin. Before Vegagerðin lands, split this into:

   - `ProviderStationPreviewCardShell`: title, provider label, distance text, close button, children slot.
   - `VedurstofanStationPreviewCard`: wraps shell and renders Veðurstofan forecast rows + Púls.
   - Future `VegagerdinStationPreviewCard`: same shell, provider-specific current conditions/road state.

3. **Low: stale comment in `FerdalagidClient` says the client downsamples to <=500**

   `app/auth-mvp/vedrid/FerdalagidClient.tsx:446-448` still says:

   > Downsamples route geometry to <=500 points before sending to avoid the server cap.

   The code now sends `selectedRoute.providerMatchingPoints ?? selectedRoute.points` at lines 464-466. Update the comment so future work does not reintroduce the old sampling assumption.

4. **Low/workflow: handoff timestamp and filename disagree**

   The reviewed file is named `2026-07-17-0631-...`, but inside it says `# 2026-07-17 06:35` and `Created: 2026-07-17 06:35`. Not a product issue, but `WORKFLOW.md` requires the filename timestamp and `Created` timestamp to come from the same immediate time command. Worth tightening so the handoff trail stays trustworthy.

## What Looks Good

- The core architectural direction is right: met.no/Yr keeps using the sampled/display route points, while fixed providers use a dense `providerMatchingPoints` geometry.
- `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M = 1_000` is now shared by the final travel endpoint and route-selection provider-stations endpoint.
- `polylineQuality: 'HIGH_QUALITY'` is applied consistently to `getRouteGeometry`, `getRouteOptions`, and curated routes.
- Provider matching now projects to route segments rather than nearest vertices, which is the correct foundation for Veðurstofan and later Vegagerðin.
- Focused tests passed locally in this review.

## Commands Run By Codex

- `npm run type-check`  
  Result: passed, exit 0.
- `npm run test:run -- lib/__tests__/providerRouteMatching.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/weather-provider-stations.test.ts`  
  Result: passed, 3 files / 55 tests, exit 0.

No dev server was started. No SQL, migrations, env changes, commit, push, deploy, or production changes were performed.

## Recommended Immediate Next Step

Ask Claude Code to do one small B0.4 follow-up before moving on:

1. Fix the `providerMatchingPointsFrom()` cap so it can never return >1000.
2. Add a cap regression test.
3. Fix the stale `<=500` comment.
4. Optional but preferred: start B0.5 by making the preview card shell genuinely provider-neutral.

This should stay small and should not touch route cache, heatmap, overview page, Vegagerðin, SQL, or deploy.

## Updated Phase Order Including Route Cache / Interest Heatmap

This adds `2026-07-17-0627-todo-086-v382-codex-route-cache-and-interest-heatmap` into the overall plan so it does not get lost.

### B0.4 — Dense Provider Geometry Hardening

Current phase. Finish the cap bug, tests, and stale comments.

Goal: fixed providers match against accurate route geometry while met.no remains unchanged.

### B0.5 — Provider Preview Component Cleanup

Make the station preview UI genuinely reusable before Vegagerðin:

- shared provider preview shell
- Veðurstofan-specific forecast rows as child/content
- Vegagerðin-specific current/road conditions later as separate child/content

Goal: avoid rebuilding the same station-card/popup shell for each provider.

### B1 — Localhost Validation Of Provider Geometry

Stebbi validates:

- Vík / Skeiðflötur curve case
- Reykjavík-area false positives
- Reykjavík -> Ísafjörður
- Höfn -> Egilsstaðir / Öxi-adjacent routes
- route-selection layer vs final result stations
- met.no unchanged

### H0 — Google / Data Compliance Check For Route Cache

Before caching route polylines or route results, Claude Code should explicitly check the Google Maps/Routes terms that apply to this API usage and document what can be cached, for how long, and in what form.

Do not implement storage until this is clear.

### H1 — Shared Route Cache Design

Design only first:

- cache key from normalized origin/destination/waypoints/travel mode/options
- separate route geometry cache from user analytics
- TTL policy that respects provider terms
- no raw user home addresses stored as analytics labels
- make cache usable by route-selection, final calculation, and later overview/common routes

Goal: reduce repeated Google calls before building bigger overview surfaces.

### H2 — Route Interest Event Model

Privacy-first analytics track. This is not the same as route cache.

Capture route interest as coarse corridor/segment aggregates, not exact personal trips:

- reuse/extend existing `usage_events` patterns where possible
- preserve `USAGE_EVENT_SECRET` / fingerprint approach
- do not store raw address, place text, email, exact home coordinates, polyline, or forecast payload
- aggregate to route corridors/segments with k-anonymity threshold before showing anything public/admin-visible

### H3 — Aggregated Teskeið Route Heatmap

Turn H2 into a useful product view:

- "hvert landinn er að spá í að fara" as coarse popular corridors
- time windows like today / weekend / last 7 days
- only show aggregates above privacy threshold
- useful for future overview map, but not required for current route-result UI

### B2 — Route-Selection Provider Layer UX

After B0/B1, improve the route-selection step:

- Veðurstofan show/hide layer
- later Vegagerðin show/hide layer
- station click opens shared preview shell
- preview contains a few latest forecast/condition values and one Púls preview
- optional weather-threshold coloring and time scrubber should wait until the data model is stable

### B3 — Iceland Overview / Status Map

The larger "before route selection" idea:

- full Iceland map, desktop-friendly
- status overview before user chooses route
- later layers for campsites, fishing rivers, golf, hikes, etc.
- should reuse route cache and provider-layer components, not create a separate weather-map product stack

### V — Vegagerðin Provider

Vegagerðin should build on the same fixed-provider route matching model:

- station/road/live points matched directly to dense route geometry
- same provider preview shell
- same route-selection/final-result provider layer pattern
- separate feature/access env model for provider rollout, parallel to Veðurstofan

Vegagerðin does not need to wait for the full heatmap product, but it should wait for B0.5 provider-preview cleanup if possible.

## Localhost Checks For Stebbi

After the B0.4 follow-up:

1. Open `http://localhost:3004/vedrid`.
2. Test a short Reykjavík-area route and confirm far-off island/coastal stations do not appear with the 1 km threshold.
3. Test Vík / Skeiðflötur or another curvy coastal route and confirm nearby stations are not missed because of route chording.
4. Test Reykjavík -> Ísafjörður and Höfn -> Egilsstaðir to confirm long routes do not lose the Veðurstofan layer.
5. On route selection, toggle Veðurstofan off/on and click a station marker. The preview should show forecast rows and Púls without layout jump.
6. Continue to final result and compare station count/order with route-selection layer. They should be materially consistent.
7. Confirm met.no/Yr point count and summary/worst/selected behavior still feels unchanged.

Do not test Vercel, Supabase, SQL, migrations, or production from this handoff.

## Open Questions For Claude Code

- Can `providerMatchingPointsFrom()` be covered without exporting it, e.g. through a mocked Google response in `weather-google.test.ts`, or should it be exported as an internal/tested helper?
- Is the 10 m RDP epsilon causing any noticeable payload/latency issue on the longest Iceland routes?
- Should route-selection provider-stations return a small diagnostic status for rejected/too-long payloads, or is preventing >1000 client-side enough?

## Summary

v382 is directionally strong and should solve the original "1 km misses route curves/fjords" concern without changing met.no sampling. I would not release this exact state without fixing the possible 1001-point cap bug. The route-cache/interest-heatmap work should be preserved as a new H-track after geometry hardening and before the big overview map, but it should not be mixed into the immediate B0.4 follow-up.
