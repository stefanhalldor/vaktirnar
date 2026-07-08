# TODO-067 v209 - Codex addendum to v208: Þrengslavegur duration gap

Created: 2026-07-08 14:16  
Timezone: Atlantic/Reykjavik  
Relevant TODO: TODO-067, Ferðaveðrið route fidelity  
Builds on: `2026-07-08-1412-todo-067-v208-codex-v207-review.md`

## Short Answer

We are not at a dead end.

v207 appears to have fixed the route-geometry problem for Garðabær -> Þorlákshöfn: Teskeið now draws and lists the Þrengslavegur / Route 39 path at about 56 km, separately from the Route 427 path at about 67 km.

The remaining problem is different: Teskeið is likely using the wrong Google duration field for this product. The app currently uses Google `duration` from `TRAFFIC_AWARE` requests. That can behave like a live/current-traffic ETA. Ferðaveðrið needs a route travel-time baseline to place weather forecasts along the route, not necessarily a live traffic delay estimate at the instant the user calculates the route.

Stebbi's screenshot evidence:

- Google Maps: Þrengslavegur route is 45 min / 55 km.
- Google Maps: Route 427 is 59 min / 67.2 km.
- Teskeið: Þrengslavegur route is 57 min / 56 km.
- Teskeið: Route 427 is 59 min / 67 km.

That means the geometry and distance now look right, but the Þrengslavegur ETA is inflated in Teskeið.

## Evidence From Current Code

Current code in `lib/weather/google.server.ts`:

- `RoutesResponse` includes `duration` but not `staticDuration` at lines 21-32.
- Curated via-route request uses `routingPreference: 'TRAFFIC_AWARE'` at line 164.
- Curated field mask asks for `routes.duration` but not `routes.staticDuration` at line 178.
- Curated route returns `durationS` from `route.duration` at line 225.
- Main alternatives request uses `routingPreference: 'TRAFFIC_AWARE'` at line 339.
- Main field mask asks for `routes.duration` but not `routes.staticDuration` at line 349.
- Main routes parse `durationS` from `route.duration` at line 365.
- Route cards are sorted by `durationS` at lines 395 and 403.

So every user-visible route duration, route ordering, final-submit duration, arrival time and weather-point timing currently flows from `routes.duration`.

## Relevant Google Docs

Official Google Routes API docs used for this addendum:

- Compute Routes reference: https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
- RoutingPreference reference: https://developers.google.com/maps/documentation/routes/reference/rest/v2/RoutingPreference

Key docs implications:

- `TRAFFIC_AWARE` incorporates live traffic data.
- `TRAFFIC_UNAWARE` computes routes without live traffic.
- `trafficModel` affects the value returned in `duration` when traffic is requested.
- `departureTime`, when not set, defaults to the request time.
- Route fields must be explicitly requested via the field mask, so `staticDuration` will not appear unless Claude Code asks for `routes.staticDuration`.

## Codex Interpretation

The problem is probably not the curated waypoint anymore. The curated route's distance matches the expected route.

The problem is probably that Teskeið uses traffic-aware `duration` as if it were a stable route duration. For a weather forecast product, that is a leaky abstraction:

- The user may be choosing departure times over many future hours.
- The weather forecast point timing should be stable and explainable.
- Live traffic at the moment of route calculation should not quietly change which forecast hour is sampled 30-60 km later.
- Road closures and dangerous road conditions should be handled as road-condition warnings, not hidden inside a Google ETA.

This is especially visible on Garðabær -> Þorlákshöfn because the Route 39 / Þrengslavegur path is much shorter, but Teskeið's traffic-aware duration makes it look almost equal to Route 427.

Confidence: medium-high. We still need Claude Code to verify what Google returns for `staticDuration` on this exact request.

## Recommended Next Step For Claude Code

Make one narrow implementation experiment:

1. Request `routes.staticDuration` from Google for both normal route alternatives and curated via-route requests.
2. Parse both values:
   - `trafficDurationS` from `route.duration`
   - `staticDurationS` from `route.staticDuration`
3. Use `staticDurationS` as `RouteOption.durationS` when present.
4. Fall back to `trafficDurationS` if `staticDuration` is absent.
5. Add dev diagnostics that show both values and the source used.
6. Keep the existing curated route registry and label behavior unchanged.

Suggested helper shape:

```ts
function parseGoogleSeconds(value: string | undefined): number | null {
  if (!value?.endsWith('s')) return null
  const parsed = Number.parseInt(value.slice(0, -1), 10)
  return Number.isFinite(parsed) ? parsed : null
}
```

