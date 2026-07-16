# TODO 086 v114 - Claude v113 done, prerelease

Created: 2026-07-13 22:00 Atlantic/Reykjavik
Agent: Claude Code
Implements: `2026-07-13-2148-todo-086-v113-codex-provider-filter-addendum.md`

## What was done

### Server: lat/lon/sourceUrl in layer points (`app/api/teskeid/weather/travel/route.ts`)

- Added import of `VEDURSTOFAN_STATIONS_REGISTRY`.
- Built a `Map<stationId, registryEntry>` inside the layer-building block.
- Each `layerPoints.push(...)` now includes `lat`, `lon`, `sourceUrl` looked up from the registry (all `null` if station not found in registry or registry entry has no coordinates).
- This populates the fields added to `VedurstofanTravelLayer.points` in the previous step.

### Phase A: Stale drawer fix (`FerdalagidClient.tsx` — `toggleVedurstofan`)

- `toggleVedurstofan` now calls `setForecastDrawerData(null)` and `setCompareDrawerOpen(false)` before swapping the result. Stale drawer data from the previous layer can no longer bleed through after toggling.

### Phase B: Provider filter inside summary card

- Removed the standalone Veðurstofan toggle card that appeared below the map (lines ~1171-1198).
- Added a `Gagnaveitur` (provider filter) panel at the very top of the combined summary card, visible only when `vedurstofanLayer` is present.
- Three rows:
  - `met.no` — always on, shown with a filled indicator (not a toggle button; locked).
  - `Veðurstofan (í prófun)` — toggle switch with `aria-label`, `role="switch"`, `aria-checked`. Whole row is `min-h-[40px]` for touch target.
  - `Vegagerðin (í vinnslu)` — visual toggle in `opacity-40`, not interactive, no click handler. Clearly disabled visually without relying on color alone.
- Disclaimer text (`vedurstofanLayerDisclaimer`) still appears below the rows when Veðurstofan is on.
- Panel is separated from the rest of the card with a bottom border.

### Phase D: Veðurstofan points in "Allir spápunktarnir"

- After the MET/Yr `RoutePointRow` list, when `showVedurstofan && vedurstofanLayer?.points.length > 0`, a labeled section header (`vedurstofanPointsSectionLabel`) and one `VedurstofanPointRow` per layer point are rendered.
- `VedurstofanPointRow` (new function component at the bottom of the file):
  - Shows station name + `Veðurstofan (í prófun)` badge.
  - Shows first forecast row fields: windSpeedMs, precipitationMmPerHour, temperatureC, weatherText (each only when non-null).
  - Shows stale indicator when `status === 'stale'`.
  - Shows a `vedur.is` link (`vedurstofanSourceLink`) when `sourceUrl` is available.
  - Does not show Yr or met.no links.

### Translation keys added

Both `messages/is.json` and `messages/en.json` in `teskeid.vedrid.ferdalagid`:

| Key | is | en |
|---|---|---|
| `providerFilterTitle` | Gagnaveitur | Data sources |
| `providerMetnoLabel` | met.no | met.no |
| `providerVedurstofanLabel` | Veðurstofan (í prófun) | Veðurstofan (in testing) |
| `providerVegagerdinLabel` | Vegagerðin (í vinnslu) | Vegagerðin (in progress) |
| `vedurstofanPointsSectionLabel` | Veðurstofan punktar (í prófun) | Veðurstofan points (in testing) |
| `vedurstofanSourceLink` | vedur.is | vedur.is |

The existing `vedurstofanLayerToggleLabel` key is now unused in code (the switch uses `aria-label={tf('providerVedurstofanLabel')}` instead) but was left in the message files since removing unused i18n keys is low priority and safe to do later.

## Answers to v113 questions

1. **Is the provider filter controlling display only, or also the experimental augmented result calculation?**
   Both. Toggling Veðurstofan on calls `toggleVedurstofan(true)` which swaps `result` to `vedurstofanLayer.augmentedResult`, exactly as before. The provider filter replaced the old toggle card but kept the same behavior.

2. **Is `met.no` allowed to be toggled off when no other active provider is visible?**
   No. `met.no` has no toggle button. It is shown with a static filled indicator. The UI cannot enter a state where met.no is off.

3. **Does the all-points list now contain provider-labelled Veðurstofan points, or only MET/Yr points?**
   Both, when Veðurstofan is enabled. MET/Yr `RoutePointRow` points appear first (unchanged), then a labeled section of `VedurstofanPointRow` points appears below when `showVedurstofan && vedurstofanLayer.points.length > 0`.

4. **Are Veðurstofan links using `vedurstofan_stations.source_url` when available?**
   Yes. The server now looks up each station in `VEDURSTOFAN_STATIONS_REGISTRY` by `stationId` and populates `sourceUrl` in the layer point. `VedurstofanPointRow` renders a `vedur.is` link only when `vpt.sourceUrl` is truthy.

5. **Are all new user-facing strings in `messages/is.json` and `messages/en.json`?**
   Yes. No hardcoded user-facing strings were added in this step.

## Tests and type-check

```
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
# 2 files passed, 24 tests passed

npm run type-check
# exit 0
```

## Files changed

- `app/api/teskeid/weather/travel/route.ts` — registry lookup + lat/lon/sourceUrl in layer points
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — stale-drawer fix, standalone card removed, provider filter added, VedurstofanPointRow added
- `messages/is.json` — 6 new keys
- `messages/en.json` — 6 new keys
- `lib/weather/providers/vedurstofanBlend.ts` — already updated in prior step (lat/lon/sourceUrl in type)

## Localhost checks for Stebbi

Preconditions:
- Sign in as user with `elta-vedrid` access.
- Set `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true` and `WEATHER_ELTA_VEDRID_FLAG=true` locally.
- Ensure local Veðurstofan product table has been warmed (`/api/cron/warm-vedurstofan`).

1. Run the route weather flow. Confirm the result loads.
2. Confirm the `Gagnaveitur` filter panel appears at the top of the summary card, before the scrubber and coverage text.
3. Confirm `met.no` row is visible and has no interactive toggle.
4. Confirm `Veðurstofan (í prófun)` row has a working toggle. Toggle it on and off several times.
5. Confirm `Vegagerðin (í vinnslu)` is visible but grayed out and cannot be tapped/clicked.
6. With Veðurstofan off: confirm existing MET/Yr result is unchanged, no Veðurstofan points appear in "Allir spápunktarnir".
7. With Veðurstofan on:
   - Confirm disclaimer text appears below the filter rows.
   - Open "Allir spápunktarnir" (expand explainer). Confirm Veðurstofan section header and cards appear below the MET/Yr list.
   - Confirm Veðurstofan cards show station name, provider badge, forecast values, and a `vedur.is` link where available.
   - Confirm Veðurstofan cards do NOT show Yr or met.no links.
8. Open a forecast drawer for a MET/Yr point, then toggle Veðurstofan — confirm the drawer closes (no stale data).
9. Open the comparison drawer, then toggle Veðurstofan — confirm the drawer closes.
10. At 360, 390, 460 px widths: confirm no horizontal overflow, provider labels wrap cleanly, toggle hit targets feel usable.
11. Without `elta-vedrid` access or feature flag: confirm `Gagnaveitur` panel is not visible and route weather behaves exactly as before.
