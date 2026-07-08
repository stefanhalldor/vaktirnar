# TODO-067 v188 - Codex addendum - localhost route fidelity still failing

Created: 2026-07-08 11:35
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi / Claude Code
Builds on: `2026-07-08-1133-todo-067-v187-codex-v186-placeid-routing-review.md`

## Findings

### High - Localhost proves the primary Þorlákshöfn route-fidelity problem is still not solved

Stebbi tested v186 locally on `2026-07-08` and the route picker still shows only one route for:

```text
Garðabær -> Þorlákshöfn
```

Observed in Stebbi's localhost screenshot:

```text
Leiðir sem Google fann

Fljótlegasta leið
Krýsuvíkurvegur og Suðurstrandarvegur/Leið 427
67 km
58 mín.
```

This is the route Stebbi describes as "leið sem enginn keyrir". The expected product outcome is that the sensible Þrengslavegur / Route 39 option appears, roughly the Google Maps consumer route around `51 km / 42 min`, and is first when Google treats it as fastest.

This means v186 may have improved the technical Place ID plumbing, but it did not solve the core user-visible trust problem. Do not describe v186 as having fixed "same routes as Google Maps" until this is understood or explicitly accepted as an API limitation.

### High - v187 route-id blocker still stands, but it is no longer enough as the next release gate

v187 correctly flags that traffic-aware `durationS` must not be part of the stable route id. That still needs fixing.

But after Stebbi's localhost test, the route-id fix alone cannot be the whole next step. Even before the user continues to the weather result, the route selection step is missing the route that matters.

Release gate should now be:

1. Stable selected-route id fixed.
2. Route provider diagnostics prove what Google Routes is actually returning for Þorlákshöfn.
3. Either Route 39 appears through an accepted API setting, or Claude Code documents why Google Routes API will not return it and proposes a fallback that Stebbi explicitly approves.

### Medium - Need to verify actual request and response, not infer from UI

The screenshot confirms the product failure, but not the exact cause.

Claude Code should capture or log the local route-options provider facts for this one case:

- whether the frontend-selected `destination.placeId` is present and real,
- the exact Google Routes request shape, excluding API key,
- whether origin and destination are sent as `{ placeId }` or `{ location: { latLng } }`,
- `routingPreference`,
- whether `computeAlternativeRoutes` is true,
- returned route count,
- route labels,
- descriptions,
- distance/duration for each route.

Do this in a safe local/dev-only way. Do not log API keys, auth cookies, Supabase session data or user-identifying data beyond the route names needed for this debugging.

## Updated recommendation

Claude Code should not proceed as if Place ID + `TRAFFIC_AWARE` is enough. The next technical pass should be a small provider-fidelity experiment, not broad UI work.

Recommended sequence:

1. Fix v187 High: route id must not include traffic-aware `durationS`.
2. Add a small diagnostic path for local route-options debugging, or temporarily log sanitized provider request/response details in development only.
3. Test these variants for `Garðabær -> Þorlákshöfn`:
   - current v186 request,
   - `TRAFFIC_AWARE_OPTIMAL`,
   - explicit `departureTime: now`,
   - `languageCode: 'is'` and `regionCode: 'IS'`,
   - `requestedReferenceRoutes: ['SHORTER_DISTANCE']`.
4. Record which variants return Route 39 / Þrengslavegur.
5. Bring findings back to Codex/Stebbi before turning any experimental route mode on for production.

## Why `SHORTER_DISTANCE` is now worth testing

Codex re-checked official Google docs on `2026-07-08`.

Google documents `requestedReferenceRoutes: ['SHORTER_DISTANCE']` for Compute Routes. The docs say it returns the default ETA-optimized route and a shorter-distance route, labelled with `SHORTER_DISTANCE`, when request criteria are met. The docs also say this feature is Experimental/pre-GA and can prefer unusual but legal paths such as local roads or dirt roads.

So this should not be enabled blindly as the new global default. But for the exact Þorlákshöfn failure, it is the next plausible Google-native option to test because the missing sensible route is materially shorter than Route 427.

If it returns Þrengslavegur / Route 39 reliably:

- consider adding it as an extra provider route option,
- label it clearly, e.g. `Styttri leið sem Google fann`,
- dedupe it against normal alternatives,
- sort by duration for display,
- keep the normal Google default/alternatives too.

If it returns weird local-road routes or still does not return Route 39:

- do not ship it globally,
- move to a curated Þorlákshöfn corridor fallback proposal.

## Possible fallback if Google Routes still refuses Route 39

If official Google Routes variants still only return Route 427, then this becomes a product fallback decision, not a simple Place ID bug.

The likely fallback is a curated corridor route option for known Þorlákshöfn cases:

- detect destination/ferry port as Þorlákshöfn,
- request a separate route through a safe via point on Þrengslavegur / Route 39,
- show it as a separate option,
- label it carefully as curated/suggested, not as a standard Google alternative,
- weather-assess the selected curated route exactly like any other selected route.

Important constraint: Google documents that alternative routes are not returned for requests with intermediate waypoints. So a curated via-point approach should be a separate route computation, not mixed into the standard `computeAlternativeRoutes` request.

Do not implement this fallback without Stebbi's explicit approval, because it introduces domain-specific routing logic.

## Localhost checks for Stebbi

After Claude Code's next pass, use `/auth-mvp/vedrid` on localhost.

Primary check:

1. Search origin: `Garðabær`.
2. Search destination: `Þorlákshöfn` via Google autocomplete, not saved places.
3. Expected: route picker no longer shows only `Krýsuvíkurvegur og Suðurstrandarvegur/Leið 427`.
4. Expected: Þrengslavegur / Route 39-style route appears if the adopted API strategy can produce it.
5. Expected: if only Route 427 still appears, the handoff must say exactly which API variants were tried and what Google returned.

Secondary checks:

1. Select the sensible route if present and continue to result.
2. Expected: weather map follows the selected route.
3. Wait 1-2 minutes between route selection and submit.
4. Expected: final result does not fail with `Valin leið fannst ekki`, confirming v187 route-id fix.
5. Test `Garðabær -> Selfoss` and `Garðabær -> Akureyri` to make sure new route logic does not add weird extra routes.

Do not test production API keys, Vercel env, Supabase, SQL, RLS, billing or deployment as part of this.

## Sources

Official Google docs checked by Codex:

- Compute Routes: https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
- Alternative routes: https://developers.google.com/maps/documentation/routes/alternative-routes
- Shorter distance routes: https://developers.google.com/maps/documentation/routes/shorter-distance-routes

Codex created this addendum only. No app code, SQL, migrations, env, commit, push or deploy changes were made.

## Óvissa / þarf að staðfesta

- Codex did not inspect the live Network request from Stebbi's browser. The screenshot proves the UI result, not the raw Google response.
- Codex did not make live Google API calls.
- `SHORTER_DISTANCE` is a hypothesis to test, not an approved production behavior.
