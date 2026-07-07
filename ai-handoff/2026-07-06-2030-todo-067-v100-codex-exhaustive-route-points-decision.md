# todo-067 v100 - Codex addendum: exhaustive route points if marginal cost is low

Created: 2026-07-06 20:30
Timezone: Atlantic/Reykjavik
Author: Codex
Amends: `2026-07-06-2028-todo-067-v099-codex-route-sampling-precip-threshold.md`
Relevant TODO: `todo-067` Ferðalagið weather work

## Stebbi correction

Stebbi disagrees with stopping at a distance-based cap if there is no real extra cost:

> Ef það kostar mig ekki meira að hafa alla mögulega punkta á leiðinni þá vil ég fá alla.

Codex agrees with the principle. The implementation should not throw away route information just because `15`, `80` or `10 km` sounded convenient.

The important distinction:

1. **Drawing all route polyline points** costs almost nothing extra after Google returns the route. Do this for the route line.
2. **Evaluating weather at every route polyline point** can cost more because each unique coordinate can become a met.no forecast request unless cached/deduplicated.
3. If deduplication/caching makes the marginal forecast cost low, use all meaningful points.

## Revised decision

Do not hardcode a low fixed sampling cap as the product decision.

Instead, implement and measure an "exhaustive when cheap" strategy:

1. Start from all Google route geometry points.
2. Convert each to the forecast coordinate key actually used by `fetchForecast`.
3. Deduplicate forecast coordinate keys.
4. Measure:
   - raw route geometry point count
   - unique forecast coordinate count
   - cache hits
   - cache misses / outbound met.no calls
   - route response time
5. If unique forecast count is low enough, evaluate all unique forecast points.
6. Only fall back to distance-based capped sampling when the route would create too many unique forecast calls or too large a payload.

In other words:

- preferred mode: `all_unique_forecast_points`
- fallback mode: `distance_capped`

This gives Stebbi what he wants where it is genuinely cheap, while protecting the app/provider when a route explodes into hundreds/thousands of point forecasts.

## What "cost" means here

Even if Google/met.no billing is not the issue, cost can still mean:

- slow result for the user
- hundreds of parallel met.no calls on first uncached request
- provider friction / ToS risk from unnecessary traffic
- big payload when candidate × point summaries are added
- more browser rendering work on mobile
- false precision from many near-identical neighboring points

So Claude Code should not assume "no dollar billing" means "no cost." But Claude Code also should not assume more points are bad before measuring.

## Recommended implementation policy

### Phase 1: instrument and choose dynamically

Create a small shared route-weather sampling helper that returns both points and diagnostics:

```ts
type RouteWeatherSamplingDiagnostics = {
  mode: 'all_unique_forecast_points' | 'distance_capped'
  rawRoutePointCount: number
  uniqueForecastPointCount: number
  selectedWeatherPointCount: number
  targetSpacingM?: number
  cap?: number
}
```

Initial rule:

- if unique forecast coordinate count <= `MAX_EXHAUSTIVE_FORECAST_POINTS`, use all unique forecast points
- otherwise use distance-based capped sampling

Start with a conservative but not tiny threshold:

- `MAX_EXHAUSTIVE_FORECAST_POINTS = 120`
- fallback `TARGET_WEATHER_POINT_SPACING_M = 10_000`
- fallback `MAX_WEATHER_POINTS = 120`

The exact numbers can be adjusted after local measurements. The important part is the policy: all if cheap, capped if not.

### Phase 2: expose diagnostics for review

For now, include sampling diagnostics in server logs or a debug-only field in the travel response. The goal is that Stebbi and Codex can see:

- "Route had 482 geometry points"
- "After dedup: 67 forecast points"
- "Mode: all_unique_forecast_points"

or:

- "Route had 1,600 geometry points"
- "After dedup: 900 forecast points"
- "Mode: distance_capped, selected 120 points"

Do not show noisy diagnostics to normal users unless behind a small debug/details section.

### Phase 3: use this before candidate × point summaries

Once v098 adds per-candidate/per-point summaries, point count directly affects payload size. Therefore this sampling policy needs to be settled before declaring the timeline-map complete.

## Precipitation threshold from v099 still stands

Keep the v099 decision:

- raise travel precipitation caution from `1.0` to `2.0 mm/klst`
- because current logic is strict `>`, `2.0` is OK and `2.1` warns
- wind remains the main travel-risk signal

## What Claude Code should do next

1. Re-read v098 and this v100 addendum.
2. Do not implement a fixed 80-point distance cap as the final answer.
3. Inspect how many route geometry points Google returns for:
   - Garðabær → Akureyri
   - Reykjavík → Selfoss
   - Garðabær → Akranes
4. Estimate/measure unique forecast coordinate counts using current rounding.
5. Propose the threshold for exhaustive mode based on that measurement.
6. Then implement sampling helper/tests if Stebbi gives execution permission.

## Localhost checks for Stebbi

After implementation:

1. Test Garðabær → Akureyri.
2. Confirm result uses exhaustive mode if unique forecast point count is under threshold.
3. Confirm visible weather point count is much higher than 15.
4. Confirm response time is still acceptable.
5. Confirm details/debug data can tell whether route used exhaustive or capped mode.
6. Test a short route and confirm it does not become visually noisy.
7. Confirm no browser calls are made directly to met.no.
8. Confirm precipitation threshold behavior from v099 still works.

## Codex conclusion

Stebbi's correction is right: if the marginal cost is not real, use all meaningful route points.

The revised plan is not "always 10 km spacing." It is:

**Use all unique forecast points when cheap; fall back to capped distance-based sampling only when exhaustive mode would be too slow/heavy/risky.**

No code changes were made in this addendum.
