# TODO 078 - Future-proof shared weather core for Ferðaveðrið and Tjaldferð

Created: 2026-07-10 20:26  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Architecture direction / handoff for Claude Code  
Builds on:

- `2026-07-10-1953-todo-078-v001-codex-tjaldferd-product-discovery.md`
- `2026-07-10-2001-todo-078-v002-claude-v001-discovery-review.md`
- `2026-07-10-2007-todo-078-v003-codex-v002-shared-core-feature-flag-review.md`
- `2026-07-10-2018-todo-078-v004-claude-additive-phase05-plan.md`
- `2026-07-10-2022-todo-078-v005-codex-v004-fork-risk-review.md`

Status: Planning/handoff only. No implementation approval implied.

## Stebbi's Direction

Stebbi wants the future-proof version, even if it is a bit more thoughtful up front.

The goal is not merely to build Tjaldferð quickly. The goal is to make the existing Ferðaveðrið work better over time while opening a new camping/trip product on top of the same assessment engine.

Non-negotiable product/architecture principle:

> Improvements to route weather, forecast windows, status logic, threshold display, forecast drawers, and trip assessment should be shared by Ferðaveðrið and Tjaldferð unless there is a deliberate domain reason not to.

## Codex Position

Do not approve the v004 additive-only plan as written.

The v004 plan is too close to a thin fork:

- it exports private helper functions,
- creates a new `lib/camping/assessment.ts`,
- leaves Ferðaveðrið orchestration in `checkTravelWeather()`,
- and lets Tjaldferð build its own orchestration around low-level helpers.

That is safer for the next hour, but worse for the next three months.

Preferred direction:

- keep changes incremental,
- avoid a giant rewrite,
- but create a real shared weather assessment core and migrate Ferðaveðrið onto it seam by seam.

## Desired End State

Conceptual architecture:

```txt
Provider/data layer
  Google routes, Met.no forecasts, cached data, route sampling

Shared weather assessment core
  metric evaluation
  threshold resolution/application
  forecast window assessment
  route point/route leg assessment
  aggregate worst-segment logic
  forecast drawer rows / metric cells

Product adapters/composers
  Ferðaveðrið: single route, departure candidates, map, current copy
  Tjaldferð: multi-stop trip, campsite stay windows, saved trip recheck

Product UI
  /vedrid and /auth-mvp/vedrid
  /auth-mvp/tjaldferd behind CAMPING_ENABLED
```

The important point:

- Ferðaveðrið and Tjaldferð can have different workflows.
- They should not have different route-weather engines.

## What "Shared Core" Means

Shared core should be stable domain functions, not random exported private helpers.

Good shared boundary examples:

```ts
assessForecastWindow(input): ForecastWindowAssessment
assessRoutePoint(input): RoutePointAssessment
assessRouteLeg(input): RouteLegAssessment
aggregateSegmentAssessments(input): AggregateAssessment
buildForecastDrawerRows(input): ForecastDrawerRow[]
```

Weak boundary examples:

```ts
evalDrivingLeg(...)
findWorstMetric(...)
getHoursNearEta(...)
```

Those may be useful internally, but should not become the main API that Tjaldferð imports. If camping depends on current private helper names, we have made the internals public by accident.

## Future-Proof Module Direction

Exact filenames can change after Claude Code inspects the code, but the layering should look like this.

### Existing files that can remain

- `lib/weather/travel.ts`
  - Keep `checkTravelWeather()` public behavior.
  - Gradually turn it into a composer that calls shared core functions.

- `lib/weather/thresholds.ts`
  - Keep route/weather thresholds.
  - Later extend or add profile abstractions for camping/stay thresholds.

- `components/weather/*`
  - Keep shared visual components where they are truly weather components.

### New shared core area

Potential files:

```txt
lib/weather/assessment/types.ts
lib/weather/assessment/metrics.ts
lib/weather/assessment/forecastWindow.ts
lib/weather/assessment/routePoint.ts
lib/weather/assessment/routeLeg.ts
lib/weather/assessment/aggregate.ts
```

