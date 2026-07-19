# 2026-07-18 08:14 - TODO 086 v462 - Claude v461 done, prerelease

Created: 2026-07-18 08:14
Timezone: Atlantic/Reykjavik

Source handoff reviewed: `2026-07-18-0803-todo-086-v461-codex-v460-review-and-vedrid-vegagerdin-map-next`

## What was implemented

v461 implemented Scopes A, B, C from the Codex handoff: provider-neutral pulse inline,
Vegagerdin station detail with pulse preview, and provider-aware URL state on `/vedrid`.

### Scope A - Provider-neutral WeatherPulseInline

Created `components/weather/WeatherPulseInline.tsx`.

Props: `{ provider: WeatherPulseProvider, stationId: string, returnTo?: string }`

- Resolves preview endpoint per provider:
  - vedurstofan: `/api/teskeid/weather/vedurpuls/stations/${stationId}/preview`
  - vegagerdin: `/api/teskeid/weather/vedurpuls/vegagerdin/stations/${stationId}/preview`
- Resolves full pulse href per provider via `vedurstofanPulseHref` / `vegagerdinPulseHref`
- Uses `useChatPreview` + `ChatPreviewList` + optional "view more" link
- Read-only — no compose, no thread creation

`components/weather/VedurstofanPulseInline.tsx` is now a thin wrapper:

```tsx
export function VedurstofanPulseInline({ stationId, returnTo }: VedurstofanPulseInlineProps) {
  return <WeatherPulseInline provider="vedurstofan" stationId={stationId} returnTo={returnTo} />
}
```

### Scope B - VegagerdinStationDetail with pulse preview

In `components/weather/WeatherOverviewClient.tsx`:

- Added `WeatherPulseInline` import
- Added `returnTo?: string` prop to `VegagerdinStationDetail`
- Added `<WeatherPulseInline provider="vegagerdin" stationId={station.stationId} returnTo={returnTo} />`
  inside the card, after the measurement `<dl>`
- `renderPostMap` passes:
  ```
  returnTo={`${stationPulseReturnBase}?provider=vegagerdin&stationId=${selectedStation.stationId}`}
  ```

### Scope C - Provider-aware URL state in WeatherOverviewShell

`components/weather/WeatherOverviewShell.tsx`:

- Imports `parseOverviewSelection`, `overviewSelectionUrl`, `overviewSelectionKey` from
  `lib/weather/overviewSelectionUrl`
- `urlSelection = parseOverviewSelection(searchParams)` — replaces old `urlMarkerId`
- `urlSelectionKey = overviewSelectionKey(urlSelection)` — composite `provider:stationId` key
  used for `lastRestoredKeyRef` deduplication
- Restore loop: if `provider !== 'vedurstofan'` only searches that provider's layer;
  otherwise searches all layers (legacy fallback for `?stationId=31392` with no provider)
- `syncUrl(s: SelectedProviderMarker | null)` now writes both `provider` and `stationId`
  via `overviewSelectionUrl(window.location.href, selection)`, or clears both when null

URL examples after this change:
- Vegagerdin: `/vedrid?provider=vegagerdin&stationId=V1234`
- Vedurstofan: `/vedrid?provider=vedurstofan&stationId=31392`
- Legacy: `/vedrid?stationId=31392` still restores Vedurstofan (fallback)

### lib/weather/overviewSelectionUrl.ts

Created in this session. Helper module with three exports:

- `parseOverviewSelection({ get })` — parses URLSearchParams duck type, null if no stationId,
  falls back to `'vedurstofan'` if provider missing
- `overviewSelectionUrl(base, selection)` — builds pathname+search with provider+stationId,
  or clears both when null
- `overviewSelectionKey(selection)` — `'provider:stationId'` composite or `''`

Uses `{ get(key: string): string | null }` duck type instead of `ReadonlyURLSearchParams`
(not available in this tsconfig).

### Tests

