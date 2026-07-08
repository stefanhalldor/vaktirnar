# TODO-067 v202 - Codex review of v201 via-waypoint plan

Created: 2026-07-08 13:27
Timezone: Atlantic/Reykjavik
Author: Codex
Status: Review/recommendation. No app code changed by Codex.

## Recommendation

Codex recommends this decision:

1. Choose **SHORTER_DISTANCE Option A: remove it entirely** from the route picker path for now.
2. Approve a **narrow curated via-waypoint experiment** for capital-area -> Þorlákshöfn.

Reason: `SHORTER_DISTANCE` was tested live and returned the same Route 427 corridor. It now adds noise without solving the problem. A curated via-waypoint is the next rational experiment because it asks Google to compute a real route geometry through the expected corridor instead of hoping Google discovers that corridor as an alternative.

## Findings

### High - Curated route generation must be shared by route picker and final submit

v201 mentions trigger logic in the routes API handler. Be careful: final submit also recomputes `provider.getRouteOptions()` and matches `selectedRouteId`.

Current final submit path:

- `app/api/teskeid/weather/travel/routes/route.ts` returns selectable route options.
- `app/api/teskeid/weather/travel/route.ts` recomputes `provider.getRouteOptions()` and finds `selectedRouteId`.

If the curated option is only appended in the route-picker API handler, it can appear in the UI but fail later with `selected_route_unavailable`.

Recommended implementation:

- Put the curated option inside `googleProvider.getRouteOptions()` or a shared helper called by that provider.
- Then both route picker and final submit see the same route set and stable geometry id.
- If route API sorting remains, it can still sort the returned list, but it should not be the only place that knows about curated options.

### High - Remove or gate `SHORTER_DISTANCE` before testing the curated route

Do not leave the v198 `SHORTER_DISTANCE` option active while testing the curated route. It creates an extra Route 427 card and makes visual validation harder.

Recommended cleanup for this pass:

- remove `requestedReferenceRoutes: ["SHORTER_DISTANCE"]`,
- remove `routes.routeToken` from the field mask unless otherwise needed,
- remove exact/near duplicate `SHORTER_DISTANCE` logic,
- remove `SHORTER_DISTANCE` label branch from the picker,
- remove or defer the `routeOptionShorterDistance` translation key,
- remove `SHORTER_DISTANCE`-specific tests.

Keep:

- Place ID flow,
- `waypointFor`,
- `TRAFFIC_AWARE`,
- geometry-based route ids that do not include duration,
- route descriptions,
- provider-level duration sorting,
- dev diagnostics for route results.

### Medium - Trigger by destination radius as well as Place ID

Saved/recent places still do not store `placeId`. If the curated trigger only checks the Þorlákshöfn Place ID, then the fix will not activate when a returning user taps saved/recent Þorlákshöfn.

Recommended first trigger:

- destination matches known Þorlákshöfn Place ID **or** destination coordinates are within a small radius around Þorlákshöfn,
- origin is in a capital-area bounding box/radius,
- origin is not in Reykjanes/southwest exclusions such as Keflavík, Grindavík, Vogar,
- destination is not already on a route where Route 427 is expected.

This keeps the trigger narrow while not depending entirely on `placeId`.

### Medium - Via waypoint choice is the main risk

Google docs support intermediate waypoints and `via: true` pass-through waypoints, but Google warns that pass-through waypoints are strict and can cause severe detours or `ZERO_RESULTS` if the waypoint is not accessible.

Recommended experiment shape:

- Start with one coordinate verified visually on the Route 39 / Þrengslavegur road surface.
- Do not rely blindly on public road endpoint coordinates. One public listing for Þrengslavegur appears to have a suspicious latitude typo on the south endpoint.
- Test both:
  - `intermediates: [{ location: { latLng }, via: true }]`
  - and, if `via: true` fails, the same intermediate without `via`.
- Use whichever gives a valid, sensible Google-computed geometry.

The route should still be Google-computed, not hand-drawn.

### Medium - Curated option should be clearly labelled but quiet

Design.md relevant points:

- keep app UI clear, practical, mobile-first,
- use short natural text,
- all user text belongs in `messages/is.json` and `messages/en.json`,
- status/meaning should not be color-only,
- controls should not cause layout shift or mobile overflow.

Recommended label:

- Icelandic: `Um Þrengslaveg`
- English: `Via Þrengslavegur`

Do not over-explain in the card. The route description/distance/duration and map path should carry the meaning.

### Low - v201 timestamp looks inconsistent

The v201 filename and header say `13:30`, but Codex's local `Get-Date` returned `13:25` and then `13:27` while reading/reviewing it. This is harmless for the product decision, but future handoffs should use the actual local timestamp from the time command.

