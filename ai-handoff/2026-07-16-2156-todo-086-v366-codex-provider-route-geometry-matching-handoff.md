# TODO 086 v366 - Match provider points to the selected route geometry

Created: 2026-07-16 21:56
Timezone: Atlantic/Reykjavik
Author: Codex

Related context:
- `2026-07-16-2051-todo-086-v358-codex-provider-route-matching-handoff.md`
- `2026-07-16-2112-todo-086-v359-codex-v358-release-review.md`
- Current route code inspected on 2026-07-16 before writing this handoff.

## Workflow framing for Claude Code

If Stebbi sends this with `Workflow`, Claude Code may:

1. Review this critically first, devil's advocate style.
2. Stop and write a handoff/review if there are blocking questions or a safer simpler path.
3. If the scope is clear, implement only the scoped local code/test changes below.
4. After implementation, write a new handoff immediately.

This does not permit commit, push, deploy, Vercel changes, SQL execution, migration execution, production work, or env/secrets changes.

## Goal

Fix how Veðurstofan stations are selected for a chosen travel route, and create the reusable spatial foundation that Vegagerðin can use next.

The core rule:

> Fixed provider points, such as Veðurstofan stations and future Vegagerðin live points, must be matched directly against the selected route geometry/polyline.

They must not be selected indirectly through sampled MET/Yr route forecast points.

MET/Yr sampling stays unchanged. MET/Yr is a forecast-grid provider and `sampleRouteWeatherPoints()` is still the right tool for the met.no forecast calculations.

## Current confirmed problem

In `app/api/teskeid/weather/travel/route.ts`:

- Route geometry is sampled into `weatherPoints` with `sampleRouteWeatherPoints(allPts, cumDist)`.
- Veðurstofan station IDs are then selected with:

```ts
const vedurstofanStationIds = layerEnabled ? getUniqueStationIdsForRoute(weatherPoints) : []
```

- `getUniqueStationIdsForRoute()` in `lib/weather/providers/vedurstofanStations.ts` maps each sampled MET/Yr route point to the nearest curated Veðurstofan station and omits only `unavailable` mappings.
- Only after those station IDs are chosen does `route.ts` project each station to the full route geometry with `projectToPolyline(...)`.

So the projection math is already mostly present, but it is used too late. A station can be close to the real road/route and still never be selected if no sampled MET/Yr point maps to it.

This is especially wrong as a foundation for Vegagerðin, where the provider points are road-condition/current-state locations and must be tied to actual route proximity.

## Product model

For non-MET providers:

1. Take the selected route's `routeGeometry.points`.
2. Take all provider points that have valid coordinates.
3. Project each provider point to the nearest route segment.
4. Include points within the provider-specific route radius.
5. Return route-order metadata that every UI surface can share.

For Veðurstofan now:

- Use all coordinate-bearing entries from `VEDURSTOFAN_STATIONS_REGISTRY`, not only `VEDURSTOFAN_STATIONS`.
- Do not select station IDs from `weatherPoints`.
- Keep one Veðurstofan point per station.

For Vegagerðin later:

- Reuse the same helper with Vegagerðin's point list and provider-specific radius/config.
- Do not introduce a second spatial model for Vegagerðin unless there is a documented road-section reason.

## Implementation plan

### 1. Extract a provider-neutral route matcher

Create a pure helper, suggested location:

`lib/weather/providerRouteMatching.ts`

Suggested API:

```ts
export type ProviderRoutePoint = {
  id: string
  name?: string | null
  lat: number | null
  lon: number | null
}

export type ProviderRouteMatch<T extends ProviderRoutePoint> = {
  point: T
  distanceM: number
  distanceFromOriginM: number
  routeFraction: number
  nearestRoutePoint: { lat: number; lon: number }
}

export function matchProviderPointsToRoute<T extends ProviderRoutePoint>(input: {
  points: readonly T[]
  routePolyline: ReadonlyArray<{ lat: number; lon: number }>
  maxDistanceM: number
  maxPoints?: number
}): ProviderRouteMatch<T>[]
```

Rules:

- Ignore provider points with missing/null/invalid coordinates.
- Project each point to the nearest segment of the full polyline, not just nearest vertex.
- Include only points where `distanceM <= maxDistanceM`.
- Deduplicate by `point.id`.
- Sort by `distanceFromOriginM`, then by id for stable output.
- If `maxPoints` is used, cap only after sorting and document the cap. Prefer no cap for this first Veðurstofan pass unless tests or performance show it is needed.
- Empty or single-point polylines must behave safely and not throw.

