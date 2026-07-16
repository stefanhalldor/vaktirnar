# TODO 086 v358 - Provider route matching before Vegagerðin

Created: 2026-07-16 20:51
Timezone: Atlantic/Reykjavik
Author: Codex
Related context:
- `2026-07-16-2025-todo-086-v356-claude-v355-done-prerelease.md`
- `2026-07-16-2041-todo-086-v357-codex-v356-date-format-review.md`

## Goal

Before starting Vegagerðin, fix the route-matching model for non-MET weather providers.

MET/Yr can keep using sampled route weather points because that provider is forecast-grid based and sampling controls API/cost/work. Veðurstofan and Vegagerðin are different: they are fixed real-world point providers. For those, the correct mental model is:

> Given a selected route polyline, which provider points are close to the route?

Not:

> Given sampled MET/Yr weather points, which provider station is nearest to each sampled point?

## Current behavior

In `app/api/teskeid/weather/travel/route.ts`:

- `routeGeometry.points` is sampled into `weatherPoints` via `sampleRouteWeatherPoints()` around lines 325-333.
- Veðurstofan station IDs are selected from those sampled points via `getUniqueStationIdsForRoute(weatherPoints)` around line 351.
- `getUniqueStationIdsForRoute()` in `lib/weather/providers/vedurstofanStations.ts` maps each sampled route point to its nearest curated station and omits mappings with `unavailable` confidence (>50 km).
- Only after station IDs are selected does `route.ts` project each chosen station onto the full route polyline with `projectToPolyline()` around lines 436-441.

This means the later projection is good, but the station selection has already been narrowed through sampled MET/Yr route points. A Veðurstofan station can be close to the real route but still be missed if it is never the nearest station for a sampled weather point.

## Why this matters now

This may be acceptable-ish for the first Veðurstofan prototype, but it is the wrong foundation for Vegagerðin. Vegagerðin points are current road/condition points, cameras, road sections, or sensors. Those must be matched to the actual selected route geometry, not inferred through MET/Yr sample points.

If we fix this now for Veðurstofan, Vegagerðin can reuse the same provider-neutral route matching helper.

## Proposed model

Create a reusable provider point to route matching helper, for example:

`lib/weather/providerRouteMatching.ts`

Recommended API shape:

```ts
export type ProviderRoutePoint = {
  id: string
  name: string
  lat: number | null
  lon: number | null
}

export type ProviderRouteMatch<T extends ProviderRoutePoint> = {
  point: T
  distanceM: number
  distanceFromOriginM: number
  routeFraction: number
}

export function matchProviderPointsToRoute<T extends ProviderRoutePoint>(input: {
  points: readonly T[]
  routePolyline: ReadonlyArray<{ lat: number; lon: number }>
  maxDistanceM: number
  maxPoints?: number
  includeEndpoints?: boolean
}): ProviderRouteMatch<T>[]
```

The helper should:

1. Ignore provider points without valid `lat/lon`.
2. Project every provider point onto the full route polyline.
3. Keep points where `distanceM <= maxDistanceM`.
4. Sort by `distanceFromOriginM`.
5. Deduplicate by provider `id`.
6. Optionally cap, but only after sorting by route order and with a clearly named constant.

Move or share the existing projection math from `app/api/teskeid/weather/travel/route.ts`:

- `pointToSegmentM()`
- `projectToPolyline()`
- `haversineM()`

Do not leave duplicate projection implementations drifting in multiple files.

## Veðurstofan implementation plan

Replace the station selection path in `app/api/teskeid/weather/travel/route.ts`:

Current:

```ts
const vedurstofanStationIds = layerEnabled ? getUniqueStationIdsForRoute(weatherPoints) : []
```

Target:

1. Build candidate provider points from `VEDURSTOFAN_STATIONS_REGISTRY`, not only the old curated seed list.
2. Include entries where `stationId`, `lat`, and `lon` are present.
3. Run `matchProviderPointsToRoute()` against `routeGeometry.points`.
4. Use the matched IDs to call `readVedurstofanProductForStations(...)`.
5. When building `layerPoints`, use the precomputed match values:
   - `distanceM`
   - `distanceFromOriginM`
   - `routeFraction`
6. Keep metadata lookup from registry for:
   - station name
   - source URL
   - owner/mapping status if useful later

Suggested initial distance rule for Veðurstofan:

- Start with `VEDURSTOFAN_ROUTE_MAX_DISTANCE_M = 10_000` or `15_000`.
- Do not reuse the old 50 km nearest-point confidence rule as the default inclusion radius. A station 50 km away from the actual route is usually not a route-adjacent observation.
- If Stebbi wants a more generous prototype, make it explicit and visible in the constant name/comment, e.g. `VEDURSTOFAN_EXPERIMENTAL_ROUTE_RADIUS_M`.