Suggested selection logic:

```ts
const trafficDurationS = parseGoogleSeconds(route.duration)
const staticDurationS = parseGoogleSeconds(route.staticDuration)
const durationS = staticDurationS ?? trafficDurationS
if (durationS == null) {
  // skip malformed route, or fall back exactly how existing code handles impossible Google data
}
```

Do not change the route registry, via waypoint, placeId handling, saved places, SQL or RLS in this pass.

## If Static Duration Does Not Fix It

If `staticDuration` is absent or still close to 57 minutes for the Þrengslavegur route, do not keep guessing in the UI.

Then the next diagnostic pass should compare:

1. Current request: `routingPreference: 'TRAFFIC_AWARE'`, fields `duration` + `staticDuration`.
2. Alternate diagnostic-only request: `routingPreference: 'TRAFFIC_UNAWARE'`, field `duration`.

Reason: Google documents `TRAFFIC_UNAWARE` as not considering live traffic. It may be closer to the 45-minute Maps screenshot for this corridor. But this should be a second step after trying `staticDuration`, because `staticDuration` is the cleaner minimal change.

Do not jump to `TRAFFIC_AWARE_OPTIMAL` as the first fix. It is still traffic-oriented and may increase latency without solving the product question.

## Test Expectations

Claude Code should add or update focused tests around `lib/weather/google.server.ts` and any API/final-submit tests touched by v207.

Minimum useful test cases:

1. Main Google route with both `duration` and `staticDuration`:
   - API route has `duration: "3420s"` and `staticDuration: "2700s"`.
   - Expected `RouteOption.durationS === 2700`.

2. Curated Þrengslavegur route with both values:
   - API route has `duration: "3426s"` and `staticDuration: "2700s"`.
   - Expected curated option uses `2700`, not `3426`.

3. Fallback behavior:
   - API route has `duration: "3540s"` and no `staticDuration`.
   - Expected route still uses `3540`.

4. Sorting:
   - With static durations, Þrengslavegur should sort before Route 427 for the screenshot scenario.

5. Final submit / weather sampling:
   - Selecting the curated route must carry the selected static-based `durationS` into the final weather result.
   - No regression to `Valin leið fannst ekki`.

6. Diagnostics:
   - In development logs, include enough info to compare `durationS`, `staticDurationS`, `trafficDurationS` and `durationSource`.
   - Do not log secrets, full API keys, user emails or private saved-place metadata.

## UX / Product Copy Note

Do not add explanatory UI copy yet. First fix the duration source and confirm on localhost.

If Stebbi later wants transparency, a future small copy change could say something like "Áætlaður aksturstími" rather than implying live traffic. But do not broaden this pass.

## Localhost checks for Stebbi

After Claude Code implements the static-duration experiment:

1. Open `/auth-mvp/vedrid`.
2. Select `Garðabær` from Google autocomplete as origin.
3. Select `Þorlákshöfn` from Google autocomplete as destination.
4. Expected route list:
   - `Um Þrengslaveg` still appears.
   - It still shows about 55-56 km.
   - Its duration should be much closer to Google Maps' 45 minutes than to the current Teskeið 57 minutes, if Google returns a useful `staticDuration`.
   - `Sjálfgefin Google-leið` / Route 427 should still show about 67 km and around 59 minutes.
5. Select `Um Þrengslaveg` and click `Nota þessa leið`.
6. Expected final result:
   - Route map still follows Þrengslavegur / Route 39.
   - Arrival time and point times shift consistently with the shorter travel time.
   - Weather-point labels and "Mest krefjandi" details remain coherent.
7. Repeat with `Garðabær -> Selfoss`.
8. Expected:
   - No false `Um Þrengslaveg` curated route.
   - Route options still render and final submit still works.
9. Repeat with `Keflavík -> Þorlákshöfn`.
10. Expected:
   - No capital-area Þrengslavegur curated route unless the registry intentionally matches that corridor later.

No Supabase migration, production data, auth config, billing, secrets, commit, push or deploy is part of these localhost checks.

## Recommendation

Claude Code should do one more narrow implementation pass before we call this "good enough":

- add `staticDuration` to the Google route response handling,
- prefer it for `RouteOption.durationS`,
- log both static and traffic-aware durations in development,
- add focused tests.

If that brings Garðabær -> Þorlákshöfn close to the Google Maps 45 min / 55 km route, this is likely the right product model for Ferðaveðrið.

If it does not, we are still not necessarily at a dead end, but the next step becomes a controlled `TRAFFIC_UNAWARE` comparison rather than more placeId/via-point work.

