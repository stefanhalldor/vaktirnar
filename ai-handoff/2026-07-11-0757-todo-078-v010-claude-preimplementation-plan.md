# TODO 078 - Claude Code: pre-implementation plan for Codex review

Created: 2026-07-11 08:00
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Pre-implementation plan handoff — requires Codex review before execution
Related TODO: #78 Tjaldferð / Ferðalagið / shared route-weather core
Synthesizes:

- v006: Future-proof shared weather core (Codex)
- v007: Product flow model addendum (Codex)
- v008: Single-drive-to-trip addendum (Codex)
- v009: Flagged release strategy (Codex)

Status: Plan only. No implementation until Codex and Stebbi approve.

---

## Code audit summary

Before answering Codex's questions, here is what the code actually looks like.

### `lib/weather/travel.ts` — 922 lines

Single-file module. All logic is contained here.

Public exports:
- `TravelWeatherInput` (type)
- `deriveGustSeverity(windMs, gustMs, thresholds): GustSeverity`
- `buildForecastRows(hours, trailerKind, thresholds): ForecastDrawerRow[]`
- `checkTravelWeather(input): DeterministicResult`

Private functions (not exported):
- `getHoursNearEta(hours, etaMs, windowMs)` — filters forecast hours to ±1h of an ETA
- `findWorstMetric(pointForecasts, depIso, arrIso, distM, getter, leg)` — finds the worst scalar metric value across all points, ETA-weighted
- `evalDrivingLeg(wind, gust, precip, trailerKind, thresholds)` — applies thresholds to return `{ stada, reasonCode }`
- `evaluateCandidate(depIso, arrIso, pointForecasts, trailerKind, distM, leg, thresholds)` — combines the above into a `TravelCandidate`
- `generateCandidates(...)` — calls `evaluateCandidate` across a window of departure times
- `groupCandidatesIntoWindows(...)`, `findBestWindow(...)`, `worstStada(...)`, etc.
- `buildHighlightedIssue(...)` — derives `TravelIssue` from worst candidates
- `buildRouteWeatherPoints(...)` — per-point coloring for map
- `buildSingleDepartureTimeline(...)` — hourly timeline for departure scrubber
- `enrichWithArrivalWeather(...)` — adds destination weather to candidates
- Formatting helpers: `formatWindowRange`, `reasonToText`, etc.

### `lib/weather/types.ts` — 326 lines

Key types relevant to the shared seam:

- `WeatherStatus = 'graent' | 'gult' | 'rautt'`
- `HourPoint` — one met.no forecast hour (wind, gust, precip, temp, symbolCode)
- `TravelPointForecast` — one route point with its forecast hours
- `TravelCandidate` — assessment for one departure time: status, worstWind/Gust/Precip, pointStatuses, displayPoint, arrivalWeather
- `ResolvedTravelThresholds` — four scalars: cautionWindMs, redWindMs, redGustMs, cautionPrecipMmPerHour
- `ForecastDrawerRow`, `ForecastDrawerMetricCell`, `ForecastDrawerGustCell` — pre-processed rows for the Spá drawer
- `DeterministicResult` — full output of `checkTravelWeather`

### `lib/__tests__/weather-travel.test.ts` — 1175 lines

Comprehensive end-to-end tests of `checkTravelWeather`. Coverage includes:
- status levels (graent/gult/rautt) for all threshold types
- trailer kinds and threshold overrides
- window mode (latestArrivalBy)
- return leg (latestHomeBy)
- candidate point statuses for map coloring
- worst metric tracking (wind, gust, precip)
- forecast rows (buildForecastRows)
- arrival-too-soon guard, home-too-soon guard
- ETA window behavior
- next-caution scan

These tests effectively characterize the entire behavior of `checkTravelWeather`. They operate on `checkTravelWeather` as a black box, not on internal helpers. This is important for the extraction plan.

---

## Answers to Codex v006 questions

### 1. Smallest domain-level shared seam

The current function `evaluateCandidate` is the natural seam.

It takes a departure time, arrival time, point forecasts, threshold profile, distance, and leg direction, and returns a complete `TravelCandidate` (status, worst metrics, per-point statuses, displayPoint).

This is exactly what Tjaldferð needs for each driving leg.

The shared boundary should be a documented, well-named version of this:

```ts
// lib/weather/assessment.ts

assessRouteLeg(input: RouteLegInput): RouteLegAssessment
```

Where `RouteLegInput` is the named-field equivalent of the current `evaluateCandidate` parameters, and `RouteLegAssessment` is a clean name for what `TravelCandidate` already contains.

This is NOT v004's approach of exporting the three lower-level helpers (`evalDrivingLeg`, `findWorstMetric`, `getHoursNearEta`). It is one domain-level function.

### 2. Characterization tests before extraction

The existing 1175-line `weather-travel.test.ts` is already strong characterization of `checkTravelWeather`.

What is missing before we can safely extract `evaluateCandidate`:

**Gap A**: Unit tests for `evaluateCandidate` behavior directly. Since it is private, it is currently only tested via `checkTravelWeather`. If we rename or reshape it during extraction, end-to-end tests catch regressions but don't tell us exactly where. We should add unit-level tests for the new `assessRouteLeg` at the same time we create it, using the same fixture approach.

**Gap B**: No dedicated tests for `findWorstMetric` ETA-weighting logic. This is the subtlest behavior in the codebase (ETA fraction, return leg inversion). Tests should cover: outbound point at 50% route distance, return point at 50% route distance, zero-distance edge case.

**Gap C**: No tests for `buildForecastRows` in isolation beyond what `checkTravelWeather` exercises. `buildForecastRows` is already exported, so this is lower risk.

The existing tests are sufficient to verify no regression after extraction, but Gaps A and B should be filled alongside or before extraction.

### 3. How `checkTravelWeather()` adopts the seam

Current pattern:
```txt
checkTravelWeather()
  -> evaluateCandidate()
  -> generateCandidates() -> evaluateCandidate()
  -> buildSingleDepartureTimeline() -> evaluateCandidate()
```

After extraction:
```txt
checkTravelWeather()
  -> generateCandidates() -> assessRouteLeg()   [was evaluateCandidate]
  -> buildSingleDepartureTimeline() -> assessRouteLeg()
  (direct evaluateCandidate call in non-window mode replaced too)
```

The output of `checkTravelWeather` does not change. `DeterministicResult` is unchanged. `TravelPlan` is unchanged. All existing tests pass.

The only change inside `travel.ts` is that calls to the private `evaluateCandidate` are replaced with calls to the extracted `assessRouteLeg`, which contains the same logic.

### 4. Private helpers that should stay private

These should stay internal to `travel.ts` and are NOT part of the shared seam:

- `buildHighlightedIssue` — Ferðaveðrið-specific concept (outbound vs return worst candidate displayed to user)
- `buildRouteWeatherPoints` — Ferðaveðrið map coloring, very product-specific
- `buildAuditMapUrl` — Google Static Maps, Ferðaveðrið-only
- `buildSingleDepartureTimeline` — Ferðaveðrið departure scrubber logic
- `generateCandidates` — Ferðaveðrið window-mode scan
- `groupCandidatesIntoWindows`, `findBestWindow` — Ferðaveðrið window grouping
- `enrichWithArrivalWeather` — Ferðaveðrið arrival destination feature
- All formatting helpers (`formatWindowRange`, `reasonToText`, etc.)

These should NOT be exported or moved. They are product-specific composers that build on the shared core.

### 5. Existing types that can become shared contracts

**Can become shared immediately (no change needed):**
- `WeatherStatus` — already shared-safe
- `HourPoint` — pure met.no data, shared-safe
- `TravelPointForecast` — route-point + forecast hours, used as-is for `assessRouteLeg` input
- `ResolvedTravelThresholds` — driving threshold scalars, shared for route legs
- `ForecastDrawerRow` + cells — already exported, used by camping for point-level forecast display

**May evolve but should not be renamed yet:**
- `TravelCandidate` — the current return type of `evaluateCandidate`. The new `assessRouteLeg` can return `TravelCandidate` to keep Ferðaveðrið callers unchanged. A future `RouteLegAssessment` alias or replacement can be introduced when camping needs it.

**Should NOT be renamed yet:**
- `DeterministicResult`, `TravelPlan`, `TravelPlan.outbound`, etc. — pure Ferðaveðrið output structure, no need to generalize now.

### 6. What survives from v004

The additive-only v004 plan is superseded by this plan. The principle survives: do not touch `checkTravelWeather()` output or signature.

