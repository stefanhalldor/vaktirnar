# TODO-067 v170 - Codex handoff - place identity and routing fidelity fix

Created: 2026-07-08 06:25  
Updated: 2026-07-08 06:38 - added Google Maps parity / traffic-aware routing notes from Stebbi screenshot  
Timezone: Atlantic/Reykjavik  
From: Codex  
To: Claude Code  
Status: Ready for Claude Code planning/implementation after Stebbi gives explicit execution approval. Codex changed only this handoff file.

## Context

Stebbi found that Teskeið suggests the longer/lower-quality route to Þorlákshöfn, even when selecting Þorlákshöfn directly as the destination. This means the issue is not only the Vestmannaeyjar / Herjólfur ferry-port hardcode.

Observed comparison:

- Teskeið shows roughly `68 km / 56 min`, visually matching the Krýsuvíkurvegur + Suðurstrandarvegur / Route 427 route.
- Google Maps consumer UI for Garðabær -> Þorlákshöfn shows a much shorter/faster route via Þrengslavegur / Route 39, roughly `51.2 km / 42 min`, plus Route 427 as an alternative.

This is trust-critical. If the user can see Google Maps choosing a more obvious route, Ferðaveðrið feels wrong before the weather model even runs.

Additional Stebbi screenshot after v170:

- Teskeið, `Egilsstaðir -> Garðabær`, shows:
  - `Fljótlegasta leið`: `637 km`, `7 klst. 41 mín.`
  - `Önnur leið`: `624 km`, `7 klst. 58 mín.`
- Google Maps consumer UI for the same visible route search shows:
  - `via Hringvegur/Þjóðvegur and Hringvegur`: `637 km`, `7 hr 49 min`, marked fastest/usual traffic/tolls.
  - `via Hringvegur/Þjóðvegur and Hringvegur/Route 1`: `624 km`, `8 hr 5 min`.
  - a third route: `690 km`, `8 hr 42 min`.

This means Teskeið is often close, but not identical:

- Same first route distance as Google Maps, but time differs by about 8 minutes.
- Same second route distance as Google Maps, but time differs by about 7 minutes.
- Google Maps shows a third route that Teskeið does not show.

This should be treated as a broader "match Google Maps as closely as the public APIs allow" problem, not only a Þorlákshöfn issue.

## Revised diagnosis

Codex previously suspected the hardcoded Herjólfur Þorlákshöfn coordinates in `lib/weather/ferryPorts.ts`.

That diagnosis is too narrow because Stebbi now confirms the same route problem happens when selecting Þorlákshöfn directly.

The more likely underlying problem is route-provider fidelity:

1. Browser Places selection currently fetches `displayName`, `formattedAddress` and `location`, but not the Place ID.
2. `PlaceResult` and `RoutePlace` currently do not carry `placeId`.
3. `/api/place/search` receives `place_id` from Geocoding through `PlaceCandidate`, but strips it from its response.
4. The travel routes API accepts an optional `placeId`, but in practice usually receives none.
5. Google Routes calls are made with raw `latLng` waypoints only.

When we route by raw coordinates, Google may snap the destination to a different road approach than Google Maps consumer UI does for a named place/address. This can explain why Teskeið gets the Route 427 route while Google Maps UI prefers Route 39.

There is also a second, independent fidelity gap:

- Google Maps consumer UI is using `Leave now` and displays traffic wording such as `usual traffic`.
- Teskeið currently does not explicitly set `routingPreference`, `departureTime`, `trafficModel`, `languageCode` or `regionCode` in `computeRoutes`.
- Teskeið only requests `routes.polyline`, `routes.distanceMeters`, `routes.duration` and `routes.routeLabels`.
- Teskeið does not request `routes.staticDuration`, `routes.description`, `routes.localizedValues`, `routes.travelAdvisory`, `routes.legs.startLocation`, or `routes.legs.endLocation`.

So even when Google returns roughly the same route geometry, the duration and set of alternatives may differ from Google Maps consumer UI.

## Relevant code references

### Browser PlaceSearch drops place ID

`components/weather/PlaceSearch.tsx`

- `PlaceResult` has no `placeId`.
- Google selection fetches only:

```ts
await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] })
```

and then returns only name, formatted address and coordinates.