Created `lib/__tests__/overviewSelectionUrl.test.ts` — 10 tests:
- `parseOverviewSelection`: null when absent, explicit provider, legacy fallback, explicit vedurstofan
- `overviewSelectionUrl`: adds params, full URL base, clears on null, replaces existing,
  preserves unrelated params
- `overviewSelectionKey`: null → `''`, composite key, provider differentiation

## Commands run

```
npm run type-check   → exit 0
npm run test:run -- lib/__tests__/overviewSelectionUrl.test.ts lib/__tests__/pulseTarget.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/weather-conditions-feed-preview-api.test.ts lib/__tests__/middleware.test.ts lib/__tests__/vedurpuls-api.test.ts
→ exit 0, 7 files, 169 tests passed
```

No localhost checks run. No SQL run. No commit or push.

## Changed files (this session only)

New files:
- `components/weather/WeatherPulseInline.tsx`
- `lib/weather/overviewSelectionUrl.ts`
- `lib/__tests__/overviewSelectionUrl.test.ts`

Modified:
- `components/weather/VedurstofanPulseInline.tsx` — now a thin wrapper
- `components/weather/WeatherOverviewClient.tsx` — WeatherPulseInline in VegagerdinStationDetail
- `components/weather/WeatherOverviewShell.tsx` — provider-aware URL state

## SQL status

- SQL 80: required for admin feature key support. Not run in this session.
- SQL 81: required for Vegagerdin write threads. Not run. Vegagerdin preview reads and map
  display work without SQL 81. Compose and new thread creation will fail until SQL 81 is run.

## Localhost checks for Stebbi

Prerequisites:
- `WEATHER_ENABLED=All`
- For public Vegagerdin access: `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED` absent or not `true`
- Vegagerdin current cache must have data (populated by cron or recent warm)

1. Open `/vedrid`.
   - Expected: Vegagerdin dot appears in provider strip.
   - Expected: Vegagerdin pins visible on map if current cache has data.

2. Click a Vegagerdin pin on the map.
   - Expected: detail card opens with station name + "Vegagerdin" badge + "Núverandi mæling" label.
   - Expected: current measurement values visible (wind, gusts, direction, air temp, road temp as available).
   - Expected: Veðurpúls preview panel appears below measurements (or empty state if no messages).
   - Expected: "Sjá fleiri skilaboð eda segja fra adstaedum" link visible.
   - Expected: URL updates to `/vedrid?provider=vegagerdin&stationId=...`

3. Click the CTA link.
   - Expected: navigates to `/auth-mvp/vedrid/puls/vegagerdin/stod/[id]?returnTo=...`
   - Expected: "Til baka" link on that page points back to the correct `/vedrid?provider=...` URL.

4. Reload the page with `/vedrid?provider=vegagerdin&stationId=V1234` in the URL.
   - Expected: Vegagerdin marker is restored and detail card opens automatically.

5. Check legacy URL `/vedrid?stationId=31392`.
   - Expected: still restores Vedurstofan selection (legacy fallback).

6. Click a Vedurstofan pin.
   - Expected: Vedurstofan detail card opens (unchanged from before).
   - Expected: URL writes `/vedrid?provider=vedurstofan&stationId=31392`.
   - Expected: no compose box, no thread creation.

7. Deselect (click map background or close button).
   - Expected: URL clears both `provider` and `stationId`.

8. Mobile at 390 px.
   - Provider strip wraps cleanly.
   - Measurement card and pulse preview do not overflow horizontally.
   - CTA text wraps cleanly.

## Deferred

- Scope D (route-selection provider-neutral overlay): not started. See v461 handoff.
- SQL 81: Stebbi must run before Vegagerdin write/compose works.
- Persistent Vegagerdin station registry so pulse pages do not 404 when cache is unavailable.
- Favorite stations on `/vedrid`.
- Route-cache and Teskeid interest heatmap (v382 track).
- Deferred Vik/Reynisfjall/Myrdalssand and Oxi south-coast sections (v398, v409 tracks).
