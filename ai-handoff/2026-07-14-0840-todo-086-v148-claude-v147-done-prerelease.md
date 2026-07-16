# TODO 086 v148 - Claude done: overlay map selection and pill counts, prerelease

Created: 2026-07-14 08:40 Atlantic/Reykjavik
Agent: Claude Code
Implements: Stebbi's three map issues reported after v147 review

## Result

Type-check: exit 0
Tests: 131 passed + 5 skipped = 136 total (unchanged from v146/v147)

## Issues Fixed

### Issue #1 — Map pill counts now include all selected providers

`mapStatusCounts` useMemo in `TravelAuditMap.tsx` now counts both MET/Yr route points and `providerOverlayPoints`. Added `providerOverlayPoints` to the useMemo deps.

Pills visibility condition updated from `weatherPoints.length > 0` to `(weatherPoints.length > 0 || (providerOverlayPoints?.length ?? 0) > 0)` so pills also show in Veðurstofan-only mode.

### Issue #2 — Map worst-point card shows decisive provider station

New `highlightedOverlayPointId?: string` prop on `TravelAuditMap`. When Veðurstofan is decisive (or Veðurstofan-only), FerdalagidClient passes `worstVedurstofanData.station.stationId`.

New `selectedOverlayPoint: ProviderMapPoint | null` state. A `useEffect([highlightedOverlayPointId, providerOverlayPoints])` auto-selects the station from `providerOverlayPoints` when not user-selected, and clears `selectedIndex` so the MET/Yr panel is suppressed.

`selectionResetSignal` effect also resets `selectedOverlayPoint` from `highlightedOverlayPointId` (and clears MET/Yr selectedIndex when overlay is found).

New `OverlayPointDetailsPanel` component renders: panel title (worst/manual), station name, wind status chip, wind speed, ETA time. Reuses existing translation keys: `worstPointTitle`, `manualSelectedPointTitle`, `pointEtaLabel`.

Render: `OverlayPointDetailsPanel` shown when `selectedOverlayPoint !== null`; `PointDetailsPanel` shown only when `!selectedOverlayPoint`.

### Issue #3 — Veðurstofan overlay markers are clickable

Overlay update effect now adds a click listener per marker:
```ts
m.addListener('click', () => {
  userSelectedRef.current = true
  setIsManualSelection(true)
  setSelectedOverlayPoint(sp)
  setSelectedIndex(null)
})
```

MET/Yr route and forecast marker click handlers now call `setSelectedOverlayPoint(null)` to clear any overlay selection when user clicks a MET/Yr point.

Overlay markers now also respect `visibleStatuses` filter (`visible: isVisible`). Added `visibleStatuses` to overlay update effect deps.

Jump-to-worst button now gated with `!selectedOverlayPoint` so it is hidden when an overlay point is shown as the card.

## Changes Made

### `components/weather/TravelAuditMap.tsx`

- Added `highlightedOverlayPointId?: string` to `TravelAuditMapProps`
- Added `selectedOverlayPoint: ProviderMapPoint | null` state
- Init effect MET/Yr click handlers: added `setSelectedOverlayPoint(null)`
- Overlay update effect: added `visible: isVisible`, click handler per marker, `visibleStatuses` in deps
- New auto-select effect `[highlightedOverlayPointId, providerOverlayPoints]`
- `selectionResetSignal` effect: resets `selectedOverlayPoint`, conditionalized `setSelectedIndex`
- `mapStatusCounts`: added `providerOverlayPoints?.forEach` count + dep
- Pills condition: includes overlay points
- Jump button: gated with `!selectedOverlayPoint`
- Render: `OverlayPointDetailsPanel` / `PointDetailsPanel` mutually exclusive on `selectedOverlayPoint`
- Added `OverlayPointDetailsPanel` component (no new translation keys)

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`

- Added `highlightedOverlayPointId` prop to `<TravelAuditMap>` call:
  ```tsx
  highlightedOverlayPointId={
    (isVedurstofanOnly || combinedDecisiveProvider === 'vedurstofan') && worstVedurstofanData
      ? worstVedurstofanData.station.stationId
      : undefined
  }
  ```

## What Was NOT Changed

- `travelAuditMap.helpers.ts` — no changes needed
- `lib/weather/providerComparator.ts` — no changes
- No new translation keys in `messages/*.json`
- No SQL, Supabase, cron, Vercel, migrations, feature access
- No commit, no push

## Open Items After v148

- Vegagerðin integration: when added, pass as third `ProviderMapPoint` provider and extend `selectDecisiveProvider` chaining
- Map detail panel for overlay points: currently shows station name, status, wind m/s, ETA — no yrno/Google Maps link (Veðurstofan doesn't have these); Vegagerðin may have road links
- Return leg: Veðurstofan has no return leg model yet; return heatmap remains MET/Yr only

## Localhost Checks for Stebbi

Preconditions:
- Localhost running, `WEATHER_ELTA_VEDRID_FLAG=true`
- Veðurstofan layer enabled and warmed
- Do not run migrations, cron, Supabase changes, commit, push, or deploy

Checks:

1. Generate a route with both MET/Yr and Veðurstofan data active.
2. **Pill counts**: Confirm map pills show MET/Yr count + Veðurstofan count combined (e.g. 72 + 6 = entries across all pills).
3. **Worst-point card — both providers**:
   - Find a scenario where Veðurstofan is decisive (higher wind or worse severity).
   - Expected: map card shows the Veðurstofan station name and status, not the MET/Yr point.
4. **Worst-point card — Veðurstofan-only** (toggle MET/Yr off):
   - Expected: map card shows the worst Veðurstofan station.
5. **Clickable Veðurstofan markers**:
   - Click a Veðurstofan station marker on the map.
   - Expected: map card updates to show that station's name, status, and wind.
6. **Clickable MET/Yr markers after overlay selected**:
   - After clicking a Veðurstofan marker, click a MET/Yr marker.
   - Expected: map card switches back to the MET/Yr point detail.
7. **Visibility filter**:
   - Toggle a status pill (e.g. hide "Óþægilegt").
   - Expected: both MET/Yr markers and Veðurstofan markers with that status are hidden; pill counts are correct.
8. **Slot scrubber reset**:
   - Change the departure slot on the heatmap.
   - Expected: map card auto-resets to the worst Veðurstofan station for the new slot (if Veðurstofan is decisive), not a stale MET/Yr point.
