# TODO 078 - Codex handoff: continue shared-weather refactor, tighten release workflow

Created: 2026-07-11 08:23  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Review + continuation handoff for Claude Code  
Related TODO: #78 Ferðalagið / shared route-weather core  
Reviews:

- `2026-07-11-0815-todo-078-v012-claude-phase05ab-prerelease.md`

Builds on:

- `2026-07-10-2026-todo-078-v006-codex-future-proof-shared-weather-core.md`
- `2026-07-11-0731-todo-078-v007-codex-product-flow-model-addendum.md`
- `2026-07-11-0737-todo-078-v008-codex-single-drive-to-trip-addendum.md`
- `2026-07-11-0745-todo-078-v009-codex-flagged-release-strategy.md`
- `2026-07-11-0757-todo-078-v010-claude-preimplementation-plan.md`
- `2026-07-11-0801-todo-078-v011-codex-v010-scope-review.md`

Status: Handoff/review only. No implementation approval implied.

## Executive Summary

Phase 0.5A/0.5B looks okay to keep in production.

Codex found no release-blocking issue in the shared route-leg extraction. The current commit on `origin/main` is:

```txt
3ef0887 refactor: extract assessRouteLeg shared weather seam from travel.ts (#78)
```

Codex local checks after the release:

```txt
npm run type-check
-> pass

npm run test:run -- lib/__tests__/weather-assessment.test.ts lib/__tests__/weather-travel.test.ts lib/__tests__/weather-travel-api.test.ts
-> 3 files passed, 136 passed, 5 skipped
```

Stebbi also says the change appears okay in production. Codex recommendation: do not roll back. Continue from this commit.

## Workflow Correction For Claude Code

This part is important.

The v012 handoff says:

```txt
Status: Framkvæmd lokið. Ekkert commitað enn.
```

But the change is already committed and pushed to `origin/main` as `3ef0887`, and Stebbi says Claude Code already released it.

This is not a reason to revert, but it is a workflow problem.

Going forward, Claude Code must not treat vague wording such as:

- "gefa út"
- "áfram gakk"
- "klárum þetta"
- "virðist í lagi"
- "LGTM"

as implicit permission for commit, push, deploy, SQL, migration, or production changes.

Per `WORKFLOW.md`, commit, push, deploy and migration require explicit, scoped permission from Stebbi.

Future release handoffs must include:

1. Exact commit hash.
2. Whether the commit was pushed.
3. Whether Vercel deployment was started.
4. Whether Vercel deployment completed green.
5. What tests/type-check/build were run locally.
6. What was not run.
7. Whether SQL, auth, RLS, env vars, secrets, billing, production data or user data were touched.
8. Localhost checks for Stebbi.

If Claude Code is uncertain whether Stebbi approved deploy, Claude Code must stop and ask.

## Current Technical State After Phase 0.5A/0.5B

New shared seam:

```txt
lib/weather/assessment.ts
```

Main domain API:

```ts
assessRouteLeg(input: RouteLegInput): RouteLegAssessment
```

Current return type:

```ts
export type RouteLegAssessment = TravelCandidate
```

Supporting utilities:

```ts
assessDrivingConditions()
getForecastHoursNearEta()
```

These are acceptable as supporting utilities, but they are not the domain seam. Future code should use `assessRouteLeg()` for route-leg weather assessment rather than recreating its logic.

Current `lib/weather/travel.ts` now composes:

```txt
checkTravelWeather()
  -> generateCandidates()
      -> assessRouteLeg()
  -> buildSingleDepartureTimeline()
      -> assessRouteLeg()
  -> route weather point / arrival / forecast-row composers
```

This is the right direction.

## Non-Negotiable Architecture Direction

Do not fork Ferðaveðrið and Ferðalagið.

The product may later expose separate modes:

```txt
Einn akstur
Ferðalag
```

But the route-weather assessment engine must stay shared.

Conceptually:

```txt
Einn akstur
  = one-leg WeatherTrip

Ferðalag
  = multi-stop WeatherTrip
  = many route legs
  = optional campsite/stay windows later
```

Camping/tjaldsvæði is a use case or preset inside `Ferðalag`, not a separate route-weather engine.

## Exact Next Refactor Plan

Claude Code should not jump directly into camping UI, campsite discovery, SQL, or saved trips.

The next work should harden the shared core and introduce the generic trip model in small, testable steps.

### Phase 0.5C - Contract hardening and documentation only

Goal:

- make it explicit which functions are shared domain contracts;
- prevent future code from importing low-level helpers as a substitute for `assessRouteLeg`;
- keep current `/vedrid` behavior unchanged.

Allowed changes:

- comments/docs around `lib/weather/assessment.ts`;
- small type-level cleanup if needed;
- tests proving `assessRouteLeg` remains equivalent for current behavior.

Do not:

- add UI;
- add API route;
- add feature flag;
- add SQL;
- add campsite logic.

Specific guidance:

- `assessRouteLeg()` is the domain seam.
- `assessDrivingConditions()` and `getForecastHoursNearEta()` may stay exported if `travel.ts` needs them, but comments should keep them framed as supporting utilities.
- Do not rename `TravelCandidate` everywhere yet.
- Do not move `buildRouteWeatherPoints`, `buildHighlightedIssue`, `buildSingleDepartureTimeline`, arrival enrichment or route result formatting unless there is a very specific reason. Those are still Ferðaveðrið composers.

### Phase 0.6A - Add shared trip model types, no behavior change

Goal:

- introduce a generic trip shape that can represent current single-drive weather without making the UI heavier.

Suggested file:

```txt
lib/weather/trip/types.ts
```

or, if the repo prefers fewer folders:

```txt
lib/weather/trip.ts
```

Suggested conceptual types:

```ts
export type WeatherTripMode = 'single_drive' | 'multi_stop_trip'

export type TripPlace = {
  name: string
  formattedAddress?: string
  lat?: number
  lon?: number
  placeId?: string
}

export type TripStopKind = 'origin' | 'destination' | 'campsite' | 'home' | 'waypoint'

export type TripStop = {
  id: string
  kind: TripStopKind
  place: TripPlace
  stayWindow?: TripStayWindow
}

export type TripLeg = {
  id: string
  fromStopId: string
  toStopId: string
  routeOptionId?: string
  departureIso?: string
  arrivalIso?: string
}
```

Important:

- Do not overbuild.
- Do not require current Ferðaveðrið UI to create this model yet unless that is low-risk and fully tested.
- Do not persist it.
- Stops are itinerary source of truth for multi-stop trips.
- Legs are calculated/selected journeys between stops.
- Current `Einn akstur` maps to origin + destination + one leg.

### Phase 0.6B - Pure `assessWeatherTrip()` composer, no fetch/API/UI

Goal:

- create a pure domain composer that assesses one or more already-prepared route legs by calling `assessRouteLeg()`.

Suggested file:

```txt
lib/weather/trip/assessment.ts
```

Suggested shape:

```ts
export type WeatherTripAssessmentInput = {
  trip: WeatherTrip
  legs: RouteLegInput[]
}

export type WeatherTripAssessment = {
  overallStatus: WeatherStatus
  legAssessments: RouteLegAssessment[]
  worstLegId?: string
  worstRouteIndex?: number
}

export function assessWeatherTrip(input: WeatherTripAssessmentInput): WeatherTripAssessment
```

Rules:

- It must not call Google Maps.
- It must not call Met.no.
- It must not know about React/UI.
- It must not store data.
- It must call `assessRouteLeg()` for each driving leg.
- It should be tested with deterministic fixtures.

This is the first real bridge from single-drive to multi-stop without making a UI fork.

### Phase 0.6C - Optional adapter from current one-drive input to WeatherTrip

Only do this if Phase 0.6A/0.6B are stable and Stebbi approves.

Goal:

- prove that current Ferðaveðrið can be represented as a one-leg trip internally.

Possible function:

```ts
buildSingleDriveTrip(input: TravelWeatherInput): WeatherTrip
```

Do not change `checkTravelWeather()` public signature.

`checkTravelWeather()` may remain the public compatibility wrapper.

### Phase 0.7 - Hidden flagged trip mode, after core is ready

Only after the pure shared trip assessment exists.

Preferred flag:

```txt
WEATHER_TRIP_ENABLED
```

Meaning:

- gates experimental `Ferðalag` mode;
- gates `Breyta í ferðalag`;
- gates add-stop UI;
- gates hidden trip route/mode.

Do not use `TJALDFERD_ENABLED` as the architecture flag.

Avoid using `CAMPING_ENABLED` as the main flag. Campsites are a use case inside the trip model, not the architecture.

Possible later narrow flag:

```txt
WEATHER_CAMPSITE_PRESET_ENABLED
```

Meaning:

- gates `Finna tjaldsvæði`;
- gates campsite-specific preset UI;
- still uses the same shared route/weather core.

### Phase 1 - Product UI

