# 2026-07-17 06:35 — TODO-086 v382 — Phase B0.4 done, prerelease

Created: 2026-07-17 06:35
Timezone: Atlantic/Reykjavik
Author: Claude Code

## Status

Phase B0.4 implemented. Type check passes. 55/55 tests pass.

## What was done

### Phase B0.4 — Dense provider-matching geometry

1. **`lib/weather/provider.types.ts`**
   - Added `providerMatchingPoints?: Array<{ lat: number; lon: number }>` to `RouteGeometry`
   - Documented: prefer over `points` for fixed provider matching; falls back to `points` when absent

2. **`lib/weather/providerRouteMatching.ts`**
   - Added `perpendicularToSegmentM` (internal helper — flat-earth perpendicular distance)
   - Exported `rdpSimplify(points, epsilonM)` — Ramer-Douglas-Peucker simplification
   - Always preserves endpoints; keeps curve/fjord points that deviate > epsilonM; prunes collinear intermediates

3. **`lib/weather/google.server.ts`**
   - Import: `import { rdpSimplify } from './providerRouteMatching'`
   - Added `PROVIDER_MATCHING_RDP_EPSILON_M = 10` (10 m — tight, preserves fjord curves)
   - Added `MAX_PROVIDER_MATCHING_POINTS = 1000` (matches endpoint cap)
   - Added `providerMatchingPointsFrom(allPoints)` helper: runs RDP then stride-caps at 1000 as last resort
   - Added `polylineQuality: 'HIGH_QUALITY'` to all 3 request bodies:
     - `getRouteGeometry`
     - `getRouteOptions`
     - `fetchCuratedRoute`
   - Added `providerMatchingPoints: providerMatchingPointsFrom(allPoints)` to all 3 return objects

4. **`app/api/teskeid/weather/travel/route.ts`**
   - Provider matching now uses `routeGeometry.providerMatchingPoints ?? routeGeometry.points`
   - Was: `routeGeometry.points` (80-point sparse display geometry)

5. **`app/auth-mvp/vedrid/FerdalagidClient.tsx`**
   - Removed `downsampleRoutePoints` (stride-based, commented as having curve/fjord limitation)
   - Provider-stations fetch now sends: `selectedRoute.providerMatchingPoints ?? selectedRoute.points`
   - `providerMatchingPoints` is RDP-simplified (well under 1000 for typical routes); `points` fallback is at most 80

6. **`lib/__tests__/providerRouteMatching.test.ts`**
   - Added 4 new `rdpSimplify` tests:
     - preserves 2-point polyline endpoints
     - collapses collinear intermediate points (straight line → 2 points)
     - preserves significant curve point above epsilon
     - **regression test**: stride geometry misses fjord station at 1 km; RDP geometry finds it

7. **`lib/__tests__/weather-travel-api.test.ts`**
   - Added `providerMatchingPoints` to `makeRouteOption` helper (3 denser points vs 2 display)
   - Renamed test: "passes route geometry points..." → two tests:
     - "uses providerMatchingPoints (not sampled points) as routePolyline when present"
     - "falls back to points when providerMatchingPoints is absent"

## What was NOT done (as planned)

- No met.no sampling changes (MAX_ROUTE_POINTS = 80 unchanged)
- No 2 km radius change (DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M = 1_000 unchanged)
- No Vegagerðin
- No overview page
- No SQL/cache tables

## Localhost checks for Stebbi

1. Open `http://localhost:3004/vedrid`
2. Test Vík/Skeiðflötur area route — stations near fjord bends should appear
3. Test Reykjavík-area route — no cross-water chording artifacts
4. Test Reykjavík → Ísafjörður — fjord-heavy, dense geometry should follow road
5. Test Höfn → Egilsstaðir — confirm stations not missed on curvy east fjords
6. Compare route-selection preview layer vs final result layer — should show same stations
7. Confirm met.no behavior unchanged: route point count, summary/worst/selected cards

No SQL, Vercel, Supabase, migration, commit, push, or deploy is part of this validation.

## Open for Codex review

- Is epsilon 10 m right, or should it be tuned based on localhost observations?
- Should the stride-cap safety in `providerMatchingPointsFrom` log a warning when triggered?
- Are there any routes where HIGH_QUALITY increases latency noticeably?