Keep this small. Do not create all files if one or two is enough for the first seam.

### Tjaldferð-specific area

```txt
lib/camping/campsites.ts
lib/camping/trip.ts
lib/camping/stay.ts
```

Allowed in `lib/camping/*`:

- campsite metadata
- campsite stop/trip shape
- nights/day windows
- equipment profiles
- multi-stop itinerary composition
- saved trip diff logic later

Not allowed in `lib/camping/*`:

- duplicate route weather assessment
- duplicate forecast metric severity logic
- duplicate forecast drawer row logic

## Proposed Shared Types

Do not overfit these names, but Claude Code should plan around explicit contracts like these.

```ts
type WeatherAssessmentStatus = 'good' | 'uncomfortable' | 'dangerous' | 'insufficient_data'

type WeatherMetricAssessment = {
  key: 'wind' | 'precipitation' | 'temperature' | 'gust'
  value: number | null
  unit: string
  status: WeatherAssessmentStatus
  thresholdLabel?: string
  reasonCode?: string
}

type ForecastWindowAssessment = {
  windowStartIso: string
  windowEndIso: string
  status: WeatherAssessmentStatus
  worstMetric: WeatherMetricAssessment | null
  metrics: WeatherMetricAssessment[]
  forecastRows: ForecastDrawerRow[]
}

type RoutePointAssessment = {
  routeIndex: number
  etaIso: string
  forecastIso?: string
  distanceFromOriginM: number
  distanceFromRoadM?: number
  status: WeatherAssessmentStatus
  worstMetric: WeatherMetricAssessment | null
  forecastRows?: ForecastDrawerRow[]
}

type RouteLegAssessment = {
  status: WeatherAssessmentStatus
  worstPoint: RoutePointAssessment | null
  points: RoutePointAssessment[]
  departureIso: string
  arrivalIso: string
  distanceMeters: number
  durationSeconds: number
}
```

Important:

- Existing `WeatherStatus`, `RouteWeatherPoint`, `TravelCandidate`, etc. may already cover some of this.
- Do not introduce redundant types if current ones can be renamed/adapted safely.
- The point is not type churn. The point is a shared contract that both product flows consume.

## Strangler-Style Refactor Plan

This should not be a giant rewrite.

### Phase 0.5A - Characterization tests first

Before extraction, add or strengthen tests that freeze current Ferðaveðrið behavior for representative fixtures.

At minimum:

- route candidate status counts remain the same,
- selected/best candidate remains the same for a known fixture,
- worst point / most challenging point remains the same,
- forecast drawer rows remain structurally compatible,
- destination arrival weather remains compatible,
- insufficient data behavior remains compatible.

Use deterministic fixtures, not live Google/Met.no calls.

If current tests already cover some of this, identify exact tests and gaps.

### Phase 0.5B - Extract one stable shared seam

Start with the smallest seam that is clearly shared.

Best first candidate:

- route point / route leg weather assessment

Why:

- Ferðaveðrið needs it today.
- Tjaldferð needs it for every driving leg.
- Bugs/fixes here should benefit both.

Implement as:

```ts
assessRouteLeg(input): RouteLegAssessment
```

or, if that is too large:

```ts
assessRoutePoint(input): RoutePointAssessment
```

Then let `checkTravelWeather()` call it internally.

### Phase 0.5C - Keep `checkTravelWeather()` as compatibility wrapper

Do not break current callers.

`checkTravelWeather()` should keep the same signature and output shape for now.

Internally it can call the new shared seam and adapt the result back to `DeterministicResult`.

This protects Ferðaveðrið while letting the core become shared.

### Phase 0.5D - Add hidden camping prototype only after shared seam is adopted

Once one seam is shared:

- add `CAMPING_ENABLED`,
- add hidden route/API if desired,
- build the prototype against the shared seam.

The prototype can be ugly/simple internally, but its route assessment must not be a new implementation.

## Feature Flag Direction

