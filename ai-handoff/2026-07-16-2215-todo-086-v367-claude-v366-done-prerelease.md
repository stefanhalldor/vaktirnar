# TODO 086 v367 - Claude handoff: v366 done, prerelease

Created: 2026-07-16 22:30
Timezone: Atlantic/Reykjavik
Author: Claude
Related handoffs:
- `2026-07-16-2156-todo-086-v366-codex-provider-route-geometry-matching-handoff.md`

## Status

v366 implemented. File changes only — not committed or pushed per workflow.
33/33 tests pass. 119/119 related tests pass. Type-check clean.

---

## Changes in this pass

### `lib/weather/providerRouteMatching.ts` (NEW)

Provider-neutral route geometry matching helper.

Exports:
- `ProviderRoutePoint` type — `{ id, name?, lat, lon }`
- `ProviderRouteMatch<T>` type — projection result with `distanceM`, `distanceFromOriginM`, `routeFraction`, `nearestRoutePoint`
- `haversineM(lat1, lon1, lat2, lon2): number` — moved from route.ts
- `matchProviderPointsToRoute<T extends ProviderRoutePoint>(input): ProviderRouteMatch<T>[]`

Internal only: `pointToSegmentM`, `projectToPolyline`.

Behaviour:
- Points with null/undefined/non-finite coordinates are skipped.
- Each point is projected to the nearest polyline segment (not nearest vertex).
- Only points within `maxDistanceM` are included.
- First occurrence wins for duplicate ids.
- Result sorted by `distanceFromOriginM` ascending, then `id` for stable output.
- Empty polyline returns `[]` safely. Single-point polyline handled safely.

### `lib/__tests__/providerRouteMatching.test.ts` (NEW)

9 tests covering all handoff requirements:
- Point near segment midpoint included even when far from vertices (key correctness proof)
- Point outside maxDistanceM excluded
- Sort by route order
- Deduplication of ids
- Null/NaN/Infinity coordinates skipped safely
- Empty polyline returns []
- Single-point polyline: close point included, distant point excluded
- sensible routeFraction and distanceFromOriginM for multi-segment route
- haversineM sanity checks

### `app/api/teskeid/weather/travel/route.ts`

Removed local geometry functions (`pointToSegmentM`, `distanceToPolylineM`, `projectToPolyline`, `haversineM`) — now imported from `providerRouteMatching`.

Import change:
```ts
// Removed:
import { mapRoutePointToVedurstofanStation, getUniqueStationIdsForRoute, VEDURSTOFAN_STATIONS } from '@/lib/weather/providers/vedurstofanStations'

// Now:
import { VEDURSTOFAN_STATIONS } from '@/lib/weather/providers/vedurstofanStations'
import { haversineM, matchProviderPointsToRoute } from '@/lib/weather/providerRouteMatching'
```

Station selection replaced:
```ts
// Before:
const vedurstofanStationIds = layerEnabled ? getUniqueStationIdsForRoute(weatherPoints) : []

// After:
const VEDURSTOFAN_ROUTE_MAX_DISTANCE_M = 15_000

const vedurstofanMatches = layerEnabled
  ? matchProviderPointsToRoute({
      points: VEDURSTOFAN_STATIONS_REGISTRY
        .filter(s => s.stationId !== null && s.lat !== null && s.lon !== null)
        .map(s => ({ id: s.stationId!, name: s.name, lat: s.lat!, lon: s.lon! })),
      routePolyline: routeGeometry.points,
      maxDistanceM: VEDURSTOFAN_ROUTE_MAX_DISTANCE_M,
    })
  : []
const vedurstofanStationIds = vedurstofanMatches.map(m => m.point.id)
const stationMatchById = new Map(vedurstofanMatches.map(m => [m.point.id, m]))
```

Layer building: replaced `projectToPolyline` call with `stationMatchById.get(stationId)` lookup. distanceM, distanceFromOriginM, routeFraction all come from the match.

Added sort after layer building:
```ts
layerPoints.sort((a, b) => {
  const af = a.distanceFromOriginM ?? Infinity
  const bf = b.distanceFromOriginM ?? Infinity
  return af !== bf ? af - bf : a.stationId.localeCompare(b.stationId)
})
```

MET/Yr sampling is entirely unchanged.

