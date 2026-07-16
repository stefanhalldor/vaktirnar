# TODO 086 v119 - Claude v118 done, prerelease

Created: 2026-07-13 22:32 Atlantic/Reykjavik
Agent: Claude Code
Implements: `2026-07-13-2222-todo-086-v118-codex-station-points-correction.md`

## Core correction: station-based layer points

The `vedurstofanLayer.points` array is now one entry per unique Veðurstofan station, not one entry per MET/Yr route sample point.

### Old (wrong) model
- Looped over `pointForecasts` (every met.no route sample)
- Each sample called `mapRoutePointToVedurstofanStation` → nearest station
- Same station could appear as many times as route samples mapped to it
- Garðabær - Kauptún (or any dense-route station) would repeat many times
- Distance shown was from met.no sample point, not from actual station to route

### New (correct) model
- Loops over `vedurstofanResults.entries()` — already route-relevant, already deduped by stationId
- One `layerPoint` per unique station
- Distance computed from station coordinates to nearest point on the actual route polyline
- `routePointId` is now `vedurstofan_${stationId}` (was `rwp_${routeIndex}`)

### Corridor / relevance filtering

`getUniqueStationIdsForRoute(weatherPoints)` (unchanged) already filters to stations within 50km of any route sample before fetching from the product table. So `vedurstofanResults` is already route-corridor filtered. No additional corridor filter was added.

The 50km threshold comes from `WEAK_MAX_M = 50_000` in `vedurstofanStations.ts`.

### Station metadata lookup chain

For each stationId in `vedurstofanResults`:
1. `curatedByStationId` (from `VEDURSTOFAN_STATIONS`) → name, lat, lon (most verified)
2. `registryByStationId` (from `VEDURSTOFAN_STATIONS_REGISTRY`) → sourceUrl, and lat/lon fallback
3. Fallback: stationId itself as name, `distanceM: 0` when coordinates unavailable

## Type changes (`vedurstofanBlend.ts`)

`routeIndex` and `confidence` made optional in `VedurstofanTravelLayer['points']`:

```ts
routePointId: string           // now 'vedurstofan_{stationId}' for station-based points
routeIndex?: number            // not set for station-based points
confidence?: 'good' | 'ok' | 'weak' | 'unavailable'  // not set for station-based points
```

These fields were relative to a met.no sample point and are meaningless for the new station-based model.

## New helper in `route.ts`

```ts
function distanceToPolylineM(lat, lon, polyline): number
```

Returns the minimum haversine distance from a point to any vertex of the polyline. Used to compute station-to-route distance for display.

## `VedurstofanPointRow` updates

Station cards now show:
- Station name + `Veðurstofan (í prófun)` badge (was there before)
- `Stöð: {stationId}` — for validation context
- `{N} km frá leið` — distance from station to nearest route polyline vertex
- Stale indicator (moved into the metadata row)
- Wind speed + wind direction (was speed only)
- Precipitation (now using `precipUnit` translation key — `mm/klst` / `mm/hr`)
- Temperature
- Weather text
- `vedur.is` link when `sourceUrl` available

## New translation keys

In `teskeid.vedrid.ferdalagid` (both is.json and en.json):

| Key | is | en |
|---|---|---|
| `stationIdLabel` | Stöð | Station |
| `stationDistanceFromRoute` | frá leið | from route |
| `precipUnit` | mm/klst | mm/hr |

## What was NOT changed

- The augmented/blended calculation (`augmentedPointForecasts`) still uses per-route-point mapping — this is intentional. Blending remains a per-sample operation; the provider point display is now separate.
- `met.no` toggle still controls visibility of MET/Yr route point cards in "Allir spápunktarnir" (filter only, not the assessment calculation).
- No map marker changes in this patch.
- No SQL, migrations, cron, or production changes.

## Open gaps (not in scope for this patch)

- Map markers for Veðurstofan stations: not yet added.
- Worst-point and selected-map-point surfaces: still MET/Yr only; Veðurstofan station cards not yet shown there.
- `mm/klst` unit was also hardcoded in other places — only `VedurstofanPointRow` was fixed.
- All-stale → `available` status not changed (v115 finding 4).

## Tests and type-check

```
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
# 2 files passed, 24 tests passed

npm run type-check
# exit 0
```

No test changes were needed — the API tests only check `points.length`, `points[0].stationId`, `points[0].forecastRows.length`, and `points[0].status`, all of which still hold with the station-based model.

## Files changed

- `lib/weather/providers/vedurstofanBlend.ts` — `routeIndex`, `confidence` made optional; comments updated
- `app/api/teskeid/weather/travel/route.ts` — `VEDURSTOFAN_STATIONS` import, `distanceToPolylineM` helper, station-based `layerPoints` loop
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — `VedurstofanPointRow` shows distance, station ID, wind direction, localized precip unit
- `messages/is.json` — 3 new keys
- `messages/en.json` — 3 new keys

## Localhost checks for Stebbi

Preconditions: `elta-vedrid` access, `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`, `WEATHER_ELTA_VEDRID_FLAG=true`, product table warmed.

1. Run a route (e.g., Garðabær → Þorlákshöfn).
2. Turn `met.no` off, `Veðurstofan` on. Open "Allir spápunktarnir".
3. Confirm the list contains unique station cards — no station should appear twice.
4. Confirm `Garðabær - Kauptún` (or whichever station was repeating) appears at most once.
5. Each card should show:
   - Station name
   - `Stöð: {id}` and `{N} km frá leið`
   - Stale indicator if data is old
   - Wind speed and direction, precip, temperature, weather text
   - `vedur.is` link when available
6. Turn `met.no` back on: both MET/Yr and Veðurstofan sections visible, clearly separate.
7. MET/Yr cards show `met.no` badge; with Veðurstofan on they show `met.no + Veðurstofan`.
8. At 360, 390, 460 px: no overflow, cards readable, station ID and distance wrap cleanly.
9. Without `elta-vedrid` access or flag: existing flow unchanged.
