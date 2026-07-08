# 2026-07-08 11:59 - TODO 067 v191 Codex addendum after v190 terminal diagnostics

## Context

Stebbi tested the Garðabær -> Þorlákshöfn route on localhost after v189 and pasted the actual Next.js terminal diagnostic:

```txt
[weather/google] getRouteOptions diagnostics: {
  "originType": "latLng",
  "destType": "latLng",
  "routeCount": 1,
  "routes": [
    {
      "distanceMeters": 67435,
      "durationS": 3527,
      "labels": [
        "DEFAULT_ROUTE"
      ],
      "description": "Krýsuvíkurvegur og Suðurstrandarvegur/Leið 427"
    }
  ]
}
```

This is more useful than the browser DevTools console output. The browser console warnings shown earlier were unrelated to route choice.

## Findings

### High - v186 Place ID routing is not active in this localhost test

The diagnostic says both endpoints were sent to Google Routes as coordinates:

- `originType: "latLng"`
- `destType: "latLng"`

So this test does **not** yet prove that Google Routes, when given real Place IDs, only returns the Route 427/Krýsuvík option. It proves that the current user flow still reached `getRouteOptions` without real Place IDs.

Do not jump straight to `requestedReferenceRoutes: ["SHORTER_DISTANCE"]` or a curated Þorlákshöfn fallback before this is verified. First confirm whether the user selected saved/recent places or Google suggestions.

### Medium - saved/recent places currently cannot preserve Place ID

This may be expected if Stebbi selected Garðabær or Þorlákshöfn from the saved/recent list.

Current code path:

- Google suggestion selection includes `placeId` in `components/weather/PlaceSearch.tsx`.
- `RouteSelectionStep` forwards `p.placeId` into the route place.
- Saved/recent place selection in `components/weather/PlaceSearch.tsx` calls `onPlaceSelected({ name, formattedAddress, lat, lon })` without `placeId`.
- Migration 69 and saved-place API design dedupe by coordinates and do not store `place_id`.

That means saved/recent selection will naturally produce `latLng` diagnostics even after v186/v189.

If we want saved/recent places to retain Google routing fidelity, that is separate persistence work:

- add nullable `place_id` to saved places,
- validate it server-side,
- return it from saved-place API,
- save it when known,
- keep backward compatibility for existing rows without it.

That should not be mixed into an emergency route-fidelity experiment unless Stebbi explicitly approves the schema/API scope.

### Medium - if Google suggestion selection still logs latLng, there is a real Place ID propagation bug

If Stebbi typed into the search field and selected the Google autocomplete/server suggestion, this diagnostic is a blocker: `placeId` is being lost somewhere before the provider.

Recommended debug order:

1. Re-test with both fields cleared.
2. Type `Garðabær` and select the Google suggestion, not a saved/recent item.
3. Type `Þorlákshöfn` and select the Google suggestion, not a saved/recent item.
4. Watch the terminal diagnostic.
5. Expected result for the Place ID path: `originType: "placeId"` and `destType: "placeId"`.

If it still says `latLng`, add short dev-only diagnostics at the boundaries:

- selected place emitted by `PlaceSearch`,
- `RoutePlace` received by `RouteSelectionStep`,
- request body received by `/api/teskeid/weather/travel/routes`,
- `PlaceCandidate` passed into `getRouteOptions`.

Keep the logs dev-only and avoid logging secrets or unrelated user data. Name, lat/lon, and whether `placeId` exists is enough.

## Recommended next handoff to Claude Code

```md
TODO 067 v191 - Route fidelity follow-up after terminal diagnostics

Stebbi's terminal diagnostic for Garðabær -> Þorlákshöfn shows:

- originType: "latLng"
- destType: "latLng"
- routeCount: 1
- returned route: Krýsuvíkurvegur og Suðurstrandarvegur/Leið 427, 67.4 km, 58.8 min

Please do not start with SHORTER_DISTANCE yet. First determine why this test reached Google Routes as latLng instead of placeId.

Tasks:

1. Verify the intended behavior:
   - Google suggestion selections should carry `placeId`.
   - Saved/recent selections currently do not carry `placeId`, because saved places are coordinate-based and migration 69 does not store `place_id`.

2. Add the smallest dev-only diagnostics needed to distinguish these flows:
   - When a place is selected, log whether the selected object has a real `placeId`.
   - In `/api/teskeid/weather/travel/routes`, log whether origin/destination request body contains a real `placeId`.
   - Keep logs dev-only and do not log secrets or broad user data.

3. Ask Stebbi to retest by clearing both fields, typing the place names, and choosing the Google suggestions rather than saved/recent items.

4. If that still logs `latLng`, fix the propagation bug.

5. Only after diagnostics show `originType: "placeId"` and `destType: "placeId"` should we evaluate whether Google still returns only Route 427. If it does, then create a separate small experiment for `requestedReferenceRoutes: ["SHORTER_DISTANCE"]` or another routing-bias strategy, with a clear note that `SHORTER_DISTANCE` is experimental/pre-GA.

Do not add a saved-places `place_id` migration in this same change unless Stebbi explicitly approves that schema/API scope.
```

## Localhost checks for Stebbi

Use the existing localhost dev server that Stebbi is already running.

1. Open `/auth-mvp/vedrid`.
2. Clear both route fields.
3. For `Frá`, type `Garðabær` and choose a Google suggestion, not a saved/recent item shown before typing.
4. For `Til`, type `Þorlákshöfn` and choose a Google suggestion, not a saved/recent item shown before typing.
5. Check the Next.js terminal for `[weather/google] getRouteOptions diagnostics`.

Expected diagnostic if v186/v189 Place ID path is active:

```txt
"originType": "placeId",
"destType": "placeId"
```

If it still says `latLng`, the next fix should target Place ID propagation. If it says `placeId` but still returns only Route 427, the next fix should target Google route option strategy.

Do not test production, Supabase migrations, or saved-place schema changes for this addendum. This is localhost-only route selection diagnostics.

## Files changed by Codex

- Added this review/addendum file only.

## Tests run

- Not run for this addendum. This is an interpretation of Stebbi's terminal diagnostic plus a next-step handoff.
