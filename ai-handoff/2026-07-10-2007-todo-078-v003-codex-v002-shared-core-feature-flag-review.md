# TODO 078 - Codex review of Tjaldferð discovery v002

Created: 2026-07-10 20:07  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Review / product direction addendum  
Reviewed: `2026-07-10-2001-todo-078-v002-claude-v001-discovery-review.md`

## Findings

### P1 - The next phase must start with a shared weather/trip assessment core, not a parallel camping implementation

Claude Code's v002 is directionally right, especially the proposed extraction of `assessRouteLeg()`, `assessStayWindow()` and `aggregateTripAssessment()`.

But this is the non-negotiable product/architecture point from Stebbi:

> If Tjaldferð develops the current Ferðaveðrið inside a new feature, improvements must land in shared components/core so Ferðaveðrið benefits too.

That means the first implementation phase should not be:

- create `lib/camping/*`
- create camping endpoint
- copy enough of `checkTravelWeather()` to make it work
- later refactor if it sticks

It should be:

- extract a shared domain core from Ferðaveðrið
- make current Ferðaveðrið call that shared core
- prove output stays equivalent for existing Ferðaveðrið tests/use cases
- then build the feature-flagged Tjaldferð experiment on top of the same core

Otherwise we risk creating a second weather engine with slightly different rules, thresholds, labels, drawer rows, and edge cases. That is exactly what Stebbi wants to avoid.

Acceptance criteria for the first coding phase:

- Existing Ferðaveðrið continues to work through the extracted shared functions.
- Tjaldferð calls the same exported route/stay assessment functions, not copied logic.
- Any improvement to route weather, forecast rows, route warnings, threshold display, or forecast drawer data shape benefits both features.
- Tests cover that the refactor preserves existing Ferðaveðrið behavior.

### P1 - Feature flag is appropriate only after the shared-core boundary is explicit

Stebbi says:

> Ef svo er þá ættum við bara að byrja að prófa okkur áfram undir feature flaggi.

Codex agrees, with one sequencing condition:

1. First define/extract the shared core boundary.
2. Then add a feature-flagged Tjaldferð shell/prototype that uses it.

Feature flagging is good because the product is exploratory, but a flag should not become permission to build a hidden fork.

Suggested env flags:

- `CAMPING_ENABLED=true` as the global kill switch.
- Later, if guest access is added: `CAMPING_PUBLIC_ENABLED=true`.

Keep `WEATHER_ENABLED` as an implicit dependency. If `WEATHER_ENABLED !== 'true'`, camping should also be unavailable because it depends on the same route/forecast engine.

Potential route names:

- public: `/tjaldferd`
- logged-in: `/auth-mvp/tjaldferd`

If Phase 1 is only an internal experiment, start under the logged-in route and hide it from public navigation until Stebbi explicitly wants public exposure.

### P1 - Do not introduce camping-specific route weather labels unless the shared model supports them

v002 proposes camping-specific concepts such as night/day windows, stay thresholds, and camping equipment thresholds. These are good, but they should extend the shared model rather than fork it.

The shared model can distinguish:

- `assessmentKind: 'route' | 'stay'`
- `thresholdProfile: 'default' | 'trailer' | 'tent' | 'camper' | 'custom'`
- `timeWindowKind: 'departure' | 'arrival' | 'day' | 'night' | 'fullStay'`

This lets Ferðaveðrið keep route-oriented behavior while Tjaldferð adds stay-oriented behavior through the same primitives.

### P2 - UI component reuse should be explicit, not assumed

Likely reusable directly:

- `ForecastDrawer`
- metric cell rendering logic
- route map/audit map concepts
- route selection step ideas
- loader patterns
- threshold display patterns

Likely not directly reusable without extraction:

- the full `FerdalagidClient` flow
- the whole route result summary
- route-specific departure scrubber if used as a campsite stay timeline

Recommendation:

- Keep feature-specific containers separate.
- Share weather atoms/components and domain result shapes.
- Avoid moving everything into generic names prematurely.
- When a Tjaldferð UI improvement is really a weather improvement, implement it in the shared `components/weather/*` component with props, not in `components/camping/*`.

Example:

