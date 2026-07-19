# 2026-07-17 06:19 — TODO-086 v381 — Route geometry fidelity + overview phases

Created: 2026-07-17 06:19  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Mode: planning / implementation handoff only, no product code changes

## Short Summary

Stebbi noticed a real product issue: after tightening provider-station matching to 1 km, stations near curvy roads/fjords can disappear because the route line we match against may be too sparse. The right next move is **not** to simply raise the provider radius to 2 km. The safer fix is to keep met.no behavior unchanged, but add a denser/high-quality route geometry specifically for fixed provider matching: Veðurstofan now, Vegagerðin next.

Also add the longer-term “Iceland overview before route selection” idea to the roadmap, but as a cost-controlled dashboard phase: no Google route calculations until the user actually chooses a route or opens a cached popular route.

## Decision To Carry Forward

1. **Keep met.no route sampling unchanged.**  
   met.no already has its own sampled route points and API-cost logic. Do not destabilize that.

2. **Provider points need better route geometry.**  
   Veðurstofan and Vegagerðin should match against the best route geometry we can reasonably keep, not against the 80-point route display/met.no route.

3. **1 km remains the target cutoff for fixed provider points.**  
   Only raise to 1.5-2 km if high-quality/dense geometry still misses real road-adjacent stations in localhost checks.

4. **Do not build the first overview page as a Routes API machine.**  
   It should be a cached/current-state dashboard first. Google route calls should happen only after route intent is clear.

## Current Code Observations

Relevant files:

- `lib/weather/google.server.ts`
- `lib/weather/provider.types.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/travel/provider-stations/route.ts`
- `lib/weather/providerRouteMatching.ts`

Key details:

- `google.server.ts` asks Google for `polylineEncoding: 'GEO_JSON_LINESTRING'`.
- It does **not** currently set `polylineQuality: 'HIGH_QUALITY'`.
- Google route geometry is immediately passed through `samplePoints(allPoints, MAX_ROUTE_POINTS)`, with `MAX_ROUTE_POINTS = 80`.
- Route cautions already use full pre-sampling geometry in places, which is good precedent.
- Provider station matching now uses the shared 1 km constant, but on route-selection it receives the route points from the client, which are currently the sampled route option points.

## Phase B0.4 — Dense Provider-Matching Geometry

Goal: Make Veðurstofan/Vegagerðin station inclusion depend on real route proximity, not a sparse 80-point display/met.no polyline.

### Implementation requirements

1. Extend provider route types without breaking existing consumers:

   ```ts
   export type RouteGeometry = {
     points: Array<{ lat: number; lon: number }>
     providerMatchingPoints?: Array<{ lat: number; lon: number }>
     distanceM: number
     durationS: number
   }
   ```

   `points` stays the existing sampled/display/met.no geometry.  
   `providerMatchingPoints` is the denser geometry for fixed provider matching.

2. In `lib/weather/google.server.ts`, keep `points = samplePoints(allPoints, MAX_ROUTE_POINTS)` exactly as today for current UI/met.no behavior.

3. Add `providerMatchingPoints` from `allPoints`, preferably high-quality route points.

4. Add `polylineQuality: 'HIGH_QUALITY'` to Google Routes request bodies where we need provider matching geometry:

   - `getRouteGeometry`
   - `getRouteOptions`
   - curated route fetches if route options can later be selected and matched against provider stations

   Keep an eye on response size and latency. The request is still a Routes API request; the known cost risk is more data/latency, not a separate feature we should assume is free forever.

5. Do not send unbounded geometry from browser to API.

   Current `provider-stations` endpoint cap is 1000 route points. Keep a cap, but replace stride downsampling with geometry-preserving simplification before sending:

   - Use Ramer-Douglas-Peucker or equivalent.
   - Preserve endpoints and curves/fjords better than stride.
   - Cap to <= 1000 points unless measured need says otherwise.

6. Route-selection provider-stations endpoint should receive:

   ```ts
   selectedRoute.providerMatchingPoints ?? selectedRoute.points
   ```

   after geometry-preserving simplification if needed.