Product preference from Stebbi:

- It is better to show "stations near this route" than to over-include distant stations.
- Cards already show the distance from the road; keep doing that.

## Vegagerðin future use

Vegagerðin should plug into the same helper:

```ts
const vegagerdinMatches = matchProviderPointsToRoute({
  points: vegagerdinPoints,
  routePolyline: routeGeometry.points,
  maxDistanceM: VEGAGERDIN_ROUTE_MAX_DISTANCE_M,
})
```

Vegagerðin may need a different `maxDistanceM` or route-section logic. That should be provider-specific configuration, not a separate spatial-matching system.

## Important non-goals

Do not change MET/Yr sampling in this pass. `sampleRouteWeatherPoints()` is still useful for forecast-grid calls and route weather assessment.

Do not start Vegagerðin implementation in this pass. This handoff is about preparing the route matching foundation by fixing Veðurstofan first.

Do not change Supabase schema or RLS for this pass.

Do not commit, push, deploy, run migrations, or change Vercel env. This should be a local implementation with handoff only unless Stebbi explicitly approves more.

## Tests to add or update

Add focused unit tests for the new helper:

1. Includes a point near the middle of a polyline segment even if it is not near a sampled vertex.
2. Excludes a point beyond `maxDistanceM`.
3. Sorts matches by `distanceFromOriginM`.
4. Deduplicates duplicate provider IDs.
5. Handles empty polyline safely.
6. Handles null/missing provider coordinates safely.

Add/adjust Veðurstofan tests:

1. Route that passes near a registry station includes that station.
2. Route that is far from a station excludes it.
3. A station can be included even when it would not be nearest to a sampled MET/Yr point.
4. The resulting layer point preserves `distanceM`, `distanceFromOriginM`, and `routeFraction`.

If full route API tests are heavy, keep most coverage in pure helper tests and add one integration-style test around the station ID selection function.

## Suggested file changes

Likely changed:

- `lib/weather/providerRouteMatching.ts` new
- `lib/__tests__/providerRouteMatching.test.ts` new
- `app/api/teskeid/weather/travel/route.ts`
- Possibly `lib/weather/providers/vedurstofanStations.ts` if old nearest-sampled-point helpers become unused or need to remain only for legacy tests.
- Possibly `lib/__tests__/weather-travel-api.test.ts` or a smaller provider matching test.

Likely unchanged:

- `sampleRouteWeatherPoints()` and MET/Yr route assessment logic.
- Supabase migrations.
- Feature flags.
- Chat/Púls.

## Risks / things Claude Code should watch

1. **Too many station IDs**  
   Moving from sampled-nearest stations to all registry points within radius may increase the number of Veðurstofan stations on some long routes. That is probably correct, but the product-table read should remain bounded. If a cap is needed, cap after route-order sorting and document it.

2. **Missing coordinates**  
   `VEDURSTOFAN_STATIONS_REGISTRY` includes `missing-coordinates`. Those must be ignored safely.

3. **Source-provided coordinates are not manually verified**  
   The registry notes that coordinates are source-provided and not manually verified. Keep the station distance visible in UI and do not claim perfect precision.

4. **Endpoint timeout budget**  
   The Veðurstofan layer has `VEDURSTOFAN_LAYER_BUDGET_MS = 1500`. More stations can increase read/work. Keep the timeout/fail-open behavior.

5. **Do not regress route order**  
   UI sections and Safnpúls depend on `routeFraction` / `distanceFromOriginM` order. Verify ordering after the refactor.

6. **Do not blend providers by accident**  
   The refactor is about deciding which provider points belong on the route. It should not change MET/Yr weather calculations or combine values differently.

## Localhost checks for Stebbi

After Claude Code implements this locally:

1. Open `/vedrid`.
2. Test a short route such as Reykjavík -> Stóra-Borg or Reykjavík -> Selfoss with Veðurstofan visible.
3. Confirm the Veðurstofan station count and station cards still appear and are ordered along the route.
4. Confirm each station card still shows `Spápunktur um X m/km frá veginum`.
5. Test a longer route where station selection previously looked sparse or odd.
6. Confirm public and authenticated behavior does not change except for which Veðurstofan stations are included.
7. Confirm MET/Yr point count and route weather assessment still behave as before.
8. Confirm Safnpúls route summary still follows route order.

No production, SQL, RLS, Vercel env, deploy, or migration testing should be involved in this pass.

## Questions for Codex review after Claude Code implementation

1. Did Claude Code keep MET/Yr sampling untouched?
2. Is the new provider matching helper genuinely provider-neutral enough for Vegagerðin?
3. Is the Veðurstofan radius too strict or too generous?
4. Are long routes bounded without silently hiding important stations?
5. Are tests proving the exact bug this refactor is meant to prevent: provider points near the real polyline but missed by sampled MET/Yr points?
