# TODO-086 v329 - Codex Route Layer Render Fix

Created: 2026-07-22 16:59
Timezone: Atlantic/Reykjavik

## Context

Stebbi tested v328 diagnostics and the UI still did not change. The new logs narrowed the issue sharply:

- Server successfully built Vegagerdin route layer:
  - `matchCount: 30`
  - `layerPointCount: 30`
  - `availablePointCount: 23`
  - `noWindDataPointCount: 7`
  - `layerStatus: partial`
- Browser accepted the server layer:
  - `hasServerVegagerdinLayer: true`
  - `serverVegagerdinPointCount: 30`
- But the next client summary still showed:
  - `providers - vegagerdin: 0 stations {}`
  - `nowCounts: {}`

Conclusion: the bug was no longer API data, feature access, or server matching. The failure was inside client-side rendering/counting.

## Root Cause Found

`renderVegagerdinStations()` and `renderVedurstofanStations()` returned `{ count: 0, statusCounts: {} }` immediately when `map.isStyleLoaded()` was false.

In MapLibre, `isStyleLoaded()` can be false while tiles/source data are still loading even after the map style is usable enough for app-owned GeoJSON sources/layers. That means the route API could return a valid Vegagerdin layer, but client rendering would bail out before reading the layer points.

This matches the observed sequence:

1. Server layer exists with 30 points.
2. Client route API diagnostics see that layer.
3. Route station render returns 0.
4. UI shows no Now station counts or markers.

## What I Changed

1. Added `canUseMapStyle(map)`.
   - Uses `map.getStyle()` inside a try/catch instead of relying only on `map.isStyleLoaded()`.
   - This is better for route-owned overlays because we only need the style object to exist, not all raster/vector tiles to be fully idle.

2. Updated route layer visibility/front ordering to use `canUseMapStyle()`.
   - `bringWeatherLayersToFront()`
   - `updateRouteWeatherLayerVisibility()`

3. Updated `renderVegagerdinStations()`.
   - It now reads, normalizes, stores, and counts route points before checking whether the map style can be used for drawing.
   - If the map style is not ready, it returns the real count/status counts instead of zero.
   - Added richer diagnostic sample: first 5 station ids/names/coords/status/wind.

4. Added `normalizeVegagerdinRoutePointForRender()`.
   - Accepts numeric strings for lat/lon/wind fields defensively.
   - Normalizes unknown `windDisplayStatus` to `no_data`.
   - Prevents one runtime shape mismatch from zeroing the whole route layer.

5. Updated `renderVedurstofanStations()` similarly.
   - Forecast route layer now also computes counts before style readiness can block drawing.

6. Updated route endpoint labels to use `canUseMapStyle()`.
   - This helps the existing “Frá” and “Til” labels avoid the same style-loaded false negative.

## Files Changed

- [components/weather/RoadMapPrototypeMap.tsx](../components/weather/RoadMapPrototypeMap.tsx)

Current `git status --short` after this change shows only:

- `components/weather/RoadMapPrototypeMap.tsx`
- this new v329 handoff file

Unrelated dirty file left untouched:

- `.obsidian/workspace.json`

## Commands Run

- `npm run type-check`
  - Exit code: 0
- `npm run test:run -- road-intelligence providerRouteMatching routeControlPoints weather-travel-api`
  - Exit code: 0
  - 13 test files passed, 195 tests passed.
- `git diff --check`
  - Exit code: 0
  - Only CRLF warnings.

## Expected Result

On the same route where v328 showed:

- `hasServerVegagerdinLayer: true`
- `serverVegagerdinPointCount: 30`
- then `providers - vegagerdin: 0 stations`

v329 should instead show:

- `vegagerdin render input` with `rawPointCount: 30`, `validPointCount: 30`
- `providers - vegagerdin: 30 stations ...`
- `nowCounts` populated
- “Núna” selected with real pill counts
- Vegagerdin station markers/labels visible in Now mode

## If It Still Fails

Collect these browser console logs:

- `[RoadMap][diagnostic] route api provider layers`
- `[RoadMap][diagnostic] vegagerdin render input`
- `[RoadMap][diagnostic] vegagerdin render deferred`
- `[RoadMap] providers - vegagerdin: ...`
- `[RoadMap] route success - initial candidates ... nowCounts ...`

Interpretation:

- If `rawPointCount: 30` and `validPointCount: 30` but `providers` still says 0, there is another call clearing/re-rendering the layer after the good render.
- If `rawPointCount: 30` and `validPointCount: 0`, then the response shape is still not compatible with runtime point normalization.
- If `validPointCount: 30` and `canUseMapStyle: false`, counts should now still be correct, but drawing may be deferred. Then the next fix is to queue a one-time render on `styledata`/`idle`.
- If `providers - vegagerdin` becomes 30 but no dots are visible, the issue is map layer visibility/filter/styling, not data/counting.

## Route Intelligence Check

- Route scope: Road Intelligence prototype route mode, especially Reykjavik to Isafjordur where server found 30 Vegagerdin matches.
- Provider-neutrality: this fix is about MapLibre route-layer lifecycle and applies to both Vegagerdin Now and Vedurstofan forecast route layers.
- IcelandRoadmap impact: no new route data, control points, segments, or station matching rules were added.
- Privacy: no new storage, no SQL, no user IDs, no raw addresses, no place IDs, no route persistence changes.

## Localhost Checks For Stebbi

1. Keep the existing dev server running.
2. Hard refresh `/auth-mvp/vedrid/road-map-prototype`.
3. Recalculate `Reykjavik -> Isafjordur`.
4. Expected:
   - “Núna” is active.
   - Vegagerdin route station count is nonzero.
   - Pill counts match visible route stations.
   - Dots and wind labels appear on the selected route in Now mode.
5. Open console and confirm:
   - `vegagerdin render input` has nonzero `validPointCount`.
   - `providers - vegagerdin:` is nonzero.
6. Switch between the two route options.
   - The selected route should update counts/markers without falling back to 0.
7. Try `Akureyri -> Egilsstadir`.
   - Same expectation: Now route stations should be counted and shown if the API layer has points.

No Supabase, migration, deploy, push, commit, production data, auth, billing, or secrets changes were made or should be tested casually here.

## Suggested Next Step For Claude Code

If v329 fixes the count and dots, Claude Code should remove or gate the extra diagnostics before release, or keep them behind the existing dev/debug condition only.

Then resume the remaining product issues:

1. Ensure route station wind labels stay anchored well while zooming.
2. Improve label collision between wind value and station name.
3. Keep Now-first UX and route switching smooth.
4. Revisit departure forecast opt-in after Now mode is stable.
