# TODO 086 v149 - Codex review of v148 prerelease

Created: 2026-07-14 08:43
Timezone: Atlantic/Reykjavik
Agent: Codex
Reviews: `2026-07-14-0840-todo-086-v148-claude-v147-done-prerelease.md`

## Findings

### Medium - Overlay detail panel can keep showing a point after its status is filtered out

`components/weather/TravelAuditMap.tsx:539`

`toggleMapStatus` handles the existing MET/Yr selected point: if the selected MET/Yr point's status is no longer visible, it clears manual selection and moves to the first visible MET/Yr point.

The new overlay path does not do the equivalent for `selectedOverlayPoint`. Overlay markers themselves respect `visibleStatuses` in the marker update effect, so the marker can disappear while `OverlayPointDetailsPanel` still shows that hidden station.

Likely reproduction:

1. Enable Veðurstofan.
2. Click a Veðurstofan overlay marker, or let the worst Veðurstofan station auto-select.
3. Click a map status pill so that station's status is no longer visible.
4. Marker hides, but the detail panel can still show the hidden station.

Expected behavior should match MET/Yr:

- If the selected overlay point is filtered out, clear `selectedOverlayPoint`.
- Prefer auto-selecting the highlighted overlay point if it is still visible.
- Otherwise select the first visible overlay point, or fall back to the existing MET/Yr behavior if MET/Yr points are active.

This matters because v148 explicitly includes "Visibility filter" in the localhost checks. The filter should hide both marker and selected detail state consistently.

## Non-Blocking Notes

- `highlightedOverlayPointId` is currently just an id string. This is okay while only Veðurstofan overlay points exist, but before Vegagerðin is added, consider passing a composite identity (`provider` + `id`) or a stable `overlayKey`. Provider station ids can collide across data sources.
- `OverlayPointDetailsPanel` follows the existing compact panel pattern and uses semantic card/border tokens, which is broadly aligned with `Design.md`. Keep an eye on mobile tap targets for map filter pills; they are compact existing UI, but newly exposed in Veðurstofan-only mode.
- There still appears to be no automated component test coverage for `TravelAuditMap` overlay selection. That is acceptable for this prerelease if Stebbi does the localhost checks, but a small future test around selected overlay + filter would be valuable.

## What Looks Good

- v148 moves the map closer to the desired provider-neutral behavior: Veðurstofan markers can be selected and can drive the map detail panel.
- Pill counts now include overlay provider points, which fixes the mismatch Stebbi was seeing when MET/Yr and Veðurstofan were both active.
- `PointDetailsPanel` and `OverlayPointDetailsPanel` are mutually exclusive, so the UI no longer tries to cram Veðurstofan into a MET/Yr point card.
- The implementation did not touch SQL, Supabase, cron, Vercel, migrations, feature access, commit, push, or deploy.

## Tests Run By Codex

```powershell
npm run test:run -- lib/__tests__/weather-provider-comparator.test.ts lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
```

Result: exit 0, 3 test files passed, 47 tests passed.

```powershell
npm run type-check
```

Result: exit 0.

```powershell
git diff --check -- components/weather/TravelAuditMap.tsx app/auth-mvp/vedrid/FerdalagidClient.tsx lib/weather/providerComparator.ts lib/__tests__/weather-provider-comparator.test.ts
```

Result: exit 0.

## Recommended Next Step For Claude Code

Fix only the overlay-selection/filter consistency issue before prerelease:

1. In `TravelAuditMap`, add a small helper for overlay visibility, e.g. `isOverlayVisible(point, visibleStatuses)`.
2. When `visibleStatuses` changes, if `selectedOverlayPoint` is no longer visible, clear it or replace it with the highlighted/first visible overlay point.
3. Make the auto-select effect respect visibility too, so a hidden highlighted overlay does not remain selected.
4. Add a focused unit/component-level test if practical; otherwise explicitly add this to Stebbi's localhost checks.

After that, continue to the provider identity cleanup before Vegagerðin lands.

## Localhost checks for Stebbi

Preconditions:

- Localhost is running.
- `WEATHER_ELTA_VEDRID_FLAG=true`.
- Veðurstofan layer is enabled and warmed.
- Do not run migrations, cron jobs, Supabase changes, commit, push, or deploy for this check.

Checks:

1. Generate a route with both `met.no` and `Veðurstofan` active.
2. Confirm map status pill counts include both MET/Yr and Veðurstofan points.
3. Click a Veðurstofan marker.
   - Expected: the map detail card shows that Veðurstofan station, not a MET/Yr point.
4. Hide the clicked station's status using the map pill filter.
   - Expected after the next patch: the selected Veðurstofan detail card should not keep showing a hidden marker.
5. Turn MET/Yr off and leave only Veðurstofan on.
   - Expected: map markers, filter counts, and the detail card are all based on Veðurstofan points only.
6. Change the departure slot.
   - Expected: the map detail card resets to the worst visible provider point for the new slot.
7. Turn MET/Yr back on and click a MET/Yr marker after clicking a Veðurstofan marker.
   - Expected: the detail card switches back to MET/Yr correctly.

## Óvissa / þarf að staðfesta

- I did not run browser/Google Maps interaction tests. This review is based on code inspection plus targeted unit tests/type-check. The marker-click/filter behavior should be verified by Stebbi on localhost.
