# 2026-07-22 07:40 — TODO-086 v300 — Codex road-surface + loader first pass

## Context

Stebbi asked Codex to implement two things in the Road Intelligence prototype:

1. Use Vegagerðin road-surface data so routes that touch gravel can be detected, and offer an alternate non-gravel route when available.
2. Improve the “Reikna ferð” flow so the route sidebar closes, a full Teskeið loader appears, and the scrubber/loader explains that Veðurstofan forecasts are being fetched and hourly departure states are being built.

This was an execution-approved turn. No SQL was run, no deploy was done, no commit was made.

Important: `components/weather/RoadMapPrototypeMap.tsx` already had substantial uncommitted changes before this Codex pass. I did not revert those; this handoff describes the new Codex additions on top.

## Plan for this phase

- Add a typed helper for Vegagerðin `vegakerfi/yfirbord` layer 0 `Slitlag`.
- Add a gated same-origin API proxy for the surface query.
- Register the new data source in the open-data catalogue.
- In the Road Map prototype, fetch route options, check each route against surface data, and show route choices when gravel is detected.
- Close the route sidebar and show a full Teskeið loader during calculation.
- Add targeted tests for the surface helper.

## What was implemented

- Added `lib/road-intelligence/vegagerdinRoadSurface.ts`.
  - Targets `https://vegasja.vegagerdin.is/arcgis/rest/services/vegakerfi/yfirbord/MapServer/0/query`.
  - Uses field `GERD_SL`.
  - Maps `0` / `Möl` / `gravel` to `gravel`.
  - Maps `1` / `Bundið` / `paved` to `paved`.
  - Validates WGS84 bbox requests against an Iceland guard.
  - Normalizes provider GeoJSON with Teskeið-owned `teskeidRoadSurfaceType` and `teskeidRoadSurfaceLabel`.
  - Summarizes whether a route comes within 450 m of gravel features.

- Added `app/api/teskeid/road-intelligence/road-surface/route.ts`.
  - Same auth/feature-gate pattern as `road-segments`.
  - Requires `AUTH_MVP_ENABLED=true`, an authenticated user, and `road-intelligence-v1`.
  - Does not expose service-role data or new Supabase access.
  - Proxies only allowlisted Vegagerðin surface data by bbox.

- Updated `lib/iceland-routes/openDataSources.ts`.
  - Added `vegagerdin-road-surface`.
  - Notes document `GERD_SL`: `0 = Möl`, `1 = Bundið`.

- Updated `components/weather/RoadMapPrototypeMap.tsx`.
  - Route form now closes the sidebar on submit.
  - Full Teskeið loader appears while route calculation is running.
  - Loader text rotates through:
    - latest Veðurstofan forecast fetch
    - distance-to-station calculation
    - calculating “Núna” first
    - building hourly departure state
  - Route calculation now first asks `/api/teskeid/weather/travel/routes` for available route options.
  - Each returned route option is checked against the new road-surface proxy.
  - The selected route is then sent to `/api/teskeid/weather/travel` using `selectedRouteId`.
  - If gravel is found, a small route-choice panel appears above the bottom scrubber so the user can switch between route options.
  - Choosing another route reuses the resolved origin/destination and recalculates with the chosen `selectedRouteId`.

- Updated `messages/is.json` and `messages/en.json`.
  - Added loader, scrubber, and surface-route copy.

- Added `lib/__tests__/road-intelligence-road-surface.test.ts`.
  - Covers bbox parsing, query URL, content-type guard, `GERD_SL` classification, GeoJSON normalization, route-gravel summary, and bbox building.

## What this does for the user

When Stebbi enters a route in `/auth-mvp/vedrid/road-map-prototype` and clicks `Reikna`:

- The driving sidebar closes.
- A full Teskeið loader covers the map.
- The loader explains that Teskeið is fetching Veðurstofan data and calculating station timing/distance.
- The route opens on the map when calculation succeeds.
- If Vegagerðin surface data says the selected route touches gravel, the bottom strip offers route choices with `Möl`, `Bundið slitlag`, or `Slitlag óstaðfest`.
- Clicking another route recalculates the same weather route on that route option.

## Important limitation

This is **not yet the gold-standard gravel avoidance engine**.

What it does now:

- Uses Google route options already returned by the existing route provider.
- Checks those route polylines against Vegagerðin surface GeoJSON in the route bbox.
- Offers any available alternative route option if one appears to avoid gravel.

What it does **not** yet do:

- It does not compute a brand-new route over our own open road graph.
- It does not guarantee that “no gravel route” exists or is found if Google does not return it.
- It does not yet snap the route to exact Vegagerðin road-segment IDs.
- It does not yet use surface attributes as routing costs.

For Stebbi’s “gulltryggt að missa aldrei af neinni stöð / malarkafla” goal, the next real step is still the open road graph: build route graph nodes/edges from Vegagerðin/OSM-approved source, attach `GERD_SL`, and route with “avoid gravel” as a graph constraint or penalty.

## Nuance on “Núna first”

The UI now says and behaves as a “Núna-first” user flow, but the backend still returns the existing full travel response in one request. I did **not** implement progressive server streaming or a separate “now-only first, hourly forecast later” API split.

The existing old-style hourly logic is still reused through:

- `buildProviderSlotStatusOverrides`
- Veðurstofan station forecasts matched by ETA at each station
- Vegagerðin current values used for now/current observations