7. Final travel route endpoint should match Veðurstofan against:

   ```ts
   routeGeometry.providerMatchingPoints ?? routeGeometry.points
   ```

8. Keep `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M = 1_000` for the first pass.

9. Add tests proving this is deliberate:

   - `getRouteOptions` returns sampled `points` for existing UI/met.no behavior.
   - `getRouteOptions` also carries denser `providerMatchingPoints`.
   - provider station endpoint uses the shared 1 km cutoff.
   - final travel endpoint uses `providerMatchingPoints` when available.
   - route-selection client sends `providerMatchingPoints` when available.
   - add a synthetic “curvy route” regression test where stride-like sparse geometry would miss a station but dense geometry includes it.

### What not to do in B0.4

- Do not change met.no sampling or number of met.no forecast points.
- Do not raise to 2 km as the main fix.
- Do not add Vegagerðin yet.
- Do not add the overview page yet.
- Do not add SQL/cache tables yet unless Claude Code finds an already-required tiny internal type change.

## Phase B0.5 — Provider Preview Shell Cleanup

Carry over v380 findings:

1. Make `ProviderStationPreviewCard` a truly reusable shell:
   - header
   - close button
   - provider badge
   - distance text
   - layout
   - slots for body/actions/pulse

2. Do not make the shell import `VedurstofanForecastRows`.

3. Let Veðurstofan pass its forecast rows as content.

4. Vegagerðin should later be able to pass current measurements / road state without pretending to be Veðurstofan forecast rows.

5. Add shared provider-station distance formatting:
   - under 1000 m: show metres
   - 1000 m and above: show km

## Phase B1 — Localhost Validation Of 1 km

After B0.4/B0.5:

1. Test real routes where 1 km previously felt too strict:
   - around Vík/Skeiðflötur
   - Reykjavík area with curved urban roads
   - Reykjavík → Ísafjörður
   - Höfn → Egilsstaðir
   - any fjord-heavy route

2. Confirm visually:
   - no far-away stations are pulled in
   - road-adjacent stations are not missed because of chording/sparse geometry

3. Only if high-quality/dense geometry still misses legitimate road-adjacent stations:
   - consider 1.5 km
   - then 2 km only with explicit product decision
   - document why

## Phase C — Iceland Overview Before Route Selection

Goal: A desktop-friendly and mobile-friendly “overall status of Iceland” entry step before the current route-selection flow.

### Product direction

This becomes the place users can open when they are not ready to choose a route yet:

- all-Iceland map
- Veðurstofan stations
- future Vegagerðin live/current points
- weather pulse / user reports
- later curated layers:
  - campsites
  - fishing rivers
  - golf courses
  - hiking routes
  - common routes

### Cost-control principles

Do **not** call Google Routes API just because a user opens the overview.

Overview should use:

- cached provider data from our own Supabase tables
- Veðurstofan/Vegagerðin cron/cache
- static curated lists
- map load only

Google route calculations should happen only when:

- user selects a route
- user opens a popular route
- cached popular route has expired and needs refresh

### Popular routes cache

We can have “popular/common routes” as product-owned definitions:

- origin/destination display names
- Google place IDs when available
- curated via-points
- route labels such as “Gegnum Hólmavík”, “Til að sleppa við Öxi”
- product copy/warnings

For Google-derived route geometry/durations:

- cache with explicit expiry
- do not treat Google route geometry as permanent data
- suggested TTL: <= 30 days, based on Google Maps Platform service terms for Routes API latitude/longitude caching
- revalidate on demand or by controlled background process if needed

Useful references:

- Google Maps Platform pricing: `https://developers.google.com/maps/billing-and-pricing/pricing`
- Routes API usage and billing: `https://developers.google.com/maps/documentation/routes/usage-and-billing`
- Google Maps service terms, Routes API caching: `https://cloud.google.com/maps-platform/terms/maps-service-terms/index-20240515`

## Phase D — Time Scrubber / Forecast Comparison On Overview

After the overview exists and provider matching is stable:

1. Add map-time scrubber for Veðurstofan forecast values.
2. Allow provider toggles:
   - Yr/met.no
   - Veðurstofan
   - Vegagerðin when ready
3. Consider Yr-at-provider-station-coordinates:
   - fetch/cache Yr values at Veðurstofan station coordinates
   - compare same coordinate across providers
4. Product modes can come later:
   - “Jákvæðasta spáin”
   - “Varfærnasta spáin”
   - “Sýna mun”

Do not add this before geometry and provider-card abstractions are stable.

## Phase E — Vegagerðin

Vegagerðin should plug into the same fixed-provider route matching model:

- fixed points / stations / road cameras / road condition points
- distance to dense route geometry
- order along route
- same preview-card shell
- same route overview layer model
- likely different body content than Veðurstofan

Important: avoid shaping Vegagerðin as Veðurstofan forecast rows. Use the provider-neutral shell and provider-specific body slots from B0.5.

## Risk / Cost Notes

### Google cost

The overview page can be cheap if it avoids route calls. Map loads still cost money, but the expensive runaway scenario is route calculations for every curious user.

Keep these controls:

- no automatic route calculation on overview load
- cache popular route geometry/durations with TTL
- avoid Google Places for campsites/rivers/golf/hikes if we can source/curate our own data
- keep route API calls user-intent driven

### Latency

`HIGH_QUALITY` route polylines can increase payload size and latency. Use it where provider matching needs it, then simplify/cap for client/API boundaries.

### Data model

Adding `providerMatchingPoints?: ...` to route types is a better long-term boundary than overloading `points`.

`points` can continue to mean “sampled display/evaluation route points”.  
`providerMatchingPoints` can mean “dense route geometry for fixed providers”.

## Recommended Next Message To Claude Code

Claude Code, please treat this as the updated execution plan for the next route-geometry phase.

Start with Phase B0.4 only:

1. Preserve current met.no behavior and sampled route `points`.
2. Add dense/high-quality `providerMatchingPoints` for fixed-provider matching.
3. Use `providerMatchingPoints` for Veðurstofan matching in both:
   - final travel calculation
   - route-selection provider-stations endpoint
4. Use geometry-preserving simplification/capping when sending route geometry from client to provider-stations endpoint.
5. Keep the 1 km cutoff initially.
6. Add targeted tests.
7. Do not add overview page, cache tables, Vegagerðin, or Yr comparison yet.
8. Run:
   - `npm run type-check`
   - targeted relevant tests
9. Create a handoff immediately after implementation.

## Localhost Checks For Stebbi

After Phase B0.4 is implemented:

1. Open `http://localhost:3004/vedrid`.
2. Test a route around Vík/Skeiðflötur where the screenshot showed a station near a bend/road.
   - Expected: station near the real road should be included if within about 1 km of the road.
   - Expected: no obviously far-away station should appear just because we widened the radius.
3. Test Reykjavík-area route.
   - Expected: fewer/fairer stations than 15 km logic.
   - Expected: no stations across water/urban chording weirdness.
4. Test a fjord-heavy route.
   - Expected: dense geometry follows the fjord enough that stations near the road are not lost.
5. Continue to final route result.
   - Expected: final Veðurstofan station list matches the route-selection layer logic.
6. Confirm met.no:
   - route point count and status behavior look unchanged
   - summary/worst/selected met.no cards still work
7. If stations are still missed, capture screenshots and note:
   - route
   - station
   - approximate distance from actual road
   - whether it is route-selection, final result, or both

No SQL, Vercel, Supabase, migration, commit, push, or deploy is part of this localhost validation.

## Open Questions

1. Should `HIGH_QUALITY` be enabled for all route calculations immediately, or only when provider station layers are enabled?
   - I lean all route calculations that feed provider matching, because selected route options need consistent geometry.
2. What max dense points should we allow client-side after geometry-preserving simplification?
   - Start with <= 1000 to match current endpoint cap.
3. Should popular route caching be DB-backed or static-file backed first?
   - For Phase C, static curated route definitions plus short-lived DB/API cache for Google-derived geometry is probably best.
