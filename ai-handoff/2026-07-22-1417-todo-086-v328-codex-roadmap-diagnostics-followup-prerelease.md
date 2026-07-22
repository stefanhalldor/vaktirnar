# TODO-086 v328 - Codex RoadMap Diagnostics Follow-Up

Created: 2026-07-22 14:17
Timezone: Atlantic/Reykjavik

## Context

Stebbi reported that the Road Intelligence prototype still shows no Vegagerdin route stations on the selected route. The browser console before this change showed:

- `providers - vegagerdin: 0 stations {} | vedurstofan: 0 | slotSource: fallback`
- `route success - initial candidates: 1 | selectedCandidateIdx: 0 | nowCounts: {}`

That means the route calculation itself returns 200, but the Now provider layer never gets usable Vegagerdin station points.

## Scope Approved

Stebbi explicitly gave Codex implementation permission to analyze again, add logs, improve follow-up diagnostics, and make the next focused fix.

This did not include commit, push, deploy, migration, SQL execution, Supabase production changes, or env/secrets changes.

## What I Changed

1. Added structured RoadMap API diagnostics in [route.ts](../app/api/teskeid/weather/travel/route.ts).
   - Logs whether Vegagerdin current/history data was available.
   - Logs measurement count, matchable station count, route polyline point count.
   - Logs strict vs wide station matching counts and nearest stations when matching fails.
   - Logs whether the Vegagerdin layer was built, disabled by feature access, unavailable, or failed by exception.

2. Added a safe `roadIntelligenceDebug` object to the travel API response in dev/debug mode.
   - Browser console can now show server-side counts without only relying on terminal logs.
   - Debug payload contains only counts/statuses, no secrets, raw addresses, user IDs, or private data.

3. Added matching diagnostics on the client side in [RoadMapPrototypeMap.tsx](../components/weather/RoadMapPrototypeMap.tsx).
   - Logs server provider layers from the route API response.
   - Logs fallback fetch status for `/api/teskeid/weather/vegagerdin/current`.
   - Logs station-marker fallback fetch/parsing counts.
   - Logs route match mode, nearest stations, and render input counts.

4. Made the departure forecast opt-in less dead-ended.
   - If provider slot overrides are unavailable, the UI now falls back to showing the already-built native route timeline instead of going straight to unavailable.
   - This is a fallback, not the final desired provider-first forecast calculation.

5. Updated [weather-travel-api.test.ts](../lib/__tests__/weather-travel-api.test.ts) mock for the newly imported `pointToPolylineDistanceM`.

## Files Changed

- [app/api/teskeid/weather/travel/route.ts](../app/api/teskeid/weather/travel/route.ts)
- [components/weather/RoadMapPrototypeMap.tsx](../components/weather/RoadMapPrototypeMap.tsx)
- [lib/__tests__/weather-travel-api.test.ts](../lib/__tests__/weather-travel-api.test.ts)

Unrelated dirty file left untouched:

- `.obsidian/workspace.json`

## Commands Run

- `Get-Content -Encoding UTF8 WORKFLOW.md`
  - Exit code: 0
- `git status --short`
  - Exit code: 0
  - Showed unrelated `.obsidian/workspace.json` plus RoadMap files.
- `npm run type-check`
  - Exit code: 0
- `npm run test:run -- road-intelligence providerRouteMatching routeControlPoints weather-travel-api`
  - Exit code: 0
  - 13 test files passed, 195 tests passed.
- `git diff --check`
  - Exit code: 0
  - Only CRLF warnings.

## What This Should Tell Us Next

On the next localhost route calculation, collect these logs.

From browser console:

- `[RoadMap][diagnostic] route api debug payload`
- `[RoadMap][diagnostic] route api provider layers`
- `[RoadMap][diagnostic] vegagerdin current fetch response`
- `[RoadMap][diagnostic] vegagerdin current payload`
- `[RoadMap][diagnostic] station-markers fallback fetch response`
- `[RoadMap][diagnostic] station-markers fallback payload`
- `[RoadMap][diagnostic] station-markers fallback parsed payload`
- `[RoadMap][diagnostic] vegagerdin client layer input`
- `[RoadMap][diagnostic] vegagerdin route match`
- `[RoadMap][diagnostic] vegagerdin render input`

