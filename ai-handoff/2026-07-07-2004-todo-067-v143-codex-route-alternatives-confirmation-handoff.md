# TODO 067 - v143 Codex handoff: route alternatives and route confirmation

Created: 2026-07-07 20:04  
Timezone: Atlantic/Reykjavik  
From: Codex  
To: Stebbi / Claude Code  
Purpose: Next implementation phase after v141/v142 auth-redirect resilience.

## Goal

Fix route trust before adding more weather intelligence.

When user selects `Frá` and `Til`, Teskeið should fetch route options, show the actual drivable route choices, put the shortest returned route first, and require the user to confirm which route should be weather-assessed.

The weather result must then be calculated from the selected route, not silently from Google's first/default route.

## Important product wording

Do not say "allar mögulegar leiðir".

Google Routes does not promise every possible route. Use wording like:

- `Leiðir sem Google fann`
- `Stysta leið af þeim sem fundust`
- `Sjálfgefin Google-leið`
- `Önnur leið`

This matters because Stebbi explicitly noticed that Reykjavík -> Selfoss can pick a route that does not match what the user expects.

## Source notes from Google docs

Codex checked official Google docs on 2026-07-07:

- Alternative routes: `computeAlternativeRoutes: true` can return the default route plus up to three alternatives, but alternatives are not always available and can increase response time. Route labels include `DEFAULT_ROUTE` and `DEFAULT_ROUTE_ALTERNATE`. Include `routes.polyline` in the field mask to draw each route.  
  Source: https://developers.google.com/maps/documentation/routes/alternative-routes

- Shorter-distance route: Google also has `requestedReferenceRoutes: ["SHORTER_DISTANCE"]`, which returns a default route and a route optimized for distance, but the feature is documented as Experimental/pre-GA and may choose local roads, dirt roads, or other unconventional legal paths. Do not silently use it as MVP default without Stebbi approving that product tradeoff.  
  Source: https://developers.google.com/maps/documentation/routes/shorter-distance-routes

- REST reference confirms `computeAlternativeRoutes` and `requestedReferenceRoutes` are separate request fields.  
  Source: https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes

## Implementation plan for Claude Code

### Phase B1 - Provider route options

Extend provider types in `lib/weather/provider.types.ts`.

Add a provider-agnostic type similar to:

```ts
export type RouteOption = RouteGeometry & {
  id: string
  routeIndex: number
  provider: 'google' | 'mapbox'
  labels: string[]
  isDefault: boolean
  displayLabel?: string
}
```

Extend `WeatherMapProvider`:

```ts
getRouteOptions(from: PlaceCandidate, to: PlaceCandidate): Promise<RouteOption[]>
```

Keep `getRouteGeometry` for compatibility, implemented as first/legacy fallback if needed.

### Phase B2 - Google provider route alternatives

In `lib/weather/google.server.ts`:

1. Update `RoutesResponse` to parse `routeLabels`.
2. Add `getRouteOptions`.
3. Request alternatives with `computeAlternativeRoutes: true`.
4. Include at least this field mask:

```text
routes.polyline,routes.distanceMeters,routes.duration,routes.routeLabels
```

5. Continue using `polylineEncoding: 'GEO_JSON_LINESTRING'` if it works with alternatives.
6. Return all routes with stable ids.
7. Sort presentation later by distance, not inside low-level parsing unless documented clearly.

Do not add `requestedReferenceRoutes: ["SHORTER_DISTANCE"]` in this phase unless Stebbi explicitly approves experimental shorter-distance routing. If Claude Code wants to include it, put it behind a server env flag and default it off.

### Phase B3 - Route options API

Add a narrow API endpoint, for example:

```text
POST /api/teskeid/weather/travel/routes
```

Responsibilities:

1. Same auth/feature gate pattern as `/api/teskeid/weather/travel`.
2. Same origin/destination validation.
3. Fetch route options from provider.
4. Sort options for response:
   - shortest `distanceM` first
   - if distances tie, shorter `durationS` first
5. Return only bounded route data needed by UI:
   - id
   - routeIndex
   - labels
   - distanceM
   - durationS
   - points/polyline for display
   - displayLabel

Error behavior:

- provider missing -> `provider_not_configured`
- no routes -> `route_unavailable`
- auth failure -> JSON `401`, not redirect

### Phase B4 - Selected route drives weather calculation

Update `/api/teskeid/weather/travel` to accept `selectedRouteId`.

Security / correctness rule:

Do not trust client-submitted route geometry for weather assessment.

Preferred flow:

1. Client sends origin, destination, selectedRouteId, trailerKind, thresholds.
2. Server recomputes route options for the same origin/destination.
3. Server selects the matching `selectedRouteId`.
4. Server samples weather points from that selected route.
5. If selectedRouteId is missing or stale:
   - return `selected_route_unavailable` if the route step is now required
   - or fall back to shortest returned route only if explicitly documented and surfaced to the user

This costs another Routes call, but keeps the weather assessment deterministic and not based on tamperable client geometry. Later, we can optimize with signed route payloads or short-lived server cache if needed.

### Phase B5 - Route selection UI

Update `components/weather/RouteSelectionStep.tsx` and `app/auth-mvp/vedrid/FerdalagidClient.tsx`.

Expected UX:

1. User chooses `Frá` and `Til`.
2. App fetches route options.
3. Show heading: `Leiðir sem Google fann`.
4. Show route options as tappable rows/cards:
   - `Stysta leið`
   - `Sjálfgefin Google-leið`
   - `Önnur leið`
   - distance
   - driving time
   - difference vs shortest or fastest where useful
5. Interactive map draws the selected route's actual polyline.
6. Selecting a different route updates the highlighted route on map.
7. Confirm button should mean: "Use this route for weather assessment".
8. If only one route is returned, still show it and require/allow explicit confirmation.
9. If Google map fails, route cards must still work. The map is explanation, not the only control.

State rules:

- If origin or destination changes, clear route options, selected route, weather result, selected map point, heatmap selection, and stale error.
- If route options are re-fetched, do not keep a stale selected route unless id still matches.
- Result navigation back to `Leið` should preserve selected route until origin/destination changes.

Design.md constraints:

- Mobile-first.
- Stable map height.
- No horizontal overflow.
- Touch targets at least 40px.
- Text must wrap cleanly at 360px.
- Loading state must not resize controls.
- Do not nest cards inside cards; use simple selectable rows or shallow panels.

### Phase B6 - Result/audit consistency

The selected route must be visible in the result:

- Result summary should show the selected route label and distance/time.
- Audit map must draw the selected route polyline.
- Weather points must lie on/near the selected route.
- Route point detail must continue to show distance from route/met.no point distance as already implemented.

Do not compute full weather for all alternative routes in this phase. Keep that for the later "weather-better alternative" phase.

## Suggested message keys

Add IS/EN keys under `teskeid.vedrid.ferdalagid`:

```text
routeOptionsTitle
routeOptionsLoading
routeOptionsUnavailable
routeOptionsRetry
routeOptionShortest
routeOptionDefault
routeOptionOther
routeOptionGoogleFound
routeOptionDistance
routeOptionDuration
routeOptionExtraMinutes
routeOptionSelected
routeConfirmSelected
selectedRouteUnavailable
```

Use natural Icelandic, for example:

- `Leiðir sem Google fann`
- `Stysta leið`
- `Sjálfgefin Google-leið`
- `Velja þessa leið`
- `Ekki tókst að sækja leiðir. Reyndu aftur.`

## Tests Claude Code should add/update

Provider / server:

1. Google provider parses multiple routes with labels.
2. Route options sort shortest first in API response.
3. Single-route response still works.
4. No-routes response maps to `route_unavailable`.
5. `/api/teskeid/weather/travel/routes` unauthenticated returns JSON `401`.
6. `/api/teskeid/weather/travel` rejects stale/unknown `selectedRouteId` or handles it as documented.
7. Weather calculation uses selected route, not always route `0`.

Client:

1. Changing origin/destination clears selected route and old result.
2. Selecting a route changes selected route id.
3. Confirm is disabled until route is selected if options are available.
4. Map failure still allows route selection from text rows.

Run:

```text
npm run type-check
npm run test:run
git diff --check
```

## Localhost checks for Stebbi

1. Restart localhost after Claude Code implements this phase.
2. Open `/auth-mvp/vedrid` as a logged-in user with weather access.
3. Choose `Reykjavík -> Selfoss`.
4. Expected before result:
   - user sees `Leiðir sem Google fann`
   - shortest returned route is first
   - distance and time are visible for each route
   - selecting each route changes the route line on the map
5. Select the route Stebbi expects and continue through trailer/thresholds.
6. Expected result:
   - summary distance/time matches selected route
   - audit map shows selected route, not some other Google default
   - weather points follow selected route
7. Go back to `Leið`.
8. Expected: selected route is still visible unless origin/destination was changed.
9. Change destination.
10. Expected: route options and old result are cleared; new route options are fetched.
11. Test a long route like `Garðabær -> Akureyri`.
12. Expected: route options still load without layout overflow; selected route controls remain usable on 360-390px mobile width.
13. Test browser/map failure if possible.
14. Expected: text route options still work and the user is not blocked by the map.

Do not test by changing production keys, Vercel env, Supabase policies, or billing settings.

## Risks / guardrails

- Google alternatives are not literally every route.
- Alternative route requests can add latency.
- Recomputing route options in the final weather endpoint adds another Routes call. This is acceptable for correctness in beta but should be watched.
- `SHORTER_DISTANCE` is experimental/pre-GA and may choose awkward legal roads. Keep it out of MVP unless Stebbi explicitly approves.
- Do not mix this with Vestmannaeyjar ferry fallback, saved places, or login UI clarity. Those are next phases.

## Files likely touched

```text
lib/weather/provider.types.ts
lib/weather/google.server.ts
lib/weather/provider.server.ts
app/api/teskeid/weather/travel/routes/route.ts
app/api/teskeid/weather/travel/route.ts
app/auth-mvp/vedrid/FerdalagidClient.tsx
components/weather/RouteSelectionStep.tsx
components/weather/TravelAuditMap.tsx (only if selected route result contract needs small adjustment)
messages/is.json
messages/en.json
lib/__tests__/*
```

## Sequencing note

v141/v142 auth redirect fix should be accepted or at least kept in place before this phase. Route alternatives will add another API call in the same flow, so the JSON-401 API behavior from v141 is a prerequisite.

No SQL should be needed for this phase.

## What Codex did

Codex created this handoff only. No app code was changed. No SQL was run. No migrations were created. No commit, push, deploy, or production action was performed.
