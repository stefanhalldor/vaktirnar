# todo-067 v101 - Codex consolidated handoff: route timeline, exhaustive sampling, precipitation threshold

Created: 2026-07-06 20:31
Timezone: Atlantic/Reykjavik
Author: Codex
Relevant TODO: `todo-067` Ferðalagið weather work
Supersedes for Claude communication:
- `2026-07-06-2024-todo-067-v098-codex-v097-phase-a-review.md`
- `2026-07-06-2028-todo-067-v099-codex-route-sampling-precip-threshold.md`
- `2026-07-06-2030-todo-067-v100-codex-exhaustive-route-points-decision.md`

## Purpose

Stebbi has **not** sent v098, v099 or v100 to Claude Code yet. This v101 handoff consolidates those decisions into one canonical package for Claude Code.

Claude Code should read this v101 as the current direction after v097.

Do not treat v098-v100 as separate new requests unless useful for history. This file is the send-forward version.

## High-level decision

The next Ferðalagið milestone is:

1. Route timeline audit map first.
2. Use all meaningful route/weather points when the marginal cost is low.
3. Fall back to capped sampling only when exhaustive mode is actually too heavy.
4. Recolor all route weather points by selected timeline slot.
5. Raise travel precipitation caution threshold from `1.0` to `2.0 mm/klst`.

This is the "alla leið" route experience Stebbi wants. The map should become the explanation, not a decorative proof image.

## What is already right in v097

Codex agrees with these v097 conclusions:

- Route timeline should come before Iceland-wide travel-conditions map.
- Current architecture is close.
- Existing route payload already has candidates and highlighted worst metrics.
- `TravelAuditMap` is already interactive, not just a static image.
- `DepartureHeatmap` already gives us the basic time-scrubber shape.
- No new met.no calls should be needed just to make the timeline interactive.
- Iceland-wide map should wait until the route timeline primitives are solid.

## Major correction to v097: no "worst point only" completion

v097 suggested an MVP where the selected heatmap slot only highlights the worst point and leaves other route points default/gray.

Codex does **not** accept that as a completed Phase C.

Reason:

- Stebbi explicitly wants the route map to build trust.
- If only one point changes, the user still cannot see how the whole route behaves at that selected time.
- Current code colors markers from `summaryForWindow`, not from the selected heatmap slot.
- `summaryForWindow` is derived from one default/best/decisive candidate, so it can disagree visually with the selected timeline slot.

Required behavior:

- When a user taps a timeline slot, **all route weather point markers** should reflect that selected slot.
- The worst point for that selected slot should be highlighted.
- The detail panel should use selected-slot values.
- Green slots should show a genuinely green route state, not fall back to an old/default warning point.

## Required data shape: compact candidate-point summaries

Add a compact server-generated summary for each candidate × route weather point.

Do not send raw met.no forecast JSON to the client.
Do not make client-side met.no calls.
Do not add new weather fetches just for timeline selection.

Suggested shape:

```ts
type CandidatePointSummary = {
  routeIndex: number
  status: WeatherStatus | 'no_data'
  metric?: 'wind' | 'gust' | 'precipitation' | 'data'
  value?: number
  thresholdValue?: number
  thresholdUnit?: 'm/s' | 'mm/klst'
  unit?: 'm/s' | 'mm/klst'
  timeIso?: string
}
```

Attach summaries either:

- inside each `TravelCandidate`, or
- as parallel arrays keyed by candidate index.

Choose the smaller/cleaner shape after inspecting serialization and component usage.

Important:

- Compute from already fetched `pointForecasts`.
- Preserve outbound vs return ETA direction.
- Return leg distances and labels must be from destination/return-start.
- Use the same deterministic threshold logic as route weather.
- Keep payload compact.

## Green slot behavior

Current behavior falls back to the result default highlighted issue when `candidateToIssue()` returns `undefined` for a green slot. That avoids stale red/yellow state but is still not honest enough.

Required:

- selected green slot clears "worst point" language
- all markers recolor for the selected green slot
- detail panel can select a neutral/relevant point, such as destination-nearest or the highest-but-still-green point
- copy should say no point exceeds thresholds for that selected slot
- remove/replace copy like "map cannot update" once candidate-point summaries exist

## Route point sampling decision

Stebbi tested a long route to Akureyri and saw only 15 points. That is too sparse.

Current code uses:

- `MAX_WEATHER_POINTS = 15`
- index-based route sampling, not distance/weather-aware sampling