From terminal:

- `[RoadMap API][diagnostic] vegagerdin current read`
- `[RoadMap API][diagnostic] vegagerdin match input`
- `[RoadMap API][diagnostic] vegagerdin route match`
- `[RoadMap API][diagnostic] vegagerdin layer built`
- or `[RoadMap API][diagnostic] vegagerdin layer not returned`
- or `[RoadMap API][diagnostic] vegagerdin unavailable for route layer`
- or `[RoadMap API][diagnostic] vegagerdin layer exception`

How to interpret:

- If `vegagerdin.layerEnabled` is `false`, the problem is feature/env access for the API layer.
- If `vegagerdin current read.status` is `unavailable`, the API cannot read current/history Vegagerdin data.
- If `measurementCount > 0` but `matchableCount = 0`, the provider data shape lacks usable station IDs/lat/lon.
- If `matchableCount > 0` but `routeMatchCount = 0`, route geometry and station matching are the problem. The `nearest` distances should tell whether 12 km is still too strict or whether the polyline is wrong.
- If server returns `layerReturned: true` but browser says `hasServerVegagerdinLayer: false`, then `isVegagerdinRouteLayer()` is rejecting the response shape.
- If server layer is absent but client fallback has parsed stations and nonzero route matches, then the client fallback should render stations. If it still does not, the issue is in layer creation/render/filter visibility.

## Route Intelligence Check

- Route scope: selected Iceland road routes in the Road Intelligence prototype, especially Reykjavik to Isafjordur and Akureyri to Egilsstadir style tests.
- Provider-neutrality: this is still provider-specific for Vegagerdin Now and Vedurstofan forecast. It does not change routing provider or production routing behavior.
- IcelandRoadmap impact: no canonical road segment/control-point data was added. This change is diagnostics and fallback behavior only.
- Privacy: debug output uses counts, statuses, route point counts, and public station IDs/names only. No user ID, raw address, Google place ID, or raw route payload is logged.

## Remaining Risk

The main bug may still be present after this patch. This change is deliberately diagnostic-heavy because prior attempts kept fixing around the symptom without proving where the station layer disappears.

Most likely remaining causes:

- API cannot read Vegagerdin current/history data in this context.
- Server builds no layer due feature/access logic.
- Client fallback endpoint returns zero or malformed station marker features.
- Response validator rejects the server Vegagerdin layer shape.
- Route matching is using a polyline that does not pass close enough to Vegagerdin stations.

## Localhost Checks For Stebbi

1. Keep the existing localhost dev server running. No agent started or restarted it.
2. Open `/auth-mvp/vedrid/road-map-prototype`.
3. Hard refresh once so the new client code is loaded.
4. Calculate `Reykjavik -> Isafjordur`.
5. Check whether Now opens selected and whether Vegagerdin route stations show.
6. Copy the browser console logs listed above, especially `route api debug payload`, `vegagerdin current payload`, `station-markers fallback parsed payload`, and `vegagerdin render input`.
7. Copy the matching terminal logs listed above, especially `vegagerdin current read`, `vegagerdin route match`, and `vegagerdin layer built/not returned/unavailable`.
8. Repeat once with `Akureyri -> Egilsstadir`.

Expected healthy state:

- `roadIntelligenceDebug.vegagerdin.layerPointCount` is greater than 0.
- Browser `providers - vegagerdin:` is greater than 0.
- `nowCounts` contains real status counts.
- The Now pill is active by default.
- Vegagerdin station dots/labels are visible on the route for Now.

No Supabase migration, production data change, auth change, deploy, push, or SQL execution is part of these checks.

## Suggested Next Step For Claude Code

Use the new diagnostics from Stebbi's next localhost test to choose the smallest true fix:

1. If API read is unavailable, fix Vegagerdin current/history availability or permissions.
2. If API layer is built but client rejects it, fix `isVegagerdinRouteLayer()`.
3. If fallback parses stations but no matches, inspect route polyline and matching threshold/control points.
4. If matches exist but render input is zero, fix client layer handoff/render visibility.

Do not add more UI guesses until the logs identify which of those four branches is failing.
