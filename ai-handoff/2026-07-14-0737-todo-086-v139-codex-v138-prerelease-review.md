# TODO 086 v139 - Codex review of v138 prerelease

Created: 2026-07-14 07:37  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Reviewed: `2026-07-14-0732-todo-086-v138-claude-v137-done-prerelease.md`

## Findings

### High - Veðurstofan map overlay does not update when the selected scrubber slot changes

`providerOverlayPoints` is recomputed from `referenceDepartureIso` / `referenceArrivalIso`, so in Veðurstofan-only mode the overlay marker colors, wind values, and marker titles should change when Stebbi clicks a different departure slot.

But `TravelAuditMap` only creates provider overlay markers inside the mount-only map init effect (`components/weather/TravelAuditMap.tsx:170-322`). That effect intentionally has exhaustive deps disabled and the map key only includes result/provider toggles (`app/auth-mvp/vedrid/FerdalagidClient.tsx:1408-1414`):

```tsx
key={`${result.id}-${showMetno ? 'm' : ''}-${showVedurstofan ? 'v' : ''}`}
```

Changing `selectedHeatmapIdx` changes `providerOverlayPoints`, but it does not remount the map and there is no follow-up effect that updates `vedurstofanMarkersRef`. Result: the summary and scrubber can move to a different Veðurstofan forecast slot while the map still shows stale marker colors/titles from the previous slot.

Fix options:

1. Preferred: add a separate `useEffect` in `TravelAuditMap` that watches `providerOverlayPoints`, clears `vedurstofanMarkersRef`, and recreates overlay markers using `mapRef.current` and `markerLibRef.current`.
2. Acceptable short-term: include a stable overlay key in the map `key`, e.g. selected slot/departure ISO, but this remounts the full map more often and may feel jumpy.

Acceptance: in Veðurstofan-only mode, click different scrubber hours and verify marker colors/titles change without needing to toggle providers.

### High - Parent auto-select for outbound scrubber filters still uses MET/Yr status

`DepartureHeatmap` itself now correctly accepts `slotStatusOverrides` and uses them for counts/filter/selection/detail (`components/weather/DepartureHeatmap.tsx:90-127`, `196`, `261-267`). Good.

However the parent auto-select effect still classifies outbound slots with MET/Yr candidate data:

- selected slot visibility check: `app/auth-mvp/vedrid/FerdalagidClient.tsx:516-520`
- visible slot predicate: `app/auth-mvp/vedrid/FerdalagidClient.tsx:523-530`

That means in Veðurstofan-only mode, if Stebbi filters the scrubber by a status, the child heatmap filters by Veðurstofan status, but the parent can reselect a slot by MET/Yr status. Since `referenceDepartureIso` uses `selectedHeatmapIdx` (`FerdalagidClient.tsx:706-719`), the summary/worst station/map overlay can then be based on a slot that is not actually visible under the Veðurstofan filter.

Fix: create one parent-level slot status resolver and use it in the auto-select effect:

```ts
function getOutboundSlotDisplayStatus(slot: TravelCandidate, idx: number): WindDisplayStatus {
  if (isVedurstofanOnly && vedurstofanSlotStatuses?.[idx]) return vedurstofanSlotStatuses[idx]
  return classifyCandidateWindDisplayStatus(slot, effectiveThresholds)
}
```

Then use that resolver anywhere parent logic checks outbound slot status. If hook ordering makes that awkward, move the auto-select effect below the computed `vedurstofanSlotStatuses` block or split the calculation into a stable array.

Acceptance: in Veðurstofan-only mode, filter scrubber to an orange/red status and confirm selected summary/worst station uses one of the visible Veðurstofan-colored slots, not a hidden MET/Yr-derived slot.

### Medium - Return heatmap still leaks MET/Yr when met.no is off

The return heatmap remains rendered whenever return candidates exist:

