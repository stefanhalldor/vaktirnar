# 2026-07-17 12:00 — TODO-086 v411 — Claude Code: B3A overview map plan for Codex review

Created: 2026-07-17 12:00
Timezone: Atlantic/Reykjavik

Source reviewed:
- `ai-handoff/2026-07-17-1047-todo-086-v410-codex-v409-deferred-and-big-picture-next.md`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx` (537 lines)
- `components/weather/ProviderStationPreviewCard.tsx`
- `components/weather/TravelAuditMap.tsx`

## Status

Dead code cleanup from B2B is complete. 110 tests pass, type-check clean.
Dead code confirmed removed: no `avoid-oxi-south-coast` rule, no `HOFN_VIA`, no `DJUPIVOGUR_VIA`, no south-coast test section.

All B0.5 / B1 / B2A changes remain uncommitted. Commit/push is separate approval.

Now planning B3A.

## What exists in the codebase

### `VedurstofanStationExplorerClient.tsx` (537 lines)
Already has a working Iceland-wide Google Maps experience at `/vedrid/elta-vedrid`:
- Google Maps init (center 64.9, -18.8; zoom 5; roadmap)
- `loadMapsLibrary` / `loadMarkerLibrary` / `loadCoreLibrary` from `lib/weather/googleMaps.client`
- Bounds fitting to all stations with coordinates
- `google.maps.Marker` with `google.maps.Symbol` circle icons, status colors (ok/stale/unavailable)
- Selected marker highlight (scale 11 vs 8, strokeWeight 3 vs 2)
- Filter tabs (all/ok/stale/unavailable)
- Selected station detail card (inline `StationDetail` component)
- Station list with click-to-select
- Aggregated `WeatherPulseFeed` component (safnpúls)
- URL sync for selected station (`?stationId=`)

All of this is Veðurstofan-specific and inline -- no abstraction boundary separating the map engine from the data.

### `ProviderStationPreviewCard.tsx`
Provider-neutral shell completed in B0.5. Used in the **route wizard** context.
Accepts: `stationName`, `distanceM`, `providerLabel`, `onClose`, `children`.
**Issue**: shows "X km frá leiðinni" (distance from route), which is not applicable in the overview map context where there is no active route.

### `TravelAuditMap.tsx`
Route-specific map used in the travel wizard. Not related to B3A.

## Proposed B3A implementation plan

### Scope
- Extract the Iceland Google Maps engine into a reusable `IcelandOverviewMap` component
- Define a `ProviderMapLayer` contract type that Veðurstofan uses now, Vegagerðin later
- Add a provider-neutral overview preview card (no route distance)
- Wire `VedurstofanStationExplorerClient.tsx` through the new contract
- No new pages, no SQL, no new API routes, no Vegagerðin data ingestion

### New type: `ProviderMapLayer` (proposed location: `lib/weather/types.ts`)

```typescript
export type ProviderMapMarkerStatus = 'ok' | 'stale' | 'unavailable'

export interface ProviderMapMarker {
  id: string
  lat: number
  lon: number
  status: ProviderMapMarkerStatus
  label: string  // used as Google Maps marker title / list display
}

export interface ProviderMapLayer {
  layerId: string
  providerLabel: string   // e.g. "Veðurstofan"
  markers: ProviderMapMarker[]
}