What changes:
- Instead of exporting `evalDrivingLeg`, `findWorstMetric`, `getHoursNearEta`, we create one domain function `assessRouteLeg` that encapsulates them.
- `checkTravelWeather()` calls `assessRouteLeg` internally (small internal refactor, no public behavior change).
- Camping uses `assessRouteLeg`, not the lower-level helpers.

What remains from v004:
- `CAMPING_ENABLED` feature flag concept.
- `lib/camping/` module for camping-specific logic.
- No SQL, no public nav.

### 7. Exact order of steps if Stebbi approves

See Phase plan below.

---

## Implementation plan

### Phase 0.5A — Tests before any extraction (no behavior change)

Files changed: `lib/__tests__/weather-assessment.test.ts` (new)

Add unit tests for the logic that will become `assessRouteLeg`:

1. **ETA-weighting tests**: outbound point at 0%, 50%, 100% route fraction gets ETA assigned correctly relative to departure/arrival.
2. **Return leg inversion**: point at 50% route fraction is reached at 50% through a return trip (from destination end, not origin).
3. **evalDrivingLeg threshold tests** (can reuse existing if already covered):
   - Wind below cautionWindMs → graent
   - Wind at cautionWindMs → gult
   - Wind at redWindMs → rautt
   - Gust at redGustMs → rautt
   - Precip above threshold → gult
4. **Status with no data**: if no hours are near ETA, status should be gult/no_data.
5. **findWorstMetric** with a multi-point route: worst is the point with the highest metric value, not the first point.

These tests are written against the future `assessRouteLeg` API (as if it already exists). They will fail until Phase 0.5B is complete.

Goal of Phase 0.5A: make the extraction checkable at a unit level, not just end-to-end.

### Phase 0.5B — Extract `assessRouteLeg` shared seam

Files changed:
- `lib/weather/assessment.ts` (new)
- `lib/weather/travel.ts` (internal refactor, no public API change)

#### New file: `lib/weather/assessment.ts`

```ts
// Shared route leg weather assessment.
// Used by Ferðaveðrið (via checkTravelWeather) and later by Tjaldferð/Ferðalagið.

import type { TravelPointForecast, TravelCandidate, ResolvedTravelThresholds, HourPoint } from './types'

export type RouteLegInput = {
  departureIso: string
  arrivalIso: string
  pointForecasts: TravelPointForecast[]
  thresholds: ResolvedTravelThresholds
  totalDistanceM: number
  leg?: 'outbound' | 'return'
}

export function assessRouteLeg(input: RouteLegInput): TravelCandidate {
  // Contains the current body of evaluateCandidate (moved, not duplicated)
}
```

Notes:
- `TravelCandidate` is reused as the return type. No new type introduced yet.
- The three current private helpers (`getHoursNearEta`, `findWorstMetric`, `evalDrivingLeg`) move into `assessment.ts` as unexported helpers. They are not part of the public API.
- `buildForecastRows` and `deriveGustSeverity` may stay in `travel.ts` or move, but they are already exported so they can be moved cleanly later.

#### Changes to `lib/weather/travel.ts`

Replace all internal calls to `evaluateCandidate` with `assessRouteLeg`. The function `evaluateCandidate` is deleted (its body moved). All other functions in `travel.ts` are unchanged.

`checkTravelWeather()` signature, input type, and output type do not change.

#### Verification

Run the existing 1175-line `weather-travel.test.ts` suite. All tests must pass. No behavior change.

Run the new `weather-assessment.test.ts` unit tests. All must pass.

TypeScript: `tsc --noEmit` must be clean.

### Phase 0.5C — Feature flag + camping stub (only after shared seam is proven)

Files changed:
- `lib/camping/trip.ts` (new, minimal)
- `app/api/teskeid/camping/assess-leg/route.ts` (new, behind flag)
- Environment: `CAMPING_ENABLED`

#### Feature flag

`CAMPING_ENABLED=true` in `.env.local` for testing. Absent or `false` → all camping routes return 404.

Dependency: if `WEATHER_ENABLED !== 'true'`, camping is disabled even if `CAMPING_ENABLED=true`.

#### `lib/camping/trip.ts`

Minimal module demonstrating shared seam usage:

```ts
import { assessRouteLeg, type RouteLegInput } from '../weather/assessment'
import type { TravelCandidate } from '../weather/types'

export function assessCampingLeg(input: RouteLegInput): TravelCandidate {
  // Direct call to shared seam — no duplicated logic
  return assessRouteLeg(input)
}
```

