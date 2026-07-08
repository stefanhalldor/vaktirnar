# TODO-067 v200 - Codex addendum after live SHORTER_DISTANCE result

Created: 2026-07-08 13:22
Timezone: Atlantic/Reykjavik
Author: Codex
Status: Deeper analysis/addendum. No app code changed by Codex.

## New Diagnostic Result

Stebbi tested `Garðabær -> Þorlákshöfn` with typed Google suggestions and real Place IDs after v198.

The trace confirms:

```txt
originType: "placeId"
destType: "placeId"
rawRouteCount: 2
dedupedRouteCount: 2

DEFAULT_ROUTE:
  67,435 m
  3,510 s
  Krýsuvíkurvegur og Suðurstrandarvegur/Leið 427

SHORTER_DISTANCE:
  66,592 m
  3,620 s
  Krýsuvíkurvegur og Suðurstrandarvegur/Leið 427
```

Browser console also confirms typed Google selection with a real Þorlákshöfn Place ID:

```txt
[PlaceSearch] selected (google): {
  name: "Þorlákshöfn",
  placeId: "ChIJU1N290hC1kgRypBJRWS0YX4"
}
```

## Findings

### High - `SHORTER_DISTANCE` does not solve the Þorlákshöfn route fidelity issue

This is now conclusive for this route.

`SHORTER_DISTANCE` returned a slightly shorter variant of the same Route 427 / Krýsuvíkurvegur / Suðurstrandarvegur corridor. It did not find the expected Þrengslavegur / Route 39 route.

The returned shorter-distance route is:

- 843 m shorter than default,
- 110 seconds slower than default,
- same Google route description,
- visually the same corridor in Stebbi's screenshot.

So v198's experiment should be considered unsuccessful for the original product problem.

### High - Do not ship always-on `SHORTER_DISTANCE` as-is

Before this test, `SHORTER_DISTANCE` was a reasonable experiment. After this result, shipping it always-on creates user-facing noise without fixing the issue:

- it adds a second card,
- the second card looks like a meaningful alternative,
- but it is effectively the same Route 427 corridor and slower,
- and the user may think Teskeið found another useful option when it did not.

Codex recommendation:

- remove `SHORTER_DISTANCE` from always-on route options before release, or
- hide/filter `SHORTER_DISTANCE` routes when they are only near-duplicates of the same corridor.

Simplest safe choice: turn it back off unless Stebbi wants to keep it behind a dev-only/experiment flag for diagnostics.

### Medium - Exact-geometry dedupe is not enough for route-option quality

The current dedupe only merges identical geometry fingerprints. That is technically correct but insufficient for product quality.

This test produced two distinct geometries, so dedupe kept both. But product-wise they are near-duplicates:

- same description,
- same corridor,
- only ~1.25% distance difference,
- slower route.

If `SHORTER_DISTANCE` remains available, add a near-duplicate filter before displaying routes. Candidate rule:

- if a route has the same `description` as a faster route,
- and distance differs by less than 2 km or less than ~3%,
- and duration is not better,
- hide it from the route picker but keep a dev diagnostic count.

This should be treated as route-option cleanup, not as a fix for Route 39.

### Medium - Next route-fidelity attempt should be a curated via-waypoint experiment

Since these have all failed for Þorlákshöfn:

- coordinate routing,
- Place ID routing,
- `computeAlternativeRoutes`,
- `requestedReferenceRoutes: ["SHORTER_DISTANCE"]`,

the next likely fix is a very narrow curated route candidate for known failure corridors.

For this specific case, add an extra candidate route computed through a pass-through waypoint on or near Þrengslavegur / Route 39, then show it alongside the Google default if it is valid and materially different.

Important constraints:

- Do not replace Google default silently.
- Add the curated route as a selectable option with a clear label, e.g. `Um Þrengslaveg`.
- Use Google Routes to compute the actual geometry with the intermediate waypoint; do not hand-draw a polyline.
- Keep weather sampling and final submit based on the computed route geometry, like other route options.
- Keep this scoped to Þorlákshöfn / capital-area origin until validated.

Google docs support intermediate waypoints and pass-through waypoints, but warn that via waypoints are strict and can cause severe detours or `ZERO_RESULTS` if the waypoint is not accessible. So the waypoint must be selected carefully and tested.

Docs checked:

- Intermediate waypoints: https://developers.google.com/maps/documentation/routes/intermed_waypoints
- Pass-through waypoints: https://developers.google.com/maps/documentation/routes/pass-through
- Shorter distance routes: https://developers.google.com/maps/documentation/routes/shorter-distance-routes

### Medium - Detection scope must avoid making southwest-origin routes worse

A curated Þrengslavegur option should not trigger for every origin going to Þorlákshöfn.

Example: if the origin is Grindavík, Keflavík, Vogar, or another southwest/Reykjanes origin, Route 427 or other south-coast routing may be correct. Forcing Þrengslavegur there could be obviously wrong.

Suggested trigger for the first experiment:

- destination is Þorlákshöfn by known Place ID or radius around Þorlákshöfn,
- origin is in the capital-area cluster, not Reykjanes/southwest,
- Google default description includes Route 427 or distance is suspiciously long,
- curated candidate is materially shorter or matches expected route description.

Keep the trigger conservative. It is better to miss some valid cases than to introduce bad route suggestions widely.

## Recommended Next Handoff To Claude Code

```md
TODO-067 next step after v200:

The live SHORTER_DISTANCE test did not solve Þorlákshöfn.

Evidence:
- Place IDs are present end-to-end.
- Google returned 2 routes.
- Both are Route 427 / Krýsuvíkurvegur / Suðurstrandarvegur.
- SHORTER_DISTANCE is only 843 m shorter and 110 s slower.
- It is visually the same corridor, not Þrengslavegur / Route 39.

Please do not ship SHORTER_DISTANCE always-on as-is.

Recommended next implementation:

1. Turn SHORTER_DISTANCE off for production/use by default, or hide near-duplicate SHORTER_DISTANCE routes from the picker.
2. Create a narrow curated-route experiment for Garðabær/capital-area -> Þorlákshöfn:
   - Add one extra Google Routes request with an intermediate `via: true` waypoint on/near Þrengslavegur / Route 39.
   - Return it as a separate route option only if Google computes a valid route.
   - Label it clearly, e.g. `Um Þrengslaveg`.
   - Do not replace the default silently.
   - Keep final submit matching stable by geometry id, like other route options.
3. Add tests for:
   - curated option appears only for Þorlákshöfn/capital-area trigger,
   - no curated option for unrelated destinations,
   - no curated option for southwest/Reykjanes origins where Route 427 may be reasonable,
   - final submit can use selected curated route.
4. Keep saved-place `place_id` persistence separate.

Do not add SQL, migrations, Supabase changes, or saved-place schema work in this pass.
```

## Localhost checks for Stebbi

For the current v198 state:

1. Treat the live `SHORTER_DISTANCE` experiment as failed for Þorlákshöfn.
2. Do not validate success by seeing two cards; both cards are still Route 427.
3. If Claude Code keeps `SHORTER_DISTANCE` temporarily, test that near-duplicate Route 427 options are hidden or clearly not presented as useful alternatives.

For the next curated via-waypoint experiment, if Stebbi approves it:

1. Open `/auth-mvp/vedrid`.
2. Use typed Google suggestions for `Garðabær -> Þorlákshöfn`.
3. Expected: route picker shows Google default Route 427 and a distinct curated option labelled like `Um Þrengslaveg`.
4. Confirm the curated route map follows Route 39 / Þrengslavegur.
5. Confirm distance/duration are plausible, roughly around the expected 51 km / 42 min ballpark if Google computes it that way.
6. Select the curated option and continue; expected no `selected_route_unavailable`.
7. Regression checks:
   - `Keflavík -> Þorlákshöfn` should not force Þrengslavegur.
   - `Grindavík -> Þorlákshöfn` should not force Þrengslavegur.
   - `Garðabær -> Selfoss` and `Garðabær -> Akureyri` should not show Þorlákshöfn-specific curated options.

Do not test production, run migrations, or modify Supabase data for this route experiment.

## Files changed by Codex

- Added this review/addendum file only.

## Tests run

- Not run for this addendum. This is analysis of Stebbi's live localhost diagnostics plus official Google Routes documentation.

## Uncertainty / Needs Confirmation

The exact Þrengslavegur via-point should be chosen by testing. It must be accessible and placed on the intended road, because Google warns pass-through waypoints are strict and may fail or cause severe detours if poorly placed.

Also still unconfirmed: whether Google Routes will compute the expected Route 39 route when forced through an appropriate via-point. The next experiment should answer that before any broader product decision.