Move/share projection logic from `app/api/teskeid/weather/travel/route.ts`:

- `pointToSegmentM`
- `projectToPolyline`
- `haversineM`

Avoid leaving duplicate route projection implementations in route handlers.

### 2. Use the matcher for Veðurstofan station selection

In `app/api/teskeid/weather/travel/route.ts`, replace the sampled-point station selection:

```ts
getUniqueStationIdsForRoute(weatherPoints)
```

with route-geometry matching:

1. Build provider candidates from `VEDURSTOFAN_STATIONS_REGISTRY`.
2. Only include rows with non-null `stationId`, `lat`, and `lon`.
3. Run `matchProviderPointsToRoute(...)` with `routeGeometry.points`.
4. Use the matched station IDs for `readVedurstofanProductForStations(...)`.
5. Keep a `Map<stationId, match>` and use it when building `vedurstofanLayer.points`.
6. `distanceM`, `distanceFromOriginM`, and `routeFraction` should come from the shared matcher.

Recommended first radius:

```ts
const VEDURSTOFAN_ROUTE_MAX_DISTANCE_M = 15_000
```

Reasoning:

- 15 km matches the existing `OK_MAX_M` mental model in `vedurstofanStations.ts`.
- It avoids the old 50 km `weak` inclusion, which is too broad when matching directly to the real route.
- It is generous enough for route-adjacent weather stations while still making the UI honest.

If Claude Code believes 10 km or another radius is safer, stop and explain the product tradeoff instead of silently changing it.

### 3. Retire old sampled-station route path from the travel API

Do not delete `mapRoutePointToVedurstofanStation()` or `getUniqueStationIdsForRoute()` unless all tests/usages are cleaned up. They may remain for legacy tests or standalone mapping. But the travel route API should no longer use them for the Veðurstofan layer.

The key acceptance point is:

> The selected Veðurstofan stations on `/vedrid` must no longer depend on the number, position, or deduping of sampled MET/Yr points.

### 4. Keep downstream UI surfaces on the same data

The existing shared card work should remain intact. This task should only change which Veðurstofan stations are in `vedurstofanLayer.points` and their route metadata.

The following surfaces must all consume the same `vedurstofanLayer.points` ordering/metadata:

- map provider overlay points
- worst Veðurstofan card
- selected Veðurstofan card
- "Allir spápunktar" / station list
- route-level Safnpúls ordering
- station-level Veðurpúls links/returnTo context

Do not create separate ordering or station-selection logic in the client.

### 5. Do not touch MET/Yr calculation

Leave these unchanged except for import cleanup if needed:

- `sampleRouteWeatherPoints()`
- met.no forecast fetch count
- baseline route weather assessment
- map/filter status logic for MET/Yr points
- route cautions / curated route rules

This pass is only provider point route matching.

## Tests to add or update

### Pure helper tests

Add tests for `matchProviderPointsToRoute()`:

1. Includes a point near the middle of a segment even when it is far from route vertices.
2. Excludes a point outside `maxDistanceM`.
3. Sorts included points by route order.
4. Deduplicates duplicate ids deterministically.
5. Handles null/missing/invalid coordinates safely.
6. Handles empty polyline and single-point polyline safely.
7. Produces a sensible `routeFraction` and `distanceFromOriginM`.

### Travel API / Veðurstofan tests

Update existing mocks in `lib/__tests__/weather-travel-api.test.ts` or add a smaller integration-style test:

1. A station close to `routeGeometry.points` is selected even if it is not represented by `sampleRouteWeatherPoints()`.
2. `readVedurstofanProductForStations(...)` receives IDs from route-geometry matching, not from `getUniqueStationIdsForRoute(weatherPoints)`.
3. A station outside the radius is excluded.
4. `vedurstofanLayer.points[0]` preserves `distanceM`, `distanceFromOriginM`, and `routeFraction`.
5. MET/Yr route sampling still runs and baseline weather output remains present.

If mocking the full registry is awkward, expose a small internal helper for:

```ts
selectVedurstofanStationsForRoute(routeGeometry.points, registryEntries)
```