### Server place search also drops place ID

`app/api/place/search/route.ts`

- `provider.geocodePlace(q)` returns candidates with `placeId`.
- The API maps candidates to:

```ts
{ name, formattedAddress, lat, lon }
```

and does not include `placeId`.

### Routes API endpoint accepts placeId but normally does not get it

`app/api/teskeid/weather/travel/routes/route.ts`

- Validation permits optional `placeId`.
- The candidate uses:

```ts
placeId: destination.placeId ?? 'confirmed'
```

but the UI/API flow generally does not supply a real Google Place ID.

### Google route provider ignores placeId even if present

`lib/weather/google.server.ts`

Current request body uses only:

```ts
origin: { location: { latLng: { latitude: from.lat, longitude: from.lon } } },
destination: { location: { latLng: { latitude: to.lat, longitude: to.lon } } },
```

This happens in both `getRouteGeometry` and `getRouteOptions`.

## Google API facts to respect

Primary docs:

- Routes API `computeRoutes`: https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
- Routes API `Waypoint`: https://developers.google.com/maps/documentation/routes/reference/rest/v2/Waypoint

Relevant facts:

- A Routes API waypoint can be specified as geographic coordinates, Place ID or human-readable address.
- `computeAlternativeRoutes: true` asks Routes API to return alternate routes in addition to the main route.
- Google says no alternative routes are returned when requests have intermediate waypoints.
- Route leg `endLocation` may differ from the supplied destination if the supplied destination is not near a road.
- Route `duration` depends on routing preference. Google documents that with `TRAFFIC_UNAWARE`, `duration` is the same as `staticDuration`; with `TRAFFIC_AWARE` or `TRAFFIC_AWARE_OPTIMAL`, duration accounts for traffic conditions.
- Google Routes response can include `description`, `localizedValues`, `travelAdvisory`, `staticDuration`, `routeLabels`, `legs.startLocation`, and `legs.endLocation` if requested in the field mask.

Implementation should use these facts without overfitting to Þorlákshöfn only.

## Goal

Make Ferðaveðrið route selection use richer place identity end-to-end, so Google Routes gets the best possible signal about the intended origin/destination.

This should improve Þorlákshöfn and other ambiguous / place-name-sensitive destinations without adding special-case hacks.

Secondary goal:

Make Teskeið route options visibly and numerically match Google Maps consumer UI as closely as Google Routes API allows:

- same intended start/end places,
- same route ordering when the same routes are returned,
- same or explainably close durations,
- same key alternatives where possible,
- route names/descriptions that help Stebbi verify whether a Teskeið option corresponds to the Google Maps option.

## Non-goals

Do not change in this pass unless Stebbi explicitly approves:

- weather scoring,
- thresholds,
- route weather sampling,
- met.no fetching,
- SQL migrations,
- RLS,
- auth,
- saved-places table schema,
- production env,
- deployment.

Do not solve this with a hardcoded "Þorlákshöfn must use Þrengslavegur" rule in the first attempt. Use Google place identity first.

## Proposed implementation

### 1. Carry `placeId` through PlaceSearch

Update shared place types:

- `PlaceResult`
- `RoutePlace`
- relevant request/response types
- `PlaceCandidate` if needed

Make `placeId` optional, because saved places and curated places may not have one.

Browser Places path:

- Fetch Place ID from the selected suggestion.
- If the JS Places object exposes it through `place.id` / equivalent in the current API version, include it.
- If the current library needs an explicit field name, fetch the documented place ID field.
- Keep `lat/lon` as fallback.

Important: verify the actual field name against the installed Google Maps JS types. Do not guess if TypeScript disagrees.

### 2. Return `placeId` from `/api/place/search`

`app/api/place/search/route.ts` should include `placeId` in `PlaceSearchResult`.

This keeps server fallback and browser Google path aligned.

### 3. Preserve `placeId` in route state

Route selection should keep the Place ID once selected:

- `RouteSelectionStep`
- `FerdalagidClient`
- request body to `/api/teskeid/weather/travel/routes`
- request body to `/api/teskeid/weather/travel`

Do not lose `placeId` when:

- moving from route step to trailer/threshold/result steps,
- selecting a route option,
- submitting the final travel calculation.

### 4. Use Place ID waypoint in Google route calls when available

