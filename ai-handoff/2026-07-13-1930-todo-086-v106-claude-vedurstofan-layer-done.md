# TODO 086 v106 - Claude: Veðurstofan additive travel layer complete

Created: 2026-07-13 19:30
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input: v105 Codex review + Stebbi confirmations

---

## Staða

API/helper grunnur fyrir Veðurstofan travel layer er fullgerður. Ócommitað. Allt type-checks og 2398 prófanir standast.

---

## Hvað var gert

### 1. Blend helper: `lib/weather/providers/vedurstofanBlend.ts`

Nýr hjálparskrá (búin til í fyrri lotu, staðfest hér):

- `blendHoursWithVedurstofan(hours, forecasts)`: max-blending á `windSpeedMs` og `precipitationMmPerHour`
- Nearest ±1.5h window (`MAX_BLEND_OFFSET_MS = 90 * 60 * 1000`)
- Veðurstofan getur aðeins hækkað gildi, aldrei lækkað
- `VedurstofanTravelLayer` type: `{ experimental: true, status, augmentedResult, points }`

### 2. Travel route: `app/api/teskeid/weather/travel/route.ts`

Nýtt guard + dual-result pattern:

**Guard (tvöfalt):**
```ts
const [routeForecastResults, destForecastRaw, layerEnabled] = await Promise.all([
  Promise.allSettled(weatherPoints.map((pt) => fetchForecast(pt.lat, pt.lon))),
  fetchForecast(destCandidate.lat, destCandidate.lon).catch(() => null),
  process.env.VEDURSTOFAN_TRAVEL_LAYER_ENABLED === 'true' && user?.id && user?.email
    ? checkFeatureAccess(user.id, user.email, 'elta-vedrid').catch(() => false)
    : Promise.resolve(false),
])
```

**Conditional product table read:**
```ts
const vedurstofanStationIds = layerEnabled ? getUniqueStationIdsForRoute(weatherPoints) : []
const vedurstofanResults = layerEnabled && vedurstofanStationIds.length > 0
  ? await readVedurstofanProductForStations(vedurstofanStationIds).catch(() => null)
  : null
```

**Dual result:**
- `result` = `checkTravelWeather(...)` á óbreyttum MET/Yr gögnum (baseline)
- Ef `layerEnabled && vedurstofanResults`:
  - `augmentedPointForecasts` = `blendHoursWithVedurstofan` per point
  - `augmentedResult` = `checkTravelWeather(...)` á blandaðum gögnum
  - `layerPoints` = stöðvar sem komu með gögn (ok/stale)
  - `vedurstofanLayer = { experimental: true, status, augmentedResult, points }`
- Return: `vedurstofanLayer ? { ...result, vedurstofanLayer } : result`

**Fjarlægt:**
- Gömul `vedurstofanStation` mutation á `result.travelPlan.routeWeatherPoints` (v101 scope-drift)

### 3. Tests

**`lib/__tests__/weather-vedurstofan-blend.test.ts`** (nýr, 11 prófanir):
- raises wind when higher
- does not lower wind when lower
- raises precip when higher
- does not lower precip when lower
- null fields ignored
- outside ±1.5h window: unchanged
- nearest row within window picked
- non-blended fields preserved
- multiple hours handled independently

**`lib/__tests__/weather-travel-api.test.ts`** (uppfærður):
- `delete process.env.VEDURSTOFAN_TRAVEL_LAYER_ENABLED` bætt í `beforeEach`
- Gömlu enrichment-prófanir (sem prófuðu `vedurstofanStation` á route points) skipt út fyrir layer-prófanir:
  - Layer disabled: no product read, no `vedurstofanLayer`
  - Layer enabled with data: `vedurstofanLayer` present, `points` populated, `augmentedResult` present
  - Baseline unchanged: no `vedurstofanStation` on route points
  - Empty product table: `vedurstofanLayer.status === 'unavailable'`
  - Unavailable station: excluded from points, fail-open
  - Stale data: included in points with `status: 'stale'`
  - No stations mapped: product table not called

