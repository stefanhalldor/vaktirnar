# todo-067 v099 - Codex handoff: route sampling density and precipitation threshold

Created: 2026-07-06 20:28
Timezone: Atlantic/Reykjavik
Author: Codex
Relevant TODO: `todo-067` Ferðalagið weather work
Builds on:
- `2026-07-06-2024-todo-067-v098-codex-v097-phase-a-review.md`

## Stebbi feedback

Stebbi tested a long route to Akureyri and saw only 15 weather points on the map. That is too sparse for long Iceland drives. It creates a real risk that Teskeið misses troublesome weather pockets between sampled points.

Stebbi also wants the travel precipitation threshold raised by 1 mm/klst. Light/small rain should not make travel look concerning, especially in summer. Wind should remain the main driver for travel warnings.

## Current code

Route weather sampling currently uses a fixed cap:

- `app/api/teskeid/weather/travel/route.ts:16` has `MAX_WEATHER_POINTS = 15`.
- `app/api/teskeid/weather/travel/route.ts:133-138` samples by `Math.ceil(allPts.length / MAX_WEATHER_POINTS)`, i.e. by route polyline point index count.
- `app/api/teskeid/weather/travel/route.ts:139-151` always includes destination by adding/replacing the last point.

This has two issues:

1. 15 points is too low for long routes like Garðabær/Reykjavík → Akureyri.
2. Index-based sampling depends on Google polyline vertex density, not road distance. A curvy area with many geometry vertices gets more sampling; a long straighter rural segment can get too few weather checks.

Precipitation threshold currently:

- `lib/weather/thresholds.ts:25-28` has `travel.cautionPrecipMmPerHour = 1.0`.
- `lib/weather/travel.ts` uses `precip > WEATHER_THRESHOLDS.travel.cautionPrecipMmPerHour`, so exactly the threshold value is still OK; values above it become `gult`.

## Decision

Do not use "all possible route polyline points" as weather points.

Reason: route polyline points are geometry/rendering points, not weather-analysis points. On a long route this could become hundreds or thousands of met.no point forecasts, with slow responses, more API traffic, bigger payloads and little extra signal because many neighboring coordinates resolve to similar forecast grids.

Instead use distance-based route sampling:

- sample by kilometers along the route, not by route vertex count
- always include origin and destination
- use a denser interval for long routes than today
- cap total point count to avoid accidental overload
- deduplicate forecast coordinates where possible so neighboring route markers can reuse the same fetched forecast
- preserve all route polyline points for drawing the route line separately

## Recommended sampling model

### First implementation target

Use:

- `TARGET_WEATHER_POINT_SPACING_M = 10_000`
- `MAX_WEATHER_POINTS = 80`
- `MIN_WEATHER_POINTS` not strictly needed, but short routes should still include origin, destination and reasonable midpoints if distance allows.

Behavior:

1. Compute cumulative route distance, as current code already does.
2. Create desired sample distances:
   - 0
   - every 10 km
   - final route distance
3. If desired count exceeds `MAX_WEATHER_POINTS`, increase spacing dynamically:
   - `effectiveSpacing = totalDistanceM / (MAX_WEATHER_POINTS - 1)`
4. For each desired distance, interpolate or choose nearest point along the route segment.
5. Store:
   - route point coordinate for map display
   - rounded forecast coordinate for met.no/cache
   - distanceFromOriginM
   - stable routeIndex
6. Fetch forecasts for unique rounded forecast coordinates, then assign results back to sampled route points.

Expected result:

- 50 km route: roughly 6 points
- 100 km route: roughly 11 points
- 400 km route: roughly 41 points
- 800 km route: roughly 80 points max

This is a much better trust/coverage tradeoff than a flat 15.

### Why not all polyline points?

Do not call met.no for every Google route geometry point.

Downsides:

- unnecessary API traffic
- slower user response
- higher chance of rate-limit or provider friction
- more cache churn
- many near-duplicate forecasts
- payload grows quickly once candidate × point summaries are added
- polyline density is not the same as weather risk density

