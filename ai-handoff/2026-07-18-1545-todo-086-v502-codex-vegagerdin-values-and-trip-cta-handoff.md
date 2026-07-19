# 2026-07-18 15:45 - TODO 086 v502 - Codex handoff: Vegagerdin values on /vedrid and Trip CTA polish

Created: 2026-07-18 15:45
Timezone: Atlantic/Reykjavik

Source context:
- Stebbi localhost screenshots after v500/v501 review.
- Current `Design.md` guidance: mobile-first app UI, stable controls, reusable components, no one-off provider UI unless necessary.
- Current `WORKFLOW.md`: advice/plan only unless Stebbi gives explicit implementation permission. No SQL, commit, push, deploy, Vercel, or production action unless explicitly requested.

## Short Human Summary

On `/vedrid`, Vegagerdin is selectable but when only `Vegagerdin (nuna)` is active, the map disappears and the user does not see the Vegagerdin station measurements. The overview should show Vegagerdin stations with the same threshold/status system as Ferdalagid, and clicking a Vegagerdin station should show useful current values. Also make the bottom `Ferdalagid` CTA a bit more visually inviting without breaking Teskeid's calm app style.

## Stebbi Feedback

Stebbi observed:

- Vegagerdin values are missing from `/vedrid`.
- When only `Vegagerdin (nuna)` appears active, the screenshot shows no map, only the conditions feed and the `Ferdalagid` CTA.
- The `Ferdalagid` button is functionally in the right place, but should use a slightly different, more fun color than the current black/foreground treatment.

## Product Intent

`/vedrid` should be the overview of weather/road-condition stations around Iceland:

- Provider pills control visible layers:
  - `Vegagerdin (nuna)` = current road-weather measurements.
  - `Vedurstofan (spa)` = forecast station data.
- The map should remain visible when either provider has station data.
- Vegagerdin station markers should be colored by the same wind-threshold display status as the route map, not by freshness.
- A selected Vegagerdin station should show current measurement values clearly:
  - measured time
  - mean wind
  - gust last 10 min
  - wind direction if available
  - air temperature
  - road temperature
  - optional data freshness as metadata, not the primary status
  - Vegagerdin pulse link/inline component

## Current Code Pointers

Likely relevant files:

- `components/weather/WeatherOverviewClient.tsx`
  - Fetches `/api/teskeid/weather/vedurstofan/stations`.
  - Fetches `/api/teskeid/weather/vegagerdin/current`.
  - Builds `vedurstofanLayer` and `vegagerdinLayer`.
  - Builds `overviewStatusCounts`.
  - Renders `WeatherThresholdBar`, `ConditionsFeedPreview`, `WindStatusFilterPills`, and selected station detail cards.
  - `VegagerdinStationDetail` already has current-measurement rows, but user is not reaching/seeing them in the Vegagerdin-only case.
- `components/weather/WeatherOverviewShell.tsx`
  - Owns provider pills, map rendering, selected marker state, URL sync, and bottom `Ferdalagid` CTA.
  - `hasMapData = mapLayers.length > 0` means if `vegagerdinLayer` is null and Veðurstofan is toggled off, no map renders.
- `components/weather/IcelandOverviewMap.tsx`
  - Provider-neutral multi-layer map.
  - Accepts display-ready marker colors/status labels.
- `components/weather/ProviderStationPreviewCard.tsx`
  - Reusable provider-neutral station detail card.
- `lib/weather/providers/vegagerdinCurrent.server.ts`
  - Cache-only read for overview endpoint.
- `app/api/teskeid/weather/vegagerdin/current/route.ts`
  - Public/current endpoint maps cache payload into client DTO.
- `messages/is.json` and `messages/en.json`
  - All user-facing copy must live here.

## Investigation Requirements

Before changing UI, Claude Code should determine why Vegagerdin-only mode has no map:

1. Check whether `/api/teskeid/weather/vegagerdin/current` returns:
   - `status: "ok"` with `stations.length > 0`, or
   - `status: "unavailable"` / `stations: []`.
2. Check whether `vegagerdinData.status === "ok"` but all stations are filtered out by `visibleStatuses`.
3. Check whether the provider pill can be active even when `mapLayer` is null, creating a visually active but empty state.
4. Check whether stale measurement data is accidentally making Vegagerdin unavailable. It should not. Stale measurements may affect metadata, but the provider pill and layer should remain usable when cached station coordinates/values exist.

Important: Do not add live upstream fetches from the browser. `/vedrid` should read cached Vegagerdin current measurements via our API.

## Implementation Plan

### 1. Make Vegagerdin-only map state robust

If Vegagerdin has cached stations, the map must render when only Vegagerdin is active.

Likely fixes:

- Ensure `vegagerdinLayer` is non-null whenever `vegagerdinData.status === "ok"` and `stations.length > 0`, regardless of `measurementFreshness`.
- Do not set `unavailableReason` from stale/aging/unknown measurement freshness.
- If `vegagerdinData.status === "unavailable"` or stations are empty:
  - keep the provider pill interactive if that is the current product decision,
  - but show a calm empty state near the map area, not a blank content jump.
  - Suggested copy:
    - IS: `Engin Vegagerdargogn eru i skyndiminni enntha. Reyndu aftur eftir augnablik.`
    - EN: `No Road Administration data is cached yet. Try again shortly.`
  - Put final copy in `messages/is.json` and `messages/en.json`.

