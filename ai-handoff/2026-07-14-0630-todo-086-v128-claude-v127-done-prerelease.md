# TODO 086 v128 - Claude v127 done, prerelease

Created: 2026-07-14 07:30 Atlantic/Reykjavik
Agent: Claude Code
Implements: `2026-07-14-0610-todo-086-v127-codex-provider-selection-must-drive-assessment.md`
Also implements: v126 freshness threshold fix

## What changed

### 1. Freshness TTL: 90 min → 4 h (`lib/weather/providers/vedurstofan.server.ts`)

`TTL_MS` changed from `90 * 60 * 1000` to `4 * 60 * 60 * 1000`.

Cadence-aware: Veðurstofan forecasts update every 3 hours; warmer now runs hourly (`vercel.json`). Data fetched within 4 hours shows no stale warning.

### 2. Route projection for Veðurstofan stations

**`app/api/teskeid/weather/travel/route.ts`** — new `projectToPolyline()` function:
- Finds the nearest polyline segment using the same local planar projection as `pointToSegmentM`
- Returns `{ distanceM, distanceFromOriginM, routeFraction }`
- Cumulative arc distance from route origin to the projected station point
- `routeFraction` in [0, 1] — enables ETA estimation for the station

**`lib/weather/providers/vedurstofanBlend.ts`** — type update:
- Added `distanceFromOriginM: number | null` to `VedurstofanTravelLayer['points'][0]`
- Added `routeFraction: number | null` to `VedurstofanTravelLayer['points'][0]`
- Both null when station has no coordinates in curated or registry

Each Veðurstofan layer point now carries full route projection metadata.

### 3. Map shows only active provider markers

**`components/weather/TravelAuditMap.tsx`**:
- New optional prop: `vedurstofanStationPoints?: Array<{ lat, lon, stationId, stationName }>`
- Map initializes when either `weatherPoints` or `vedurstofanStationPoints` is non-empty (was: only when `weatherPoints` was non-empty)
- Veðurstofan station markers: purple circles (`#7c3aed`), scale 8, white border, station name as tooltip
- Station points included in bounds calculation
- Full cleanup in effect return

**`app/auth-mvp/vedrid/FerdalagidClient.tsx`**:
- `activeMetnoPoints = showMetno ? routeWeatherPoints : []`
- `activeVedurstofanStationPoints` = filtered from `vedurstofanLayer.points` (lat/lon non-null)
- TravelAuditMap now receives `weatherPoints={activeMetnoPoints}` (empty when met.no off)
- TravelAuditMap now receives `vedurstofanStationPoints={activeVedurstofanStationPoints}`
- Outer render condition: `activeMetnoPoints.length > 0 || activeVedurstofanStationPoints.length > 0`

**Effect**: When `met.no` is off, MET/Yr route markers disappear from the map — not CSS, not a filter, the data is not passed at all. When Veðurstofan is on, station markers appear as distinct purple circles.

### 4. Worst-point card is provider-aware

When `showMetno=false` and `showVedurstofan=true`:

- `worstVedurstofanStation` = station with highest max wind across all forecast rows
- `worstVedurstofanMaxWind` = that station's max wind speed
- `vedurstofanOnlyStatus` = `WeatherStatus` derived from max wind vs effective thresholds

**Overall route status** (`derivedStatus` in combined card IIFE):
```ts
const derivedStatus = vedurstofanOnlyStatus ?? (activeOutboundCandidate?.status ?? result.stada)
```
The status dot and label now reflect Veðurstofan data when only Veðurstofan is selected.

**"Á leiðinni" section** — new Veðurstofan branch at the top of the IIFE:
- Shows wind status label from Veðurstofan worst station
- Shows `X km frá [origin] um kl. HH:MM` using `distanceFromOriginM` + `routeFraction` + reference departure time
- Shows station name, max wind, `Veðurstofan (í prófun)` badge
- Same disclaimer box as MET/Yr branch