## Suggested implementation plan for Claude Code

```md
TODO-067 via-waypoint experiment implementation

Stebbi/Codex decision:
- Remove SHORTER_DISTANCE from active route options.
- Implement a narrow curated Þrengslavegur via-waypoint experiment for capital-area -> Þorlákshöfn.

Implementation requirements:

1. Clean up SHORTER_DISTANCE:
   - Remove `requestedReferenceRoutes: ["SHORTER_DISTANCE"]` from `getRouteOptions`.
   - Remove `routes.routeToken` from field mask unless still needed.
   - Remove SHORTER_DISTANCE-specific dedupe/logging/tests/UI label branch.
   - Keep Place ID, TRAFFIC_AWARE, geometry fingerprint ids, route descriptions, duration sorting, and dev diagnostics.

2. Add curated route support inside `googleProvider.getRouteOptions()` or a shared provider helper:
   - Trigger only for destination Þorlákshöfn plus capital-area origin.
   - Trigger by known destination Place ID OR destination coordinate radius.
   - Exclude Reykjanes/southwest origins where Route 427 may be right.
   - Make one extra Google Routes request with a Route 39/Þrengslavegur intermediate waypoint.
   - Prefer `via: true` if it produces a sensible route; otherwise test non-via intermediate.
   - Silent fallback: if the curated request fails or returns no route, return only normal Google routes.

3. Curated option shape:
   - Label in `labels`: `CURATED_VIA_THRENGSLAVEGUR`.
   - Add a translated UI label: `Um Þrengslaveg` / `Via Þrengslavegur`.
   - Use Google route polyline/distance/duration from the curated response.
   - Use the same geometry fingerprint id logic, with a curated prefix or label-safe id so it remains stable.
   - Do not replace the Google default silently.

4. Filter bad curated results:
   - Do not show curated route if it is effectively the same corridor as the default.
   - Do not show it if distance/duration are wildly implausible.
   - Keep dev diagnostics explaining whether curated route was added, skipped, failed, or filtered.

5. Tests:
   - SHORTER_DISTANCE removed from request body and field mask.
   - Curated request is made for capital-area -> Þorlákshöfn.
   - Curated request is not made for unrelated destinations.
   - Curated request is not made for Keflavík/Grindavík/Vogar -> Þorlákshöfn.
   - Curated route is included with correct label when Google returns valid geometry.
   - Curated route is omitted silently on ZERO_RESULTS/error.
   - Final submit can match a selected curated route id.

Do not touch SQL, RLS, Supabase, saved-place schema, deployment config, or production data.
```

## Localhost checks for Stebbi

After Claude Code implements the next experiment:

1. Open `/auth-mvp/vedrid` on localhost.
2. Use typed Google suggestions for `Garðabær -> Þorlákshöfn`.
3. Expected route picker:
   - normal Google Route 427 option,
   - plus a distinct option labelled `Um Þrengslaveg` if Google computes it successfully.
4. Inspect the map:
   - the curated option should visibly follow Þrengslavegur / Route 39,
   - it should not follow Route 427 / Krýsuvíkurvegur.
5. Inspect distance/duration:
   - should be plausible for the expected route,
   - not a tiny variant of the same Route 427 corridor.
6. Select `Um Þrengslaveg` and continue through the wizard.
7. Expected: no `Valin leið fannst ekki` / `selected_route_unavailable`.
8. Regression checks:
   - `Keflavík -> Þorlákshöfn`: should not force/show Þrengslavegur unless clearly appropriate.
   - `Grindavík -> Þorlákshöfn`: should not force/show Þrengslavegur.
   - `Garðabær -> Selfoss`: no Þorlákshöfn-specific route.
   - `Garðabær -> Akureyri`: no Þorlákshöfn-specific route.

Do not test production, run migrations, or modify Supabase data.

## Sources checked

- Google Routes intermediate waypoints: https://developers.google.com/maps/documentation/routes/intermed_waypoints
- Google Routes pass-through waypoints: https://developers.google.com/maps/documentation/routes/pass-through
- Google Routes shorter-distance routes: https://developers.google.com/maps/documentation/routes/shorter-distance-routes
- Design.md in this repo for route-card UI/microcopy considerations.

## Files changed by Codex

- Added this review/recommendation file only.

## Tests run

- Not run for this review. This is a plan/risk review based on v201, current code inspection, Stebbi's localhost diagnostics, Google documentation, and Design.md.

## Uncertainty / needs confirmation

The via coordinate must be selected and verified visually. The first attempt may return `ZERO_RESULTS` or an unreasonable detour. That should be treated as normal experiment feedback, not a failure of the whole approach.
