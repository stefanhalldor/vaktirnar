# TODO 086 v142 - Claude done: v139/v140/v141 corrections implemented, prerelease

Created: 2026-07-14 08:00 Atlantic/Reykjavik
Agent: Claude Code
Implements: v139/v140/v141 Codex reviews

## Result

Type-check: exit 0
Tests: 133 passed + 5 skipped = 138 total (was 129+5=134 before this batch)

## Changes Made

### `components/weather/TravelAuditMap.tsx` (v139 HIGH)

**Overlay markers now update when scrubber slot changes.**

Removed provider overlay marker creation from the mount-only init effect.
Added a separate `useEffect` watching `[providerOverlayPoints, mapLoaded]`:
- When `mapLoaded` becomes true (after init), the effect fires and creates initial overlay markers.
- When `providerOverlayPoints` changes (because `selectedHeatmapIdx` changed in parent), the effect fires again, clears old `vedurstofanMarkersRef`, and recreates markers from fresh data.

This fixes the stale-marker bug: in Veðurstofan-only mode, clicking a different scrubber hour now updates map marker colors/titles immediately.

### `app/auth-mvp/vedrid/FerdalagidClient.tsx` (v139/v140/v141)

**Import**: added `useRef` to import line.

**New ref**:
```ts
const combinedSlotStatusesRef = useRef<WindDisplayStatus[] | null>(null)
```
Latest-value ref so the auto-select effect can read combined statuses without adding them to its dep array.

**New computed values (v141 — selected providers must aggregate)**:

```ts
const combinedSlotStatuses: WindDisplayStatus[] | null
```
- `null` when `hasNoActiveProvider` or `isMetnoOnly` (DepartureHeatmap handles MET/Yr natively).
- Veðurstofan-only: returns `vedurstofanSlotStatuses` per slot.
- Both providers: returns `worstWindDisplayStatus(metnoStatus, vedurStatus)` per slot.
- Ref kept in sync: `combinedSlotStatusesRef.current = combinedSlotStatuses`.

```ts
const combinedDecisiveVedurstofan: boolean
```
- True when both providers are selected AND Veðurstofan worst station status is at least as severe as MET/Yr status for the reference slot.
- Tie-break: Veðurstofan wins (per v141 spec: `indexOf(vedurstofanDs) <= indexOf(metnoDs)`).

**Auto-select effect updated (v139 HIGH)**:
- `getSlotStatus(c, idx)` reads from `combinedSlotStatusesRef.current` first; falls back to `classifyCandidateWindDisplayStatus`.
- All filter/priority logic in the effect now uses combined provider status, not MET/Yr only.
- In Veðurstofan-only mode: filter by a non-green status now correctly finds a Veðurstofan slot, not a hidden MET/Yr slot.

**derivedStatus updated**:
- Removed `vedurstofanWeatherStatus` variable.
- New `toWeatherStatus(st: WindDisplayStatus): WeatherStatus | null` helper inside IIFE.
- `selectedSlotCombinedStatus` from `combinedSlotStatuses[selectedHeatmapIdx ?? 0]` drives the card badge.
- `hasNoActiveProvider` → null; combined status available → mapped to WeatherStatus; fallback → MET/Yr candidate status.

**Scrubber `slotStatusOverrides` updated (v141)**:
```tsx
slotStatusOverrides={combinedSlotStatuses ?? undefined}
```
Previously: `isVedurstofanOnly ? vedurstofanSlotStatuses : undefined`.
Now: any multi-provider or Veðurstofan-only mode automatically sends combined statuses. MET/Yr-only passes `undefined`, so DepartureHeatmap uses its own classification.

**"Á leiðinni" combined-decisive branch added (v141)**:
New branch before the existing Veðurstofan-only branch:
- Fires when `showMetno && showVedurstofan && combinedDecisiveVedurstofan && worstVedurstofanData`.
- Shows Veðurstofan worst station summary (same layout as Veðurstofan-only, same provenance label).
- If Veðurstofan is not decisive, falls through to the MET/Yr branch.

**Removed `vedurstofanLayerDisclaimer` (v140)**:
```tsx
// REMOVED:
{showVedurstofan && (
  <p className="text-xs text-muted-foreground">{tf('vedurstofanLayerDisclaimer')}</p>
)}
```
The text "Veðurstofugögn eru í prófun. MET/Yr er áfram grunnspáin. Vegagerðin er ekki komin inn." is gone. Provider labels/toggles remain.

