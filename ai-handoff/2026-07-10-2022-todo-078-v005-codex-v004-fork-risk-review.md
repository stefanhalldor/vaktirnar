# TODO 078 - Codex review of v004 additive Phase 0.5 plan

Created: 2026-07-10 20:22  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Architecture review  
Reviewed: `2026-07-10-2018-todo-078-v004-claude-additive-phase05-plan.md`

## Findings

### P1 - v004 reduces short-term production risk, but it does create real future fork risk

The additive-only approach is attractive because it does not touch `checkTravelWeather()` and therefore keeps current Ferðaveðrið safer during experimentation.

But as a long-term foundation it is not future-proof enough.

The plan says:

- export private functions from `lib/weather/travel.ts`
- create `lib/camping/assessment.ts`
- write camping assessment "from scratch"
- leave `checkTravelWeather()` unchanged

That means Ferðaveðrið and Tjaldferð would not actually share the full assessment engine. They would share a few low-level helper functions, but the orchestration, result semantics, status aggregation, reason codes and future behavior could drift.

This is not a full fork on day one, but it is a **thin fork**:

- Ferðaveðrið keeps the monolithic `checkTravelWeather()` orchestration.
- Tjaldferð gets its own `lib/camping/assessment.ts` orchestration.
- Future fixes to route/stay status logic may land in one side and not the other.
- Exporting formerly private helpers can freeze internal implementation details as a pseudo-public API.

Codex answer to Stebbi's question:

> Já, ef v004 verður grunnurinn til lengri tíma erum við að mála okkur inn í mögulegt fork-vesen.

It is acceptable only as a short-lived hidden spike if explicitly marked as temporary.

### P1 - The plan should not export private helpers directly as the shared boundary

Exporting `evalDrivingLeg`, `findWorstMetric`, and `getHoursNearEta` is a weak boundary.

Why:

- Their names and inputs were shaped by the current `travel.ts` internals.
- They are not product-level concepts.
- Once camping imports them, they become harder to change.
- They do not guarantee shared behavior at the level Stebbi cares about.

The shared boundary should be a product/domain boundary, for example:

```ts
assessRouteLeg(input): RouteLegAssessment
assessForecastWindow(input): ForecastWindowAssessment
aggregateWeatherTrip(input): TripAssessment
```

The helpers may still exist internally, but camping should not be coupled to them directly.

### P1 - Better middle path: additive extraction with Ferðaveðrið adoption, one seam at a time

We do not need a giant refactor. Stebbi's concern about blocking Ferðaveðrið hotfixes is valid.

But the first phase should still prove shared behavior.

Recommended revised Phase 0.5:

1. Create a new shared module, for example:
   - `lib/weather/assessment/routeLeg.ts`
   - `lib/weather/assessment/forecastWindow.ts`
   - or `lib/weather/assessment.ts` if smaller.
2. Move or wrap the smallest stable piece of logic into a domain-level function:
   - `assessRouteLeg(...)`
   - input/output chosen for both Ferðaveðrið and Tjaldferð.
3. Update `checkTravelWeather()` to call that one shared function.
4. Add characterization tests proving Ferðaveðrið output is unchanged.
5. Let Tjaldferð call the same shared function.

This is still additive and incremental:

- no SQL
- no public UI
- no big rewrite of `checkTravelWeather()`
- no change to the result UX
- but it avoids a hidden fork.

### P2 - Tjaldferð-specific stay logic can be additive, but route logic should be shared first

It is reasonable that camping has new domain logic:

- night/day windows
- min temperature for tents
- campsite stay scoring

Those concepts do not exist in Ferðaveðrið and can live in `lib/camping` at first.

But route-leg weather logic absolutely overlaps with Ferðaveðrið and should not be reimplemented or orchestrated separately if avoidable.

Suggested line:

- Shared in `lib/weather/*`: route leg assessment, metric thresholds, forecast rows, status derivation.
- Camping-specific in `lib/camping/*`: campsite metadata, stay windows, multi-stop trip aggregation, camping equipment presets.

### P2 - Feature flag is still the right product move

Codex agrees with using a feature flag:

- `CAMPING_ENABLED=true`
- depends on `WEATHER_ENABLED=true`
- no public nav initially
- no guest/public access initially unless Stebbi asks

But the flag should hide an experiment that consumes shared weather primitives, not a separate implementation.

### P2 - v004's "no menu link, no SQL, hidden route" is good

The low-risk shell is good:

- no SQL
- no saved trips yet
- hidden route
- no nav entry
- feature flag off in production

Keep these parts.

The part to change is the shared-core boundary.

## Recommended Decision

Do **not** approve v004 exactly as written as the long-term Phase 0.5.

Approve a revised version:

1. Keep additive-only and feature-flagged spirit.
2. Do not export internal helpers as the main seam.
3. Introduce a small shared domain function first.
4. Make current Ferðaveðrið use that shared function.
5. Make Tjaldferð use the same function.
6. Keep camping stay/window logic additive in `lib/camping`.

## Suggested Message To Claude Code

```text
Claude Code, v004 er rétt í því að við viljum ekki stóran refactor sem stoppar Ferðaveðrið, en Codex og Stebbi hafa áhyggjur af thin-fork.

Endurskrifaðu Phase 0.5 planið þannig að það sé enn lítið og additive, en exporti ekki bara private helpers sem shared boundary.

Markmiðið:
- búa til lítinn shared weather assessment seam, t.d. `assessRouteLeg(...)`
- láta núverandi `checkTravelWeather()` nota þann seam án hegðunarbreytingar
- láta Tjaldferð prototype nota sama seam
- halda camping-specific stay/night/temp logic í `lib/camping`
- halda feature flaggi, engri SQL, engum nav-link og engri public exposure
- sýna hvaða characterization tests tryggja að Ferðaveðrið breytist ekki

Við viljum ekki fullan refactor núna, en við viljum heldur ekki prototype sem verður thin fork.
```

## Localhost checks for Stebbi

No app behavior exists from this review.

When Claude Code returns the revised plan, Stebbi should verify:

1. Does the plan include at least one shared domain function used by both Ferðaveðrið and Tjaldferð?
2. Does `checkTravelWeather()` still own the same public behavior but call the shared seam internally?
3. Are existing Ferðaveðrið tests kept and/or strengthened?
4. Is camping route logic prevented from becoming a separate implementation?
5. Is the experimental UI still hidden behind `CAMPING_ENABLED`?

When implementation later exists:

- `/vedrid` should behave the same before/after refactor.
- `/auth-mvp/vedrid` should behave the same before/after refactor.
- With `CAMPING_ENABLED=false`, no Tjaldferð route/API should be usable.
- With `CAMPING_ENABLED=true`, the hidden prototype can call the same route assessment seam.

## Bottom Line

v004 is safe for avoiding immediate breakage, but not safe enough as a future-proof shared architecture.

Use a small strangler-style extraction instead:

- tiny shared seam,
- existing Ferðaveðrið adopts it,
- Tjaldferð consumes it,
- repeat seam by seam.

That keeps us moving without painting ourselves into a fork.