```tsx
{result && !loading && (result.travelPlan?.return?.candidates.length ?? 0) > 0 && (
  <DepartureHeatmap ... />
)}
```

This block is not gated by `showMetno`, `hasNoActiveProvider`, or provider-specific return support (`app/auth-mvp/vedrid/FerdalagidClient.tsx:1448-1462`). If Stebbi has a return trip and turns `met.no` off, this can still show a MET/Yr-based return scrubber.

Fix for this iteration: gate the existing return heatmap with `showMetno && !hasNoActiveProvider`, unless Claude Code also implements a first-class Veðurstofan return assessment. Since current work is about outbound route layer validation, hiding MET/Yr return data when met.no is off is safer.

### Low - Middle-status overlay markers rely on color only

The v138 handoff says provider overlay markers use `✓` for green and `!` for danger, but no label for middle statuses. This is probably acceptable for prerelease, but it means amber/orange distinction is color-only on the map. If Stebbi finds it hard to read, use short labels like `~` for approaching discomfort and `!` for uncomfortable/danger bands, with marker title carrying the full text.

## What Looks Good

- `augmentedResult` was removed from the client payload and route handler.
- `slotStatusOverrides` is correctly threaded through the internal `DepartureHeatmap` status paths.
- `ProviderMapPoint` is now generic and exported from `TravelAuditMap`.
- `ResolvedTravelThresholds` is used in `computeVedurstofanAssessments`.
- No-provider state keeps the provider toggles visible.
- The tests handoff mentioned are present and pass locally.

## Commands Run

```bash
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
```

Result: exit 0, 2 test files passed, 31 tests passed.

```bash
npm run type-check
```

Result: exit 0.

## Suggested Next Step For Claude Code

Implement a small v140 patch:

1. Make outbound parent auto-select use the same provider-aware slot status as `DepartureHeatmap`.
2. Make provider overlay markers update when `providerOverlayPoints` changes, or include selected departure in the map remount key as a short-term fallback.
3. Gate the return heatmap so MET/Yr return data does not appear when `met.no` is off.
4. Re-run the same tests and `npm run type-check`.

Do not change SQL, Supabase, cron, Vercel, migrations, feature flags, commits, or push in this patch.

## Localhost Checks For Stebbi

Preconditions:

- Stebbi runs localhost himself.
- `WEATHER_ELTA_VEDRID_FLAG=true`.
- `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`.
- Veðurstofan product data has been warmed recently.
- No Supabase migration, cron run, deploy, push, or commit is part of these checks.

Check `/auth-mvp/vedrid` with a route that has visible Veðurstofan stations:

1. Veðurstofan only:
   - Turn `met.no` off and `Veðurstofan` on.
   - Click several different scrubber hours.
   - Expected: worst station text, scrubber selected slot, and map marker colors/titles all move together.

2. Veðurstofan-only scrubber filters:
   - Filter to a non-green status if available.
   - Expected: selected/worst summary uses one of the visible filtered Veðurstofan slots.
   - No hidden MET/Yr slot should drive the summary.

3. MET/Yr only:
   - Turn `Veðurstofan` off and `met.no` on.
   - Expected: old MET/Yr map/scrubber/worst point still works.

4. Both providers:
   - Expected: MET/Yr remains baseline and Veðurstofan markers overlay.
   - Toggle scrubber slots; there should be no stale duplicate provider markers.

5. No providers:
   - Turn both providers off.
   - Expected: no-provider message appears and toggles remain visible.

6. Return trip, if enabled:
   - Turn `met.no` off.
   - Expected after fix: no MET/Yr return scrubber appears unless a provider-specific return model has been implemented.

## Óvissa / þarf að staðfesta

- I did not run browser/localhost checks; findings are from code inspection plus unit/typecheck.
- I did not inspect unrelated dirty worktree changes.
- The return-trip provider behavior should be confirmed with Stebbi if return weather is currently important for this feature gate.
