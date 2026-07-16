# TODO 086 - v061 Claude handoff: Phase 2B1 done, prerelease

Created: 2026-07-13 08:00
Timezone: Atlantic/Reykjavik
Author: Claude
Type: Done / prerelease handoff for Codex review
Input: v060 Codex research response + Stebbi "Framkvæmdu Phase 2B1 og gerðu handoff"

## Hvað var gert

### Phase 2B1: Authoritative 280-station registry

All implemented in one commit: `56ad2d5`

#### 1. Generator script

`scripts/generate-vedurstofan-registry.mjs`

- Fetches `https://www.vedur.is/vedur/stodvar/?t=3` for all station slugs
- Fetches each `?s={slug}` info page (280 requests, 150ms delay between)
- Parses infotable: name, stationId, wmoNumber, abbreviation, forecastAreaName,
  forecastAreaCode, lat/lon (WGS84, lon negated), elevationM, startYear, owner
- Writes `lib/weather/providers/vedurstofanStationsRegistry.ts`
- Run with: `node scripts/generate-vedurstofan-registry.mjs`

#### 2. Generated registry

`lib/weather/providers/vedurstofanStationsRegistry.ts`

- 280 stations, all with coordinates (source-provided from official pages)
- All 280 have stationId, owner, lat, lon
- `mappingStatus: 'source-provided'` for all (not manually verified)
- Exports: `VEDURSTOFAN_STATIONS_REGISTRY`, `VEDURSTOFAN_STATION_REGISTRY_COUNT`,
  `VEDURSTOFAN_STATION_REGISTRY_SOURCE`, `VEDURSTOFAN_STATION_REGISTRY_GENERATED_AT`

#### 3. Station explorer helper updated

`lib/weather/providers/vedurstofanStationExplorer.ts`

- Accepts `VedurstofanStationRegistryEntry[]` instead of `VedurstofanStation[]`
- `StationExplorerStation.coordinatesVerified` → `mappingStatus: string`
- `stationName` mapped from registry `name` field
- Filters to stations with non-null lat/lon/stationId (currently all 280)

#### 4. Server fetch gate expanded

`lib/weather/providers/vedurstofan.server.ts`

- `VERIFIED_STATION_IDS` (29 curated) → `REGISTRY_STATION_IDS` (280 registry)
- Route weather still works: the 29 curated IDs are a subset of the registry

#### 5. API route updated

`app/api/teskeid/weather/vedurstofan/stations/route.ts`

- Uses `VEDURSTOFAN_STATIONS_REGISTRY` (280 stations)
- Timeout raised from 1500ms to 8000ms (280 stations × up to 10 per batch = 28 batches)

#### 6. Tests

`lib/__tests__/weather-vedurstofan-registry.test.ts` (new, 22 tests):
- Total count == 280
- Hellisheiði: stationId 31392, WMO 4836, owner Vegagerðin, lat ~64.0188, lon ~-21.3424, elevation 360
- All longitudes negative
- All latitudes between 63–67.5
- All have slug, sourceUrl, mappingStatus
- All 280 have coordinates and stationId
- Station IDs are unique
- 5 known curated IDs present in registry

`lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts` (updated):
- Now mocks `vedurstofanStationsRegistry` with 2 registry-shaped entries

## Prófaniðurstöður

```
npm run test:run -- lib/__tests__/weather-vedurstofan-registry.test.ts lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/guard.test.ts lib/__tests__/sql-migration.test.ts
```

**4 files, 276 tests, all passed.**

```
npm run type-check
```
Clean.

```
npm run build
```
Passed.

## Hvað er EKKI gert enn

- `type=obs` observation parser og fetcher (Phase 2B3)
- Supabase annotation table fyrir handvirkar athugasemdir (Phase 2B2)
- UI filter fyrir `mappingStatus` (source-provided / needs-verification / etc.)
- Stöðvar án hnita (vantar-hnit-hluti) -- ekki þörf enn, öll 280 hafa hnit
- Batching timeout: 8s gæti verið langt í production; ætti að fylgjast með

## Mikilvægt um timeout

280 stöðvar = allt að 28 HTTP batches (10 per batch) á Veðurstofan þjón.
Timeout 8000ms á hverja batch. Í versta falli: 28 × 8s = 224s --- það er of langt.

Í reynd: Supabase cache mun skila flestar stöðvar án network-calls. Eingöngu
stöðvar sem eru expired eða ekki í cache þurfa live fetch. Þær fara í batches,
og Veðurstofan svarar yfirleitt hratt.

Codex ætti að athuga hvort þörf sé á öflugri batch-parallelism eða shorter
timeout (e.g. 3000ms) + graceful partial results.

## Supabase / SQL

Engar nýjar SQL migrations. sql/73 er enn ókeyrð (bíður Stebbi-leyfis).

## Localhost checks fyrir Stebbi

Prereqs: `.env.local` með `WEATHER_ELTA_VEDRID_FLAG=true`, báðir `vedrid` +
`elta-vedrid` í feature_access (krefst sql/73 í DB).

1. Opna `/auth-mvp/vedrid/elta-vedrid`. Síðan sýnir nú ~280 stöðvar í stað 29.
2. Kanna að summary strip sýni réttan total (nálægt 280, háð cache-stöðu).
3. Kappa kanna kort með 280 pinnum yfir Ísland.
4. Smella á Hellisheiði í lista. Detail card sýnir stationId 31392, owner Vegagerðin.
5. Velja filter "Ekki tiltæk" -- skoða hversu margar stöðvar eru ekki í cache enn.
6. Regression: `/auth-mvp/vedrid` (route weather) virkar áfram.
