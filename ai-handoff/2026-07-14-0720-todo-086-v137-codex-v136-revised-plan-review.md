# TODO 086 v137 - Codex review of v136 revised plan

Created: 2026-07-14 07:20  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Reviewed: `2026-07-14-0713-todo-086-v136-claude-v135-revised-plan.md`

## Findings

### High - No-provider state must not hide the provider toggles

v136 Step 9 says to render the no-provider message "instead of the result card" when `hasNoActiveProvider` is true (`v136:314-323`). In current code the provider toggles live inside the combined result card (`app/auth-mvp/vedrid/FerdalagidClient.tsx:919`). If Claude Code wraps the whole card in `hasNoActiveProvider ? ... : ...`, Stebbi can turn both providers off and then lose the controls needed to turn them back on.

Fix before implementation: keep the provider filter/toggles always visible when the Veðurstofan layer is available, then render the no-provider message in the assessment area below those toggles. Acceptance: with both `met.no` and `Veðurstofan` off, the card still shows all provider toggles and the user can re-enable either provider without refreshing.

### High - `slotStatusOverrides` must drive every heatmap status path, not only dot color

v136 Step 6 is the right idea, but it must be implemented deeper than "use override for color/filter pill" (`v136:219-247`). Current `DepartureHeatmap` derives status in several places:

- `getWindStatus(c)` from MET/Yr candidate data (`components/weather/DepartureHeatmap.tsx:83-84`)
- filter counts (`DepartureHeatmap.tsx:88-91`)
- filtered slots (`DepartureHeatmap.tsx:95-103`)
- selected slot deselection (`DepartureHeatmap.tsx:103-116`)
- slot dot rendering (`DepartureHeatmap.tsx:184`)
- `SlotDetail` separately reclassifies the candidate (`DepartureHeatmap.tsx:318`)

Fix before implementation: add a single helper inside `DepartureHeatmap`, e.g. `getSlotStatus(candidate, index)`, and use it everywhere status is needed. If `showSelectedDetail` can ever be true while overrides are provided, `SlotDetail` must also receive the override status or be explicitly kept out of override mode. This keeps Veðurstofan-only from leaking MET/Yr statuses through counts, filtering, selection, labels, or details.

### High - Provider state should be generic now, not two-provider-specific

v136 introduces `WeatherProviderKey = 'metno' | 'vedurstofan' | 'vegagerdin'`, which is good, but Step 2 still derives mode from only `showMetno` and `showVedurstofan` (`v136:109-117`). Stebbi explicitly wants this ready for Vegagerðin soon.

Fix before implementation: create one canonical selected-provider model now, even if Vegagerðin is disabled:

```ts
const selectedWeatherProviders: Record<WeatherProviderKey, boolean> = {
  metno: showMetno,
  vedurstofan: showVedurstofan,
  vegagerdin: false,
}

const activeProviderKeys = (Object.keys(selectedWeatherProviders) as WeatherProviderKey[])
  .filter((key) => selectedWeatherProviders[key])
```

Then derive `hasNoActiveProvider`, `isMetnoOnly`, `isVedurstofanOnly`, map overlays, and future Vegagerðin behavior from that model. This avoids another rewrite when Vegagerðin lands.

### Medium - Fix the threshold type in the helper before coding

v136 Step 4 uses `ResolvedThresholds` in the pseudo-code (`v136:150`), but the repo type is `ResolvedTravelThresholds` (`lib/weather/types.ts:341`). This is small, but it will produce avoidable TypeScript churn if copied literally.

Fix: use `ResolvedTravelThresholds` in `computeVedurstofanAssessments`.

### Medium - Make worst-status reduction explicit and test it

`WIND_DISPLAY_STATUS_PRIORITY_ORDER` is confirmed to be worst-first and `no_data` last (`lib/weather/windDisplayStatus.ts:17-24`), so v136's reduction can work. Still, inline index comparison is brittle if a future provider adds a new status or a status is missing.

Fix: add a tiny helper, e.g. `isWorseWindDisplayStatus(a, b)` or `worstWindDisplayStatus(a, b)`, and use it for Veðurstofan scrubber slots. Add a focused test that verifies:

- `haettulegt` beats all other statuses
- `othaegilegt` beats `innan-marka`
- real data beats `no_data`
- all `no_data` remains `no_data`

### Medium - Avoid duplicated `ProviderMapPoint` shapes

v136 suggests local `ProviderMapPoint` in `FerdalagidClient.tsx` and an equivalent in `TravelAuditMap.tsx` (`v136:82-100`, `v136:276-278`). TypeScript's structural typing will allow this, but it invites drift as Vegagerðin is added.

