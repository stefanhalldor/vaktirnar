# TODO-067 v187 - Codex review - v186 Place ID routing fidelity

Created: 2026-07-08 11:33
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi / Claude Code
Reviewed handoff: `2026-07-08-1130-todo-067-v186-claude-v170-placeid-routing-fidelity.md`

## Findings

### High - Traffic-aware duration is now part of the selected route ID, so the selected route can disappear between steps

`lib/weather/google.server.ts:119` and `lib/weather/google.server.ts:163` now set `routingPreference: 'TRAFFIC_AWARE'`.

That is a reasonable Google Maps parity move, but the route id still includes `durationS`:

- `lib/weather/google.server.ts:189` parses `route.duration`
- `lib/weather/google.server.ts:197` builds the fingerprint with `${route.distanceMeters}-${durationS}-...`
- `lib/weather/google.server.ts:199` returns `id = google-${fp}`

Then the final weather endpoint recomputes route options and requires an exact id match:

- `app/api/teskeid/weather/travel/route.ts:170-174`

This was already a little brittle, but v186 makes it materially riskier because `TRAFFIC_AWARE` duration is based on traffic conditions. Google documents that `departureTime` defaults to the request time, and that `duration` accounts for traffic when `routingPreference` is `TRAFFIC_AWARE` or `TRAFFIC_AWARE_OPTIMAL`.

Practical failure mode:

1. Route step fetches options at 11:30:00.
2. User selects route `google-637000-28140-...`.
3. User spends a minute in the next steps.
4. Final `/api/teskeid/weather/travel` recomputes options at 11:31:00.
5. Google returns the same route geometry, but traffic duration changes by a few seconds or minutes.
6. The id becomes `google-637000-28180-...`.
7. Exact match fails and the user gets `selected_route_unavailable`.

This is a prerelease blocker because it can turn a normal confirmed route into an error without the user doing anything wrong.

Recommended fix:

- Do not include traffic-aware `durationS` in the stable route id.
- Build route id from geometry/shape and stable-ish route identity instead:
  - distance,
  - route labels if useful,
  - normalized first/middle/last coordinates, or a compact hash of the returned coordinate sequence.
- Keep `durationS` for display and sorting, but not for identity.
- Add a focused test where the same geometry is returned twice with different `duration`, and the final selected-route match still succeeds.

If Claude Code wants a still safer approach later, the route step can return a short-lived signed server payload or cache key. That is probably too much for this pass; a geometry-based id is the smaller fix.

### Medium - Route endpoints still do not validate `placeId`, even though v186 now sends it to Google Routes

Both route APIs accept optional `placeId` in the type guard but do not actually validate its type or length:

- `app/api/teskeid/weather/travel/routes/route.ts:8-15`
- `app/api/teskeid/weather/travel/route.ts:53-60`

Then the candidate is built from raw body data:

- `app/api/teskeid/weather/travel/routes/route.ts:55` and `app/api/teskeid/weather/travel/routes/route.ts:63`
- `app/api/teskeid/weather/travel/route.ts:150` and `app/api/teskeid/weather/travel/route.ts:158`

And `waypointFor(...)` treats any truthy non-sentinel value as a real Google Place ID:

- `lib/weather/google.server.ts:72-80`

The normal UI sends a string, so this is not a user-facing bug in the happy path. But the API boundary is now looser than the provider assumption. A malformed or tampered authenticated request can send a non-string or huge string as `placeId`, and the provider will try to forward it to Google.

Recommended fix:

- Normalize optional place IDs at the API boundary:
  - accept only a non-empty string,
  - trim it,
  - enforce a conservative max length,
  - treat `confirmed` and `curated` as internal sentinels only if the server creates them, not as trusted client signals.
- Add tests for both route endpoints:
  - valid string `placeId` is preserved into `PlaceCandidate`,
  - empty string becomes no place ID / coordinate fallback,
  - non-string `placeId` is rejected or ignored consistently.

### Low - Route descriptions are truncated even though they are the main trust/debug signal

`components/weather/RouteSelectionStep.tsx:473-475` renders Google route descriptions with `truncate`.

For this specific feature, the description is not decorative; it is how Stebbi checks whether Teskeið's option corresponds to Google Maps, e.g. `via Þrengslavegur/Route 39` versus `via Suðurstrandarvegur/Route 427`.