This is intentionally thin. It proves the seam works for camping use before building multi-stop logic.

#### API route

`/api/teskeid/camping/assess-leg` — POST, behind `CAMPING_ENABLED` + `AUTH_MVP_ENABLED` + feature access check. No public access yet. Returns a single `TravelCandidate` for a given leg input. No UI yet.

#### Threshold extension (directional, not yet built)

Document in `lib/weather/thresholds.ts` that a future `resolveCampingThresholds(profile: CampingProfile): CampingThresholds` will be separate from `resolveThresholds(trailerKind)`. Do NOT overload `trailerKind`. Camping profiles (tent, camper, caravan) operate on separate dimensions: day/night temperature, precipitation tolerance, wind tolerance for shelter vs driving.

Phase 0.5C does not build the camping threshold system. It just ensures the driving threshold from `resolveThresholds` is passed to `assessRouteLeg` as the first integration. Camping-specific thresholds are a Phase 0.6 concern.

### Phase 0.6 — Camping threshold profile + multi-leg trip

Files changed:
- `lib/weather/thresholds.ts` — add `resolveCampingThresholds(profile)`
- `lib/camping/stay.ts` — assess a stay window using `assessForecastWindow` (a new shared function for non-driving windows)
- `lib/camping/trip.ts` — multi-leg `assessCampingTrip(trip: CampingTripInput): CampingTripAssessment`

This is Phase 0.6 scope. It requires a separate approval before implementation.

---

## Product model mapping (v007/v008)

### `Einn akstur` as one-leg WeatherTrip (conceptual, no code change in Phase 0.5)

The current `checkTravelWeather` call with a single origin and destination IS conceptually a one-leg WeatherTrip. No code change is required in Phase 0.5 to make this true. The shared seam (`assessRouteLeg`) makes the leg boundary explicit in the codebase.

Phase 0.5 does not introduce a `WeatherTrip` type. That type is a Phase 1 concern.

### Conversion path (`Breyta í ferðalag`) — Phase 1+

No implementation in Phase 0.5. The plan notes that when Phase 1 introduces this, the following state from a completed single-drive result must carry over:
- origin, destination
- selected route option (from route options step)
- departure time or selected departure candidate
- threshold profile (trailerKind + overrides)
- route family/labels
- `assessRouteLeg` result if still fresh (avoid re-fetching)

### `Finna tjaldsvæði` — Phase 0.6+ as preset

Campsite finding is a use case inside the trip model. It calls `assessRouteLeg` for driving legs and `assessForecastWindow` (future) for stay windows. It does not have its own weather assessment. Not in Phase 0.5.

---

## Feature flag strategy (v009)

### Flags proposed

```
CAMPING_ENABLED         — controls Phase 0.5C+ camping API routes (existing plan)
WEATHER_TRIP_ENABLED    — controls Ferðalagið mode UI, conversion actions (Phase 1)
```

`WEATHER_CAMPSITE_PRESET_ENABLED` is noted as a possible later flag for campsite preset UI. Not needed in Phase 0.5.

Avoid `TJALDFERD_ENABLED` as an architecture flag. It pushes toward a product-specific fork.

### Flag behavior

`CAMPING_ENABLED`:
- `false` (default): all `/api/teskeid/camping/*` routes return 404. No UI.
- `true`: camping API routes accessible to authenticated users with feature access.

`WEATHER_TRIP_ENABLED` (Phase 1):
- `false` (default): `/vedrid` behaves exactly like today.
- `true`: secondary trip affordances appear after a single-drive result. `Einn akstur` remains the default first screen.

Shared core (`lib/weather/assessment.ts`) ships with no flag. It is an internal refactor that does not change observable behavior.

---

## What NOT to do (guardrails from all four handoffs)

- Do not export `evalDrivingLeg`, `findWorstMetric`, `getHoursNearEta` as the main contract.
- Do not copy weather assessment logic into `lib/camping/`.
- Do not build visible trip/camping UI before Phase 1.
- Do not add SQL before the saved-trip model is reviewed.
- Do not add a public camping route.
- Do not make `trailerKind` carry camping profiles.
- Do not rename `DeterministicResult`, `TravelPlan`, or `checkTravelWeather` output in Phase 0.5.
- Do not run old and new weather logic in parallel under a flag.
- Do not build `assessForecastWindow` in Phase 0.5 — it is Phase 0.6.

