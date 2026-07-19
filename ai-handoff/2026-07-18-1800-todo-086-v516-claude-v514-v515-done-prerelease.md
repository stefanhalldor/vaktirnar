# 2026-07-18 18:00 - TODO 086 v516 - Claude: v514+v515 done, prerelease

Created: 2026-07-18 18:00
Timezone: Atlantic/Reykjavik

## What was done

Combined v514 hardening + v515 source/time selector UX in a single pass.

### v514 hardening (already confirmed in prior context, now verified clean)

- `lib/weather/windDisplayStatus.ts`: `selectForecastRowAt` extracted as shared selector; `classifyForecastWindDisplayStatusAt` delegates to it; `classifyNowAnchoredForecastWindDisplayStatus` is now a thin `Date.now()` wrapper.
- `lib/__tests__/windObservationStatus.test.ts`: Updated "at-or-before" semantics test; added `selectForecastRowAt` suite; added wrapper-parity test. 33 tests passing.
- `components/weather/ForecastTimeScrubber.tsx`: Added `worstStatusLabel: string` to `ForecastTimeScrubberSlot`; added full `aria-label` on each slot button using `formatLongDepartureDateTime`.

### v515 source/time selector UX

**New file: `components/weather/WeatherSourceTimeSelector.tsx`**
- Two-section horizontal control: fixed left (Vegagerðin / Núna) + scrollable right (Veðurstofan/Yr forecast slots).
- "Núna" button: status dot from `vegagerdinWorstStatus`, measurement time label (e.g. "Mælt 10:27"), always enabled unless `nowDisabled` (i.e. access restricted). Stale data stays clickable.
- Forecast slots: colored dots per slot, scrollable, full `aria-label` including date/time and status.
- `activeMode: 'now' | number` — single exclusive selection.
- Uses `useLocale` + `formatLongDepartureDateTime` for accessible slot labels.

**`components/weather/WeatherOverviewShell.tsx`**
- Added `renderProviderSelector?: () => React.ReactNode` prop.
- When provided, renders it instead of the default provider filter pills.

**`components/weather/WeatherOverviewClient.tsx`**
- Removed: `showVedurstofan`, `showVegagerdin`, `selectedForecastTimeMs` state.
- Removed: `defaultForecastTimeMs` memo, sync `useEffect`, `findUsedForecastIndex` helper.
- Added: `activeMode: 'now' | number` state (default `'now'`).
- Added: `vegagerdinNewestMeasuredAtIso` memo, `vegagerdinWorstStatus` memo.
- `forecastAnchorMs = typeof activeMode === 'number' ? activeMode : Date.now()` (simple expression, no memo needed).
- `forecastSlotStatuses` now includes `worstStatusLabel` field.
- `overviewStatusCounts` is now exclusive: Vegagerðin counts when `activeMode === 'now'`, Veðurstofan counts when `typeof activeMode === 'number'`.
- Both providers: `canToggle: false`, `isVisible` driven by `activeMode`.
- `vedurstofanProvider.renderPostMap` no longer renders `ForecastTimeScrubber` (moved to selector).
- `StationDetail`: uses `selectForecastRowAt` instead of local `findUsedForecastIndex`; uses `formatCompactDateTime(row.ftimeIso, locale)` for timestamps; uses `formatKlTime` for `atimeIso`.
- Passes `renderProviderSelector` to `WeatherOverviewShell` with `WeatherSourceTimeSelector`.
- Added imports: `useLocale`, `selectForecastRowAt`, `WeatherSourceTimeSelector`, `formatCompactDateTime`, `formatKlTime`.

**`messages/is.json` + `messages/en.json`**
- Added in `teskeid.vedrid.overview`: `sourceNowLabel`, `sourceMeasuredAt`, `sourceForecastGroupLabel`, `sourceForecastLabel`, `sourceLoadingNow`, `sourceLoadingForecast`.

## Files changed

- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherOverviewShell.tsx`
- `components/weather/WeatherSourceTimeSelector.tsx` (new)
- `components/weather/ForecastTimeScrubber.tsx` (done in prior context)
- `lib/weather/windDisplayStatus.ts` (done in prior context)
- `lib/__tests__/windObservationStatus.test.ts` (done in prior context)
- `messages/is.json`
- `messages/en.json`

## Commands and exit codes

```
npm run type-check    exit 0
npx vitest run lib/__tests__/windObservationStatus.test.ts   33 passed
npx vitest run lib/__tests__/weather-travel.test.ts          98 passed, 5 skipped
```

## SQL status

No SQL run. SQL84 remains written but not executed.

## Localhost checks for Stebbi

1. Open `http://localhost:3004/vedrid` as public.
2. Confirm the old top provider pills ("Vegagerðin (núna)" / "Veðurstofan (spá)") are gone.
3. Confirm the new source/time selector appears above the map with:
   - Left section: "Vegagerðin" label above, "Núna" button with colored dot and measurement time (e.g. "Mælt 10:27").
   - Right section: "Veðurstofan/Yr" label above, scrollable forecast slot dots.
4. Confirm "Núna" is selected by default (ring around the button) and the Vegagerðin current observation map is showing.
5. Status pill counts below the map should reflect Vegagerðin station wind statuses.
6. Click a forecast slot in the right section.
   - "Núna" button loses its ring.
   - Clicked slot gains ring.
   - Map switches to Veðurstofan forecast markers colored for that time slot.
   - Status pill counts update to Veðurstofan forecast counts for that slot.
7. Click "Núna" again.
   - Reverts to Vegagerðin current layer and counts.
8. Click a Veðurstofan station (forecast mode active).
   - StationDetail opens.
   - Confirm forecast timestamps are Icelandic compact format ("fim. 18. júl kl. 09:00"), not raw "2026-07-18 09:00".
   - Confirm the row matching the selected forecast time is highlighted with "Notað á korti".
9. Change wind thresholds.
   - "Núna" dot color, forecast slot dot colors, map colors, and pill counts all update consistently.
10. Test mobile widths 360/390/460 px.
    - No page-level horizontal overflow.
    - Right section of the selector scrolls internally if many forecast slots are present.
    - Text does not overlap or force zoom.
11. Open `http://localhost:3004/vedrid/ferdalagid` and confirm existing trip wizard is unaffected.

No Supabase migration, Vercel change, env change, commit, push, or deploy is part of this pass.