Not in the next implementation unless Stebbi explicitly approves.

When UI starts, follow `Design.md`:

- mobile-first, especially 360-460 px;
- no dashboard sprawl;
- no nested cards;
- `Einn akstur` remains fast and default;
- `Ferðalag` is progressive, not forced;
- use segmented control only if it is genuinely a mode switch;
- all text in `messages/is.json` and `messages/en.json`;
- route/data waits need visible Teskeið loader/pending state.

Possible final product shape:

```txt
/vedrid
  default: Einn akstur
  optional mode: Ferðalag
```

Hidden prototype may temporarily use another route, but the final product should feel like one Veðrið product with modes, not two unrelated Teskeiðar.

## Related TODOs To Keep Separate

These are valuable, but they should not be mixed into the next shared-core refactor unless Stebbi explicitly changes scope:

- Route family / `Um Þingvelli` support.
- `Af stað!` button for custom/curated routes.
- Weather-risk preview directly on route option cards.
- Dangerous road segment warnings, e.g. Öxi with trailer/camper.

These should later become consumers of the shared route/trip assessment core.

In particular, route option weather-risk previews are a good future consumer of `assessRouteLeg()`, but they may have cost/latency implications and should be planned separately.

## What Claude Code Should Do Next

Recommended immediate next step:

1. Return a short implementation plan for Phase 0.5C + Phase 0.6A only.
2. Do not code unless Stebbi explicitly says to execute.
3. The plan should name exact files, tests, and out-of-scope items.
4. If Stebbi approves implementation, do Phase 0.5C/0.6A first.
5. Stop and hand off before Phase 0.6B if the model shape becomes contentious.

If Stebbi explicitly asks Claude Code to implement immediately, Codex approves only this narrow execution scope:

- add shared trip model types;
- add tests for type/model mapping if useful;
- no UI;
- no API;
- no SQL;
- no env var;
- no feature flag wiring;
- no camping-specific logic;
- no route-family work.

## Tests / Verification For Next Implementation

At minimum:

```txt
npm run type-check
npm run test:run -- lib/__tests__/weather-assessment.test.ts lib/__tests__/weather-travel.test.ts lib/__tests__/weather-travel-api.test.ts
```

If new trip model tests are added:

```txt
npm run test:run -- lib/__tests__/weather-trip*.test.ts
```

If Phase 0.6B introduces `assessWeatherTrip()`:

- add deterministic tests with one leg and two legs;
- assert overall status aggregates correctly;
- assert each leg calls/uses route-leg assessment output, not duplicated threshold logic;
- assert no-data behavior is not silently converted to green.

## Localhost Checks For Stebbi

For Phase 0.5C/0.6A model-only work, Stebbi should see no UI changes.

After Claude Code implements the next narrow phase:

1. Open `/vedrid` as public user if `WEATHER_PUBLIC_ENABLED=true`.
2. Calculate a familiar one-drive route.
3. Expected: route option flow looks unchanged.
4. Complete the weather calculation.
5. Expected: status, scrubber, summary rows, destination weather, map points and forecast links look unchanged.
6. Open `/auth-mvp/vedrid` as logged-in user.
7. Calculate a familiar route with saved/recent places.
8. Expected: no change in saved-place behavior.
9. Confirm there is no visible `Ferðalag`, `Finna tjaldsvæði`, add-stop, saved-trip or camping UI.
10. Confirm no SQL migration needs to be run.

For any later UI phase:

1. Test at 360 px, 390 px and 460 px mobile widths.
2. Verify no horizontal overflow.
3. Verify no mobile zoom on inputs.
4. Verify loader/pending state appears for route/data waits.
5. Verify the default first screen still feels like current `Einn akstur`, not a heavy trip planner.

## Óvissa / þarf að staðfesta

- Codex did not run full browser regression; Stebbi's production smoke check is the main user-visible confirmation so far.
- Codex ran targeted tests and type-check only, not full `npm run test:run` after the production commit.
- The exact file layout for trip types should follow repo style after Claude Code inspects nearby modules.
- `WEATHER_TRIP_ENABLED` is the preferred future flag, but it should not be wired until UI/conversion affordances exist.

## Bottom Line

Current Phase 0.5A/0.5B release can stand.

Next move:

```txt
Keep current Ferðaveðrið stable.
Harden shared seam.
Introduce tiny generic trip model.
Do not build UI/API/SQL yet.
Do not fork camping.
Do not deploy without explicit release permission and accurate post-release handoff.
```

