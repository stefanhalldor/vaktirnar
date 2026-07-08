# TODO-067 v193 - Codex review of v192 after saved-place retest

Created: 2026-07-08 12:08
Timezone: Atlantic/Reykjavik
Author: Codex
Status: Review/addendum. No app code changed.

## Findings

### High - The failing retest still did not exercise Place ID routing

Stebbi's newest browser and terminal diagnostics are conclusive:

```txt
[PlaceSearch] selected (saved place): { name: 'Garðabær', placeId: 'none - saved places have no placeId' }
[PlaceSearch] selected (saved place): { name: 'Þorlákshöfn', placeId: 'none - saved places have no placeId' }
[routes/routes] placeId in request body: { origin: 'absent', destination: 'absent' }
[weather/google] getRouteOptions diagnostics: { "originType": "latLng", "destType": "latLng", ... }
```

So the current wrong Þorlákshöfn route is still coming from coordinate routing, not from a real Place ID request to Google Routes.

This means v192 diagnostics are working. The result is not yet "Google with Place IDs still returns only Route 427." The result is "the tested flow selected saved/recent places, and saved/recent places currently have no Place ID."

Relevant code:

- `components/weather/PlaceSearch.tsx`: saved-place click logs `selected (saved place)` and calls `onPlaceSelected` without `placeId`.
- `app/api/teskeid/weather/travel/routes/route.ts`: request-body log reports both `placeId`s absent.
- `lib/weather/google.server.ts`: final provider diagnostic reports `latLng`, which matches the missing request fields.

### High - Saved/recent places are now a product-level route fidelity gap

The original v191 framing treated saved/recent selection partly as a testing distinction. Stebbi's retest shows it is also a realistic product issue: a returning user will naturally tap saved/recent Garðabær and Þorlákshöfn, and that path bypasses Place ID routing entirely.

Current saved-place storage cannot preserve Place IDs:

- `sql/69_weather_saved_places.sql` has no `place_id` column.
- `lib/weather/savedPlaces.ts` `SavedWeatherPlace` and `SavedWeatherPlaceInput` have no `placeId`.
- `lib/weather/savedPlaces.ts` `savedPlaceToRoutePlace` returns only name, coordinates, and formatted address.
- `app/api/teskeid/weather/saved-places/route.ts` selects/inserts/updates no `place_id`.

If route fidelity matters for saved/recent places, the next real product fix is probably a scoped saved-place `place_id` persistence change, not just more diagnostics.

Recommended shape:

- Add nullable `place_id` to `weather_saved_places`.
- Keep coordinate `place_key` as the dedupe key for backward compatibility.
- Validate `place_id` server-side with conservative type/length checks.
- Store `place_id` when a Google/server suggestion provides one.
- Return `place_id` from saved-place GET/POST.
- Include `placeId` in `SavedWeatherPlace`, `SavedWeatherPlaceInput`, and `savedPlaceToRoutePlace`.
- Let old saved rows continue to work as lat/lon until the user reselects the place from Google suggestions and the row is refreshed.

This needs explicit Stebbi approval because it touches SQL/schema, API shape, saved-place data, and RLS-protected user data. It should be separate from `SHORTER_DISTANCE` experiments.

### Medium - A clean Google-suggestion retest is still needed before route-strategy changes

Before testing `requestedReferenceRoutes: ["SHORTER_DISTANCE"]`, Claude Code should still get one clean trace where both fields are selected from typed Google suggestions.

Expected trace:

```txt
[PlaceSearch] selected (google): { name: 'Garðabær', placeId: '...' }
[PlaceSearch] selected (google): { name: 'Þorlákshöfn', placeId: '...' }
[routes/routes] placeId in request body: { origin: 'present (...)', destination: 'present (...)' }
[weather/google] getRouteOptions diagnostics: { "originType": "placeId", "destType": "placeId", ... }
```

If that still returns only Route 427, then the routing strategy is the next problem. If it returns the expected Þrengslavegur/Route 39 route, then Place ID persistence for saved/recent places becomes the primary fix.

### Low - v192 handoff is missing the exact required `Localhost checks for Stebbi` heading

v192 contains good retest instructions, but the required heading from `ai-handoff/README.md` is not present exactly as `Localhost checks for Stebbi`.

This is not a functional app blocker, but future handoffs should keep the required heading so review/checklist tooling and human scanning stay consistent.

## Recommended next message to Claude Code

```md
TODO-067 v193 follow-up from Codex:

Stebbi retested v192 and the diagnostics worked. They show the failing Þorlákshöfn route still came from saved-place selection, not Google autocomplete:

- Browser console: `[PlaceSearch] selected (saved place)` for both Garðabær and Þorlákshöfn.
- Server terminal: `[routes/routes] placeId in request body: { origin: 'absent', destination: 'absent' }`.
- Provider terminal: `"originType": "latLng"` and `"destType": "latLng"`.

Please do not move to SHORTER_DISTANCE yet.

Next, split the work into two explicit questions:

1. Clean Place ID route test:
   - Have Stebbi clear both fields.
   - Type each place name and pick the typed Google suggestion, not the saved/recent item.
   - Confirm browser logs `(google)` with a real `placeId`, request body has both placeIds present, and provider logs `placeId`.
   - Then record whether Google still returns Route 427 or finds the expected Þrengslavegur/Route 39 route.

2. Saved/recent product fix:
   - If Stebbi wants saved/recent selections to route with the same fidelity, propose a separate small implementation to persist nullable `place_id` on `weather_saved_places`.
   - Scope should include SQL migration, saved-place types, saved-place GET/POST, client save payload, saved-place selection, and backward compatibility for existing rows without `place_id`.
   - Do not run SQL or migrations without explicit approval.

Also keep future handoffs using the exact `Localhost checks for Stebbi` heading.
```

## Localhost checks for Stebbi

For the next manual test, use localhost only.

1. Open `/auth-mvp/vedrid`.
2. Clear both `Frá` and `Til`.
3. Click into `Frá`, type `Garðabær`, wait for typed suggestions, and choose the Google suggestion, not the saved/recent item shown before typing.
4. Click into `Til`, type `Þorlákshöfn`, wait for typed suggestions, and choose the Google suggestion, not the saved/recent item shown before typing.
5. In browser DevTools, confirm both logs say `(google)` and have a real `placeId`.
6. In the Next.js terminal, confirm request body says both `present (...)`.
7. Confirm provider diagnostics say `"originType": "placeId"` and `"destType": "placeId"`.
8. Then check whether the route card still says Route 427/Krýsuvíkurvegur or whether it finds the expected Google-style route.

Do not test production, Supabase migrations, or schema changes as part of this check.

## Files changed by Codex

- Added this review/addendum file only.

## Tests run

- Not run for this review. This was a diagnostic interpretation and handoff review.

## Uncertainty / needs confirmation

The current evidence proves the failing retest used saved/recent selections. It does not yet prove whether typed Google suggestions produce the expected route.

If typed Google suggestions still log `placeId` as null or absent, then the next investigation should focus on the Google Places `fetchFields`/`place.id` path before touching route strategy.
