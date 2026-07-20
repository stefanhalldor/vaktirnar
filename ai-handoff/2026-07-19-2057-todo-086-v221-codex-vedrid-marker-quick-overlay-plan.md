# Codex Handoff: /vedrid Marker Quick Overlay Instead Of Below-Map Detail Card

Created: 2026-07-19 20:57
Timezone: Atlantic/Reykjavik
Related TODO: todo-086
Agent: Codex

## User Request

Stebbi wants `/vedrid` marker clicks to show a small overlay on the map itself, not the current white detail card below the map.

Desired overlay content:

- station name/provider context, compact
- wind speed
- gusts, when available
- latest user note/comment
- `Nánar` button

`Nánar` behavior:

- If clicked marker is a Vegagerðin station: open that Vegagerðin station Púls.
- If clicked marker is a Veðurstofan station: open the nearest Vegagerðin Púls, not the old Veðurstofan pulse/detail flow.

Important sequencing from Stebbi:

- Do not fully remove the existing below-map detail card until the small overlay and `Nánar` behavior have been verified.
- Once verified, remove the white detail card below the `/vedrid` map for marker clicks.

## Current Code Context

Relevant files inspected:

- `components/weather/IcelandOverviewMap.tsx`
- `components/weather/WeatherOverviewShell.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/ProviderStationPreviewCard.tsx`
- `lib/weather/pulseTarget.ts`
- `lib/weather/nearestStations.ts`
- `messages/is.json`
- `messages/en.json`
- `IcelandRoadmap.md`
- `Design.md` was read in the immediately preceding `/vedrid` UI/status work and applies here: mobile-first, no card-in-card/floating heavy detail, compact controls, no text overflow, all user copy in messages.

Existing behavior:

- `IcelandOverviewMap` only emits `{ layerId, markerId }` through `onSelect`.
- `WeatherOverviewShell` owns `selectedProvider` and syncs selection to URL through `provider` and `stationId`.
- `WeatherOverviewClient` renders provider-specific detail cards through `renderPostMap`.
- `StationDetail` currently renders a large `ProviderStationPreviewCard` for Veðurstofan below the map.
- `VegagerdinStationDetail` currently renders a large `ProviderStationPreviewCard` for Vegagerðin below the map.
- Vegagerðin current wind/gust values are already available in `vegagerdinData.stations`.
- Veðurstofan overview station rows have forecast rows, but no Vegagerðin gusts. For a Veðurstofan marker, the overlay should map to nearest Vegagerðin station for Púls and latest comment.

Existing helpers/routes:

- `vegagerdinPulseHref(stationId, returnTo)` in `lib/weather/pulseTarget.ts`
- `vedurstofanPulseHref(stationId, returnTo)` exists, but should not be used for this new `Nánar` behavior from a Veðurstofan overview marker.
- `findNearestStations()` in `lib/weather/nearestStations.ts` can be reused to choose the nearest Vegagerðin station from the loaded current station list.
- Latest pulse previews already exist as public read-only endpoints:
  - Vegagerðin: `GET /api/teskeid/weather/vedurpuls/vegagerdin/stations/[stationId]/preview`
  - Veðurstofan legacy: `GET /api/teskeid/weather/vedurpuls/stations/[stationId]/preview`
- Because Stebbi wants nearest Vegagerðin Púls for Veðurstofan markers, prefer fetching latest note for the resolved Vegagerðin target, not the Veðurstofan legacy target.

## Recommended Implementation Plan

### 1. Add map overlay capability to `IcelandOverviewMap`

Add an optional render prop rather than hardcoding provider-specific UI into the map:

```ts
renderSelectedOverlay?: (selection: SelectedProviderMarker) => React.ReactNode
```

Render it inside the map wrapper:

- `absolute` positioned over the map, preferably top-left or bottom-left.
- Width constrained for mobile, e.g. `max-w-[min(280px,calc(100%-24px))]`.
- Do not cover Google zoom controls on the right.
- Keep it visually light: small white/card surface, subtle border, no large detail layout.
- Include close button or support marker re-click deselect. Close button is recommended for clarity.

Alternative if Claude finds render prop awkward:

- Let `WeatherOverviewShell` render a sibling absolutely positioned overlay over the map container.
- But the render prop inside `IcelandOverviewMap` is cleaner because it keeps the overlay anchored to the map surface and avoids layout shifts below the map.

### 2. Build provider-neutral quick overlay data in `WeatherOverviewClient`

Add a small local model in `WeatherOverviewClient.tsx`, for example:

```ts
type OverviewMarkerQuickOverlay = {
  provider: 'vedurstofan' | 'vegagerdin'
  markerId: string
  stationName: string
  providerLabel: string
  windMs: number | null
  gustMs: number | null
  pulseProvider: 'vegagerdin'
  pulseStationId: string | null
  pulseStationName: string | null
  pulseHref: string | null
}
```