If Claude wants to make this truly progressive, split the route endpoint into:

1. `now` route result, fast return
2. async hourly candidate calculation, then update scrubber when ready

That should be a separate reviewed phase because it changes API shape and loading/error semantics.

## Files inspected

- `WORKFLOW.md`
- `Design.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/teskeid/TeskeidLoader.tsx`
- `app/api/teskeid/road-intelligence/road-segments/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `lib/road-intelligence/vegagerdinSegments.ts`
- `lib/road-intelligence/routeSlotStatuses.ts`
- `lib/weather/provider.types.ts`
- `lib/weather/providerRouteMatching.ts`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/README.md`

## Files changed

- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/road-intelligence/vegagerdinRoadSurface.ts` new
- `app/api/teskeid/road-intelligence/road-surface/route.ts` new
- `lib/iceland-routes/openDataSources.ts`
- `lib/__tests__/road-intelligence-road-surface.test.ts` new
- `messages/is.json`
- `messages/en.json`

Unrelated dirty file still present:

- `.obsidian/workspace.json` was dirty before this work and was not intentionally changed by Codex.

## Commands run

- `npm run test:run -- road-intelligence-road-surface`
  - Exit code: 0
  - Result: 1 test file passed, 12 tests passed.

- `npm run type-check`
  - Exit code: 0
  - Result: `tsc --noEmit` passed.

Other commands were read-only inspection commands: `Get-Content`, `rg`, `git status --short`, `git diff --stat`, `Get-Date`.

## Supabase / SQL / auth / RLS

- No SQL files were created.
- No SQL was run.
- No Supabase schema, RLS, grants, policies, or production data were changed.
- New API route is gated behind existing auth and `road-intelligence-v1`.
- It uses the current logged-in user from Supabase server client and `checkFeatureAccess`.
- It does not expose secrets.
- It fetches public Vegagerðin GeoJSON server-side and returns normalized GeoJSON only to feature-flagged authenticated users.

## Risks / review points for Claude

1. **High: true gravel avoidance is only first-pass.**
   The current implementation can detect gravel near returned route options, but cannot invent a paved route if the provider does not offer one. Claude should review whether this is acceptable for the immediate prototype or whether the UI copy should say “slitlag greint” more softly until the open graph exists.

2. **Medium: route-surface matching threshold.**
   `ROAD_SURFACE_ROUTE_MATCH_MAX_DISTANCE_M = 450`. This is intentionally forgiving for route polyline/provider mismatch, but can create false positives near parallel roads. Claude should tune this after localhost checks.

3. **Medium: route options endpoint cost.**
   The new submit flow calls `/travel/routes`, then one surface query per returned route, then `/travel`. Route count is capped to 6, but Claude should watch latency.

4. **Medium: “Núna first” is UI-first, not API-progressive.**
   If the requirement is strict progressive loading, do not ship that claim without a second API phase.

5. **Low: Icelandic declension is not implemented.**
   Loader says `{from} til {to}` using raw place names, not fallbeygð names.

6. **Low: uncommitted `RoadMapPrototypeMap.tsx` includes earlier changes.**
   Review only the intended Codex additions unless Claude has context for the prior diff.

## Suggested next implementation step

Move from first-pass route-surface detection to graph-backed Road Intelligence:

1. Add a read-only graph discovery endpoint or offline script that samples Vegagerðin road network + surface attributes.
2. Normalize road edges with:
   - geometry
   - road id / section id
   - surface type
   - road class
   - condition status when available
3. Add route solving with two modes:
   - fastest
   - avoid gravel
4. Use the same matched road-edge list for:
   - station matching
   - road condition matching
   - surface warnings
   - route labels

This is what gets us from “good prototype” to Stebbi’s desired “gulltryggt” routing.

## Localhost checks for Stebbi

Prereqs:

- Dev server is already running by Stebbi.
- Use an authenticated user with `road-intelligence-v1`.
- `.env.local` has `ROAD_INTELLIGENCE_V1_ENABLED=true` and the existing auth MVP env required by the prototype.

Open:

- `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Test 1 — loader and panel behavior:

1. Open the route sidebar.
2. Enter `Reykjavík` → `Akureyri`.
3. Click `Reikna`.
4. Expected:
   - sidebar closes immediately
   - full Teskeið loader appears
   - loader rotates through forecast/station-distance/hourly text
   - map opens route when ready
   - bottom scrubber exists

Test 2 — hourly forecast reuse:

1. After route calculation, use scrubber arrows/dots.
2. Expected:
   - route station colours/labels update by selected departure slot
   - “Núna” returns to current-state view
   - no MET/Yr route sample dots appear as primary route weather points

Test 3 — gravel route choice:

1. Try a route likely to include gravel or known alternative variants, e.g. westfjords/interior routes.
2. Expected:
   - if one of the provider routes touches `GERD_SL=0`, a small amber route-choice panel appears above the scrubber
   - route choices show `Möl`, `Bundið slitlag`, or `Slitlag óstaðfest`
   - clicking a non-selected route recalculates and refits the route

Test 4 — old/new regression:

1. Open normal `/auth-mvp/vedrid`.
2. Check overview “Núna” and Veðurstofan forecast slots.
3. Expected:
   - old page still renders
   - status pills still filter map markers
   - no public/non-flagged user sees the road map prototype

Do not casually test:

- Production deploy.
- SQL changes.
- Broad feature flag changes for other users.

None of those were part of this Codex change.
