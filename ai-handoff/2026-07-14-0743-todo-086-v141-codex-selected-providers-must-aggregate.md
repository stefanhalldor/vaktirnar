# TODO 086 v141 - Codex addendum: selected providers must aggregate

Created: 2026-07-14 07:43  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Context: Stebbi feedback after screenshots comparing met.no-only and Veðurstofan-only

## Critical Product Correction

Stebbi clarified a very important rule:

> Útreikningur á alltaf að taka mið af öllum völdum gagnaveitum.

This overrides earlier wording in v138/v140 that said "MET/Yr remains baseline" when both providers are enabled.

Correct rule:

- `met.no` selected alone: route assessment is based on MET/Yr only.
- `Veðurstofan` selected alone: route assessment is based on Veðurstofan only.
- `met.no` + `Veðurstofan` selected together: route assessment is based on both selected providers.
- Future `Vegagerðin` selected too: route assessment must include Vegagerðin as another selected provider.

The active result must not let `met.no` "trump" or hide worse Veðurstofan data when both are selected.

## What This Means In The UI

For each departure slot:

1. Compute MET/Yr status if `met.no` is selected.
2. Compute Veðurstofan status if `Veðurstofan` is selected.
3. Combine selected provider statuses by worst severity.
4. Scrubber dot/count/filter uses the combined status.
5. Summary "Á leiðinni" uses the worst selected-provider point.
6. Map shows points from all selected providers.
7. "Allir spápunktar" shows point/cards from all selected providers.

If Veðurstofan is worse than MET/Yr for the selected slot, the combined result must show the Veðurstofan-derived worse status and say that the decisive point/provider is Veðurstofan.

## Provider Aggregation Model

Claude Code should avoid another two-provider special case. Implement or plan toward a generic active-provider aggregate:

```ts
type WeatherProviderKey = 'metno' | 'vedurstofan' | 'vegagerdin'

type ProviderAssessment = {
  provider: WeatherProviderKey
  status: WindDisplayStatus
  windMs: number | null
  label: string
  pointId: string
  lat: number | null
  lon: number | null
  forecastTimeIso: string | null
  etaIso: string | null
  distanceFromOriginM: number | null
}

type CombinedSlotAssessment = {
  departureIso: string
  arrivalIso: string
  status: WindDisplayStatus
  decisive: ProviderAssessment | null
  assessmentsByProvider: Partial<Record<WeatherProviderKey, ProviderAssessment[]>>
}
```

For MVP this can be lighter than the exact shape above, but the concept matters:

- each provider produces assessments
- selected providers are aggregated
- the UI consumes the aggregate
- provenance is preserved so Stebbi can see which provider drove the result

## Severity Rule

Use `worstWindDisplayStatus` / `WIND_DISPLAY_STATUS_PRIORITY_ORDER` for provider aggregation.

Example:

- MET/Yr slot = `innan-marka`
- Veðurstofan slot = `othaegilegt`
- combined selected-provider slot = `othaegilegt`
- decisive provider = `vedurstofan`

If two providers tie, prefer deterministic tie-break:

1. `haettulegt` / worst severity first by status.
2. Higher `windMs` if both have wind.
3. Provider order only as final stable tie-break, e.g. `vegagerdin`, `vedurstofan`, `metno` once Vegagerðin exists. For now use `vedurstofan` before `metno` only if needed to make test data easier to inspect.

Tie-break must be documented in code or tests if implemented.

## Important Distinction: Destination Section

The previous v140 MVP decision still stands:

- Destination section may use MET/Yr destination forecast as context for now.
- That destination MET/Yr data must not drive route assessment.

So even if the destination section is shown from MET/Yr, the route score/scrubber/worst point must still aggregate only the selected route providers.

## What To Change From Current Direction

Earlier handoff language said:

- "Both providers: MET/Yr assessment baseline."

That is no longer correct.

Replace with:

- "Both providers: combined assessment across selected providers; worst selected provider wins, with provider provenance shown."

## Suggested Implementation Sequence

### Step 1 - Add active provider slot status aggregation

Build a provider-aware slot status array for outbound candidates:

- MET/Yr slot status from existing `classifyCandidateWindDisplayStatus`.
- Veðurstofan slot status from existing `vedurstofanSlotStatuses`.
- Combined slot status = worst of all selected providers for that slot.

Pass combined statuses to `DepartureHeatmap` as `slotStatusOverrides` whenever more than one selected provider is active, not only in Veðurstofan-only mode.

### Step 2 - Summary decisive point

For selected/reference slot:

- compute MET/Yr decisive point if selected
- compute Veðurstofan decisive station if selected
- choose the worse provider assessment
- render that as the main "Á leiðinni" summary
- include provider label, e.g. `Veðurstofan (í prófun)` or `met.no`

This is the missing "met.no must not trump Veðurstofan" fix.

### Step 3 - Map markers

When both providers are selected:

- keep MET/Yr route markers
- keep Veðurstofan provider overlay markers
- marker colors should reflect their own provider assessment at the active slot
- if the combined decisive point is Veðurstofan, the summary should point to Veðurstofan even if MET/Yr route markers are green

### Step 4 - Filters

Scrubber filter chips should count combined selected-provider statuses.

Map filter behavior can remain provider-marker-specific for now, but should not hide the decisive provider point accidentally.

### Step 5 - Tests

Add at least one focused test around provider aggregation logic if the logic is extracted.

Minimum test:

- MET/Yr status `innan-marka`
- Veðurstofan status `othaegilegt`
- both selected
- combined status `othaegilegt`
- decisive provider `vedurstofan`

## Acceptance Criteria

### Both met.no and Veðurstofan selected

- If Veðurstofan has worse wind than MET/Yr for a slot, scrubber shows the worse Veðurstofan status.
- The summary "Á leiðinni" names the Veðurstofan station/provider as the decisive point.
- Counts in filter chips match combined selected-provider slot statuses.
- MET/Yr does not override, hide, or downgrade Veðurstofan risk.

### met.no only

- Existing MET/Yr behavior remains.
- No Veðurstofan data contributes to route score.

### Veðurstofan only

- Existing Veðurstofan-only behavior remains.
- No MET/Yr route data contributes to route score.
- Destination section may still show MET/Yr context per v140, but not as scoring.

### No Providers

- No route assessment is shown.
- Provider toggles remain visible.

## Localhost Checks For Stebbi

Preconditions:

- Stebbi runs localhost himself.
- `WEATHER_ELTA_VEDRID_FLAG=true`.
- `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`.
- Veðurstofan product data has been warmed recently.
- No Supabase migration, cron run, deploy, push, or commit is part of these checks.

Use the route from the screenshot or another route where Veðurstofan produces worse status than MET/Yr.

1. `met.no` only:
   - Expected: fewer/lower risk slots if MET/Yr is milder.
   - Summary decisive point is MET/Yr.

2. `Veðurstofan` only:
   - Expected: Veðurstofan-only risk profile.
   - Summary decisive point is a Veðurstofan station.

3. Both selected:
   - Expected: combined risk should be at least as severe as the worse of the two individual provider views for each slot.
   - If Veðurstofan-only shows orange/red for a slot and MET/Yr-only is green/yellow, both-selected must show orange/red.
   - Summary should identify the provider/station that caused the combined severity.

4. Toggle back and forth:
   - Expected: scrubber colors/counts change to match active selected-provider set.
   - No stale MET/Yr-only result remains when Veðurstofan is also selected.
   - No stale Veðurstofan result remains when Veðurstofan is off.

5. Mobile:
   - Provider label/provenance in summary must fit without overflow.

## Notes For Claude Code

- This is a product correctness issue, not just copy/UI polish.
- Do not solve this by saying "Veðurstofan is just an overlay" when it is selected. Selected providers are active assessment inputs.
- Keep the implementation future-proof for Vegagerðin.
- Do not touch SQL, Supabase, cron, Vercel, migrations, feature access, commit, push, or deploy in this patch unless Stebbi separately approves.

## Óvissa / þarf að staðfesta

- Exact tie-break order can be decided by Claude Code, but it must be deterministic and not silently favor MET/Yr.
- Destination section remains an MVP MET/Yr context exception from v140, but should not be confused with route scoring.