**Added "Þín veðurmörk" threshold attention box (v140)**:
Placed after no-provider message, before coverage text and scrubber. Only shown when `!hasNoActiveProvider`:
```tsx
<div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 ...">
  <p className="text-[10px] font-semibold ...">{tf('thresholdBoxTitle')}</p>
  <p className="text-xs ...">{tf('thresholdSummaryLine', { caution, red })}</p>
</div>
```
Uses `effectiveThresholds.cautionWindMs` and `.redWindMs` — not hardcoded values.

**Destination section guard changed (v140)**:
```tsx
// Before:
{showMetno && activeOutboundCandidate?.arrivalWeather && (
// After:
{!hasNoActiveProvider && activeOutboundCandidate?.arrivalWeather && (
```
In Veðurstofan-only mode, destination section now shows MET/Yr arrival weather as context.
Route assessment is not affected — it remains Veðurstofan-driven.

**Return heatmap gated (v139 MEDIUM)**:
```tsx
// Before:
{result && !loading && (result.travelPlan?.return?.candidates.length ?? 0) > 0 && (
// After:
{result && !loading && showMetno && (result.travelPlan?.return?.candidates.length ?? 0) > 0 && (
```
When `met.no` is off, return MET/Yr heatmap is hidden.

### `messages/is.json` + `messages/en.json`

Added:
- `thresholdBoxTitle`: `"Þín veðurmörk"` / `"Your weather thresholds"`

### `lib/__tests__/weather-vedurstofan-blend.test.ts`

Added import: `WIND_DISPLAY_STATUS_PRIORITY_ORDER`.

Added `describe('provider aggregation (v141: selected providers must aggregate)')` with 4 tests:
1. Combined slot is `othaegilegt` when MET/Yr is `innan-marka` and Veðurstofan is `othaegilegt` (minimum required test from v141 spec).
2. Decisive provider is Veðurstofan when `indexOf(vedurstofanDs) <= indexOf(metnoDs)`.
3. MET/Yr is decisive when `indexOf(metnoDs) < indexOf(vedurstofanDs)`.
4. Veðurstofan wins tie-break when both statuses are equal (`<=` condition).

## What Was NOT Changed

- `blendHoursWithVedurstofan` function (kept, tested)
- Vegagerðin UI (disabled placeholder stays)
- SQL, Supabase, cron, Vercel, migrations, feature access
- No commit, no push

## Open Items (Not In Scope For This Batch)

- Full clickable Veðurstofan station selection on map (no click handler on overlay markers)
- Vegagerðin data layer (waiting for data)
- Return-leg Veðurstofan assessment (MET/Yr return heatmap hidden when met.no off; Veðurstofan return model not yet built)

## Localhost Checks For Stebbi

Preconditions: Stebbi runs localhost. `WEATHER_ELTA_VEDRID_FLAG=true`. `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`. Veðurstofan product table warmed. No migrations, Supabase, cron, push, commit.

### met.no only (Veðurstofan off)

- Existing MET/Yr scrubber/map/worst point unchanged.
- Threshold box "Þín veðurmörk" visible with correct wind values.
- Destination section visible.
- No provider disclaimer text at top.

### Veðurstofan only (met.no off)

- Scrubber slot colors are Veðurstofan-derived (from combinedSlotStatuses).
- Click different scrubber hours: map overlay marker colors/titles update immediately (no stale markers).
- "Á leiðinni": shows worst Veðurstofan station.
- Destination section visible (MET/Yr arrival data shown as context; not part of route score).
- Threshold box "Þín veðurmörk" visible.
- No provider disclaimer text.
- No return heatmap.

### Both providers

- Scrubber slots show worst of MET/Yr and Veðurstofan per slot.
- If Veðurstofan is worse for any slot, that slot shows the Veðurstofan-derived status.
- "Á leiðinni": if Veðurstofan's worst station is worse than MET/Yr, shows Veðurstofan summary with provider label.
- Card badge color reflects combined worst status.
- Map: MET/Yr route markers + Veðurstofan overlay markers; overlay updates on slot change.
- Threshold box visible.
- Destination section visible.

### Toggle back and forth

- Scrubber colors change to match active selected-provider set.
- No stale MET/Yr result when Veðurstofan-only.
- No stale Veðurstofan result when Veðurstofan off.
- Scrubber filter (if active) reselects based on combined status.

### No providers

- Provider toggles remain visible.
- No-provider message "Veldu að minnsta kosti eina gagnaveitu..." shown.
- No threshold box shown.
- No route assessment shown.

### Mobile

- Threshold box, provider toggles, map, and summary sections fit without overflow.
- Provider label in summary fits on narrow screens.
