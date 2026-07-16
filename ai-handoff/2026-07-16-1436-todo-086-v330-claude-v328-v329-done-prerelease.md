# 2026-07-16 15:13 - TODO-086 v330 - Claude: v328 + v329 done, prerelease

Created: 2026-07-16 15:13
Timezone: Atlantic/Reykjavik

Implements: v328 (loading state, pending CTA, forecast context) + v329 (Hólmavík curated route, route-scoped Safnpúls)
v328 loading state patterns applied to v329 components per Stebbi's instruction.

## What Changed

### v328-A: `ScopedChatPanel` loading state

`components/chat/ScopedChatPanel.tsx`:
- Added `loading?: string` to `ScopedChatPanelLabels`.
- While `!initialLoadDone`, renders `<p>{labels.loading}</p>` instead of null (when label is set).
- Existing callers without a `loading` label are unaffected (render nothing during load, same as before).

### v328-B: Pending state on "Sjá fleiri skilaboð" link

`components/weather/VedurstofanPulseInline.tsx`:
- Added `const [pendingFull, setPendingFull] = useState(false)`.
- `onClick` sets `pendingFull = true`, label changes to `pulseViewMorePending`, link is dimmed and non-interactive.
- New message key `pulseViewMorePending`: "Sæki púls..." / "Opening pulse..."

### v328-C: Forecast context in full pulse page

**New file `components/weather/VedurstofanForecastRows.tsx`**:
- Exports `ForecastRowLine` component (extracted from `VedurstofanPointCard`).
- Exports `ForecastRowData` type.
- Exports `selectUpcomingRows(rows, limit=3)` helper: picks next N future rows, falls back to first N if none upcoming.

**`components/weather/VedurstofanPointCard.tsx`**:
- Removed local `ForecastRowLine` function.
- Imports `ForecastRowLine` from `VedurstofanForecastRows`.

**`app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx`**:
- Calls `readVedurstofanCacheForStations([stationId])` server-side.
- Passes `forecastRows` and `atimeIso` to `VedurstofanPulsClient`. Fail-open on cache error.

**`app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`**:
- Accepts `forecastRows: ForecastRowData[]` and `atimeIso: string | null`.
- Shows forecast context card above the chat panel:
  - `atimeIso` line: "Spá gefin út kl. HH:mm"
  - 3 upcoming forecast rows (using `selectUpcomingRows`)
  - "Sjá öll spágildi" button toggles to show all rows
  - "Engin virk spágildi." fallback if rows empty but atimeIso present
- Passes `loading: t('pulseLoading')` to `ScopedChatPanel` labels (shows "Sæki..." while messages load).
- New message keys: `pulseForecastFrom`, `pulseNoForecast`, `pulseForecastShowAll`.

### v329-A: "Gegnum Hólmavík" curated route

**`lib/weather/google.server.ts`**:
- Added `WESTFJORDS_NORTH_BOUNDS: { minLat: 65.80, maxLat: 66.50, minLon: -25.0, maxLon: -22.00 }` — covers Ísafjörður, Bolungarvík, Súðavík, Flateyri, Þingeyri.
- Added `HOLMAVIK_VIA = { lat: 65.703, lon: -21.685 }` — Route 61 through Hólmavík (verify visually).
- Added curated route rule `capital-to-westfjords-north-via-holmavik`:
  - origin: capital area
  - destination: `WESTFJORDS_NORTH_BOUNDS`
  - `minFastestRouteDistanceM: 180_000`
  - labels: `['CURATED_VIA_HOLMAVIK']`
- Added `shouldSkipCuratedHolmavik` duplicate filter (same pattern as Hellisheiði): suppresses if base route already passes within 8km of Hólmavík and is not meaningfully slower.
- Registered filter in `getCuratedRouteOptions`.

**`components/weather/RouteSelectionStep.tsx`**:
- Added `CURATED_VIA_HOLMAVIK` → `routeOptionViaHolmavik` label between Hellisheiði and Þrengslavegur checks.

**Messages**:
- `routeOptionViaHolmavik`: "Gegnum Hólmavík" / "Via Hólmavík"

### v329-B: Route-scoped Safnpúls

**`lib/chat/repository.server.ts`**:
- Added `getPreviewMessagesForStations(stationIds, limitPerStation)` — fetches all threads for given station IDs in one query, then gets latest N messages per thread in parallel. Returns `Map<stationId, MessageDto[]>`.
- Added private `getThreadPreviewMessages(threadId, limit)` helper.

**New file `app/api/teskeid/weather/vedurpuls/route-preview/route.ts`**:
- `POST /api/teskeid/weather/vedurpuls/route-preview`
- Body: `{ stationIds: string[], limitPerStation?: number }`
- Validates all IDs against `VEDURSTOFAN_STATIONS_REGISTRY`. Returns 400 for unknown IDs.
- Max 40 station IDs, max 3 messages per station.
- Public endpoint (no auth required — same as single-station preview).
- Returns `{ stations: [{ stationId, messages }] }`.