**"Áfangastaður" section**: now `showMetno && activeOutboundCandidate.arrivalWeather` — hidden when met.no is off, since arrival weather is MET/Yr-derived.

### 5. Departure scrubber hidden when met.no is off

```tsx
{outboundDisplayCandidates.length > 1 && showMetno && (
  <DepartureHeatmap ...
```

The MET/Yr departure heatmap (colored departure slots) is not shown when met.no is off. This is correct: the slots are MET/Yr-computed and would mislead users when only Veðurstofan is selected.

**Known limitation**: No Veðurstofan-based departure candidates yet. A Veðurstofan-only assessment run (server-side) is needed to produce departure slot coloring for Veðurstofan-only mode. This is the next step after this PR.

## Tests

```bash
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
# 2 files passed, 26 tests passed

npm run type-check
# exit 0
```

## Files changed

- `lib/weather/providers/vedurstofan.server.ts` — TTL 90 min → 4 h
- `lib/weather/providers/vedurstofanBlend.ts` — type: added `distanceFromOriginM`, `routeFraction`
- `app/api/teskeid/weather/travel/route.ts` — `projectToPolyline()`, use it in layer point building
- `components/weather/TravelAuditMap.tsx` — `vedurstofanStationPoints` prop, overlay markers, guard changes
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — provider-aware active points, map, worst-point card, departure scrubber

## What is still not done (v127 remainder)

1. **Departure scrubber for Veðurstofan**: slots are MET/Yr only. A server-side Veðurstofan assessment path would compute departure candidates from station data. Not done — requires significant server work.
2. **`metnoBlendedLabel` cleanup**: unused key in message files. Low priority.
3. **Map marker legend/labels**: Veðurstofan markers show as purple circles with station name tooltip only — no legend chip to distinguish them from MET/Yr circles when both are shown. Could add a visual legend.
4. **Freshness tests**: v126 recommended adding freshness boundary tests. Not added — they require mocking deep `vedurstofan.server.ts` internals. Deferred.
5. **`distanceToPolylineM` is now redundant** since `projectToPolyline` can replace it. Left for now to avoid changing more than needed.

## Localhost checks for Stebbi

Preconditions: `elta-vedrid` access, `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`, `WEATHER_ELTA_VEDRID_FLAG=true`, product table warmed.

1. Run the same route as in the screenshots.
2. **Default state (met.no on, Veðurstofan off)**:
   - Map shows 72 MET/Yr route points. Assessment unchanged.
3. **met.no on + Veðurstofan on**:
   - Map shows MET/Yr route points AND purple Veðurstofan station circles.
   - Assessment (departure slots, status, worst point) still from MET/Yr baseline.
   - "Allir spápunktarnir" shows both sections.
4. **met.no off + Veðurstofan on**:
   - Map shows only purple Veðurstofan station circles (no MET/Yr route dots).
   - Overall status dot/label reflects worst Veðurstofan station wind vs thresholds.
   - "Á leiðinni" shows worst station (e.g. Sandskeið), distance from origin, ETA, max wind, Veðurstofan badge.
   - No "Punktur 26/72", no "Yr", no "Hrá met.no gögn".
   - Departure scrubber hidden (MET/Yr candidates not relevant).
   - "Áfangastaður" section hidden (MET/Yr arrival weather not relevant).
   - "Allir spápunktarnir" shows only Veðurstofan station cards.
5. **met.no off + Veðurstofan off**:
   - Map does not render (no active provider points).
   - No departure scrubber.
   - Summary card still shows, but "Á leiðinni" and "Áfangastaður" are hidden.
   - Edge case — provider filter UI still visible so user can re-enable.
6. Check 360, 390, 460 px widths — provider card wrapping, no overflow.
7. Check that station data does not show stale warning immediately after a successful warmer run (TTL now 4h).

Do not run migrations, Supabase changes, production cron, deploy, push, or commit unless Stebbi gives explicit separate approval.