and test that helper directly. Keep it pure.

## Suggested file changes

Likely:

- `lib/weather/providerRouteMatching.ts` new
- `lib/__tests__/providerRouteMatching.test.ts` new
- `app/api/teskeid/weather/travel/route.ts`
- `lib/__tests__/weather-travel-api.test.ts`
- possibly `lib/weather/providers/vedurstofanStations.ts` only for import cleanup/comments

Likely not:

- SQL migrations
- Supabase RLS/policies/grants
- Vercel env
- public/auth access model
- Veðurpúls SQL/schema
- Vegagerðin data import
- deployment files

## Risks Claude Code should watch

### Station count/performance

Using all 280 registry entries within 15 km of the full route may increase station counts on long routes. That is probably more correct, but keep the product-table read bounded by existing timeout behavior and watch tests/local output.

If a hard cap becomes necessary, it must be explicit and route-order based. Do not silently drop stations with unreadable logic.

### Route geometry precision

Distance-to-polyline is only as good as `routeGeometry.points`. If Google returns coarse overview points for some routes, distances can be approximate. This is still a better model than sampling MET/Yr points, but the code should not overclaim precision.

### Duplicate projection implementations

There is already projection logic in the travel route handler. Moving it to a helper reduces drift. Avoid copying it into multiple provider-specific modules.

### Radius semantics

The old 50 km "weak" confidence should not become the new direct route inclusion radius. It was a fallback for sampled points, not a product promise that a station 50 km from the road belongs to the route.

### Future Vegagerðin

Do not implement Vegagerðin in this pass. The correct success condition is that Vegagerðin can later call the same matcher with its own points/config.

## Acceptance criteria

- Veðurstofan station selection on `/vedrid` is based on direct distance to `routeGeometry.points`.
- `getUniqueStationIdsForRoute(weatherPoints)` is no longer used by the travel API to decide Veðurstofan station IDs.
- MET/Yr weather point count and route calculations remain unchanged.
- Veðurstofan points are sorted by route order and use shared route metadata.
- The same ordered station set feeds map markers, worst/selected/all cards, and route Safnpúls.
- No SQL/env/deploy/production changes are made.
- Tests cover the specific failure mode: provider point near the actual polyline but missed by sampled MET/Yr points.

## Commands Claude Code should run locally

Minimum:

```bash
npm run type-check
npm run test:run -- lib/__tests__/providerRouteMatching.test.ts lib/__tests__/weather-travel-api.test.ts
```

If related imports/tests change:

```bash
npm run test:run -- lib/__tests__/weather-route-sampling.test.ts lib/__tests__/weather-google.test.ts
```

Do not start/restart the dev server unless Stebbi explicitly asks.

## Localhost checks for Stebbi

After Claude Code implements and hands off:

1. Open `/vedrid`.
2. Use a short route such as Reykjavík -> Selfoss or Reykjavík -> Stóra-Borg with Veðurstofan visible.
3. Confirm Veðurstofan station cards are still visible, ordered along the road, and show sane "frá veginum" distances.
4. Confirm the map markers match the station cards.
5. Confirm worst/selected/all Veðurstofan cards are using the same station set and labels.
6. Confirm route-level Safnpúls follows the same station order.
7. Test a longer route, for example Reykjavík -> Ísafjörður or Höfn -> Egilsstaðir, and watch for obviously missing/duplicated stations.
8. Toggle met.no only and confirm baseline behavior is unchanged.
9. Toggle Veðurstofan only and confirm the station set no longer looks tied to met.no point count.

No SQL, RLS, Vercel env, deploy, production data, or migration testing belongs to this pass.

## Questions for Codex review after implementation

1. Did Claude Code keep MET/Yr sampling untouched?
2. Is the matcher genuinely provider-neutral enough for Vegagerðin?
3. Did the travel API stop using sampled MET/Yr points for Veðurstofan station selection?
4. Is the chosen route radius explicit and product-sensible?
5. Are station ordering and distance fields shared across all UI surfaces?
6. Do tests prove the original bug, not just happy-path inclusion?

## Óvissa / þarf að staðfesta

- Exact radius may need product tuning after localhost tests. Codex recommends 15 km as the first implementation value.
- The precision of `routeGeometry.points` depends on Google route geometry detail. If distances look odd, the next investigation should be whether Google is returning a coarse overview polyline for that route.