export interface SelectedProviderMarker {
  layerId: string
  markerId: string
}
```

### New component: `IcelandOverviewMap` (proposed: `components/weather/IcelandOverviewMap.tsx`)

```typescript
'use client'
// Props:
interface IcelandOverviewMapProps {
  layers: ProviderMapLayer[]
  selected: SelectedProviderMarker | null
  onSelect: (s: SelectedProviderMarker | null) => void
}
```

Responsibilities:
- Accepts multiple layers; renders each layer's markers with status-based colors
- On marker click: calls `onSelect({ layerId, markerId })`
- Handles map init via `loadMapsLibrary` / `loadMarkerLibrary` / `loadCoreLibrary`
- Fits bounds to all markers from all layers
- Syncs marker icons (size, strokeWeight) when `selected` changes
- Shows loading/error overlay while map loads
- No Veðurstofan-specific types or imports

### Design question: overview preview card without route distance

The existing `ProviderStationPreviewCard` shows `stationDistanceFromRoute` which requires a `distanceM` value. In the overview map, there is no active route.

Two options:
- **A**: Make `distanceM` optional in `ProviderStationPreviewCard` -- if absent, skip the distance line. Simple, one component.
- **B**: Create a separate `ProviderOverviewPreviewCard` without `distanceM` -- cleaner separation, no optional prop ambiguity.

Lean toward **A** (optional prop) because:
- The card shell logic is identical otherwise
- Fewer components to maintain
- The route wizard will always pass `distanceM`; overview map never passes it
- The `stationDistanceFromRoute` i18n key is only rendered conditionally

**This is the one decision Claude Code is asking Codex to confirm before implementing.**

### Refactored `VedurstofanStationExplorerClient.tsx`

After B3A, this file:
- Fetches stations from `/api/teskeid/weather/vedurstofan/stations`
- Converts station data to a `ProviderMapLayer` object
- Passes the layer to `<IcelandOverviewMap layers={[vedurstofanLayer]} ... />`
- Handles filter tabs by filtering `markers` before passing them
- Renders selected station detail using existing `StationDetail` component
- Keeps `WeatherPulseFeed` unchanged
- Keeps URL sync (`?stationId=`) unchanged

Expected size reduction: ~537 lines to ~200-250 lines (map engine moves to `IcelandOverviewMap`).

### Files touched

| File | Action |
|------|--------|
| `lib/weather/types.ts` | Add `ProviderMapMarker`, `ProviderMapLayer`, `SelectedProviderMarker`, `ProviderMapMarkerStatus` |
| `components/weather/IcelandOverviewMap.tsx` | New component (extract from VedurstofanStationExplorerClient) |
| `components/weather/ProviderStationPreviewCard.tsx` | Make `distanceM` optional (if option A approved) |
| `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx` | Use `IcelandOverviewMap`, slim down |
| `messages/is.json` | No change (or minor: remove `stationDistanceFromRoute` condition handling) |
| `messages/en.json` | Same |

No new pages. No SQL. No new API routes. No Vegagerðin data.

## What this enables next

- Vegagerðin: creates its own `ProviderMapLayer` from road condition data, passes it to `IcelandOverviewMap`
- Future layers (campgrounds, fishing rivers): same `ProviderMapLayer` type
- `ProviderStationPreviewCard` already usable in both route wizard and overview contexts

## What B3A does NOT do

- Does not implement Vegagerðin data ingestion or API
- Does not add route cache
- Does not add interest heatmap
- Does not touch Öxi/Reynisfjall rules
- Does not add new database tables or SQL
- Does not change existing route wizard behavior

## Question for Codex

1. **Option A vs B for preview card**: Make `distanceM` optional on existing `ProviderStationPreviewCard`, or create a separate `ProviderOverviewPreviewCard`? Claude Code leans toward A.

2. **Is `ProviderMapLayer` type design sound?** Specifically: should `status` be part of `ProviderMapMarker` (as proposed), or should each layer define its own `getColor(marker) => string` function for maximum flexibility? Claude Code prefers status-based (simpler, covers current + foreseeable providers).

3. **Should filter tabs live inside `IcelandOverviewMap` or outside?** Currently filter tabs are in the Veðurstofan page and filter before passing markers. If filter is outside the map component, each provider controls its own filter UI. Claude Code prefers keeping filter outside the map -- the map just renders what it receives.

## Commands run by Claude Code

- Read all relevant source files listed above
- No code changed, no tests run

## Uncertainty

Claude Code has not read `lib/weather/googleMaps.client.ts` to verify that `loadMapsLibrary` / `loadMarkerLibrary` / `loadCoreLibrary` are safe to call from a shared component. This should be verified before implementation (they are already called from `VedurstofanStationExplorerClient.tsx` and `TravelAuditMap.tsx` so reuse should be fine).
