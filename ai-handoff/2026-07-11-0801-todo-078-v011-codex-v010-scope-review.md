# TODO 078 - Codex review of v010: approve only Phase 0.5A/0.5B shared seam

Created: 2026-07-11 08:01  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Review / implementation-scope handoff for Claude Code  
Related TODO: #78 Tjaldferð / Ferðalagið / shared route-weather core  
Reviews:

- `2026-07-11-0757-todo-078-v010-claude-preimplementation-plan.md`

Builds on:

- `2026-07-10-2026-todo-078-v006-codex-future-proof-shared-weather-core.md`
- `2026-07-11-0731-todo-078-v007-codex-product-flow-model-addendum.md`
- `2026-07-11-0737-todo-078-v008-codex-single-drive-to-trip-addendum.md`
- `2026-07-11-0745-todo-078-v009-codex-flagged-release-strategy.md`

Status: Review and narrowed execution scope. No code changes made by Codex.

## Summary

Claude Code's v010 plan is directionally good and future-proof enough **if we narrow the first implementation step**.

Codex recommends starting now, but only with:

- Phase 0.5A: tests for the shared route-leg assessment seam;
- Phase 0.5B: extract `evaluateCandidate` behavior into `assessRouteLeg`;
- no UI;
- no SQL;
- no persistence;
- no new public nav;
- no camping API route in this first pass.

Do **not** run Phase 0.5C yet.

## Findings

### P1 - v010 should not implement camping API stub yet

The v010 Phase 0.5C proposal introduces:

- `lib/camping/trip.ts`;
- `/api/teskeid/camping/assess-leg/route.ts`;
- `CAMPING_ENABLED`.

This is too early for the first implementation pass.

Why:

- It creates a new product/API surface before the shared seam has been proven.
- It risks making "camping" the architecture center instead of one use case inside `Ferðalagið`.
- It adds auth/route/API review surface without delivering user value yet.
- It may distract from the main goal: current Ferðaveðrið must keep working exactly the same while gaining a shared core seam.

Recommendation:

```txt
Implement only Phase 0.5A + Phase 0.5B now.
Park Phase 0.5C for a later handoff.
```

### P1 - Feature flag naming must follow v009

v010 still talks about `CAMPING_ENABLED` as a Phase 0.5C flag.

For product architecture, Codex wants:

```txt
WEATHER_TRIP_ENABLED
```

as the future main flag for:

- `Ferðalagið`;
- `Breyta í ferðalag`;
- add-stop UI;
- hidden trip mode;
- conversion affordances.

Possible later narrow flag:

```txt
WEATHER_CAMPSITE_PRESET_ENABLED
```

for campsite-specific UI/preset.

Avoid:

```txt
TJALDFERD_ENABLED
CAMPING_ENABLED as main architecture flag
```

because those names push the implementation toward a camping-specific fork.

Important nuance:

- No visible flag is needed for Phase 0.5A/0.5B if behavior remains unchanged.
- `WEATHER_TRIP_ENABLED` becomes relevant when UI/conversion/trip mode is introduced.

### P1 - Shared core should not be old/new logic behind a flag

Do not implement:

```txt
if WEATHER_TRIP_ENABLED:
  use new assessment
else:
  use old assessment
```

That creates long-lived branch risk.

Instead:

```txt
Always use the extracted shared seam once tests prove it is equivalent.
Flag only new product UI later.
```

### P2 - Return type can be `TravelCandidate`, but add a future-facing alias

Codex preference:

```ts
export type RouteLegAssessment = TravelCandidate
```

Then:

```ts
export function assessRouteLeg(input: RouteLegInput): RouteLegAssessment
```

This keeps Phase 0.5 low-churn while giving future code a better domain name.

Do not rename `TravelCandidate` throughout the current codebase in Phase 0.5.

### P2 - Low-level helpers should not become the main contract

Codex agrees with v010 that the main domain seam should be:

```ts
assessRouteLeg(input: RouteLegInput): RouteLegAssessment
```

Do not make these the primary shared API:

- `evalDrivingLeg`;
- `findWorstMetric`;
- `getHoursNearEta`.

However, `travel.ts` currently still needs some of the low-level behavior for:

- `buildRouteWeatherPoints`;
- `buildForecastRows`;
- `enrichWithArrivalWeather`.

Recommended approach:

- Keep `findWorstMetric` private inside `assessment.ts`.
- If needed, export narrowly named pure helpers with comments that they are supporting utilities, not the domain seam:
  - `evaluateDrivingThresholds` or `assessDrivingConditions` instead of `evalDrivingLeg`;
  - `getForecastHoursNearEta` instead of `getHoursNearEta`.
- Keep `assessRouteLeg` as the only domain-level route-leg assessment contract.

Avoid copying helper logic back into `travel.ts`.

### P2 - Do not move extra UI/product composers in Phase 0.5 unless required

`buildRouteWeatherPoints`, `buildSingleDepartureTimeline`, `buildHighlightedIssue`, arrival enrichment and formatting are still Ferðaveðrið composers.

They should stay in `travel.ts` unless the extraction cannot compile without moving a tiny pure helper.

The goal is not to reorganize the whole module in one pass.

### P2 - `TripStop` vs `TripLeg` relationship

Claude's v009 review suggested deriving stops from legs rather than duplicating.

Codex refinement:

- For a pure one-drive calculation, deriving stops from one leg is fine.
- For real `Ferðalagið`, stops should likely become the itinerary source of truth:
  - campsite;
  - stay window;
  - home;
  - waypoint;
  - user-entered order.
- Legs are the calculated/selected journeys between stops.

Future direction:

```txt
TripStop = itinerary item
TripLeg = route/weather assessment between two stops
```

Do not formalize this in Phase 0.5.

## Approved Narrow Scope

Stebbi can allow Claude Code to implement only this:

### Phase 0.5A

Add focused tests for the future `assessRouteLeg` seam.

The tests should cover:

- normal green/caution/danger threshold outcomes;
- no-data behavior;
- ETA weighting along route distance;
- return-leg ETA inversion if supported by the new seam;
- worst metric selection across multiple route points.

Tests may be added at the same time as the extraction if writing failing tests first becomes awkward in this repo, but the final diff must include direct tests of `assessRouteLeg`.

### Phase 0.5B

Create:

```txt
lib/weather/assessment.ts
```

Expose:

```ts
export type RouteLegInput = { ... }
export type RouteLegAssessment = TravelCandidate
export function assessRouteLeg(input: RouteLegInput): RouteLegAssessment
```

Refactor:

- Move current `evaluateCandidate` behavior into `assessRouteLeg`.
- Update `checkTravelWeather()` internals to call `assessRouteLeg`.
- Keep `checkTravelWeather()` input/output/signature unchanged.
- Keep current `/vedrid` behavior unchanged.

### Verification

Claude Code should run:

```txt
npm run type-check
npm run test:run -- lib/__tests__/weather-travel.test.ts
npm run test:run -- <new assessment test file>
```

If feasible, run full test suite too:

```txt
npm run test:run
```

## Explicitly Out Of Scope For This Pass

Do not implement:

- `lib/camping/*`;
- `/api/teskeid/camping/*`;
- `CAMPING_ENABLED`;
- `WEATHER_TRIP_ENABLED` wiring;
- `WEATHER_CAMPSITE_PRESET_ENABLED`;
- UI for `Ferðalagið`;
- `Breyta í ferðalag`;
- `Bæta við áfangastað`;
- `Finna tjaldsvæði`;
- saved trips;
- SQL;
- migrations;
- RLS/grants;
- public nav;
- auth changes;
- admin analytics.

## Suggested Message To Claude Code

```md
Claude Code, mátt byrja á TODO #78 Phase 0.5A + 0.5B eingöngu.

Markmið:
- Future-proof shared route-weather seam.
- Engin sýnileg UI breyting.
- Engin SQL.
- Engin persistence.
- Enginn camping API route í þessari keyrslu.
- Engin public nav.
- Núverandi `/vedrid` og `/auth-mvp/vedrid` verða að hegða sér eins og áður.

Samræmdu við v009:
- `WEATHER_TRIP_ENABLED` verður framtíðarflaggið fyrir Ferðalagið/conversion UI.
- Ekki nota `CAMPING_ENABLED` sem aðalarkitektúrflaggið.
- Ekki byggja `TJALDFERD_ENABLED`.
- Ekki setja old/new assessment logic á bak við flagg. Shared seam á að vera behavior-equivalent og verða notuð af núverandi Ferðaveðri.

Útfærsla:
1. Bæta við unit tests fyrir nýjan `assessRouteLeg` seam.
2. Búa til `lib/weather/assessment.ts`.
3. Flytja/endurpakka núverandi `evaluateCandidate` logic í `assessRouteLeg`.
4. `checkTravelWeather()` notar nýja seam-ið en input/output breytist ekki.
5. Nota `TravelCandidate` sem return fyrst, en bæta við alias `RouteLegAssessment = TravelCandidate`.
6. Ekki exporta low-level helpers sem aðal contract. Ef `travel.ts` þarf helpera áfram má exporta þá með skýru internal nafni/comment, en `assessRouteLeg` er eina domain seam-ið.
7. Keyra targeted tests + `weather-travel.test.ts` + type-check.
8. Skila prerelease handoff fyrir Codex review.

Ekki framkvæma Phase 0.5C enn.
```

## Localhost Checks For Stebbi

This scoped implementation should have no visible UI change.

After Claude Code implements Phase 0.5A/0.5B, Stebbi should test:

1. Open `/vedrid` as public user if `WEATHER_PUBLIC_ENABLED=true`.
2. Calculate a familiar route.
3. Expected: route options and weather result behave like before.
4. Open `/auth-mvp/vedrid` as authenticated user.
5. Calculate a familiar route, e.g. Reykjavík -> Akureyri or Garðabær -> Akranes.
6. Expected: route options, selected route, departure scrubber, top summary, map point coloring and result status look unchanged.
7. Try one route with selected route options and one route that uses default route geometry.
8. Expected: no difference from pre-refactor behavior.
9. No new `Ferðalagið`, `Finna tjaldsvæði`, add-stop, save-trip or camping UI should appear.
10. No new SQL/migration should need to be run.

If any UI changes are visible, Claude Code should call them out explicitly in the prerelease handoff because they are not expected in this phase.

## Bottom Line

Yes, start now, but keep the first pass boring and surgical:

```txt
Extract shared route-leg assessment.
Prove it with tests.
Keep current product unchanged.
No camping API.
No UI.
No SQL.
```

This is the safest way to move toward `Ferðalagið` without creating fork debt.

