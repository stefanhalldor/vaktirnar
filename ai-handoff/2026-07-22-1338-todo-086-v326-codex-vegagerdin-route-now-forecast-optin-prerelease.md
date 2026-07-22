# 2026-07-22 13:38 - TODO 086 v326 Codex prerelease handoff

## Context

Stebbi tested v324 and confirmed the map no longer froze, but two core issues remained:

- No Vegagerðin route stations were visible in the `Núna` route view, neither on first load nor after manually clicking `Núna`.
- Clicking the departure/forecast opt-in showed “Núna-staðan er tilbúin, en brottfararspáin er ekki tiltæk...” instead of doing useful work.

Stebbi explicitly gave implementation permission.

## Plan

1. Make Vegagerðin route station matching more robust so the route view does not end up empty when the strict 2.5 km corridor finds nothing.
2. Apply the same Vegagerðin matching fallback both client-side and server-side.
3. Make the departure forecast opt-in compute slots from the current route when the stored context is missing, instead of immediately showing unavailable.
4. Include Vegagerðin Now status counts as the floor for forecast slot computation, so opt-in can still produce a meaningful scrubber even when Veðurstofan route stations are absent.
5. Update the relevant API test mock so the existing `vegagerdinLayer` test still covers the route API.

## What Changed

### `components/weather/RoadMapPrototypeMap.tsx`

- Added `VEGAGERDIN_ROUTE_FALLBACK_MAX_DISTANCE_M = 12_000`.
- Added `VEGAGERDIN_ROUTE_FALLBACK_MAX_POINTS = 40`.
- Added `matchVegagerdinPointsToRoute()`:
  - First tries the normal Vegagerðin route buffer (`2.5 km`).
  - If that returns no matches, retries with a wider `12 km` corridor and caps to 40 stations.
- `buildClientVegagerdinRouteLayer()` now uses this robust matcher.
- `RouteForecastBuildContext` now stores:
  - `vegagerdinStatusCounts`
  - `vegagerdinStationCount`
- Added `buildSyntheticRouteTimelineCandidates()` so the departure opt-in can synthesize a usable 24h-ish timeline from the current route if the original result did not provide enough timeline candidates.
- `handleRouteDepartureForecastOptIn()` now:
  - Builds a context from `routeBridgeSummary` when `routeForecastBuildContextRef` is missing.
  - Does not require Veðurstofan route stations if Vegagerðin route stations exist.
  - Passes Vegagerðin Now counts into `buildProviderSlotStatusOverrides()`.

### `app/api/teskeid/weather/travel/route.ts`

- Added the same `matchVegagerdinPointsToRoute()` helper server-side.
- Server `vegagerdinLayer` now also gets the strict-then-wide fallback matching behavior.
- This means the API itself has a better chance of returning `vegagerdinLayer.points`, not only the client fallback.

### `lib/__tests__/weather-travel-api.test.ts`

- Updated the provider route matching mock to include `VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M`.
- This keeps the existing API test for `vegagerdinLayer` meaningful after the server helper started using that imported constant.

## Files Changed

- `components/weather/RoadMapPrototypeMap.tsx`
- `app/api/teskeid/weather/travel/route.ts`
- `lib/__tests__/weather-travel-api.test.ts`

No SQL changes. No env changes. No production state changes.

Note: `messages/is.json`, `messages/en.json`, `components/weather/DepartureHeatmap.tsx`, and older handoff files were already dirty from earlier work in this thread. This pass did not add new message keys.

## Commands Run

- `npm run type-check`
  - Exit code: `0`
- `npm run test:run -- road-intelligence`
  - Exit code: `0`
  - Result: `10` files, `126` tests passed
- `npm run test:run -- providerRouteMatching routeControlPoints`
  - Exit code: `0`
  - Result: `2` files, `44` tests passed
- `npm run test:run -- road-intelligence providerRouteMatching routeControlPoints weather-travel-api`
  - Exit code: `0`
  - Result: `13` files, `195` tests passed
- `git diff --check`
  - Exit code: `0`
  - Only CRLF warnings for dirty files.

An intermediate run of `npm run test:run -- providerRouteMatching routeControlPoints weather-travel-api` failed before the test mock was updated. After adding `VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M` to the mock, the full targeted test set passed.

## Decisions

- I used a strict-then-wide matching fallback rather than making the default Vegagerðin buffer huge.
- The 12 km fallback only runs when the strict match returns zero, so normal good routes still use the tighter rule.
- I capped fallback matches to 40 to avoid exploding the route layer if a long route crosses a dense area.
- I did not re-enable automatic surface/pavement hydration. That remains intentionally deferred to the native road graph path.
- I allowed forecast opt-in to use Vegagerðin current observations as a constant floor, matching the existing helper design in `routeSlotStatuses.ts`.

## Remaining Risk

- The 12 km fallback can include stations on nearby but not identical roads. This is an intentional temporary tradeoff to avoid empty Now routes while we move toward our own road graph.
- The real fix is still to route and match stations against our own graph/road-segment topology instead of relying on distance to a polyline.
- If Vegagerðin route stations still do not appear, inspect the console line:
  - `[RoadMap] providers — vegagerdin: X stations`
  - If `X = 0`, then the station dataset fetch or route geometry is still failing.
  - If `X > 0` but nothing appears, then this is a layer visibility/rendering issue.
- If forecast opt-in still shows unavailable, inspect whether `routeNowStatusCounts` has any counts and whether `vedurstofanLayerRef.current` has points.

## Suggested Next Step

If localhost now shows Vegagerðin stations:

1. Tighten fallback matching gradually:
   - Prefer station-to-road-segment matching from our road graph.
   - Use station road number/name metadata if available.
   - Avoid false positives around parallel roads.
2. Move the route engine off Google:
   - Build graph from open road data.
   - Attach road attributes like surface, class, closures, road number.
   - Compute route candidates natively.
   - Match stations by graph adjacency or road segment distance, not arbitrary radius.

If localhost still does not show stations:

1. Add temporary debug counts in UI or console for:
   - fallback station marker count
   - strict match count
   - wide match count
   - rendered `validPoints.length`
2. Do not keep guessing in the UI layer; the next issue will be observable from those four numbers.

## Localhost Checks For Stebbi

Open:

- `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Required state:

- Logged in as a user with `road-intelligence-v1`.
- `.env.local` has `ROAD_INTELLIGENCE_V1_ENABLED=true`.
- Dev server already running on your side.

Check 1: Vegagerðin Now route stations

1. Try `Akureyri` -> `Egilsstaðir`.
2. Click `Reikna`.
3. Expected:
   - Map opens in `Núna`.
   - Vegagerðin route stations should appear.
   - The status pills should count the same route stations that are visible.
4. Also try `Ísafjörður` -> `Reykjavík`.
5. Expected:
   - It should not show 80 old forecast points as the route-station count for Now.
   - If there are no stations visible, copy the console line starting with `[RoadMap] providers`.

Check 2: Departure opt-in

1. After route calculation, click the `Ef lagt er af stað kl.` / departure-times control.
2. Expected:
   - It should enter a loading/calculating state.
   - It should produce forecast slots instead of immediately showing the unavailable message.
   - If only Vegagerðin Now data is present, slots may have the same floor status. That is acceptable for this interim step.

Check 3: Regression

1. Wait until `Leita að fleiri leiðum` finishes.
2. Pan/zoom the map.
3. Expected:
   - The map should remain responsive.
   - Route switching should not trigger full Teskeið-loader loops between already found routes.

Do not run SQL, deploy, or change production env vars from this handoff.