Use:

- `CAMPING_ENABLED=true`

Dependency:

- if `WEATHER_ENABLED !== 'true'`, camping should be disabled even if `CAMPING_ENABLED=true`.

Not yet:

- `CAMPING_PUBLIC_ENABLED`

Phase 1 should be logged-in/hidden unless Stebbi explicitly chooses public exposure.

No nav link initially. Direct URL only.

Potential route:

- `/auth-mvp/tjaldferd`

Potential API:

- `/api/teskeid/camping/assess-trip`

Both must 404 or redirect safely when disabled.

## Tjaldferð-Specific Logic That Is Okay To Add

These are not forks because Ferðaveðrið does not have the same domain:

- campsite list
- campsite open months
- camping equipment profile
- night/day/full stay windows
- tent temperature risk
- multi-stop trip timeline
- saved trip recheck/delta later

But even these should use shared metric assessment where practical.

Example:

- A night window assessment should call shared `assessForecastWindow(...)`.
- It should not implement its own wind/precipitation status rules from scratch.

## Threshold Strategy

This needs more care than v004.

Current route thresholds are driving-oriented.

Camping needs at least two threshold dimensions:

1. Route/driving thresholds
   - current Ferðaveðrið logic
   - trailer/no trailer/custom values

2. Stay/camping thresholds
   - tent/camper/caravan/custom
   - wind, precipitation, temperature
   - possibly different night/day tolerance

Future-proof direction:

```ts
type ThresholdContext =
  | { kind: 'route'; vehicleProfile: 'default' | 'trailer' | 'custom'; overrides?: ... }
  | { kind: 'stay'; campingProfile: 'tent' | 'camper' | 'caravan' | 'custom'; windowKind: 'day' | 'night' | 'full'; overrides?: ... }
```

Do not force camping into `trailerKind`.

Also do not build an over-abstract threshold framework on day one. The first phase can expose enough context to avoid painting us into a route-only model.

## UI Sharing Strategy

Shared UI belongs under `components/weather/*` only when it is genuinely weather-generic.

Likely shared:

- `ForecastDrawer`
- forecast metric cells
- status badge/pill
- compact metric rows
- route weather map point drawers if generalized
- loader pattern

Product-specific:

- Ferðaveðrið departure scrubber
- Tjaldferð multi-stop timeline
- Tjaldferð campsite picker
- saved itinerary recheck UI

Design.md constraints:

- mobile-first
- no nested cards
- structured summary rows
- no dashboard sprawl
- all text in messages
- loader/pending state for route/forecast requests

## Product Development Order

### Phase 0.5 - Future-proof shared core plan

Claude Code should return an implementation plan, not code, that names:

- tests to add before refactor,
- first shared seam,
- exact files/functions,
- how `checkTravelWeather()` adopts the seam,
- how no-regression is proven.

### Phase 0.6 - Implement first seam

Only after Stebbi explicitly approves implementation:

- add characterization tests,
- extract first seam,
- adapt `checkTravelWeather()`,
- run type-check/tests.

No camping UI yet.

### Phase 0.7 - Hidden Tjaldferð prototype

After the shared seam is used by Ferðaveðrið:

- add `CAMPING_ENABLED`,
- hidden route,
- static campsite list,
- one simple trip calculation,
- no SQL,
- no nav link.

### Phase 1 - Multi-stop and stay windows

- origin -> campsite A -> campsite B -> home
- route leg assessment via shared core
- stay window assessment via shared core + camping profiles
- compact timeline UI

### Phase 2 - Saved living itinerary

- SQL with strict RLS
- saved trips/stops/snapshots
- re-open and re-check
- current vs last assessment

### Phase 3 - Suggestions

- deterministic ranking
- staged/cached route evaluation
- strict rate limits
- no AI decisions.

### Phase 4 - AI copy layer

- summarize deterministic results
- explain tradeoffs
- never decide safety.

## Implementation Guardrails

Claude Code should not:

- export private helpers as the main contract,
- copy/paste weather logic into `lib/camping`,
- introduce camping route status rules separately from Ferðaveðrið,
- build public UI before the shared seam exists,
- add SQL before the saved-trip model is reviewed,
- add AI,
- add public nav,
- weaken auth/RLS,
- store raw Google/Met.no payloads.

Claude Code should:

- keep `checkTravelWeather()` signature stable,
- add tests before moving logic,
- introduce small shared domain functions,
- make Ferðaveðrið call the shared seam,
- make camping call the same seam later,
- clearly mark temporary adapters as temporary.

## What "Good" Looks Like

After Phase 0.6:

```txt
Ferðaveðrið UI
  -> checkTravelWeather()
      -> assessRouteLeg() shared core
      -> existing DeterministicResult adapter

Tjaldferð later
  -> assessTrip()
      -> assessRouteLeg() shared core
      -> assessForecastWindow() shared core
      -> camping timeline adapter
```

One route-weather improvement should land in `assessRouteLeg()` and benefit both products.

## What "Bad" Looks Like

```txt
Ferðaveðrið
  -> checkTravelWeather()
      -> old internal route logic

Tjaldferð
  -> lib/camping/assessment.ts
      -> imports evalDrivingLeg/findWorstMetric/getHoursNearEta
      -> own aggregation/reasoning/status rules
```

This is not catastrophic on day one, but it is where drift starts.

## Questions Claude Code Should Answer Next

1. What is the smallest domain-level seam that both Ferðaveðrið and Tjaldferð can share?
2. What characterization tests should be added before extraction?
3. How can `checkTravelWeather()` adopt that seam without changing output?
4. Which current private helpers should remain private?
5. Which existing types can become shared contracts without churn?
6. How much of v004 can be kept after changing the shared boundary?
7. What is the exact order of commits/steps if Stebbi later approves implementation?

## Suggested Message To Claude Code

```text
Claude Code, Stebbi vill frekar future-proof shared core heldur en additive plan sem getur orðið thin fork.

Endurskrifaðu Phase 0.5 planið út frá v006:
- enginn kóði enn
- ekki exporta private helpers sem aðal-contract
- finna minnsta domain-level shared seam, t.d. assessRouteLeg eða assessRoutePoint
- bæta characterization tests áður en logic er hreyft
- láta núverandi checkTravelWeather nota shared seam án hegðunarbreytingar
- halda checkTravelWeather signature/output stable
- Tjaldferð má ekki fá sér route-weather orchestration sem fork
- camping-specific stay/night/temp logic má vera sér, en það á að nota shared metric/window assessment þar sem hægt er
- feature flag kemur eftir að shared seam er til

Skilaðu implementation plan með nákvæmri röð, skrám, testum, áhættu og localhost checks.
```

## Localhost Checks For Stebbi

No app behavior exists from this handoff.

When Claude Code returns the revised plan, Stebbi should verify:

1. The plan starts with tests/characterization, not UI.
2. The plan names a real shared domain function, not exported private helpers.
3. Existing Ferðaveðrið adopts the shared seam.
4. Tjaldferð uses the same seam.
5. `checkTravelWeather()` remains stable from the outside.
6. Feature flag work starts after or alongside the shared seam, not before it.
7. No SQL, public nav, public route, or AI is included yet.

When implementation later exists:

- `/vedrid` and `/auth-mvp/vedrid` should behave the same before/after extraction.
- Existing weather tests should pass.
- New characterization tests should pass.
- If `CAMPING_ENABLED=false`, no Tjaldferð route/API should be visible.
- If `CAMPING_ENABLED=true`, hidden prototype should use the same shared route assessment as Ferðaveðrið.

## Bottom Line

The right move is not "big refactor now" and not "hidden fork now".

The right move is:

- tiny shared seam,
- tests first,
- Ferðaveðrið adopts it,
- Tjaldferð builds on it,
- repeat.

That gives Stebbi the future-proof foundation without freezing current Ferðaveðrið development.