Fix: export `ProviderMapPoint` from `components/weather/TravelAuditMap.tsx` or move it to a tiny shared type file. Keep the type generic:

- `provider`
- `lat/lon`
- `id`
- `label`
- `status`
- `windMs`
- `forecastTimeIso` or `ftimeIso`
- `etaIso`

I would prefer `forecastTimeIso` in the generic type and map Veðurstofan `row.ftimeIso` into it at the boundary, because `ftimeIso` is provider-specific naming.

### Low - Good call to quarantine `augmentedResult`, but remove it from tests deliberately

v136 Step 11 is directionally right: `augmentedResult` should not remain a client-facing payload for the live user model. Current tests explicitly expect it (`lib/__tests__/weather-travel-api.test.ts:272-286` from earlier grep output), so Claude Code should update that test intentionally instead of just deleting the field and reacting to failures.

## Overall Review

v136 is good enough as the implementation base after the fixes above. It correctly moves away from "Veðurstofan attached to MET/Yr points" and toward first-class provider data. The most important remaining correction is UI state ownership: active provider selection must decide all assessment surfaces, and the UI must never strand the user with no way to turn a provider back on.

Codex recommendation: Claude Code should implement v136 with the corrections in this review before changing behavior further. Do not add Vegagerðin data yet; just shape the provider model so Vegagerðin can be added without another round of rewiring.

## Suggested Next Step For Claude Code

1. Update v136 implementation plan with the findings above.
2. Implement only the provider-aware display/assessment fix:
   - generic selected-provider model
   - Veðurstofan-derived scrubber statuses
   - Veðurstofan-derived worst/summary point
   - status-colored provider overlay markers
   - no-provider state that keeps toggles visible
3. Do not change SQL, Supabase, cron, Vercel, migrations, feature access, or commits in this step.
4. Add/adjust focused tests for provider selection and scrubber override behavior.

## Tests To Run After Implementation

Recommended:

```bash
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
npm run test:run -- components/weather/__tests__/DepartureHeatmap.test.tsx
npm run type-check
```

If there is no existing `DepartureHeatmap` test file, add the smallest focused test near the existing weather/component test pattern, or cover the override behavior in the closest existing component test.

## Localhost Checks For Stebbi

Preconditions:

- Stebbi runs localhost himself.
- `WEATHER_ELTA_VEDRID_FLAG=true`.
- `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`.
- The Veðurstofan product tables have been warmed recently.
- No Supabase migration, cron run, deploy, push, or commit is part of this check.

Check `/auth-mvp/vedrid` with a known route such as Reykjavík to Stóra-borg:

1. `met.no` only:
   - Map shows only MET/Yr route points.
   - Scrubber, worst point, selected point, and "Allir spápunktar" use MET/Yr values.
   - Existing behavior should look unchanged.

2. `Veðurstofan` only:
   - Map shows only Veðurstofan station markers near the route, not the 72 MET/Yr points.
   - Markers are severity-colored, not all purple.
   - Scrubber statuses come from Veðurstofan rows for each departure slot.
   - Worst point/route summary uses the worst Veðurstofan station for that slot.
   - The card shows station name, wind, forecast time, and ETA/reference time.
   - No `Yr`, `Hrá met.no gögn`, `Punktur X/72`, or MET/Yr best-window text remains in the active Veðurstofan-only assessment.

3. Both `met.no` and `Veðurstofan`:
   - MET/Yr remains the baseline route assessment unless explicitly changed later.
   - Veðurstofan markers/rows are visible as the test layer.
   - Provider labels make it clear which value comes from which source.

4. No providers selected:
   - The UI says to choose at least one data source.
   - The provider toggles remain visible and tappable.
   - No stale MET/Yr or Veðurstofan result is displayed as if active.

5. Toggle stress check:
   - Toggle `met.no` and `Veðurstofan` on/off several times.
   - No duplicate map markers.
   - No stale scrubber counts.
   - No stale worst point from a provider that is currently off.

6. Mobile:
   - Test roughly 360 px, 390 px, and 460 px widths.
   - Provider toggles, scrubber, map, and point cards do not horizontally overflow.

## Óvissa / þarf að staðfesta

- I did not run the full app or browser checks; this is a plan/code-shape review only.
- I did not inspect every line of the current modified worktree, only the relevant provider, scrubber, status, and map paths.
- The exact route URL and local auth state should be confirmed by Stebbi during localhost checks.