Design.md also says to use `truncate` only when the full text is available elsewhere. Here it is not.

Recommended fix:

- Let description wrap to at least two lines on mobile, or show a full accessible label.
- Keep touch targets stable, but allow route rows to grow slightly when Google returns a useful route description.

## What looks good

- The Place ID path is well scoped and does not touch SQL, RLS, auth policy, saved-place schema, deployment or env config.
- `PlaceResult` and `RoutePlace` now carry `placeId?`.
- Browser Places path uses `place.id`; local Google Maps typings confirm `Place.id` exists.
- `/api/place/search` now returns provider `placeId`.
- Google provider uses `{ placeId }` for real IDs and falls back to coordinates for `confirmed` / `curated`.
- Official Google docs confirm Routes API waypoints support `placeId`, and the alternative-routes guide shows `routingPreference: "TRAFFIC_AWARE"` with `computeAlternativeRoutes: true`.

## Suggested next step for Claude Code

Fix only the high finding first:

1. Change route option id generation in `lib/weather/google.server.ts` so it does not include `durationS`.
2. Prefer a geometry-derived stable id.
3. Add or update tests so two responses with identical geometry and different `duration` produce the same id.
4. Add or update a final-travel endpoint test if there is an existing API test harness; otherwise note why not.
5. Re-run:

```text
npm run type-check
npm run test:run
```

Then, if still small, tighten `placeId` validation at the API boundary and remove the `truncate` from the route description.

## Localhost checks for Stebbi

Use `/auth-mvp/vedrid` on localhost with Google Maps enabled.

Primary check after Claude Code fixes the route id issue:

1. Search `Garðabær -> Þorlákshöfn` through Google autocomplete, not saved places.
2. Confirm route options show a sensible shorter/faster option if Google returns it.
3. Select that route.
4. Wait 1-2 minutes before continuing, to give traffic-aware duration a chance to drift.
5. Continue through the wizard.
6. Expected: final result does not fail with `Valin leið fannst ekki`.
7. Expected: result map follows the selected route.

Route description check:

1. On a route with multiple options, compare route card descriptions.
2. Expected: enough of the Google description is visible to distinguish the roads.
3. Especially check Þorlákshöfn and Egilsstaðir -> Garðabær.

Regression checks:

1. Saved/recent places still work even without Place ID.
2. Vestmannaeyjar ferry port flow still works with coordinate fallback.
3. `Garðabær -> Selfoss` and `Garðabær -> Akureyri` still fetch and confirm routes.
4. Do not test production API keys, Vercel env, Supabase, SQL, RLS, billing or deployment as part of this check.

## Commands / sources used by Codex

Read-only local commands included:

```text
Get-Content WORKFLOW.md
Get-Content Design.md
Get-Content ai-handoff/2026-07-08-1130-todo-067-v186-claude-v170-placeid-routing-fidelity.md
git status --short
git diff -- lib/weather/google.server.ts components/weather/PlaceSearch.tsx components/weather/RouteSelectionStep.tsx app/api/place/search/route.ts lib/weather/provider.types.ts lib/__tests__/weather-google.test.ts lib/__tests__/place-search-api.test.ts
Get-Content with line numbers for the changed/relevant files
Select-String in node_modules/@types/google.maps/index.d.ts for Place.id
Get-Content ai-handoff/README.md
Get-Date -Format 'yyyy-MM-dd HH:mm'
```

Codex also checked official Google docs:

- Routes `computeRoutes`: https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
- Routes `Waypoint`: https://developers.google.com/maps/documentation/routes/reference/rest/v2/Waypoint
- Alternative routes guide: https://developers.google.com/maps/documentation/routes/alternative-routes

Codex created this review file only. No app code, SQL, migrations, env, commit, push or deploy changes were made.

## Óvissa / þarf að staðfesta

- Codex did not run `npm run type-check` or `npm run test:run`; v186 handoff reports both green.
- Codex did not make real Google API calls, so Þorlákshöfn route parity still needs Stebbi localhost validation.
- The exact best route-id fingerprint should be chosen by Claude Code from the available route geometry shape. The important constraint is: do not include traffic-aware duration in the id.