---

## Óbreyttir hlutir (backward compat)

- `result` (MET/Yr baseline) er nákvæmlega eins og áður þegar layer er disabled
- Núverandi UI sem les `result` brotnar ekki
- `vedurstofanLayer` er optional — núverandi consumers sjá það ekki nema þeir leiti að því
- Engin ný Google eða met.no köll

---

## Response shape

```ts
// Þegar VEDURSTOFAN_TRAVEL_LAYER_ENABLED=false eða user hefur ekki elta-vedrid:
{ stada, travelPlan, ... }  // exact same as before

// Þegar layer enabled + user has access:
{
  stada, travelPlan, ...,  // baseline unchanged
  vedurstofanLayer: {
    experimental: true,
    status: 'available' | 'unavailable',
    augmentedResult: DeterministicResult,  // re-run with blended data
    points: Array<{
      routePointId: string,
      stationId: string,
      stationName: string,
      distanceM: number,
      confidence: 'good' | 'ok' | 'weak',
      status: 'ok' | 'stale',
      atimeIso: string | null,
      forecastRows: Array<{ ftimeIso, windSpeedMs, precipitationMmPerHour, temperatureC, windDirectionText, weatherText }>
    }>
  }
}
```

---

## Test results

```
type-check: exit 0
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
22 passed
npm run test:run (full suite)
81 test files, 2398 passed, 0 failed
```

---

## Óframkvæmt (næsti fasi)

UI phase -- toggle control + disclaimer -- ekki byrjað. Skv. v105 á það að bíða þangað til API contract er staðfest:

- Toggle row nálægt núverandi weather display controls
- Label: `Veðurstofan (í prófun)`
- Small status text (Icelandic): `Bætir við samanburði, breytir ekki grunnspá MET/Yr nema þú sýnir prófunarlagið.`
- Disclaimer þegar layer er sýnt: `Veðurstofugögn eru í prófun. MET/Yr er áfram grunnspáin. Vegagerðin er ekki komin inn.`
- Toggle á að vera instant/client-side yfir gögnum sem API skilar

---

## Localhost próf fyrir Stebbi

### Þegar `VEDURSTOFAN_TRAVEL_LAYER_ENABLED` er EKKI sett (eða false):

1. Keyra venjulega ferðaveðursleit
2. Staðfesta að UI/result hegðar sér nákvæmlega eins og áður
3. Staðfesta að engin Veðurstofan layer birtist
4. Í network tab: API svar hefur EKKI `vedurstofanLayer` field

### Þegar `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true` í `.env.local` og Stebbi er með `elta-vedrid` access:

1. Keyra sömu leit
2. Í network tab: API svar hefur `vedurstofanLayer` field
3. `vedurstofanLayer.experimental === true`
4. `vedurstofanLayer.augmentedResult` er til staðar
5. `vedurstofanLayer.points` hefur stöðvar ef Hellisheiði eða aðrar stöðvar eru nálægt leiðinni
6. Staðfesta að `stada` (baseline) er óbreyttur
7. Staðfesta að `travelPlan.routeWeatherPoints[n].vedurstofanStation` er UNDEFINED (gamli mutation er fjarlægður)

### Þegar stöðvar eru ekki aðgengilegar:

1. `vedurstofanLayer.status === 'unavailable'`
2. Ferðaveður keyrir áfram eðlilega

---

## Hér eru breyttar skrár (ócommitaðar)

```
M  app/api/teskeid/weather/travel/route.ts      (guard + dual result)
M  lib/__tests__/weather-travel-api.test.ts     (layer tests)
?? lib/weather/providers/vedurstofanBlend.ts    (blend helper + type)
?? lib/__tests__/weather-vedurstofan-blend.test.ts  (blend tests)
```

Skrár frá `daaecb3` commit eru þegar í gangi (cron + middleware).
