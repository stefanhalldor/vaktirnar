# TODO 086 v150 - Claude done: overlay filter consistency, prerelease

Created: 2026-07-14 08:46 Atlantic/Reykjavik
Agent: Claude Code
Implements: `2026-07-14-0843-todo-086-v149-codex-v148-prerelease-review.md` (Medium finding)

## Result

Type-check: exit 0
Tests: unchanged (no logic changed in tested modules)

## Change Made

### `components/weather/TravelAuditMap.tsx`

**`toggleMapStatus` — overlay selection cleared when filtered out (Medium finding fix)**

Added an overlay block before the existing MET/Yr block. When `selectedOverlayPoint` is set and its status is filtered out by a pill toggle:

1. `userSelectedRef.current = false`, `setIsManualSelection(false)`
2. Prefer the highlighted overlay point (`highlightedOverlayPointId`) if it is still visible after the filter change.
3. Otherwise fall back to the first visible overlay point.
4. If no overlay points are visible, `selectedOverlayPoint` is cleared to null.

The blocks are mutually exclusive: when overlay is selected, `selectedIndex` is null so `selectedPoint` is undefined and the MET/Yr block does not fire.

**Auto-select effect — visibility check on slot change**

Added a visibility check inside the auto-select effect (deps `[highlightedOverlayPointId, providerOverlayPoints]`) using the closure value of `visibleStatuses`. This prevents auto-selecting a highlighted station that is currently filtered when the departure slot changes. `visibleStatuses` is not added to effect deps to avoid double-handling (filter-driven changes are handled by `toggleMapStatus`).

## What Was NOT Changed

- No changes to `FerdalagidClient.tsx`, `providerComparator.ts`, messages, SQL, Supabase, cron, Vercel, migrations, feature access.
- No commit, no push.

## Open Items After v150

- Provider identity: `highlightedOverlayPointId` is a bare stationId string — could collide across providers. Add composite key before Vegagerðin lands.
- No automated component test for overlay selection + filter behavior. Covered by Stebbi's localhost check #4.

## Localhost Checks for Stebbi

Preconditions:
- Localhost running, `WEATHER_ELTA_VEDRID_FLAG=true`
- Veðurstofan layer enabled and warmed
- Do not run migrations, cron, Supabase changes, commit, push, or deploy

Checks:

1. Generate a route with both MET/Yr and Veðurstofan active.
2. Confirm map pills show combined point counts (MET/Yr + Veðurstofan).
3. Click a Veðurstofan marker — expected: map card shows that station.
4. **Filter consistency (v149 finding)**: toggle the clicked station's status pill to hide it.
   - Expected: marker hides AND map card clears/moves to the next visible station (or MET/Yr fallback).
5. Turn MET/Yr off (Veðurstofan-only): pills, markers, and map card should be Veðurstofan-only.
6. Change the departure slot — expected: map card resets to worst visible Veðurstofan station for new slot.
7. Click a MET/Yr marker after a Veðurstofan marker was shown — expected: card switches to MET/Yr point.
8. Toggle a status pill while worst Veðurstofan station is auto-selected:
   - If the station's status is filtered: card should clear or move to highlighted/first visible overlay.
   - If filter is cleared (show all): card should show the station again on next slot reset or interaction.