**New file `components/weather/VedurstofanRoutePulseSummary.tsx`**:
- Client component, fetches from route-preview endpoint on mount.
- Props: `stations[]` (stationId, stationName, routeFraction?, distanceFromOriginM?) + `returnTo?`.
- Sorts stations in route order (by `routeFraction` then `distanceFromOriginM`), deduplicates.
- Hidden entirely when no messages on any station.
- Per-station: station name, `ChatPreviewList`, `pulseViewMore` link to full pulse.
- Uses v328 loading pattern: `loaded` state, renders null until fetch completes.

**`app/auth-mvp/vedrid/FerdalagidClient.tsx`**:
- Imports `VedurstofanRoutePulseSummary`.
- Renders it after the journey summary section when `showVedurstofan && vedurstofanLayer?.points.length > 0`.
- Passes `vedurstofanLayer.points` mapped to `{ stationId, stationName, routeFraction, distanceFromOriginM }`.
- Passes `vedurstofanReturnTo`.

**Messages**:
- `safnpulsRouteTitle`: "Nýjast frá stöðvum á leiðinni" / "Latest from stations on your route"

## Results

```
npx tsc --noEmit        — clean
npx vitest run ...      — 168/168 pass
```

## Files Changed

- `components/weather/VedurstofanForecastRows.tsx` — NEW
- `components/weather/VedurstofanPointCard.tsx` — import ForecastRowLine from new file
- `components/chat/ScopedChatPanel.tsx` — `loading?` label
- `components/weather/VedurstofanPulseInline.tsx` — pending state on view-more link
- `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx` — server-side forecast fetch
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx` — forecast context + loading label
- `lib/weather/google.server.ts` — Hólmavík curated route + duplicate filter
- `components/weather/RouteSelectionStep.tsx` — CURATED_VIA_HOLMAVIK label
- `lib/chat/repository.server.ts` — getPreviewMessagesForStations
- `app/api/teskeid/weather/vedurpuls/route-preview/route.ts` — NEW batch endpoint
- `components/weather/VedurstofanRoutePulseSummary.tsx` — NEW
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — import + route pulse summary
- `messages/is.json` — 6 new keys
- `messages/en.json` — 6 new keys

## Files NOT Changed

- SQL — none required
- Env flags — none
- RLS — none
- Veðurstofu calculation/blending — none
- `WeatherPulseFeed` (elta-vedrid global safnpúls) — untouched

## Localhost Checks for Stebbi

### A. Loading eftir smell á fullan púls

1. Opna `/vedrid`, reikna leið með Veðurstofustöðvum.
2. Smella á `Sjá fleiri skilaboð` á Veðurstofuspjaldi.
3. Vænt:
   - Linkurinn skiptir yfir í `Sæki púls...` og dofnar þegar smellt er.
   - Fullur púlsgluggi opnast með réttri stöð.

### B. Loading í fullum púlsglugga

1. Opna fullan púls (helst með network throttling).
2. Vænt:
   - Meðan skilaboð eru sótt: `Sæki...` texti sést í skilaboðasvæðinu.
   - Þegar skilaboð koma inn hverfur textinn.

### C. Spá í fullum púlsglugga

1. Opna fullan púls fyrir stöð með Veðurstofuspá.
2. Vænt:
   - `Spá gefin út kl. HH:mm` sést.
   - Þrjú næstu/nýjustu spágildi sýnd.
   - `Sjá öll spágildi` víkkar til allra gilda.
   - Ef engin virk spágildi: `Engin virk spágildi.`
   - Engin horizontal overflow á 360px/390px.

### D. Hólmavík route option

1. Opna `/vedrid`, velja `Reykjavík` → `Ísafjörður`.
2. Vænt:
   - Google default leið sýnd.
   - `Gegnum Hólmavík` leið sýnd ef Google gaf ekki sjálft Hólmavíkurleið.
   - Kortið sýnir leið sem fer raunverulega um Hólmavík (VERIFY visually).
   - Engin tvöföldun ef Google base route fer þegar um Hólmavík.
3. Prófa líka: Reykjavík → Bolungarvík, Súðavík.
4. Passa scope: Reykjavík → Akureyri á EKKI að gefa Hólmavík leið.

### E. Route-scoped Safnpúls

1. Opna `/vedrid`, reikna leið þar sem Veðurstofustöðvar eru á leiðinni.
2. Athuga að Safnpúls birtist undir ferðalagsspjaldinu.
3. Vænt:
   - Aðeins stöðvar á valdri leið eru sýndar (ekki random stöðvar).
   - Stöðvar eru í leiðarröð (frá brottfararstað).
   - Mest þrjú nýjustu skilaboð per stöð.
   - CTA per stöð fer í fullan púls með réttu `returnTo`.
   - Ef engin skilaboð á neinni stöð: Safnpúls er algjörlega falinn.

### F. Regression checks

- `/auth-mvp/vedrid/elta-vedrid` global Safnpúls virkar áfram.
- `returnTo` brotnar ekki við opnun fulls púls.
- Public notandi sér preview en ekki compose box.
- Innskráður notandi getur skrifað og farið aftur í ferðalagið.
