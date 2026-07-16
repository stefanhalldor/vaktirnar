# TODO 086 v152 - Claude done: overlayIsVisible helper, slot-reset visibility, prerelease

Created: 2026-07-14 14:46 Atlantic/Reykjavik
Agent: Claude Code
Implements: `2026-07-14-1443-todo-086-v151-codex-v150-prerelease-review.md` (Medium finding)

## Result

Type-check: exit 0
Tests: unchanged (no logic changed in tested modules)

## Change Made

### `components/weather/TravelAuditMap.tsx`

**New `overlayIsVisible` helper (module-level, before `TravelAuditMap`)**

```ts
function overlayIsVisible(p: ProviderMapPoint, filter: Set<WindDisplayStatus> | undefined): boolean {
  return (filter?.size ?? 0) === 0 || filter!.has(p.status)
}
```

Applied in all four places where overlay visibility was previously checked inline:

1. **Overlay marker update effect** — `overlayIsVisible(sp, visibleStatuses)` replaces inline `(visibleStatuses?.size ?? 0) === 0 || visibleStatuses!.has(sp.status)`

2. **Auto-select effect** (`[highlightedOverlayPointId, providerOverlayPoints]`) — now falls back to `providerOverlayPoints.find(p => overlayIsVisible(p, visibleStatuses))` when the highlighted station is hidden. Previously it would set `null` and leave a MET/Yr point selected; now it selects the first visible overlay station if one exists.

3. **`toggleMapStatus`** — overlay block simplified: `!overlayIsVisible(selectedOverlayPoint, next)` replaces `next.size > 0 && !next.has(...)`. Replacement logic uses `overlayIsVisible(highlighted, next)` and `overlayIsVisible(p, next)`.

4. **`selectionResetSignal` effect** (Medium finding fix) — now respects `visibleStatuses` from closure:
   - Prefers highlighted overlay if visible.
   - Falls back to first visible overlay if highlighted is hidden.
   - Falls back to `initialSelectedIndex(...)` (MET/Yr) if no visible overlay exists.
   Previously: always selected `highlightedOverlayPointId` station regardless of active filter.

## What Was NOT Changed

- No changes to `FerdalagidClient.tsx`, `providerComparator.ts`, messages, SQL, Supabase, cron, Vercel, migrations, feature access.
- No commit, no push.

## Open Items After v152

- Provider identity: `highlightedOverlayPointId` is a bare stationId string — could collide across providers when Vegagerðin is added. Add composite key before that.
- No automated component test for overlay selection + filter behavior. Covered by Stebbi's localhost checks.

## Localhost Checks for Stebbi

Preconditions:
- Localhost running, `WEATHER_ELTA_VEDRID_FLAG=true`
- Veðurstofan layer enabled and warmed
- Do not run migrations, cron, Supabase changes, commit, push, or deploy

Checks:

1. Generate a route with both MET/Yr and Veðurstofan active.
2. Confirm map pills show combined point counts (MET/Yr + Veðurstofan).
3. Click a Veðurstofan marker — expected: map card shows that station.
4. Hide the station's status via pill filter — expected: marker hides AND card clears or moves to another visible overlay station.
5. While filter is still active, change the departure slot (v151 finding):
   - Expected: card does NOT auto-select a hidden Veðurstofan station.
   - If another visible overlay station exists, that one may be selected.
   - If no visible overlay station exists and MET/Yr is active, falls back to MET/Yr selection or no card.
6. Clear the filter — expected: Veðurstofan markers and auto-selection return on next slot change or interaction.
7. Turn MET/Yr off (Veðurstofan-only): pills, markers, and map card are all Veðurstofan-only.
8. Click a MET/Yr marker after a Veðurstofan marker was shown — expected: card switches to MET/Yr point.