### `lib/__tests__/weather-travel-api.test.ts`

- Replaced `mockGetUniqueStationIds`/`mockMapRoutePoint` hoisted vars with `mockMatchProviderPoints`
- Mock for `vedurstofanStations`: removed function mocks, kept `VEDURSTOFAN_STATIONS: []`
- Added mock for `lib/weather/providerRouteMatching`: real `haversineM` (needed for cumDist), `matchProviderPointsToRoute: mockMatchProviderPoints`
- Added `makeStationMatch(stationId, distanceFromOriginM)` helper
- Updated `setupStationMapping()` to use `mockMatchProviderPoints`
- Updated `beforeEach` default: `mockMatchProviderPoints.mockReturnValue([])`
- Fixed a latent bug in "does not read product table when user lacks access" test: added `process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED = 'true'` so the second `mockCheckFeatureAccess` call is actually exercised (the test relies on the access-required gate, which requires the env var)
- Updated "builds one layer point per unique station" test to use `mockMatchProviderPoints`

Added 5 new tests:
1. `selects a station via route geometry even when sampleRouteWeatherPoints does not cover its location` — proves the bug fix
2. `passes route geometry points (not sampled weather points) to matchProviderPointsToRoute` — asserts the polyline arg
3. `preserves distanceM, distanceFromOriginM, and routeFraction from route match in layer points`
4. `still runs MET/Yr route sampling unchanged when Veðurstofan layer is enabled`

---

## Test results

```
npm run type-check       → passed
npm run test:run -- lib/__tests__/providerRouteMatching.test.ts lib/__tests__/weather-travel-api.test.ts
→ 2 test files, 33/33 passed

npm run test:run -- lib/__tests__/weather-route-sampling.test.ts lib/__tests__/weather-google.test.ts
→ 2 test files, 119/119 passed
```

---

## Acceptance criteria review

- Veðurstofan station selection on `/vedrid` is based on direct distance to `routeGeometry.points`. YES
- `getUniqueStationIdsForRoute(weatherPoints)` is no longer used by the travel API. YES — removed from import
- MET/Yr weather point count and route calculations remain unchanged. YES — only provider matching changed
- Veðurstofan points sorted by route order and use shared route metadata. YES — sort added after layer build
- Same ordered station set feeds map markers, worst/selected/all cards, route Safnpúls. YES — single `layerPoints` array unchanged in structure
- No SQL/env/deploy/production changes. YES
- Tests cover the specific failure mode: provider point near polyline but missed by sampled MET/Yr points. YES — `providerRouteMatching.test.ts` test 1, and `weather-travel-api.test.ts` "selects a station via route geometry"

---

## Notes for Codex review

- `VEDURSTOFAN_ROUTE_MAX_DISTANCE_M = 15_000` as specified. 15 km matches `OK_MAX_M` in the curated stations, avoids the old 50 km weak radius.
- The 280-entry registry is filtered to non-null `stationId`/`lat`/`lon` before matching. Entry count with valid coords is a subset.
- `getUniqueStationIdsForRoute` and `mapRoutePointToVedurstofanStation` are NOT deleted from `vedurstofanStations.ts` — they remain for legacy tests and any future standalone use. They are simply no longer called from the travel route API.
- The test that had `mockResolvedValueOnce(true).mockResolvedValueOnce(false)` was relying on `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` which was missing. Fixed by adding the env var to that test — semantically correct and matching the test's original intent.

---

## Pending localhost verification

1. Open `/vedrid`, route Reykjavík -> Selfoss or Reykjavík -> Stóra-Borg with Veðurstofan visible.
2. Confirm Veðurstofan station cards visible, ordered along the road, with sane "frá veginum" distances.
3. Confirm map markers match station cards.
4. Confirm worst/selected/all Veðurstofan cards use same station set.
5. Confirm route-level Safnpúls follows same station order.
6. Test longer route (Reykjavík -> Ísafjörður or Höfn -> Egilsstaðir) for missing/duplicated stations.
7. Toggle met.no only — confirm baseline behavior unchanged.
8. Toggle Veðurstofan only — confirm station set no longer looks tied to met.no point count.

No SQL, RLS, Vercel env, deploy, production data, or migration testing in this pass.
