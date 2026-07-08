# TODO-067 v195 - Codex recommendation after v194 two-path handoff

Created: 2026-07-08 12:15
Timezone: Atlantic/Reykjavik
Author: Codex
Status: Recommendation/review. No app code changed.

## Recommendation

Codex would not treat v194 as two equal paths. Use this order:

1. Get one clean Place ID trace.
2. If Place ID routing finds the expected Route 39/Þrengslavegur route, implement saved-place `place_id` persistence next.
3. If Place ID routing still returns only Route 427/Krýsuvík, run a small `SHORTER_DISTANCE` provider experiment.
4. Only if both fail, consider a curated corridor/waypoint fallback for known route-fidelity failures.

This keeps the next step diagnostic instead of speculative.

## Why this order

The current failing tests are not yet testing Place ID routing. They are testing saved-place coordinate routing:

```txt
[PlaceSearch] selected (saved place)
[routes/routes] placeId in request body: { origin: 'absent', destination: 'absent' }
[weather/google] getRouteOptions diagnostics: { "originType": "latLng", "destType": "latLng" }
```

Google's current Routes API docs say waypoints can be represented by coordinates, Place IDs, or addresses, and the `Waypoint` object supports a `placeId` field. So Place ID routing is still the right first thing to prove.

Google's shorter-distance route feature is still marked Experimental/pre-GA. Google also says it optimizes for distance over speed/comfort and can use local roads, dirt roads, or parking lots when legal. That makes it useful as an experiment or possibly an extra route option, but not something to silently make the default for all users.

Sources checked:

- Google Routes `Waypoint`: https://developers.google.com/maps/documentation/routes/reference/rest/v2/Waypoint
- Google Routes shorter-distance routes: https://developers.google.com/maps/documentation/routes/shorter-distance-routes
- Google Routes `computeRoutes`: https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
- Google Maps JS `Place` / `fetchFields`: https://developers.google.com/maps/documentation/javascript/reference/place

## Proposed next step for Stebbi

Do one more localhost test, but make it intentionally not use saved/recent places:

1. Clear both fields.
2. Type `Garðabær`.
3. Select the typed Google suggestion.
4. Type `Þorlákshöfn`.
5. Select the typed Google suggestion.
6. Capture browser console `[PlaceSearch]` logs and server terminal `[routes/routes]` + `[weather/google]` logs.

The useful result is one of these:

| Result | Meaning | Next step |
|---|---|---|
| `(google)` with real `placeId`, request body present, provider `placeId`, Route 39 appears | Place ID solves the route. | Implement saved-place `place_id` persistence. |
| `(google)` with real `placeId`, request body present, provider `placeId`, still only Route 427 | Place ID is not enough. | Run `SHORTER_DISTANCE` experiment. |
| `(google)` but `placeId` is null | Google JS Place object did not expose id. | Add `id` to `fetchFields` and retest. |
| `(server fallback)` | JS autocomplete failed/timed out. | Verify server fallback returns/stores `placeId`, or retry. |
| `(saved place)` | Test still used saved places. | Retest typed suggestions, or approve saved-place persistence if normal usage matters more than isolation. |

## If Stebbi wants Codex's product recommendation

Codex would approve saved-place `place_id` persistence once the clean Place ID test shows Place ID routing works.

Reason: the current app encourages returning users to tap saved/recent places. If saved/recent places stay coordinate-only, the product will keep regressing to lower-fidelity routing exactly in the flow frequent users are most likely to use.

Recommended saved-place scope:

- `sql/71_weather_saved_places_place_id.sql`: add nullable `place_id text`.
- Add a conservative check constraint if the existing migration style supports it cleanly: trimmed, non-empty when present, reasonable max length such as 500.
- No `NOT NULL`, no default, no data backfill required.
- Keep `place_key` as coordinate dedupe key.
- Update saved-place types to include `placeId?: string`.
- Save `placeId` in `savePlaceBestEffort` when present.
- Return `place_id` from GET/POST.
- Pass `placeId` from saved-place selection into route selection.
- Preserve RLS and grants. Do not change policies.

This does not require `SHORTER_DISTANCE`.

## If Place ID is not enough

Then test `requestedReferenceRoutes: ["SHORTER_DISTANCE"]` in a tightly scoped provider experiment:

- Add it only to route-options fetching first, not final submission behavior.
- Include required field masks for labels and any fields Google requires for shorter-distance responses, including `routes.routeLabels` and likely `routes.routeToken`.
- Log/label whether returned routes are `DEFAULT_ROUTE`, `DEFAULT_ROUTE_ALTERNATE`, or `SHORTER_DISTANCE`.
- Do not auto-select `SHORTER_DISTANCE` globally.
- Compare for Þorlákshöfn and a few normal long routes so we do not make all routes weird for one edge case.

If it finds Route 39 cleanly, decide whether it should be an extra selectable option, a tie-breaker, or only used when the default route is suspiciously longer.

## Localhost checks for Stebbi

Before approving implementation, do the clean Place ID test:

1. Open `/auth-mvp/vedrid` on localhost.
2. Clear both fields.
3. Type and select Google suggestions for `Garðabær` and `Þorlákshöfn`.
4. Confirm browser console says `(google)` with real `placeId` for both.
5. Confirm server terminal says request body has both place IDs present.
6. Confirm provider diagnostic says `"originType": "placeId"` and `"destType": "placeId"`.
7. Record whether Route 39/Þrengslavegur appears.

Do not test production, run migrations, or modify Supabase data for this diagnostic.

## Files changed by Codex

- Added this recommendation file only.

## Tests run

- Not run. This is a review/recommendation, based on local handoffs, diagnostics, current code inspection, and official Google documentation.

## Uncertainty / needs confirmation

The remaining unknown is whether typed Google suggestions return a real `placeId` in this app. Current evidence only covers saved-place selection.

If `place.id` is null after typed Google selection, the likely next tiny fix is to include `id` in `place.fetchFields({ fields: [...] })`, because Google's Maps JS docs list `id` as a `Place` property and `fetchFields` accepts Place fields.