For Vegagerðin marker:

- `windMs = station.meanWindMs`
- `gustMs = station.gustLast10MinMs`
- `pulseStationId = station.stationId`
- `pulseHref = vegagerdinPulseHref(station.stationId, returnTo)`

For Veðurstofan marker:

- `windMs` can come from the forecast row at `forecastAnchorMs` if available.
- `gustMs = null` unless a reliable forecast gust value exists in the DTO. Do not invent gusts.
- Resolve nearest Vegagerðin station from `vegagerdinData.status === 'ok'` stations using `findNearestStations({ lat: selectedStation.lat, lon: selectedStation.lon }, vegagerdinData.stations.map(...), 1)`.
- `pulseStationId` should be that nearest Vegagerðin station ID.
- `pulseHref = vegagerdinPulseHref(nearestVegagerdin.stationId, returnTo)`.
- Show a compact context line like `Næsti vegapúls: {name}` if useful, but keep the overlay small.

Open question for Claude to check:

- Confirm exact forecast row helper already available for Veðurstofan wind at `forecastAnchorMs`; likely use the same selection path as `StationDetail` does for `selectForecastRowAt(station.forecasts, selectedTimeMs)`.

### 3. Fetch latest note/comment for the Púls target, not for the clicked provider in all cases

The overlay should show the latest note for the Púls target that `Nánar` opens.

Recommended behavior:

- Vegagerðin marker -> fetch latest preview for that Vegagerðin station.
- Veðurstofan marker -> resolve nearest Vegagerðin station first, then fetch latest preview for that Vegagerðin station.

Avoid duplicating feed parsing. Reuse preview API DTO shape if practical. If there is already a shared preview type, use it. If not, add a tiny local type for only the fields displayed.

Suggested hook/component:

- Create `components/weather/OverviewMarkerQuickOverlay.tsx`.
- Props:
  - overlay model
  - `onClose`
  - maybe `returnTo`
- It can fetch latest note with `useEffect` when `pulseProvider/pulseStationId` changes.
- Use `cache: 'no-store'` only if existing preview components do that; otherwise follow existing `WeatherPulseInline` / `ConditionsFeedPreview` pattern.
- Abort/ignore stale response on selection changes.
- Render loading as a tiny muted line, not a spinner-heavy card.

Important:

- Do not fetch latest note for every station in the map. Fetch only for the selected marker/nearest Púls target.
- If preview fetch fails, show a compact fallback like `Engin nýleg athugasemd` or hide that line. Do not block the `Nánar` button.

### 4. Wire overlay into `WeatherOverviewShell`

`WeatherOverviewShell` already has provider configs and `makeCtx(providerId)`, but it does not know provider-specific station data. The clean options are:

Option A - add a shell prop:

```ts
renderSelectedMapOverlay?: (selection: SelectedProviderMarker, onClose: () => void) => React.ReactNode
```

Then pass it to `IcelandOverviewMap` as `renderSelectedOverlay`.

`WeatherOverviewClient` can implement `renderSelectedMapOverlay` because it has both Veðurstofan and Vegagerðin data.

Option B - put overlay in provider `renderPostMap` temporarily.

Not recommended for final UI because it will still render below the map unless shell changes layout.

Recommended: Option A.

### 5. Keep old below-map detail cards during verification, then remove or gate them

Stebbi explicitly wants to remove the below-map white detail card after the overlay is confirmed.

Safer implementation sequence:

1. First implementation: render overlay and keep old post-map cards behind a temporary local constant/flag, e.g. `const SHOW_LEGACY_SELECTED_STATION_DETAIL = false`.
2. Since Stebbi already wants to remove the card, it is acceptable to set the legacy detail rendering to `null` after overlay exists, but call out in handoff that this is the removal point.
3. Do not leave both visible long-term, because marker click would feel duplicated and noisy.

Suggested final state:

- `renderPostMap` should no longer render `StationDetail` or `VegagerdinStationDetail` for overview marker selection.
- Those detail components can be deleted only if no other file uses them.
- `ProviderStationPreviewCard` must remain because `RouteSelectionStep` uses it.

### 6. Text and translations

Add user-facing text to both `messages/is.json` and `messages/en.json`.

Likely keys under `teskeid.vedrid.overview`:

- `markerOverlayWind`
- `markerOverlayGust`
- `markerOverlayNoWind`
- `markerOverlayLatestNote`
- `markerOverlayNoLatestNote`
- `markerOverlayLatestNoteLoading`
- `markerOverlayDetails`
- `markerOverlayClose`
- `markerOverlayNearestVegagerdin`

Use Icelandic wording natural for the product:

- `Vindur`
- `Hviður`
- `Síðasta athugasemd`
- `Nánar`
- `Næsti Vegagerðarpúls`

