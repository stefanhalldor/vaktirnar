# 2026-07-22 13:12 - TODO 086 v324 Codex prerelease handoff

## Context

Stebbi reported that the Road Intelligence prototype still had three painful issues after the latest local tests:

- The map opened without `Núna` being selected.
- No Vegagerðin route weather stations were visible in the Now view, likely because the UI was still effectively in forecast/Veðurstofan mode or because the overview Vegagerðin endpoint was unavailable to the flagged Road Intelligence flow.
- The map froze after `Leita að fleiri leiðum` disappeared, likely while checking whether alternate Google route choices were paved.

Stebbi also raised the bigger product direction: stop fighting Google Routes API long-term and move the surface/route intelligence work into our own road graph.

## Plan

1. Make the route map treat `Núna` as the selected slot whenever a route exists, even if no forecast candidate list has been built yet.
2. Keep the Now route layer based on Vegagerðin current observations by falling back to the Road Intelligence `station-markers` endpoint when `/api/teskeid/weather/vegagerdin/current` is unavailable or feature-gated.
3. Stop automatic per-route surface summary hydration after alternate routes load, because the current `summarizeRouteRoadSurface()` path is too CPU-heavy for the main thread and causes the map to freeze.
4. Keep the surface/alternate-route UI honest by changing its copy to say surface checks continue in the new road graph.

## What Changed

### `components/weather/RoadMapPrototypeMap.tsx`

- Added a Road Intelligence station marker GeoJSON fallback parser.
- Changed `fetchVegagerdinCurrentForRoute()` so it no longer gives up immediately when the old overview Vegagerðin endpoint is restricted.
- Added fallback fetch from `/api/teskeid/road-intelligence/station-markers`, converting marker GeoJSON into the same `VegagerdinCurrentStationDto` shape used by route matching.
- Forced route calculation success to set `selectedCandidateIdx` to `0`, so `Núna` is the active route state immediately after the route opens.
- Changed `effectiveSelectedCandidateIdx` so any existing route summary defaults to `0` when `selectedCandidateIdx` is null.
- Stopped calling `scheduleRouteSurfaceChoiceSummaries()` automatically after alternate route choices load.
- Left `scheduleRouteSurfaceChoiceSummaries()` in place for now, but it is no longer invoked by the automatic route-choice flow.
- Updated alternate-route surface intro logic so routes can be shown without claiming they have already been checked for gravel/pavement.

### `messages/is.json`

- Added:
  - `roadMapPrototypeSurfaceRouteChoicesFound`: “Fleiri leiðir fundust. Slitlagsgreining verður tekin áfram í nýja vegagrunninum.”

### `messages/en.json`

- Added:
  - `roadMapPrototypeSurfaceRouteChoicesFound`: “More route options were found. Surface checks will continue in the new road graph.”

## Files Looked At

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

## Files Changed

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

No SQL files changed. No env files changed. No production state changed.

## Commands Run

- `npm run type-check`
  - Exit code: `0`
- `npm run test:run -- road-intelligence`
  - Exit code: `0`
  - Result: `10` test files passed, `126` tests passed
- `git diff --check`
  - Exit code: `0`
  - Only existing CRLF warnings were printed for dirty files.

I did not run `npm run build` in this pass. Previous build attempts in this thread reached compile/type validation and then hit unrelated page-data errors for `/contacts` and `/home`.

## Decisions

- I did not try to fix native road graph routing in this patch. That is the correct next strategic direction, but this was a hotfix-sized change to make the current prototype less broken immediately.
- I disabled automatic surface summary hydration instead of optimizing it in place. The current surface check is useful as a data experiment, but it is too heavy to run synchronously after route options load.
- I reused the Road Intelligence `station-markers` endpoint as the Vegagerðin fallback because it is already behind the same `road-intelligence-v1` gate and matches the prototype’s feature access model better than the old overview provider endpoint.

## Remaining Risk

- If Vegagerðin stations still do not appear in `Núna`, the next likely bug is no longer “wrong provider endpoint”; it is probably route matching radius/geometry mismatch in `matchProviderPointsToRoute()` or missing current station properties in `station-markers`.
- The route options still originate from the existing route flow. This patch only prevents the surface-analysis freeze; it does not replace Google route finding with our own graph.
- Surface/pavement intelligence is now explicitly deferred to the native road graph phase. That is the right place to make it robust.

## Claude Review Questions

1. Does the `station-markers` endpoint always return `stationId`, `stationName`, `meanWindMs`, coordinates, and `measuredAtIso` for Vegagerðin current stations?
2. Should `fetchRoadIntelligenceVegagerdinStationsForRoute()` set `measurementFreshness` to a more specific value if the endpoint exposes freshness?
3. Can we remove `scheduleRouteSurfaceChoiceSummaries()` entirely in the next cleanup, or should it stay behind an explicit debug/dev action?
4. Please verify that `selectedCandidateIdx = 0` and `routeWeatherMode = now` are enough to keep the UI and map layer in `Núna` after alternate route choices arrive.

## Next Step Recommendation

Next implementation step should be the native road graph phase:

- Build or cache a normalized Vegagerðin/OpenStreetMap-based road graph.
- Route on that graph without Google Routes API.
- Store/use road attributes such as surface/pavement, closures, classes, and road numbers directly from the graph.
- Match Vegagerðin stations to the actual route corridor from our graph, not to an approximate Google polyline.
- Keep Google only as a temporary fallback until the graph path is reliable enough.

Short-term if local testing still fails:

1. Log/inspect how many Vegagerðin fallback stations come from `/api/teskeid/road-intelligence/station-markers`.
2. Log/inspect how many survive `matchProviderPointsToRoute()`.
3. If the fallback has stations but route match returns zero, tune the route station matching radius or use road-segment adjacency instead of pure geometric distance.

## Localhost Checks For Stebbi

Open:

- `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Required state:

- Logged in as a user with `road-intelligence-v1`.
- `.env.local` has `ROAD_INTELLIGENCE_V1_ENABLED=true`.
- Dev server already running on your side.

Check 1: `Núna` default

1. Enter a route like `Akureyri` -> `Egilsstaðir`.
2. Click `Reikna`.
3. Expected: the map opens with `Núna` visually selected.
4. Expected: counts below the map should be for the visible Now route stations, not the old 80 forecast points.

Check 2: Vegagerðin Now stations

1. Stay on the first opened route state, before clicking any forecast departure time.
2. Expected: Now route stations should be Vegagerðin current observations.
3. Expected: if the old Vegagerðin endpoint is gated, the prototype should still get stations through the Road Intelligence `station-markers` fallback.

Check 3: freeze after more routes

1. Wait until `Leita að fleiri leiðum` disappears.
2. Pan/zoom the map.
3. Expected: the map should remain responsive because automatic surface hydration is no longer running.
4. Expected: route choice text should say surface checks continue in the new road graph instead of implying completed pavement analysis.

Check 4: regression watch

1. Try `Ísafjörður` -> `Reykjavík`.
2. Expected: same `Núna` default behavior.
3. Expected: no long freeze after route options appear.
4. If stations are still missing, capture whether the route status pills show zero or nonzero counts. That tells us whether the next bug is station fetch or station matching.

Do not run SQL, change production env vars, or deploy from this handoff. This pass was code-only and local-verification-only.
