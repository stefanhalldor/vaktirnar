# 2026-07-18 11:30 - TODO 086 v485 - Claude v484 done, prerelease

Created: 2026-07-18 11:30
Timezone: Atlantic/Reykjavik

Sources implemented against:
- `ai-handoff/2026-07-18-1116-todo-086-v484-codex-v483-prerelease-review.md`
- Stebbi localhost findings: spjallpúls not showing + pulse map station names missing

## What was implemented

### 1. FIX (Stebbi localhost): Spjallpúls now unconditionally rendered

**Root cause:** `renderFeedPreMap` in `WeatherOverviewShell.tsx` was filtered to only run for
providers where `!p.providerRestricted && !p.loadError`. If Vegagerðin returned 401/403
(restricted) on Stebbi's localhost account, `vegagerdinRestricted=true` and the conditions
feed disappeared with it, because the feed lives in `vegagerdinProvider.renderFeedPreMap`.

The conditions feed (`ConditionsFeedPreview`) polls a **public endpoint** — it does not require
Vegagerðin access. Gating it on provider access was wrong.

**Fix:** `components/weather/WeatherOverviewShell.tsx` — `renderFeedPreMap` now renders for
ALL providers unconditionally. The callback is responsible for what to show; the shell does
not gatekeep. Provider content that genuinely requires auth should guard itself internally.

### 2. FIX (Stebbi localhost): Pulse map station names now visible inside the map

**Root cause:** The station name legend was rendered *below* the map at `text-[11px]`. It was
too small and likely not visible without scrolling, especially on mobile.

**Fix:** `components/weather/ProviderStationContextMap.tsx` — the legend is now an absolutely
positioned overlay inside the map container (`absolute bottom-2 left-2`), with:
- `bg-background/90 backdrop-blur-sm` — readable against any map background
- `border border-border/30 rounded-lg px-2 py-1.5` — looks like a standard map legend panel
- `pointer-events-none` — does not block map interaction
- `max-w-[55%]` — does not cover Google copyright (bottom-right) or zoom controls (right)
- Station names now at `text-xs` (12px) instead of `text-[11px]`
- Provider label on one line above station names (`text-[10px] text-muted-foreground`)

This means station names are now visible ON the map without hovering or scrolling.

### 3. FIX (Codex v484): Translation namespace for status labels

`components/weather/WeatherOverviewClient.tsx`:
- Added `const tf = useTranslations('teskeid.vedrid.ferdalagid')`.
- Vegagerðin marker `statusLabel` now uses `tf(WIND_STATUS_META[status].labelKey as ...)`.
- Previously used `t` (bound to `teskeid.vedrid.eltaVedrid`), which does not have these keys.
- Status labels (`Innan marka`, `Nálgast óþægindi`, `Óþægilegt`, `Nálgast hættumörk`, `Hættulegt`)
  now correctly resolve from the `ferdalagid` namespace — same source as `WindStatusBadge`.

### 4. FIX (Codex v484): Mobile zoom on threshold inputs

`components/weather/WeatherThresholdBar.tsx`:
- `<input>` class changed from `text-xs` to `text-base` (≥16px).
- This prevents iOS/Safari from zooming on focus, per `Design.md`.
- Layout density is controlled by padding and the surrounding compact bar, not input font size.

### 5. ADD (Codex v484): `WindStatusBadge` in Vegagerðin station detail card

`components/weather/WeatherOverviewClient.tsx`:
- `VegagerdinStationDetail` now accepts `thresholds: ResolvedTravelThresholds`.
- Classifies the selected station's `meanWindMs` with `classifyObservationWindDisplayStatus`.
- Renders `<WindStatusBadge status={windStatus} variant="badge" />` as `contextLine` in
  `ProviderStationPreviewCard`, replacing the static "Núverandi mæling frá Vegagerðinni" string.
- The badge uses the same `WindStatusBadge` component and `ferdalagid` namespace as the
  travel map — "Óþægilegt", "Hættulegt" etc. are consistent across both screens.
- Freshness labels (e.g. "Gömul mæling") remain in the measurement detail section below.
- `thresholds` is passed from `WeatherOverviewClient` at the call site.

### 6. UPDATE (Codex v484): Comments in `WeatherThresholdBar` and `useWeatherThresholds`

Both files now describe the threshold control/hook as a **shared** weather-threshold layer,
currently used by overview, with a TODO to promote it to a shared context once
`/vedrid/ferdalagid` is ready to consume it.

## Also already applied in prior session (not repeated here)

- Vegagerðin pill stale fix: `unavailableReason` no longer set for empty cache — pill stays
  interactive. Only `restricted` (401/403) or `error` (5xx) disable the pill.

## Commands run

```
npm run type-check
```
Exit 0.

```
npm run test:run -- lib/__tests__/windObservationStatus.test.ts lib/__tests__/chat-access.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/spatialOrder.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts
```
Exit 0. 6 files, 124 passed.

No SQL was run. No commit, push, deploy, Vercel change, or production change was made.

## SQL 81

Not run. Vegagerðin thread creation fails until SQL 81 is applied.

## Localhost checks for Stebbi

1. Open `http://localhost:3004/vedrid`.
2. **Spjallpúls:** should now appear above the map even if Vegagerðin is restricted or empty.
   If `emptyBehavior="hide"` and no messages exist, it hides (that is correct).
3. **Vegagerðin pill:** clickable/toggleable regardless of measurement freshness or cache status.
4. **Threshold bar:** above safnpúls: "Veðurmörk: Óþægilegt 15 m/s · Hættulegt 25 m/s  Breyta"
5. **Vegagerðin markers colored by threshold:** dark green / amber / orange / red by wind status.
6. Click "Breyta" on mobile → inputs must be 16px (no iOS zoom on focus).
7. Change to tight limits (e.g. 10/15) → markers recolor instantly, no refetch.
8. Click a Vegagerðin station marker → detail card should show `WindStatusBadge` chip
   (e.g. "😟 Óþægilegt") instead of "Núverandi mæling frá Vegagerðinni".
9. **Pulse map (each station pulse):** open a Vegagerðin station pulse.
   - Map shows selected station + nearby Veðurstofan markers.
   - Station name legend should now appear **inside the map** (bottom-left corner),
     showing e.g. `[green] Vegagerðin / Sandskeið` and `[grey] Veðurstofan / Selfoss (18.3 km) · ...`.
   - Names readable without hovering, does not cover map controls.
10. Mobile 390–460 px: no horizontal overflow, legend fits within `max-w-[55%]` of map.

## Files changed

- `components/weather/WeatherOverviewShell.tsx` — `renderFeedPreMap` now unconditional
- `components/weather/ProviderStationContextMap.tsx` — legend overlaid inside map, `text-xs`
- `components/weather/WeatherOverviewClient.tsx` — `tf` hook, status badge in detail card, `thresholds` threaded through
- `components/weather/WeatherThresholdBar.tsx` — `text-base` inputs, updated comment
- `lib/weather/useWeatherThresholds.ts` — updated comment
