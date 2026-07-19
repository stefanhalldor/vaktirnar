# 2026-07-17 12:30 — TODO-086 v413 — Claude Code: B3A implementation prerelease

Created: 2026-07-17 12:30
Timezone: Atlantic/Reykjavik

## What was implemented

B3A: shared Iceland overview map component with provider-layer contract.

### Files changed

| File | Change |
|------|--------|
| `lib/weather/types.ts` | Added `ProviderMapMarkerTone`, `ProviderMapMarker`, `ProviderMapLayer`, `SelectedProviderMarker` |
| `components/weather/IcelandOverviewMap.tsx` | New reusable Iceland map component |
| `components/weather/ProviderStationPreviewCard.tsx` | Replaced `distanceM` with `contextLine?: ReactNode`; removed internal `useTranslations` |
| `components/weather/RouteSelectionStep.tsx` | Passes `contextLine` and `closeLabel` to card (no functional change) |
| `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx` | Uses `IcelandOverviewMap`; 537 lines → ~280 lines |

### Contract types (lib/weather/types.ts)

```ts
export type ProviderMapMarkerTone = 'ok' | 'warning' | 'danger' | 'muted' | 'unavailable'

export interface ProviderMapMarker {
  id: string; lat: number; lon: number; label: string
  tone: ProviderMapMarkerTone
  statusLabel?: string  // optional, for screen readers / tooltips
  visible?: boolean     // false = filtered out; defaults to shown
}

export interface ProviderMapLayer {
  layerId: string
  providerLabel: string
  markers: ProviderMapMarker[]
}

export interface SelectedProviderMarker {
  layerId: string
  markerId: string
}
```

### IcelandOverviewMap component

- Accepts `layers: ProviderMapLayer[]`, `selected: SelectedProviderMarker | null`, `onSelect`
- Initializes Google Maps once when the first non-empty layers arrive
- Stores markers in a registry keyed by `${layerId}:${markerId}` for O(1) lookup
- Separate sync effect updates `setVisible` / `setIcon` / `setZIndex` on every `layers` or `selected` change
- Renders loading and error overlays in the same `rounded-xl border border-border` container
- Props `loadingLabel`, `errorLabel`, `className` are overridable (i18n caller-controlled)
- No Veðurstofan-specific imports

### ProviderStationPreviewCard changes

- `distanceM: number` removed
- `contextLine?: ReactNode` added — optional slot rendered below provider badge
- `closeLabel?: string` added — accessible close button label (default 'Loka')
- `useTranslations` removed — card is now fully import-free of next-intl
- Route wizard passes `contextLine={tf('stationDistanceFromRoute', { km: ... })}` and `closeLabel={tf('stationPreviewClose')}` — no visible change for user

### VedurstofanStationExplorerClient changes

- `stationTone()` adapter: `ok → ok`, `stale → warning`, `unavailable → unavailable`
- `ProviderMapLayer` built from fetched stations with `visible: filter === 'all' || station.status === filter`
- `selectedProvider: SelectedProviderMarker | null` replaces `selectedId: string | null`
- `handleSelect` implements the same toggle logic as before (click selected → deselects)
- URL sync (`?stationId=`) unchanged
- Map init (`loadMapsLibrary` etc.) removed from this file — delegated to `IcelandOverviewMap`
- Filter tabs, station list, `StationDetail`, `WeatherPulseFeed` unchanged
- `STATUS_COLOR` kept for summary strip dots and station list indicators (not map markers)

## Codex v412 answers addressed

1. **contextLine slot**: implemented — card has `contextLine?: ReactNode`, route wizard passes the distance string
2. **tone vs status**: implemented — `ProviderMapMarkerTone` with `ok/warning/danger/muted/unavailable`; Veðurstofan adapter converts its domain status before markers reach the map
3. **filters outside map**: implemented — `IcelandOverviewMap` renders what it receives; filter tabs in `VedurstofanStationExplorerClient` set `visible` flags before passing the layer

## Design.md compliance

- Mobile-first: map height `h-[280px] sm:h-[360px]`, no fixed/sticky elements added
- No horizontal overflow risk: map is `overflow-hidden rounded-xl`, same as original
- Loading state: overlay preserved, does not shift layout width
- No new controls that need keyboard / focus audit (all existing)

## Tests and type-check

- `npx tsc --noEmit`: clean
- `npx vitest run`: 96 test files, 2890 passed, 27 skipped, 8 todo

## What B3A does NOT do (confirmed out of scope)

- No Vegagerðin data ingestion
- No route cache
- No interest heatmap
- No Öxi/Höfn/Djúpivogur tuning
- No Reynisfjall/Vík `verified:true`
- No SQL / migrations
- No env / Vercel changes

## Localhost checks for Stebbi

1. `/auth-mvp/vedrid/elta-vedrid`
   - Map loads and shows Iceland-wide Veðurstofan markers (green/amber/gray dots)
   - Clicking a marker selects it (larger icon) and opens the station detail card below the filter tabs
   - Clicking the same marker again deselects
   - URL updates with `?stationId=` on select, clears on deselect
   - Clicking a station in the list also selects/deselects

2. Filter tabs
   - Switching from "All" to "Ok" / "Stale" / "Unavailable" hides other markers on the map
   - Station list below also filters to match

3. Mobile (390 px)
   - No horizontal overflow
   - Map height ~280 px
   - Station detail card scrolls naturally below map + tabs

4. Route wizard (`/auth-mvp/vedrid` → travel wizard)
   - Station preview card on the route map still shows distance line ("X km frá veginum")
   - Close button still works
   - No visual regression

5. Regression: `/auth-mvp/vedrid` (main weather page) unchanged

## Changes not committed

All changes are uncommitted. Commit and push require separate approval from Stebbi.
