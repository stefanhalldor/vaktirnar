# TODO 078 - Codex review of v014 and precise Phase 0.6B continuation

Created: 2026-07-11 08:31  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Prerelease review + continuation handoff for Claude Code  
Related TODO: #78 Ferðalagið / shared route-weather core  
Reviews:

- `2026-07-11-0830-todo-078-v014-claude-phase05c-06a-prerelease.md`

Builds on:

- `2026-07-11-0823-todo-078-v013-codex-refactor-continuation-workflow.md`

Status: Review/handoff only. No implementation approval implied.

## Summary

Codex found no release blocker in v014.

The change is small and correctly scoped:

- doc/comment hardening around `assessRouteLeg()`;
- a new pure `WeatherTrip` type model;
- structural tests for representing single-drive and multi-stop trips;
- no UI, API, SQL, env vars, persistence, RLS, grants, auth or public nav.

Claude Code also followed the workflow better in v014: the handoff explicitly says this is not committed and not pushed.

Codex recommendation:

```txt
v014 is safe to keep as a local prerelease candidate.
It is okay to commit/release only if Stebbi gives explicit commit/push/deploy permission.
Next implementation should be Phase 0.6B only: pure assessWeatherTrip() composer.
```

## Checks Codex Ran

```txt
npm run type-check
-> pass

npm run test:run -- lib/__tests__/weather-assessment.test.ts lib/__tests__/weather-travel.test.ts lib/__tests__/weather-trip.test.ts
-> 3 files passed, 145 passed, 5 skipped
```

## Findings

### P1 - No blocker found

No blocking issue found in v014.

`lib/weather/trip.ts` is type-only and has no runtime effect. `lib/weather/assessment.ts` and `lib/weather/travel.ts` changes are documentation/comments only. This should not alter `/vedrid` behavior.

### P2 - `TripPlace.placeId`, lat and lon must be treated as transient unless persistence is explicitly reviewed

`lib/weather/trip.ts` allows:

```ts
placeId?: string
lat?: number
lon?: number
```

This is fine for in-memory trip planning and route-provider calls.

But future phases must not casually persist or log these fields in:

- usage events;
- admin metrics;
- saved trip snapshots;
- public guest analytics;
- error logs;
- handoff examples with real user data.

If saved trips become in scope, there must be a separate SQL/RLS/privacy review. Use sanitized metadata in usage/admin analytics.

This is not a blocker for v014 because no persistence exists.

### P2 - Current `weather-trip.test.ts` is structural, not behavioral

The new tests are useful as shape checks. They prove the model can represent:

- one A -> B drive;
- multi-stop trips;
- campsite stay windows.

They do not yet prove trip assessment behavior.

That is okay for Phase 0.6A. But Phase 0.6B must add real deterministic tests for `assessWeatherTrip()`, including status aggregation and leg mapping.

### P2 - Next composer must validate or clearly handle leg/stop mismatches

`TripLeg` references stops by string IDs.

Phase 0.6B should decide what `assessWeatherTrip()` does if:

- a leg references a missing stop;
- `legs.length !== stops.length - 1`;
- a multi-stop trip has disconnected legs;
- a single-drive trip has more than one leg;
- no leg assessment input exists for a leg.

Codex preference:

```txt
Pure composer should fail closed into an explicit invalid/insufficient result,
or return structured diagnostics. It should not silently skip bad legs.
```

Do not throw raw errors into UI flows unless API/UI wrappers catch and translate them.

## Approval Recommendation For v014

Codex is comfortable with v014 as a prerelease candidate.

Before commit/release:

1. Claude Code should mention exact changed files.
2. Claude Code should run or reuse:
   - `npm run type-check`
   - targeted weather tests
3. Stebbi must explicitly approve commit/push/deploy if desired.
4. If deployed, Claude Code must produce post-release handoff with commit hash and Vercel status.

## Exact Next Step: Phase 0.6B

Implement a pure `assessWeatherTrip()` composer.

This should be the next small step because it proves the new trip model can actually use the shared route-leg seam without creating a camping fork.

### New file

Suggested:

```txt
lib/weather/trip-assessment.ts
```

Alternative if Claude Code prefers folder structure:

```txt
lib/weather/trip/assessment.ts
```

Use repo-local style and keep the import paths simple.

### Public API

Suggested shape:

```ts
import type { WeatherStatus, TravelCandidate } from './types'
import type { RouteLegInput, RouteLegAssessment } from './assessment'
import type { WeatherTrip } from './trip'

export type TripLegAssessmentInput = {
  legId: string
  assessmentInput: RouteLegInput
}

export type WeatherTripValidationIssue =
  | 'no_stops'
  | 'no_legs'
  | 'missing_leg_assessment_input'
  | 'unknown_from_stop'
  | 'unknown_to_stop'
  | 'non_adjacent_leg'
  | 'single_drive_requires_one_leg'

export type WeatherTripAssessment = {
  status: WeatherStatus
  legAssessments: Array<{
    legId: string
    assessment: RouteLegAssessment
  }>
  worstLegId?: string
  validationIssues?: WeatherTripValidationIssue[]
}

export function assessWeatherTrip(input: {
  trip: WeatherTrip
  legInputs: TripLegAssessmentInput[]
}): WeatherTripAssessment
```

