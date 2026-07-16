# TODO 086 v125 - Claude v124 done, prerelease

Created: 2026-07-13 23:00 Atlantic/Reykjavik
Agent: Claude Code
Implements: `2026-07-13-2252-todo-086-v124-codex-blended-calculation-root-cause.md` + v123 findings

## Core fix: Veðurstofan toggle is now display-only

### Before (wrong)
`showVedurstofan` toggled two things simultaneously:
1. Showed Veðurstofan station cards in the point list
2. Swapped `result` from baseline MET/Yr to `vedurstofanLayer.augmentedResult` (blended calculation)

This caused the route assessment (departure status chips, heatmap, summary) to go orange when Veðurstofan was enabled — even when the station cards looked harmless. The `11 m/s` that caused the orange came from a max-blend of a Veðurstofan forecast row at some later time that wasn't visible in the card (because the card only showed `forecastRows[0]`).

### After (correct)
`showVedurstofan` is now a pure display toggle:
- Turning on Veðurstofan shows station cards in "Allir spápunktarnir" only
- The route assessment (`result`, heatmap, status chips, departure candidates) always uses the baseline MET/Yr calculation
- Turning met.no off/on hides/shows MET/Yr route point cards
- Neither toggle changes the assessed result

### What was removed
- `baselineResult` state (no longer needed — result is always the baseline)
- `toggleVedurstofan(show: boolean)` function replaced with `toggleVedurstofan()` (no argument, just flips `showVedurstofan`)
- `setResult(show ? vedurstofanLayer.augmentedResult : baselineResult)` call removed

### What `vedurstofanLayer.augmentedResult` is now
The blended result is still computed server-side and returned in `vedurstofanLayer.augmentedResult`. It is available in the client state in `vedurstofanLayer`. It is not discarded. But it is not used to change the displayed assessment in this patch. Future work can expose it as an explicit "use Veðurstofan in assessment" toggle with provenance, once the station data has been validated.

## Station cards now show all forecast rows

Previously `VedurstofanPointRow` showed only `forecastRows[0]`. This hid the value that caused the blended assessment to change (which could come from any row, matched by ±1.5h window in the blend helper).

Now each card shows all forecast rows in a compact table:
- Time (HH:MM from ftimeIso)
- Wind speed + direction
- Precipitation
- Temperature
- Weather text

Each row is separated by a thin divider. Rows are dense/compact to fit mobile widths.

This makes it possible to see which row has `11 m/s` and verify that it matches what the blend would have used.

## What the assessment now means

With this patch:

- Route assessment = always baseline MET/Yr (no Veðurstofan influence)
- `Veðurstofan (í prófun)` toggle = show/hide station cards (validation only)
- `met.no` toggle = show/hide MET/Yr route point cards
- `vedurstofanLayer.augmentedResult` exists but is not shown to the user in this patch

This matches the product intent Stebbi expressed earlier: Veðurstofan as an extra safety layer for validation, not yet automatically changing route assessments.

## Tests and type-check

```
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
# 2 files passed, 26 tests passed

npm run type-check
# exit 0
```

## Files changed

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - Removed `baselineResult` state
  - Simplified `toggleVedurstofan()` to display-only flip
  - `VedurstofanPointRow` now renders all forecast rows

## Open gaps

- `vedurstofanLayer.augmentedResult` is computed but not exposed in UI
- Missing direct distance-to-segment regression test (v123 finding 1)
- All-stale layer status still reports `available`
- Map markers for Veðurstofan stations not yet added
- `metnoBlendedLabel` key still exists in message files but is unused

## Localhost checks for Stebbi

Preconditions: `elta-vedrid` access, `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`, `WEATHER_ELTA_VEDRID_FLAG=true`, product table warmed.

1. Run the same route as in the screenshots.
2. With default state (met.no on, Veðurstofan off): route assessment should be baseline MET/Yr. Status should be green/yellow/red as before.
3. Turn `Veðurstofan` on. **Confirm the route assessment does NOT change.** Heatmap, status chips, and departure candidates should remain the same as step 2.
4. Open "Allir spápunktarnir". Confirm two sections: `met.no punktar (72)` and `Veðurstofustöðvar við leiðina (N, í prófun)`.
5. Confirm Veðurstofan station cards show ALL forecast rows with times (HH:MM) and values. Verify that the wind value (e.g. 11 m/s) that previously caused the orange assessment IS now visible somewhere in the rows of the correct station.
6. Turn `met.no` off. Only Veðurstofan station cards remain. Route assessment still unchanged.
7. Turn `met.no` back on. Both sections appear. Route assessment still unchanged.
8. No mysterious numbers in the route assessment that are not traceable to the MET/Yr baseline.
9. At 360, 390, 460 px: station cards with multi-row forecast tables should wrap without overflow.
10. With flags off: normal route weather experience unchanged.