The correct product goal is not "use every geometry point"; it is "do not miss meaningful route-weather variation." Distance-based sampling gets much closer to that.

## Precipitation threshold change

Change travel precipitation caution threshold from:

```ts
cautionPrecipMmPerHour: 1.0
```

to:

```ts
cautionPrecipMmPerHour: 2.0
```

Because current logic uses `precip > threshold`, this means:

- `2.0 mm/klst` is still OK
- `2.1 mm/klst` starts warning

Keep wind thresholds unchanged.

Do not make light rain a prominent warning. If precipitation is below the travel threshold:

- it can still appear in point details if the user taps a point
- it should not drive `gult`
- it should not dominate main result copy
- it should not trigger `nextCaution`

## Tests to update/add

### Sampling tests

Add focused tests for a pure sampling helper if possible. Prefer extracting route sampling out of the API route into a testable helper.

Test cases:

1. Short route includes origin and destination.
2. 100 km route with 10 km spacing yields about 11 points.
3. 400 km route yields about 41 points, not 15.
4. Very long route caps at `MAX_WEATHER_POINTS`.
5. Sampling is distance-based, not dependent on uneven source vertex density.
6. Destination is always included.
7. Duplicate rounded forecast coords are fetched once but can map to multiple route points if needed.

### Weather threshold tests

Update existing precipitation expectations:

1. `1.5 mm/klst` is green if wind is otherwise safe.
2. `2.0 mm/klst` is green because threshold is strict `>`.
3. `2.1 mm/klst` is `gult` with `reasonCode = precipitation`.
4. `nextCaution` does not trigger on `1.5 mm/klst`.
5. `nextCaution` triggers on `2.1 mm/klst`.

Expected files likely affected:

- `lib/weather/thresholds.ts`
- `lib/weather/travel.ts` only if helper extraction is needed
- `app/api/teskeid/weather/travel/route.ts`
- maybe `app/api/teskeid/weather/ask/route.ts` if the legacy/hidden route endpoint still matters
- `lib/__tests__/weather-travel.test.ts`
- new helper test file if sampling is extracted

## Interaction with v098 route timeline work

This should be handled before or together with per-candidate/per-point map summaries.

Reason: once the map can recolor every point per selected time, 15 points on a long route becomes very visibly insufficient. Better sampling density makes the timeline-map trust upgrade meaningful.

Implementation order recommendation:

1. Extract and test distance-based route weather sampling.
2. Raise travel precipitation threshold to 2.0 and update tests.
3. Then implement compact candidate × point summaries from v098.

## Guardrails

- No new browser calls to met.no.
- No raw met.no forecast JSON in client payload.
- No unbounded point count.
- No dense full-country grid.
- No production env changes.
- No SQL/migration.
- No commit/push/deploy unless Stebbi explicitly asks.

## Localhost checks for Stebbi

After implementation:

1. Open `/auth-mvp/vedrid`.
2. Test Garðabær → Akureyri or Reykjavík → Akureyri.
3. Confirm map shows many more than 15 points, roughly one per 10 km with a sensible cap.
4. Confirm short routes do not become noisy or slow.
5. Confirm route result still loads in acceptable time.
6. Confirm point details still show distance/time/forecast links.
7. Test a route/time with `0.5-1.5 mm/klst` rain and calm wind:
   - expected: green, no precipitation warning
8. Test or mock a route/time with `2.1+ mm/klst`:
   - expected: yellow precipitation warning
9. Confirm wind warnings still behave as before.
10. Confirm no page-level horizontal overflow on mobile.

## Codex conclusion

Stebbi is right: 15 route weather points is too sparse for long Iceland drives. But the fix should not be "all possible polyline points." The right fix is distance-based, capped, cache-friendly route sampling, starting around 10 km spacing and max 80 points.

Also raise travel precipitation caution threshold from 1.0 to 2.0 mm/klst. That matches the product reality: light rain is usually not the travel risk; wind is.

No code changes were made in this handoff.
