# TODO-067 v201 - Claude handoff - SHORTER_DISTANCE revert + via-waypoint plan

Created: 2026-07-08 13:30
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Awaiting Stebbi decision on two open questions before implementation.

## Context

v198 shipped `requestedReferenceRoutes: ['SHORTER_DISTANCE']` always-on. Stebbi ran localhost
validation for `Garðabær -> Þorlákshöfn` (Google autocomplete, real Place IDs). Terminal output:

```
rawRouteCount: 2
dedupedRouteCount: 2

DEFAULT_ROUTE:   67,435 m / 3,510 s — Krýsuvíkurvegur og Suðurstrandarvegur/Leið 427
SHORTER_DISTANCE: 66,592 m / 3,620 s — Krýsuvíkurvegur og Suðurstrandarvegur/Leið 427
```

Both routes are Route 427. SHORTER_DISTANCE returned a 843 m shorter, 110 s slower variant of
the same corridor — not Þrengslavegur/Route 39. The experiment is conclusively failed for this
route.

Codex reviewed (v199, v200). Both agree: do not ship SHORTER_DISTANCE always-on as-is.

---

## Open decisions — Stebbi must choose before implementation

### Decision 1: What to do with SHORTER_DISTANCE

**Option A — Remove entirely** (Codex preferred, Claude agrees)
- Cleanest. One Google Routes call, one route card, no user-facing noise.
- Loses the infrastructure if it ever proves useful for other corridors.

**Option B — Keep with near-duplicate filter**
- Hide SHORTER_DISTANCE options that share the same `description` as a faster route
  and differ by less than 2 km or 3% in distance and are not faster.
- Adds code complexity for something that did not help here.

**Option C — Keep but dev-only**
- Gate behind `process.env.NEXT_PUBLIC_SHORTER_DISTANCE === 'true'` or `NODE_ENV !== 'production'`.
- Useful if Stebbi wants to keep the diagnostic logging in dev.

Recommendation: Option A. Remove SHORTER_DISTANCE and clean up the related label logic.
The translation key `routeOptionShorterDistance` can stay for now (unused keys are harmless)
or also be removed.

---

### Decision 2: Approve curated via-waypoint experiment for Þorlákshöfn?

This is the next most likely way to surface Route 39/Þrengslavegur.

The plan: for qualifying queries, add a second Google Routes API call with an intermediate
`via: true` pass-through waypoint placed on Þrengslavegur/Route 39. Return the computed
route as a selectable option alongside the Google default.

Key properties:
- Does not replace the Google default silently.
- Returns a real Google-computed geometry (distance, duration, polyline) — not a hand-drawn line.
- Weather sampling and final submit use the same geometry-based route id as all other options.
- Trigger is narrow: destination = Þorlákshöfn + origin is in the capital area (not Reykjanes/
  southwest, where Route 427 may be correct for e.g. Keflavík, Grindavík, Vogar).
- Label: something like `Um Þrengslaveg` (can be discussed).
- If Google returns ZERO_RESULTS for the via-waypoint, no curated option appears — silent fallback.

Scope of changes required:
- New constant(s): Þorlákshöfn Place ID or bounding box; capital-area origin bounding box;
  a via-waypoint coordinate on Route 39 (requires coordinate research/testing).
- `getRouteOptions` or a new `getCuratedRouteOption` function in `google.server.ts`.
- Trigger logic in the routes API handler.
- New translation key for the label.
- Tests: curated option appears for capital-area -> Þorlákshöfn, not for Reykjanes origins,
  not for unrelated destinations, final submit succeeds with selected curated route.

Risks:
- The via-waypoint coordinate must be on the accessible road surface. Google warns pass-through
  waypoints are strict and can fail or cause severe detours if poorly placed.
- This is still an experiment — Google may route via a small local street to hit the waypoint.
  The curated route must be visually inspected on localhost before commit/push.

This experiment does not touch SQL, RLS, Supabase, saved-places, or deployment config.

---

## State of uncommitted changes

All v170-v198 changes are uncommitted. Files changed relative to last commit:

- `lib/weather/google.server.ts` — waypointFor, TRAFFIC_AWARE, SHORTER_DISTANCE, sort, dedup
- `lib/weather/provider.types.ts` — description field on RouteOption
- `components/weather/PlaceSearch.tsx` — placeId on PlaceResult, dev logs
- `components/weather/RouteSelectionStep.tsx` — placeId on RoutePlace, label logic, description
- `app/api/teskeid/weather/travel/routes/route.ts` — normalizeOptionalPlaceId, dev log
- `app/api/teskeid/weather/travel/route.ts` — normalizeOptionalPlaceId
- `app/api/place/search/route.ts` — placeId on PlaceSearchResult
- `messages/is.json` + `messages/en.json` — routeOptionShorterDistance key
- `lib/__tests__/weather-google.test.ts` — new tests, fixed existing tests
- `lib/__tests__/weather-routes-api.test.ts` — placeId forwarding tests
- `lib/__tests__/place-search-api.test.ts` — placeId inclusion tests

If Stebbi chooses Option A (remove SHORTER_DISTANCE), those changes would be amended before commit.
If Stebbi also approves the via-waypoint experiment, it would be implemented and tested in the
same pass before commit.

Current test state: 58 files, 1888 passed, 27 skipped, 8 todo — all green.

---

## Recommended next session prompt for Codex

```
TODO-067 v201 — Stebbi has chosen [OPTION A/B/C] for SHORTER_DISTANCE
and [approved/deferred] the curated via-waypoint experiment for Þorlákshöfn.

If SHORTER_DISTANCE removed:
- Remove requestedReferenceRoutes from getRouteOptions in lib/weather/google.server.ts.
- Remove routes.routeToken from field mask.
- Remove SHORTER_DISTANCE dedup logic and related rawRouteCount/dedupedRouteCount diagnostics.
- Remove SHORTER_DISTANCE branch from RouteSelectionStep label logic.
- Remove or defer routeOptionShorterDistance translation key.
- Remove SHORTER_DISTANCE-specific tests from weather-google.test.ts.
- Keep: waypointFor, TRAFFIC_AWARE, geometry fingerprint, sort by durationS, placeId flow,
  dev diagnostics for placeId/originType/destType, normalizeOptionalPlaceId.

If via-waypoint experiment approved:
- Implement getCuratedRouteOption in google.server.ts:
  - One extra Google Routes call with a via-waypoint on Route 39/Þrengslavegur.
  - Only fires when destination is Þorlákshöfn + origin is in capital-area bounding box.
  - Silent fallback if Google returns ZERO_RESULTS or error.
  - Returns RouteOption with a new label, e.g. 'CURATED_VIA_WAYPOINT'.
- Wire into routes API handler.
- Add translation key for the label.
- Add tests for trigger/no-trigger conditions and final-submit path.
- Do not touch SQL, RLS, Supabase, saved-places, or deployment config.
```

---

## Files changed by Claude in this handoff

- Added this handoff file only.