In `lib/weather/google.server.ts`, add a helper such as:

```ts
function waypointFor(candidate: PlaceCandidate) {
  if (candidate.placeId && candidate.placeId !== 'confirmed' && candidate.placeId !== 'curated') {
    return { placeId: candidate.placeId }
  }
  if (candidate.formattedAddress && candidate.formattedAddress !== candidate.displayName) {
    // Consider address fallback only after testing. Lat/lng may still be safer for curated internal places.
  }
  return { location: { latLng: { latitude: candidate.lat, longitude: candidate.lon } } }
}
```

Use the helper in both:

- `getRouteOptions`
- `getRouteGeometry`

Initial preferred behaviour:

- Real Google Place ID -> use `{ placeId }`.
- Curated/manual/saved/no-place-id -> use `latLng`.

Do not use a fake place ID such as `confirmed` or `curated` in Google requests.

### 5. Add diagnostic fields during route option debugging

For local/debug validation, consider temporarily or permanently including enough data in route options to inspect routing quality:

- route `description` from Google if available,
- route `localizedValues` if useful,
- route leg `endLocation`,
- route leg `startLocation`,
- route labels,
- route distance/duration,
- `staticDuration`,
- `travelAdvisory` / toll info if available and useful.

Do not expose noisy debug fields in the final user-facing UI unless useful. It is OK to keep them internal or behind development logs/tests.

Use this diagnostic information to compare Teskeið against Google Maps screenshots:

- Does Teskeið's `637 km` route correspond to the same `637 km` Google Maps route?
- Does Teskeið's `624 km` route correspond to the same `624 km` Google Maps route?
- If distances match but durations differ, is the difference explained by traffic-aware vs static routing?
- If Google Maps shows a third route but Routes API returns only two, document that clearly and test whether routing settings can improve it.

### 6. Align routing preferences with Google Maps `Leave now`

The current Google Routes request does not set `routingPreference`.

Google Maps consumer UI for "leave now" appears traffic-aware and may show wording such as `usual traffic`. To get closer parity, test route options with:

```ts
routingPreference: 'TRAFFIC_AWARE'
```

Potentially also test:

```ts
departureTime: new Date().toISOString()
```

if the API/client behaviour requires explicit departure time for stable parity.

Do not blindly switch production behaviour without comparing:

- route count,
- duration,
- staticDuration,
- distance,
- route description,
- whether the expected alternatives appear,
- whether performance/cost/latency changes materially.

Expected comparison cases:

- `Egilsstaðir -> Garðabær`: Teskeið should be explainably close to Google Maps `7 hr 49 min`, not silently `7 klst. 41 mín.` with no explanation.
- `Garðabær -> Þorlákshöfn`: Teskeið should show the Route 39 / Þrengslavegur option if Google Routes can return it.

If `TRAFFIC_AWARE` fixes durations but increases latency or changes route count, document the tradeoff in the handoff back to Codex/Stebbi.

### 7. Show route descriptions when available

Google Maps names routes with descriptions such as:

- `via Hringvegur/Þjóðvegur and Hringvegur`
- `via Hringvegur/Þjóðvegur and Hringvegur/Route 1`
- `via Þrengslavegur/Route 39`

Teskeið currently labels options generically:

- `Fljótlegasta leið`
- `Önnur leið`

For trust, fetch `routes.description` and show it as secondary text under the option title when available.

Suggested UI:

```txt
Fljótlegasta leið
via Hringvegur/Þjóðvegur and Hringvegur
637 km
7 klst. 49 mín.
```

Icelandic route names from Google may be mixed-language. That is acceptable for MVP if it helps match Google Maps. Do not invent road descriptions by parsing polylines.

### 8. Investigate missing third route

Google Maps consumer UI can show more alternatives than the Routes API response currently seen in Teskeið.

Claude Code should verify:

- How many routes `computeRoutes` actually returns for `Egilsstaðir -> Garðabær` with current request.
- Whether `TRAFFIC_AWARE` changes route count.
- Whether using Place IDs changes route count.
- Whether adding `routes.description` / `routes.localizedValues` only changes display, not count.
- Whether `requestedReferenceRoutes` or other documented route settings can expose additional useful alternatives without intermediate waypoints.