Names may change, but keep the shape explicit.

### Requirements

`assessWeatherTrip()` must:

1. Be pure.
2. Not fetch Google routes.
3. Not fetch Met.no.
4. Not read env vars.
5. Not write SQL.
6. Not touch Supabase.
7. Not use React.
8. Not create UI text.
9. Call `assessRouteLeg()` for each driving leg.
10. Aggregate status using the same severity ordering as current weather:
    - `rautt` wins over `gult`;
    - `gult` wins over `graent`;
    - invalid/missing data should not silently become `graent`.
11. Preserve leg IDs so UI can later point to the problematic leg.
12. Return validation diagnostics for malformed trip structures.

### Do Not Implement Yet

Do not implement in Phase 0.6B:

- `/api/teskeid/trip/*`;
- `/api/teskeid/camping/*`;
- `WEATHER_TRIP_ENABLED`;
- `WEATHER_CAMPSITE_PRESET_ENABLED`;
- `CAMPING_ENABLED`;
- `Breyta í ferðalag`;
- add-stop UI;
- campsite search;
- saved trips;
- SQL/migrations;
- admin analytics;
- public nav;
- AI interpretation.

## Phase 0.6B Tests

Add:

```txt
lib/__tests__/weather-trip-assessment.test.ts
```

Minimum tests:

1. Single-drive trip with one green leg -> trip status `graent`.
2. Single-drive trip with one yellow leg -> trip status `gult`.
3. Single-drive trip with one red leg -> trip status `rautt`.
4. Multi-stop trip with green + yellow legs -> trip status `gult`, worst leg is yellow leg.
5. Multi-stop trip with yellow + red legs -> trip status `rautt`, worst leg is red leg.
6. Multi-stop trip preserves leg assessment order and leg IDs.
7. Missing leg input produces validation issue and non-green status.
8. Leg references unknown stop -> validation issue.
9. `single_drive` with more than one leg -> validation issue.
10. Composer uses `assessRouteLeg()` output shape rather than reimplementing wind/precip threshold logic.

For test fixtures:

- Reuse simple `TravelPointForecast` fixtures from `weather-assessment.test.ts` if possible.
- Avoid live Google/Met.no calls.
- Avoid real user addresses, place IDs, or coordinates.

## Important Design / Product Notes

This next phase has no UI. Still, the future UI direction should remain:

- `/vedrid` default stays `Einn akstur`;
- `Ferðalag` is progressive, not forced;
- campsites are stops/presets/use cases inside `Ferðalag`;
- no separate route-weather engine for Tjaldferð;
- any later UI must follow `Design.md`: mobile-first, no nested cards, no dashboard sprawl, visible loader/pending states, all text in messages.

## Localhost Checks For Stebbi

For v014 and Phase 0.6B, there should still be no visible UI change.

Before any release of v014 or Phase 0.6B:

1. Open `/vedrid` as public user if `WEATHER_PUBLIC_ENABLED=true`.
2. Calculate a familiar route.
3. Expected: route options, route selection, result summary and map behavior are unchanged.
4. Open `/auth-mvp/vedrid` as logged-in user.
5. Calculate a familiar route with recent/saved places.
6. Expected: saved-place behavior and result UI are unchanged.
7. Confirm no `Ferðalag`, `Finna tjaldsvæði`, add-stop, saved-trip or camping UI appears.
8. Confirm no SQL migration is needed.

For Phase 0.6B specifically:

1. There is no page to test directly.
2. The important check is absence of UI regression.
3. Claude Code should report test/type-check results in handoff.

## Suggested Message To Claude Code

```md
Claude Code, Codex rýndi v014 og finnur engan blocker.

V014 má standa sem local prerelease candidate, en ekki commit/push/deploy nema Stebbi gefi skýrt leyfi.

Næsta skref má vera Phase 0.6B eingöngu:
- pure `assessWeatherTrip()` composer;
- notar `WeatherTrip` + `RouteLegInput`;
- kallar `assessRouteLeg()` fyrir hvert leg;
- aggregatar status yfir legs;
- skilar worstLegId og validationIssues;
- engin UI;
- engin API route;
- engin feature flag;
- engin SQL;
- engin persistence;
- engin camping-specific logic.

Passaðu sérstaklega:
- `TripPlace.placeId`, lat/lon eru bara transient í bili; ekki logga eða persist-a.
- malformed trip/leg mapping má ekki silently verða grænt.
- tests þurfa að vera behavioral fyrir `assessWeatherTrip()`, ekki bara type-shape.

Skilaðu prerelease handoff með changed files, tests, exit codes, hvað var ekki gert og Localhost checks for Stebbi.
```

## Bottom Line

v014 is fine.

Next safe move:

```txt
Pure trip assessment composer.
No UI.
No API.
No SQL.
No feature flag wiring.
No camping fork.
```

