# TODO 086 v151 - Codex review of v150 prerelease

Created: 2026-07-14 14:43
Timezone: Atlantic/Reykjavik
Agent: Codex
Reviews: `2026-07-14-0846-todo-086-v150-claude-v149-done-prerelease.md`

## Findings

### Medium - Slot reset can still select a hidden overlay point

`components/weather/TravelAuditMap.tsx:405`

v150 fixes the direct filter-toggle path in `toggleMapStatus`: when the currently selected overlay point is filtered out, the panel clears or moves to another visible overlay.

However, the `selectionResetSignal` effect still ignores the active `visibleStatuses` filter:

```ts
const foundOverlay = highlightedOverlayPointId && providerOverlayPoints?.length
  ? (providerOverlayPoints.find(p => p.id === highlightedOverlayPointId) ?? null)
  : null
setSelectedOverlayPoint(foundOverlay)
```

So this can still happen:

1. Veðurstofan overlay is selected.
2. User hides that status with a map pill.
3. The selected card clears or moves correctly.
4. User changes departure slot.
5. `selectionResetSignal` runs and can select the new `highlightedOverlayPointId` even if that point's status is currently hidden.

Expected: slot reset should use the same visibility rule as the filter path. If the highlighted overlay point is hidden by `visibleStatuses`, select the first visible overlay or fall back to MET/Yr/none.

Suggested small fix:

- Extract a tiny helper inside `TravelAuditMap`, for example:

```ts
const overlayIsVisible = (p: ProviderMapPoint) =>
  (visibleStatuses?.size ?? 0) === 0 || visibleStatuses!.has(p.status)
```

- Use it in:
  - overlay marker visibility
  - highlighted overlay auto-select effect
  - `toggleMapStatus`
  - `selectionResetSignal` effect

This keeps the rule consistent and avoids one-off fixes in each effect.

## What Looks Good

- The original v149 direct toggle bug is mostly fixed: `toggleMapStatus` now handles `selectedOverlayPoint`.
- Overlay marker visibility, pill counts, and overlay detail panel are moving in the right provider-neutral direction.
- The current implementation still uses existing Teskeið compact panel/card patterns and semantic tokens, broadly aligned with `Design.md`.
- No SQL, Supabase, cron, Vercel, migrations, feature access, commit, push, or deploy changes were included.

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

Do one narrow follow-up patch before prerelease:

1. Centralize overlay visibility into one local helper.
2. Apply it to marker visibility, highlighted overlay auto-select, filter-toggle replacement, and `selectionResetSignal`.
3. In `selectionResetSignal`, if the highlighted overlay is hidden, prefer first visible overlay; if none exists, fall back to `initialSelectedIndex(...)` for MET/Yr when MET/Yr points are available.
4. Add this exact case to `Localhost checks for Stebbi`.

Avoid broader provider identity or Vegagerðin work in this patch; that should be the next separate step after the overlay filter/reset behavior is stable.

## Localhost checks for Stebbi

Preconditions:

- Localhost is running.
- `WEATHER_ELTA_VEDRID_FLAG=true`.
- Veðurstofan layer is enabled and warmed.
- Do not run migrations, cron jobs, Supabase changes, commit, push, or deploy for this check.

Checks:

1. Generate a route with both `met.no` and `Veðurstofan` active.
2. Click a Veðurstofan marker.
   - Expected: map card shows that station.
3. Hide that station's status using the map pill filter.
   - Expected: marker hides and card no longer shows that hidden station.
4. While the filter is still active, change the departure slot.
   - Expected after the next patch: the card must not auto-select a hidden Veðurstofan station.
5. If another visible Veðurstofan station exists, it may select that station.
6. If no visible Veðurstofan station exists and MET/Yr is active, fallback to MET/Yr or no selected card is acceptable, but a hidden Veðurstofan station is not.
7. Clear the filter.
   - Expected: Veðurstofan markers and eligible auto-selection return.

## Óvissa / þarf að staðfesta

- I did not run browser/Google Maps interaction tests. This review is based on code inspection plus targeted unit tests/type-check.
- There still appears to be no automated component test for `TravelAuditMap` overlay filter/reset behavior, so Stebbi's localhost check is important here.