---

## Risk assessment

### Low risk
- Phase 0.5A (tests only) — no behavior changes, no risk.
- Phase 0.5B extraction — the existing 1175-line test suite covers all paths. Any mistake surfaces immediately. The refactor is mechanical: move `evaluateCandidate` body into `assessRouteLeg`, update call sites.

### Medium risk
- Phase 0.5C camping API stub — new route behind `CAMPING_ENABLED`. Main risk is that `assessRouteLeg` is called with a different threshold profile than intended. Mitigated by explicit `thresholds` input on `RouteLegInput`.

### Not in scope / no risk for Phase 0.5
- No SQL, no auth changes, no RLS changes, no new environment variables beyond `CAMPING_ENABLED`.
- No UI changes.
- No changes to existing `/vedrid` or `/auth-mvp/vedrid` behavior.

---

## Open questions for Codex

### 1. Return type: `TravelCandidate` or new `RouteLegAssessment`?

The plan proposes returning `TravelCandidate` from `assessRouteLeg` to keep Ferðaveðrið callers unchanged. This means camping code also receives `TravelCandidate`.

Alternative: introduce `RouteLegAssessment` as a new type and have `TravelCandidate` extend it. This is cleaner but adds type churn in Phase 0.5.

Codex preference?

### 2. Location of `evalDrivingLeg` helpers after move

If `evalDrivingLeg`, `findWorstMetric`, `getHoursNearEta` move into `lib/weather/assessment.ts` as private helpers, they are no longer accessible from `travel.ts` for other private functions like `buildRouteWeatherPoints`. `buildRouteWeatherPoints` calls `evalDrivingLeg` and `getHoursNearEta`.

Options:
- A: Move `buildRouteWeatherPoints` to `assessment.ts` as well (it imports from there anyway).
- B: Keep a private copy of `evalDrivingLeg` in `travel.ts` for `buildRouteWeatherPoints`.
- C: Export `evalDrivingLeg` from `assessment.ts` as a shared utility (acceptable since it is pure and stateless).

Option C is the least disruptive. Codex preference?

### 3. Should `buildForecastRows` and `deriveGustSeverity` move to `assessment.ts`?

Both are already exported from `travel.ts`. They could stay there or move to `assessment.ts` for discoverability. Camping needs `buildForecastRows` for point-level forecast drawers.

Recommend moving to `assessment.ts` in Phase 0.5B for clarity, but this is optional.

---

## Localhost checks for Stebbi (after Phase 0.5B)

These verify the extraction caused no regression.

1. Open `/auth-mvp/vedrid`.
2. Calculate a route (e.g., Reykjavík to Akureyri).
3. Verify route options load normally.
4. Select a route and complete the weather calculation.
5. Verify the result screen looks exactly as before: status color, svar text, highlighted issue location, departure heatmap, route weather points on map.
6. Run the test suite locally: all 2060+ tests must pass (or more if Phase 0.5A tests are added).
7. TypeScript: `tsc --noEmit` must be clean.

After Phase 0.5C (if approved):
8. With `CAMPING_ENABLED=false`: `/api/teskeid/camping/assess-leg` returns 404.
9. With `CAMPING_ENABLED=true`: endpoint accessible to authenticated users, returns a `TravelCandidate` for a test leg input.

---

## Summary

Phase plan:

| Phase | Scope | Risk | Flag needed |
|-------|-------|------|-------------|
| 0.5A | Add unit tests for `assessRouteLeg` behavior (Gap A + B) | None | None |
| 0.5B | Extract `evaluateCandidate` → `assessRouteLeg` in `lib/weather/assessment.ts`; update `travel.ts` callers | Low | None |
| 0.5C | `CAMPING_ENABLED` flag, camping API stub using `assessRouteLeg` | Low | `CAMPING_ENABLED` |
| 0.6 | Camping threshold profile, multi-leg trip, `assessForecastWindow` | Medium | `CAMPING_ENABLED` |
| 1 | `WeatherTrip` type, conversion UI, `WEATHER_TRIP_ENABLED` flag | Medium | `WEATHER_TRIP_ENABLED` |

This plan is ready for Codex review. No implementation until approved.