This is not good enough for long Iceland drives.

### Stebbi's correction

If it does not cost materially more to use all possible route points, Stebbi wants all of them.

Codex agrees with the principle. Do not throw away route information just because `15`, `80`, `120` or `10 km` sounds convenient.

### Revised sampling policy

Implement "exhaustive when cheap":

1. Start from all Google route geometry points.
2. Convert each point to the same rounded forecast coordinate key used by `fetchForecast`.
3. Deduplicate forecast coordinate keys.
4. Measure diagnostics:
   - raw route geometry point count
   - unique forecast coordinate count
   - selected weather point count
   - cache hits if available
   - cache misses / outbound met.no calls if available
   - route response time if practical
5. If unique forecast coordinate count is under an agreed threshold, use all unique forecast points.
6. If it is too high, fall back to distance-based capped sampling.

Preferred mode:

```ts
mode: 'all_unique_forecast_points'
```

Fallback mode:

```ts
mode: 'distance_capped'
```

Initial suggested constants:

```ts
MAX_EXHAUSTIVE_FORECAST_POINTS = 120
TARGET_WEATHER_POINT_SPACING_M = 10_000
MAX_WEATHER_POINTS = 120
```

These are not sacred. Claude Code should inspect/measure local examples and recommend whether the threshold should be higher or lower.

Routes to measure:

- Garðabær → Akureyri
- Reykjavík → Selfoss
- Garðabær → Akranes

### Important distinction

Drawing all route polyline points is cheap and should remain separate from weather evaluation.

Evaluating weather at every route point can be heavier because each unique forecast coordinate can become a met.no forecast request unless cached/deduplicated.

So the policy is:

- draw route line from full route geometry
- evaluate weather using all unique forecast points if cheap
- cap only when necessary

## Sampling diagnostics

Add diagnostics in a developer-safe way so Stebbi/Codex can inspect what happened.

Suggested type:

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

Expose diagnostics either:

- in a debug-only field in the travel response, or
- server logs plus enough client-visible debug detail for localhost review.

Do not clutter normal user UI with noisy diagnostics unless behind an "Hvernig er þetta metið?" / debug section.

## Precipitation threshold decision

Raise travel precipitation caution threshold from:

```ts
cautionPrecipMmPerHour: 1.0
```

to:

```ts
cautionPrecipMmPerHour: 2.0
```

Current logic is strict `>`:

- `2.0 mm/klst` should still be OK
- `2.1 mm/klst` should trigger `gult`

Product rationale:

- light rain is normally not a travel blocker
- wind is the main risk signal
- below-threshold precipitation may appear in details, but should not dominate main result copy or trigger `nextCaution`

Keep wind/gust thresholds unchanged.

## Existing UI details to avoid duplicating

Claude Code should re-read current files before implementation.

Known current state:

- `nextCaution` line is already rendered in `FerdalagidClient`.
- Do not add a duplicate next-caution UI.
- Improve it instead:
  - include date/day when needed, not only `kl. HH:mm`
  - keep metric/value/threshold/location
  - ensure Icelandic and English copy are natural

Known issue:

- `DepartureHeatmap` still hardcodes Icelandic `kl.` for arrival text.
- Fix with i18n message keys.
- English locale must not show `kl.`.

Known issue:

- Day separators exist, but day/date is not always visible while horizontally scrolling.
- Add selected/current day label above the timeline, or another robust visible day context.

Known issue:

- Map fallback is too thin if Google JS and static map both fail.
- Fallback must still show useful route/weather point details, not just "map unavailable."

## Recommended implementation order

1. Read `WORKFLOW.md`, `Design.md`, this v101 handoff and latest current code.
2. Extract route weather sampling into a testable helper.
3. Implement exhaustive-when-cheap sampling with diagnostics.
4. Raise travel precipitation threshold to `2.0`.
5. Add/update tests for sampling and precipitation.
6. Add compact candidate × point summaries.
7. Update `DepartureHeatmap`, `TravelAuditMap`, and `FerdalagidClient` so selected timeline slot controls:
   - all marker colors
   - selected/highlighted point
   - detail panel values
   - green-slot behavior
   - return-leg semantics
8. Fix i18n/time/day issues.
9. Improve map fallback details.
10. Stop with handoff for Codex review before commit/push/deploy.

## Expected files likely involved

Likely:

- `app/api/teskeid/weather/travel/route.ts`
- `lib/weather/travel.ts`
- `lib/weather/types.ts`
- `lib/weather/thresholds.ts`
- `components/weather/DepartureHeatmap.tsx`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-travel.test.ts`
- new test file for route sampling helper if extracted

Maybe:

- `app/api/teskeid/weather/ask/route.ts` only if that legacy/hidden endpoint still matters.

Do not touch unrelated files.

## Tests to add/update

Sampling:

1. Short route includes origin and destination.
2. Garðabær/Reykjavík → Akureyri style route no longer produces only 15 points.
3. Exhaustive mode uses all unique forecast points when under threshold.
4. Distance-capped mode activates when unique forecast count exceeds threshold.
5. Destination is always included.
6. Uneven route geometry density does not create obviously bad sampling.
7. Duplicate forecast coordinates are fetched/evaluated once where possible, while mapping back to route points correctly.

Precipitation:

1. `1.5 mm/klst` is green if wind is otherwise safe.
2. `2.0 mm/klst` is green because the comparison is strict `>`.
3. `2.1 mm/klst` is `gult` with `reasonCode = precipitation`.
4. `nextCaution` does not trigger on `1.5 mm/klst`.
5. `nextCaution` triggers on `2.1 mm/klst`.

Timeline/map:

1. Candidate × point summaries produce expected green/yellow/red point statuses without extra fetches.
2. Selecting a yellow/red slot recolors all map markers for that selected time.
3. Selecting a yellow/red slot highlights the matching `routeIndex` and uses selected metric/time.
4. Selecting a green slot clears warning copy and does not keep stale highlighted issue.
5. Return candidate summaries calculate ETA and displayed distance from destination.
6. English heatmap arrival text has no hardcoded `kl.`.
7. Fallback without Google JS/static image still renders useful route point details.

## Localhost checks for Stebbi

After implementation, Stebbi should test:

1. Open `/auth-mvp/vedrid`.
2. Test Garðabær → Akureyri or Reykjavík → Akureyri.
3. Confirm visible weather point count is much higher than 15 when exhaustive mode is cheap.
4. Confirm diagnostics show whether route used `all_unique_forecast_points` or `distance_capped`.
5. Confirm route result still loads in acceptable time.
6. Test Garðabær → Akranes and Reykjavík → Selfoss.
7. Use latest-arrival window so multiple outbound slots appear.
8. Tap a yellow/red slot and confirm all map markers recolor for that selected time.
9. Tap a green slot after yellow/red and confirm stale warning point/copy disappears.
10. Add return trip and confirm outbound and return timelines remain separate.
11. In return timeline, confirm distances are from destination/return start.
12. Horizontally scroll the timeline and confirm day/date context remains visible.
13. Test a route/time with `0.5-1.5 mm/klst` rain and calm wind:
    - expected: green, no precipitation warning
14. Test/mock `2.1+ mm/klst`:
    - expected: yellow precipitation warning
15. Confirm wind warnings still behave as before.
16. Switch to English locale and confirm no Icelandic `kl.` leaks into heatmap slot details.
17. Confirm missing/broken Google map fallback still gives useful non-blank route/weather details.
18. Confirm no page-level horizontal overflow on 360 px, 390 px and 430 px mobile widths.

## Guardrails

- No browser calls to met.no.
- No raw met.no JSON in client payload.
- No unbounded route/weather point count without diagnostics and fallback.
- No dense full-country grid.
- No new Supabase tables.
- No SQL migration.
- No production env changes.
- No cron job.
- No commit/push/deploy unless Stebbi explicitly asks.

## Claude Code response requested

Claude Code should respond with a new handoff file containing:

1. Agreement/disagreement with this consolidated direction.
2. What current code already supports.
3. Proposed sampling helper and diagnostics shape.
4. Proposed candidate × point summary shape.
5. Exact implementation plan by file.
6. Test plan.
7. Any risks around latency, met.no traffic or payload size.
8. Whether Claude Code thinks execution should wait for current uncommitted weather work to be committed.
9. `Localhost checks for Stebbi`.

## Codex conclusion

The next implementation should not be a cosmetic map tweak.

It should make Ferðalagið auditable:

- denser/exhaustive route-weather coverage when cheap
- selected timeline slot controls the whole map
- green slots are genuinely green on the map
- precipitation threshold stops over-warning on light rain
- no extra met.no/browser/provider risk

No code changes were made in this handoff.