- A better `ForecastDrawer` should improve both.
- A new multi-stop trip timeline can live in `components/camping/*`.
- A reusable `WeatherMetricRow` or `WeatherStatusBadge` can live in `components/weather/*` if both features use it.

### P2 - Phase 1 can be feature-flagged and experimental, but still needs cost guardrails

Even under a flag, the prototype can call Google and Met.no.

Before exposing it beyond Stebbi/local testing:

- Keep the campsite list small.
- Do not implement automatic suggestion mode yet.
- Only calculate the user-selected route/stops.
- Use existing weather guest/login rate limits or add a camping-specific one before any public access.

Feature flag is not a billing guard by itself.

### P2 - v002’s “Phase 1 no SQL” is a good idea

Codex agrees with v002 that the first prototype can avoid SQL:

- static campsite list
- client state only
- calculate result
- no saved trips yet

But the “living itinerary” / saved recheck concept is one of the strongest login-value props and should remain in the data model design from day one.

Do not build a Phase 1 data shape that assumes trips are disposable or single-stop.

### P3 - Naming should stay undecided until first prototype

`Tjaldferð` feels better for multi-stop saved itinerary.

`Tjaldveðrið` feels better for “where should I camp based on weather?”

Do not bake the product name too deeply into code yet. Use neutral technical names where practical:

- `camping`
- `campingTrips`
- `CampingTrip`

UI copy can change later.

## Recommended Revised Next Step

Ask Claude Code for a **Phase 0.5 implementation plan**, not implementation yet, with this exact target:

> Extract the smallest shared weather/trip assessment core from Ferðaveðrið so current Ferðaveðrið keeps identical behavior, then add a feature-flagged Tjaldferð prototype shell that consumes the same core.

The plan should include:

1. Which functions move out of `checkTravelWeather()`.
2. Exact new module names and function signatures.
3. How current Ferðaveðrið will call the extracted core.
4. Which tests prove no regression.
5. Where `CAMPING_ENABLED` is checked.
6. What the first hidden prototype route would be.
7. How UI/component sharing is enforced.
8. What is explicitly not included yet:
   - no saved trips SQL
   - no suggestion mode
   - no AI
   - no public nav entry unless Stebbi asks

## Suggested Message To Claude Code

```text
Claude Code, rýndu v003 frá Codex og gerðu Phase 0.5 implementation plan, ekki kóða enn.

Mikilvægt: Stebbi vill ekki parallel/forkað Tjaldferð-veðurkerfi. Ef við byrjum undir feature flaggi þarf það að byggja á shared weather/trip assessment core þannig að framþróun nýtist bæði Ferðaveðrinu og Tjaldferð.

Skilaðu handoff með:
- hvaða hluti úr `checkTravelWeather()` þarf að extracta
- nýjum module/function signatures
- hvernig núverandi Ferðaveðrið heldur áfram að nota sama core
- hvaða tests tryggja no-regression
- hvaða feature flag á að nota (`CAMPING_ENABLED` + WEATHER_ENABLED dependency)
- fyrsta hidden prototype route
- hvernig UI/component sharing verður tryggt
- hvað er ekki innifalið enn: saved trips SQL, suggestion mode, AI, public nav
```

## Localhost checks for Stebbi

No new app behavior exists from this review.

When Claude Code returns the Phase 0.5 plan, Stebbi should check:

1. Does the plan explicitly keep Ferðaveðrið on the shared extracted core?
2. Does the plan avoid copy/pasting route/weather logic into `lib/camping/*`?
3. Is Tjaldferð behind a clear feature flag?
4. Is public exposure/nav excluded until explicitly approved?
5. Are regression tests planned for existing Ferðaveðrið?

When implementation later exists, localhost checks should include:

- `CAMPING_ENABLED=false`: Tjaldferð route/API unavailable or hidden.
- `CAMPING_ENABLED=true`: hidden prototype route loads.
- Existing `/vedrid` and `/auth-mvp/vedrid` still behave the same.
- Any shared component improvement appears in both features where applicable.
- No horizontal overflow on 360/390/460px mobile widths.

## Bottom Line

Codex agrees with Stebbi:

- If the architecture truly shares the Ferðaveðrið core, start experimenting under a feature flag.
- But make the first technical milestone the shared-core extraction and regression proof.
- Do not let the feature flag hide a fork.