Avoid "Vegagerðar stöð" with a space; previous copy has had that ugliness.

## Acceptance Criteria

1. Clicking a Vegagerðin marker opens a small overlay on top of the map.
2. The overlay shows station name, wind speed, gust when present, latest note if available, and a `Nánar` button.
3. `Nánar` from a Vegagerðin marker opens `/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]` with a useful `returnTo`.
4. Clicking a Veðurstofan marker opens the same style overlay on the map, not the large card below.
5. `Nánar` from a Veðurstofan marker opens the nearest Vegagerðin station Púls.
6. Latest note shown for a Veðurstofan marker comes from the same nearest Vegagerðin Púls target that `Nánar` opens.
7. If no nearest Vegagerðin station is available because Vegagerðin data is unavailable/restricted/empty, the overlay still shows Veðurstofan wind info and disables or hides `Nánar` with a calm fallback.
8. Existing route filters and status filters still clear or hide selection correctly when the selected marker becomes invisible.
9. Clicking the same marker again still deselects, or the overlay close button deselects.
10. The old below-map white detail card no longer appears after overlay behavior is verified.

## Tests / Verification Recommendations

Automated tests:

- Add a focused unit test if overlay model builder is extracted as a pure helper:
  - Vegagerðin marker maps to itself.
  - Veðurstofan marker maps to nearest Vegagerðin station.
  - no Vegagerðin candidates produces no `pulseHref`.
- If React component tests already exist for `WeatherOverviewClient`, add one interaction test for marker selection only if it can be done without brittle Google Maps mocking. If mocking is heavy, do not overbuild it for this hotfix.
- Existing pulse preview API tests should not need changes unless DTO assumptions are changed.

Manual/browser checks are essential because this is Google Maps UI.

## Route Intelligence Check

- Scope: `/vedrid` marker interaction, station-to-pulse navigation, and nearest-provider fallback.
- This does not change route memory, route variants, route caution IDs, station matching to route, or stored route data.
- For Veðurstofan -> nearest Vegagerðin Púls, the nearest calculation is a UI affordance, not canonical route intelligence. It should not be persisted.
- Provider-neutrality: keep overlay data model provider-neutral, but route `Nánar` to Vegagerðin Púls as Stebbi requested.
- Privacy: no new route or user data should be stored. Latest pulse preview is read-only public/weather-pulse data already surfaced elsewhere.
- `IcelandRoadmap.md` update is not required unless Claude decides to introduce reusable station crosswalk logic beyond this UI. If a reusable Veðurstofan-to-Vegagerðin station mapping is added, then document it in route/station matching notes.

## Supabase / Auth / Production Risk

- No migration should be required.
- No RLS change should be required.
- Do not weaken pulse access. Use existing preview and pulse routes.
- `Nánar` can navigate to auth-gated pulse page as today; do not add client-side secret logic.
- Avoid logging station/comment payloads.
- Do not fetch all message history for a marker overlay; only latest preview.

## Localhost checks for Stebbi

Stebbi runs localhost/dev server.

1. Open `/vedrid` as public user and as authenticated user if practical.
2. Ensure Vegagerðin "Núna" layer is active.
3. Click a Vegagerðin marker.
4. Expected:
   - a small overlay appears on the map itself
   - no large white detail card appears below the map after final cleanup
   - wind and gust values match the station data
   - latest note shows if one exists
   - `Nánar` opens that Vegagerðin station Púls
5. Click a Veðurstofan marker in forecast mode.
6. Expected:
   - small overlay appears on the map
   - wind is shown from the relevant forecast row
   - gust is absent/empty unless real data exists
   - overlay names or indicates nearest Vegagerðin Púls target
   - `Nánar` opens nearest Vegagerðin Púls, not the old Veðurstofan Púls page
7. Turn on a route filter, then click markers inside the route.
8. Expected:
   - overlay works only for visible route-filtered markers
   - changing route/status filter so selected marker disappears closes the overlay
9. Check mobile width around 390px.
10. Expected:
   - overlay does not cover zoom controls
   - overlay text wraps/truncates cleanly
   - `Nánar` remains tappable
   - no horizontal overflow or keyboard/scroll weirdness

Do not test migrations, Supabase schema changes, production cron, or deploy as part of this handoff; none should be needed for the overlay.

## Open Questions For Claude Code

1. Is there an existing shared DTO/type for station pulse preview items that the overlay can reuse?
2. Should the latest note line show only user text, or also timestamp/user display if already available in preview DTO?
3. For Veðurstofan markers, should the overlay title remain the clicked Veðurstofan station, or should it emphasize the nearest Vegagerðin Púls target? Recommended: title = clicked station, secondary line = nearest Vegagerðin Púls.
4. If Vegagerðin data is unavailable while Veðurstofan mode is active, should `Nánar` be hidden or disabled? Recommended: disabled with short fallback text, no extra API calls.