### 2. Show Vegagerdin measurement values from the selected station

Use the existing reusable `ProviderStationPreviewCard` and `VegagerdinStationDetail`, but make sure it is reachable and visually useful.

Acceptance:

- Clicking a Vegagerdin marker opens a detail card.
- Detail card shows the station name, provider badge, status badge, and current values.
- Labels must clearly say these are current measurements, not forecast.
- Do not hide values because global measurement freshness is stale.
- Null values should be omitted or shown as a calm missing-value row, but never coerced to `0`.
- Keep freshness as muted metadata. It should not dominate the card.

If the current `VegagerdinStationDetail` already does this, focus on why it is not visible in Stebbi's Vegagerdin-only path.

### 3. Consider marker title/hover values, but do not overdo map labels yet

Nice-to-have if cheap:

- Vegagerdin marker title can include compact current values, e.g. `Blikdalsa (vindur 2,2 m/s, hvida 3,3 m/s)`.

Do not add always-visible text labels to all markers in this pass unless Stebbi explicitly asks. That risks cluttering the Iceland overview map. Selected station detail is the primary place for values.

### 4. Make `Ferdalagid` CTA more inviting, still Teskeid-like

The bottom CTA should remain centered and clear, but not plain black.

Design constraints from `Design.md`:

- Use Teskeid semantic tokens or established palette.
- Avoid loud gradients/orbs/marketing treatment.
- Stable size, no layout shift.
- Mobile touch target at least ~40px high.
- Button text stays in messages.

Suggested style direction:

- Keep rounded button.
- Use a warm accent background or a two-tone treatment that still passes contrast.
- Example direction: dark green base with subtle warm border/accent icon, or warm amber background with dark green text if contrast is good.
- Add hover/active state without changing dimensions.

Do not invent a one-off button component if existing button/CTA styling can be reused or a tiny `variant` can be centralized.

### 5. Preserve reusable architecture

This should reinforce, not weaken, the provider-neutral shell:

- Keep `WeatherOverviewShell` provider-neutral.
- Keep provider-specific data mapping in `WeatherOverviewClient`.
- Keep station detail cards using `ProviderStationPreviewCard`.
- Keep status colors through `WindDisplayStatus`, `WIND_STATUS_MARKER_COLOR`, `WIND_STATUS_META`, and `WindStatusFilterPills`.
- If multiple provider-specific detail cards start diverging, consider a small shared `MeasurementRows` / `StationMetricList` helper instead of copy-pasting `<dl>` patterns.

## What Not To Do

- Do not run SQL82.
- Do not run SQL80/81/82 migrations.
- Do not commit, push, deploy, or change Vercel/env.
- Do not call live Vegagerdin upstream from the browser.
- Do not reintroduce freshness-based marker colors.
- Do not add a separate Vegagerdin-only map implementation.
- Do not hide the map just because one active provider is empty if another active provider has data.

## Suggested Tests

Run targeted checks after implementation:

```bash
npm run type-check
```

```bash
npm run test:run -- lib/__tests__/windObservationStatus.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts lib/__tests__/weather-conditions-feed-preview-api.test.ts lib/__tests__/overviewSelectionUrl.test.ts
```

If the implementation touches `WeatherOverviewShell` selection behavior, also run:

```bash
npm run test:run -- lib/__tests__/overviewSelectionUrl.test.ts lib/__tests__/pulseBack.test.ts lib/__tests__/useFeedLoader.test.ts
```

## Localhost Checks For Stebbi

1. Open `http://localhost:3004/vedrid`.
2. With both provider pills on, confirm the map renders and status filter pills are visible.
3. Toggle off `Vedurstofan (spa)` so only `Vegagerdin (nuna)` is active.
4. Expected:
   - the map still renders if cached Vegagerdin stations exist,
   - Vegagerdin markers are visible,
   - status filter pills still count/filter Vegagerdin statuses,
   - stale/old measurement data does not disable the Vegagerdin pill.
5. Click a Vegagerdin marker.
6. Expected detail card:
   - station name,
   - Vegagerdin badge,
   - wind-status badge,
   - measured time,
   - wind, gust, wind direction if present,
   - air temp and road temp if present,
   - pulse entry/link.
7. Toggle status pills and confirm selected detail closes/hides only when its status is filtered out.
8. Confirm the bottom `Ferdalagid` button looks a little more inviting but still fits the Teskeid style and does not wrap awkwardly on mobile.
9. Test at mobile widths around 390px and 546px, because Stebbi's screenshots are in that range.

## Open Questions For Codex / Stebbi

- Does Stebbi want values only in selected station detail, or also compactly in marker hover title? My recommendation: detail card now, hover title optional.
- If Vegagerdin cache is empty, should the map show Veðurstofan automatically even when its pill is off? My recommendation: no. Respect user toggle, but show a calm empty state for the active empty provider.
- Should the CTA color become a shared Teskeid button variant? My recommendation: if this style is likely to be reused, centralize it; if not, keep the change scoped but token-based.

## Done Definition

- Vegagerdin-only provider mode no longer collapses into an empty page when cached station data exists.
- Vegagerdin station detail exposes current measurement values.
- Stale Vegagerdin measurements remain visible and interactive.
- Marker colors/counts still use the unified wind-status model.
- `Ferdalagid` CTA is visually improved without becoming loud or off-brand.
- Type-check and targeted tests pass.
- No SQL, commit, push, deploy, or env changes performed.