Do not add intermediate waypoints just to force the third Google Maps route in this pass, because Google documents that alternative routes are not returned for requests with intermediate waypoints.

If third-route parity requires separate forced-route computations, create a new handoff for that later.

### 9. Only then consider curated corridor fallback

If Google Routes still fails to return Route 39 for Þorlákshöfn after Place ID and routingPreference validation, create a separate handoff for a curated route-corridor fallback.

Example future concept:

- Known destination: Þorlákshöfn
- Known alternatives:
  - Þrengslavegur / Route 39 corridor
  - Krýsuvíkurvegur + Suðurstrandarvegur / Route 427 corridor
- Use intermediate via points only for candidate generation, not as the primary default.

Important: Google Routes docs state that `computeAlternativeRoutes` does not return alternatives when intermediate waypoints are present, so a curated-via approach must request each candidate route separately.

## Saved places note

Current `weather_saved_places` migration does not store `place_id`.

Do not alter SQL 69 in this implementation unless Stebbi explicitly approves a migration/schema change.

MVP behaviour can be:

- live Google/server search selections carry `placeId`,
- saved places continue to work via coordinates,
- a future migration can add `place_id` to saved places if this proves important.

If Claude Code believes saved-place Place ID storage is required for the fix to be meaningful, stop and ask Stebbi/Codex before writing SQL.

## Testing guidance for Claude Code

Run at least:

```bash
npm run type-check
npm run test:run
```

Add or update focused tests where practical:

- `PlaceSearch` selected Google place includes optional `placeId` in `onPlaceSelected`.
- `/api/place/search` includes `placeId` in results when provider returns it.
- `RoutePlace` preserves optional `placeId`.
- Google provider uses `{ placeId }` waypoint when a real Place ID exists.
- Google provider falls back to `{ location: { latLng } }` for curated/manual/saved/no-place-id places.
- Route option sorting still sorts by duration ascending.
- Google provider can request/parse route `description`.
- Google provider can request/parse `staticDuration` if added.
- Google provider can request/parse `localizedValues` or ignores it safely if not used.
- `routingPreference: TRAFFIC_AWARE` is included if adopted.
- Existing saved places still work without `placeId`.

Use mocked fetches for Google API tests; do not call real Google APIs from unit tests.

## Manual validation target

Primary regression case:

```txt
Origin: Garðabær, 210
Destination: Þorlákshöfn, 815 / Þorlákshöfn
Expected route option: Route 39 / Þrengslavegur appears and is fastest/first when Google reports it fastest.
```

Also test:

- Egilsstaðir -> Garðabær
- Reykjavík -> Þorlákshöfn
- Garðabær -> Vestmannaeyjar -> select Þorlákshöfn ferry port
- Garðabær -> Landeyjahöfn
- Garðabær -> Selfoss
- Garðabær -> Akureyri

The goal is not that Teskeið always exactly mirrors Google Maps consumer UI in every detail, but it must not miss the obviously shorter/faster Þorlákshöfn route when Google can identify it.

For `Egilsstaðir -> Garðabær`, the target is stricter:

- Teskeið should show route distances/durations that are explainably close to Google Maps consumer UI.
- If durations differ because Teskeið is using traffic-unaware/static duration while Google Maps uses traffic-aware duration, either align the API request or document why exact parity is not possible.
- If Google Maps returns a third route and Teskeið cannot, document whether the API did not return it or whether Teskeið discarded it.

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid` on localhost with Google Maps and Ferðaveður enabled.

1. Search directly for `Þorlákshöfn` as destination from `Garðabær`.
   - Expected: route options include the shorter/faster Þrengslavegur / Route 39-style route if Google returns it.
   - Expected: the fastest route is listed first.
   - Expected: the 68 km Route 427 route may still appear as an alternative, but not as the only/fastest route if Google says Route 39 is faster.
2. Search for `Þorlákshöfn, 815` if autocomplete supports it.
   - Expected: same as above.
3. Try the Vestmannaeyjar flow.
   - Select `Vestmannaeyjar`.
   - Choose `Þorlákshöfn`.
   - Expected: route options are for driving to Þorlákshöfn and include the sensible shorter route if Google returns it.
4. Select a saved/recent Þorlákshöfn place if available.
   - Expected: it still works, even if saved places do not yet carry Place ID.
   - Note: saved places may still route by lat/lon until a future migration stores place IDs.
5. Confirm no regressions in normal destinations:
   - `Garðabær -> Selfoss`
   - `Garðabær -> Akureyri`
   - `Reykjavík -> Akranes`
6. Compare `Egilsstaðir -> Garðabær` with Google Maps.
   - Expected: Teskeið route distances match or nearly match the same Google Maps route options.
   - Expected: Teskeið durations are close to Google Maps `Leave now` durations if `TRAFFIC_AWARE` is adopted.
   - Expected: if Google Maps shows three routes but Teskeið shows two, Claude Code documents whether Google Routes API returned only two or whether one was filtered out.
   - Expected: route descriptions, if added, make it clear which Teskeið option maps to which Google Maps option.
7. Confirm final weather calculation uses the selected route option.
   - Pick the shorter Þorlákshöfn route.
   - Continue through the wizard.
   - Expected: result map and weather points follow that selected route, not the unselected alternative.

Do not test production API keys, billing, Vercel env, Supabase schema or SQL as part of this unless Stebbi explicitly asks.

## Acceptance criteria

- Place ID is preserved from Google/server place search into route calculation when available.
- Google Routes receives a real `placeId` waypoint instead of raw coordinates for real Google-selected places.
- Manual/curated/saved places without Place ID still work.
- Route alternatives remain sorted by fastest duration first.
- For Google-selected places, route options use route settings that are intentionally chosen to match Google Maps `Leave now` as closely as possible.
- Route option display includes Google route description when available, or Claude Code documents why not.
- Egilsstaðir -> Garðabær route durations are explainably close to Google Maps consumer UI.
- If Google Maps shows an extra route that Routes API does not return, the limitation is documented rather than silently ignored.
- Þorlákshöfn direct selection no longer gets stuck on the obviously longer route when Google returns the shorter/faster route.
- No SQL/RLS/auth changes are made unless separately approved.

## Commands Codex ran

Read-only:

```powershell
Get-Date -Format 'yyyy-MM-dd HH:mm'
Get-ChildItem -File 'ai-handoff' | Select-Object Name,Length | Sort-Object Name | Select-Object -Last 10
$i=0; Get-Content -Encoding UTF8 'components/weather/PlaceSearch.tsx' | ForEach-Object { $i++; if ($i -ge 1 -and $i -le 185) { '{0,4}: {1}' -f $i, $_ } }
$i=0; Get-Content -Encoding UTF8 'lib/weather/google.server.ts' | ForEach-Object { $i++; if ($i -ge 1 -and $i -le 190) { '{0,4}: {1}' -f $i, $_ } }
$i=0; Get-Content -Encoding UTF8 'app/api/teskeid/weather/travel/routes/route.ts' | ForEach-Object { $i++; '{0,4}: {1}' -f $i, $_ }
Get-Content -Encoding UTF8 'ai-handoff/2026-07-08-0625-todo-067-v170-codex-placeid-routing-fidelity.md'
Get-Date -Format 'yyyy-MM-dd HH:mm'
$i=0; Get-Content -Encoding UTF8 'lib/weather/google.server.ts' | ForEach-Object { $i++; if ($i -ge 21 -and $i -le 32) { '{0,4}: {1}' -f $i, $_ }; if ($i -ge 138 -and $i -le 152) { '{0,4}: {1}' -f $i, $_ } }
```

Docs referenced by Codex:

- https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
- https://developers.google.com/maps/documentation/routes/reference/rest/v2/Waypoint

Write:

```txt
Created this handoff file only.
```

## Óvissa / þarf að staðfesta

- Claude Code must verify the exact Place ID field name exposed by the installed `@googlemaps/js-api-loader` / Places library types before implementation.
- It is not guaranteed that Place ID alone fixes the Þorlákshöfn case. Test `routingPreference: TRAFFIC_AWARE` and route descriptions as part of this fidelity pass.
- It is not guaranteed that Google Routes API can return exactly the same alternative count as Google Maps consumer UI for every origin/destination. If not, Claude Code should document the gap and not pretend parity exists.
- Saved places currently do not store Place ID. Full parity for saved/recent places may need a later migration, but that is out of scope unless Stebbi explicitly approves SQL work.
