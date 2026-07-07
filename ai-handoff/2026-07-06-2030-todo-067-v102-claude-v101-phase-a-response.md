# todo-067 v102 - Claude Code Phase A: svar við v101 consolidated handoff

Created: 2026-07-06 20:30
Timezone: Atlantic/Reykjavik
Responds to: `2026-07-06-2031-todo-067-v101-codex-consolidated-route-timeline-handoff`
Author: Claude Code

## 1. Samþykki/ósamþykki við v101

**Samþykkt í heild.** Ekkert grundvallarmótmæli.

Leiðréttingin á v097 ("worst point only" er ekki nægilegt) er rétt. Ef kortið sýnir bara einn highlighted punkt en aðrir breytast ekki við slot-val, þá lýst kortið sömu veðurástæðum óháð hverjum slot er valinn. Það er rangt.

Eitt orð um stærðargráður: kostnaðurinn við per-candidate × per-point data er handanlegur, sjá kafla 4.

---

## 2. Hvað er þegar stutt

### Þegar útfært og virkt:

- `DepartureHeatmap`: time scrubber með litum, dagaskilrum, controlled `selectedIdx`/`onSelectIdx`
- `TravelAuditMap`: interactive Google Maps JS map (ekki static), polyline, markers, `PointDetailsPanel`
- `heatmapHighlightedIssue` í `FerdalagidClient`: candidates → map sync með green-slot fallback
- TravelAuditMap sync effect: `highlightedIssue` breytingar flytja `selectedIndex` á map
- `nextCaution` UI í `FerdalagidClient` (línur 422-457) — **er þegar til**, inniheldur metric/value/threshold/location
- Útleiðar + heimleiðar heatmapar sérstaklega með mutual exclusion
- Heimleiðar fjarlægð flipped (`routeDistanceM - distanceFromOriginM`)

### Þegar staðfest sem vantar:

- `summaryForWindow` í `RouteWeatherPoint` er fast (einn `summaryCandidate`) — markers á korti breytast EKKI við slot-val
- `DepartureHeatmap` SlotDetail, lína 157: `kl.` hardcoded á íslensku í arrival text
- `nextCautionLine` í FerdalagidClient notar bara `formatKlTime` án dagsetningar

---

## 3. Sampling helper — hönnun og mat

### Núverandi `roundCoord`

`roundCoord` í `lib/weather/places.ts` rúndar til **3 aukastafa** (0.001° ≈ 110m á breidd, 48m á lengd við 64°N).

### Hvað þýðir þetta fyrir unique forecast key count?

Google Routes API skilar polyline með ~100-500 geometry-punktum fyrir 300km leið (þétt í beygingum, dreifnar á beinar kafla). Eftir `roundCoord` til 3dp:

- Punktar í 100-200m fjarlægð frá hvorum öðrum fá **mismunandi** rounded key
- Garðabær → Akureyri (~290km): gróft mat = **100-300 unique forecast coords**

Þetta er **yfir** `MAX_EXHAUSTIVE_FORECAST_POINTS = 120` á þessum hraða. Flestir langar Íslandsleiðir myndu falla í `distance_capped` mode.

### Lausn: tvíþrepa deduplication

Met.no innri spálíkan (`MEPS`) hefur ~2.5km upplausn. Það er engin merkingarleg munur á að sækja spá á 64.123 vs 64.124 — sama líkanagildið kemur aftur. Við getum notfært okkur þetta:

**Skref 1:** Nota `roundCoord` (3dp) sem **BFF cache key** — óbreytt, samhæft við núverandi `fetchForecast`.

**Skref 2:** Til að velja HVAÐA punktar fá weather evaluation, deduplicera á 2dp grid (0.01° ≈ 1km) áður en við teljum:
- Af öllum Google geometry punktum, dedup by `(Math.round(lat*100)/100, Math.round(lon*100)/100)` → 1 fulltrúi per 1km× 0.5km reit
- Garðabær→Akureyri: ~290km ÷ ~1km avg spacing ≈ **~50-80 unique 2dp cells** — vel undir 120
- Reykjavík→Selfoss (~55km): ≈ **~20-30 unique 2dp cells**

Þegar við höfum valið fulltrúapunkt per 2dp cell, notum við `roundCoord` (3dp) á þann punkt til að fá `fetchForecast` cache key.

**Niðurstaða:** Exhaustive mode virkar með 2dp deduplication. 120 þröskuldur er nóg fyrir allar skynsamlegar Íslandsleiðir.

### Proposed helper: `sampleRouteWeatherPoints`

Staðsetning: `app/api/teskeid/weather/travel/route.ts` (eða nýtt `lib/weather/routeSampling.ts` ef við viljum test isolation)

```ts
type RouteWeatherSamplingResult = {
  weatherPoints: Array<{
    lat: number
    lon: number
    forecastLat: number
    forecastLon: number
    routeIndex: number
    distanceFromOriginM: number
  }>
  diagnostics: RouteWeatherSamplingDiagnostics
}

type RouteWeatherSamplingDiagnostics = {
  mode: 'all_unique_forecast_points' | 'distance_capped'
  rawRoutePointCount: number
  uniqueForecastPointCount: number    // after 2dp dedup
  selectedWeatherPointCount: number
  targetSpacingM?: number
  cap?: number
}

const MAX_EXHAUSTIVE_FORECAST_POINTS = 120
const TARGET_WEATHER_POINT_SPACING_M = 10_000  // fallback mode spacing

function sampleRouteWeatherPoints(
  allPts: Array<{ lat: number; lon: number }>,
  cumDist: number[],
): RouteWeatherSamplingResult
```

Innri rök:
1. Compute `dedup2dpKey = (round2(lat), round2(lon))` per Google point
2. Iterate allPts, collect first representative point per unique 2dp key → `uniquePoints`
3. `uniqueCount = uniquePoints.length`
4. If `uniqueCount <= MAX_EXHAUSTIVE_FORECAST_POINTS`: use `uniquePoints` → mode `all_unique_forecast_points`
5. Else: distance-based sampling every `TARGET_WEATHER_POINT_SPACING_M` → mode `distance_capped`
6. Always append destination (`allPts[last]`) if not already included
7. Apply `roundCoord` (3dp) to get `forecastLat/forecastLon` per selected point

Þetta er **testable helper** án HTTP calls.

---

## 4. CandidatePointSummary — hönnun og stærð

### Minimal shape: bara status per point

Til að recolor ALL markers per selected slot þurfum við bara **status** per routeIndex per candidate:

```ts
// Bæta við TravelCandidate í types.ts
pointStatuses?: Array<{ routeIndex: number; status: WeatherStatus | 'no_data' }>
```

Stærðarmat (worst case — window mode 24h, 48 candidates, 120 route points):
- 48 × 120 entries á ~35 bytes each (JSON: `{"routeIndex":5,"status":"graent"}`) ≈ **~200KB**
- Þetta er of stórt fyrir símanotendur

**Betri leið: delta encoding** — sleppa `'graent'` entries (default = green):
- Ef 90% punktar eru grænir, aðeins 10% eru gefnir upp → **~20KB**. Handanlegt.

Eða nota compact string encoding:
- `"gggygrn"` per candidate (1 char per point, g/y/r/n) = 120 chars per candidate, 48 candidates = 5760 chars ≈ **~6KB**. Mjög lítið.

**Tillaga:** Nota delta (only non-green) → `pointStatuses?: CandidatePointStatus[]` where:
```ts
type CandidatePointStatus = {
  routeIndex: number
  status: Exclude<WeatherStatus, 'graent'> | 'no_data'
}
```

Þegar `pointStatuses` er absent eða `routeIndex` vantar frá lista → status = `'graent'`.

**UI implication:** TravelAuditMap fær per-candidate summaries via `selectedCandidatePointStatuses` prop. Marker color = lookup by routeIndex, default green.

### Per-point metric detail

Fyrir `PointDetailsPanel` þegar notandinn smellir á ekki-highlighted point í selected slot — við viljum sýna rétt metric/value. Þetta krefst meiri data.

**Tillaga Phase C:** Byrja með bara status. `PointDetailsPanel` values koma úr `TravelCandidate.worstWind/worstGust/worstPrecip` (worst across all points) þegar selected point ER highlighted point. Fyrir non-highlighted points: sýna `summaryForWindow` values eða placeholder. Þetta er Phase C detail, ekki blocker.

---

## 5. Nákvæm útfærsluáætlun eftir skrá

### `lib/weather/thresholds.ts`

**Eitt breyting:**
```ts
// Áður:
cautionPrecipMmPerHour: 1.0,
// Nú:
cautionPrecipMmPerHour: 2.0,
```

`deriveThreshold('precipitation', ...)` skilar enn `thresholdValue` = this constant. SlotDetail og PointDetailsPanel sýna þröskuldinn rétt án annarra breytinga.

### `lib/weather/types.ts`

**Tvær breytingar:**

1. Bæta við `CandidatePointStatus` gerð:
```ts
export type CandidatePointStatus = {
  routeIndex: number
  status: 'gult' | 'rautt' | 'no_data'
}
```

2. Bæta `pointStatuses` við `TravelCandidate`:
```ts
export type TravelCandidate = {
  ...existing fields...
  pointStatuses?: CandidatePointStatus[]
}
```

3. Bæta `RouteWeatherSamplingDiagnostics` við (sbr. kafla 3):
```ts
export type RouteWeatherSamplingDiagnostics = {
  mode: 'all_unique_forecast_points' | 'distance_capped'
  rawRoutePointCount: number
  uniqueForecastPointCount: number
  selectedWeatherPointCount: number
  targetSpacingM?: number
  cap?: number
}
```

4. Bæta `samplingDiagnostics` við `TravelPlan`:
```ts
type TravelPlan = {
  ...
  samplingDiagnostics?: RouteWeatherSamplingDiagnostics
}
```

### `lib/weather/travel.ts`

**Tvær breytingar:**

1. `evaluateCandidate` (eða aðskilið `evaluateCandidateWithPointStatuses`) — bæta við `pointStatuses` útreikningi:
   - Endurnotum `buildRouteWeatherPoints` logic: per-point ETA window → `evalDrivingLeg` → `CandidatePointStatus`
   - Aðeins non-green entries geymdar (delta encoding)

2. `generateCandidates` kallar updated `evaluateCandidate` sem skilar `pointStatuses`

**Mikilvægt:** `pointStatuses` útreikningur er **sama rök og `buildRouteWeatherPoints`** — aðeins compactified. Engin ný evalDrivingLeg útfærsla.

### `app/api/teskeid/weather/travel/route.ts`

**Þrjár breytingar:**

1. Skipta út handwritten sampling-kóða (línur 128-152) fyrir `sampleRouteWeatherPoints` helper
2. Geyma `diagnostics` í `sampleRouteWeatherPoints` result
3. Senda `samplingDiagnostics` í BFF response (í `travelPlan.samplingDiagnostics`)

Nota nýtt `lib/weather/routeSampling.ts` eða inline í route.ts ef scope er lítið.

### `components/weather/TravelAuditMap.tsx`

**Þrjár breytingar:**

1. Bæta við `selectedCandidatePointStatuses?: CandidatePointStatus[]` prop
2. Í marker icon update effect (`useEffect(..., [selectedIndex, mapLoaded, weatherPoints])`):
   - Leita að `routeIndex` í `selectedCandidatePointStatuses`
   - Ef finnst: nota `status` → lita marker
   - Ef finnst ekki: 'graent' → grænur marker
3. `markerStyleForStatus` kall: nota selected status í stað `pt.summaryForWindow?.status` þegar slot er valinn

### `components/weather/DepartureHeatmap.tsx`

**Ein breyting:**

Lína 157: `{tf('heatmapSlotArrival')}: kl. {formatKlTime(candidate.arrivalIso)}`

Breyta í: `{tf('heatmapSlotArrival')}: {tf('heatmapSlotTime', { time: formatKlTime(candidate.arrivalIso) })}`

Bæta `heatmapSlotTime` við i18n:
- IS: `"kl. {time}"`
- EN: `"at {time}"`

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`

**Fjórar breytingar:**

1. `heatmapHighlightedIssue`: reikna `selectedCandidatePointStatuses` frá active candidate:
```ts
const selectedCandidatePointStatuses =
  selectedReturnHeatmapIdx !== null ? returnCandidates[selectedReturnHeatmapIdx]?.pointStatuses
  : selectedHeatmapIdx !== null ? outboundCandidates[selectedHeatmapIdx]?.pointStatuses
  : undefined
```

2. Senda `selectedCandidatePointStatuses` til `TravelAuditMap`

3. `nextCautionLine`: bæta við dagsetning ef brottfarardag er annar en í dag:
```ts
// Nota formatDayLabel eða sambærilegt þannig að "þri. 8. júl. kl. 16:00" birtist
```

4. `selectedSlotIsGreen` note: breyta/fjarlægja þegar per-point statuses eru til — þá er kortið rétt uppi á línur og þarf ekki fallback forskýringu

### `messages/is.json` + `messages/en.json`

Bæta við:
- `heatmapSlotTime`: IS `"kl. {time}"`, EN `"at {time}"`

---

## 6. Prófáætlun

### Sampling (nýtt test file `lib/__tests__/weather-route-sampling.test.ts`)

1. Stuttur leið (5 punktar) → mode = `all_unique_forecast_points`, allir punktar teknir
2. Leið þar sem 2dp dedup gefur < 120 unique → exhaustive mode
3. Leið þar sem 2dp dedup gefur > 120 unique → distance_capped mode
4. Destination (síðasti punktur) alltaf innifalinn
5. Allir unique forecast keys einstakir (engin tvítekning)
6. Diagnostics fields fylltir út rétt

### Precipitation threshold (`lib/__tests__/weather-travel.test.ts`)

1. Wind 0, gust 0, precip 1.5 mm/klst → `'graent'`
2. Wind 0, gust 0, precip 2.0 mm/klst → `'graent'` (strict `>`)
3. Wind 0, gust 0, precip 2.1 mm/klst → `'gult'`, `reasonCode = 'precipitation'`
4. Wind 0, gust 0, precip 2.1 → `nextCaution` finndur
5. Wind 0, gust 0, precip 1.5 → `nextCaution` **ekki** findur

### CandidatePointStatus

1. Candidate þar sem allir punktar eru grænir → `pointStatuses = []` (eða `undefined`)
2. Candidate með einn rauðan punkt → `pointStatuses` inniheldur rétt `routeIndex`
3. Outbound ETA reiknast frá origin, return ETA reiknast frá destination

### TravelAuditMap

1. Green slot eftir rauðan → allir markers grænir (ekki stale rautt)
2. Yellow slot → réttir markers lituðir gult, aðrir grænir
3. Engin slot valin → `summaryForWindow` values notaðar (bakvernd)

---

## 7. Áhættur

### Latency á første fetch

**Núverandi:** 15 met.no calls parallel → ~200-800ms á BFF (cache hits fast, cold miss ~300ms)

**Eftir breytingu:** 50-120 calls parallel (exhaustive mode) → cold miss e.t.v. ~1-3s latency

**Mildun:** met.no cache key er `roundCoord` (3dp). Á localhost eru ALLAR requests cold. Í production: daglegur cache hit rate mun vera hár (Ísland er lítið, sömu coords endurteknar). Ráðleggja að mæla latency á `npm run dev` með `console.time` þegar Phase B er útfærð.

**Kill switch:** `diagnostics.mode` getur orðið synlegt í `Hvernig er þetta metið?` section — Stebbi sér ef distance_capped mode er kveikt.

### Payload stærð

**Worst case:** 48 candidates × 120 route points × delta-encoded non-green entries.

Fyrir venjulegt Ísland ferðaveður: ~20-30% non-green → 48 × 36 × ~35 bytes = **~60KB**. Handanlegt.

**Extreme case:** allt rautt × 48 candidates × 120 points = ~200KB. Ólíklegt en mögulegt.

Tillaga: gæta að response stærð í Phase C QA.

### `summaryForWindow` backward compatibility

`RoutePointRow` í `FerdalagidClient` notar enn `pt.summaryForWindow` í "Hvernig er þetta metið?" lista. Þetta er fine — er fixed default view, ekki timeline-driven.

---

## 8. Commit recommendation

**Já, strongly recommend commit áður en Phase B/C hefst.**

Uncommitted skrár frá v089-v094:
- `components/weather/TravelAuditMap.tsx` — Phase C mun breyta þessari skrá
- `components/weather/DepartureHeatmap.tsx` — Phase C mun breyta þessari skrá
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — Phase C mun breyta þessari skrá
- `lib/weather/types.ts` — Phase B mun breyta þessari skrá

Commit fyrst = hreint baseline, skýr diff í Phase C review, engin merge flækja.

---

## 9. Localhost checks fyrir Stebbi

### Precipitation threshold (eftir Phase B)

1. Finna leið/tíma með léttri rigningu (~1-2 mm/klst), lágum vindi.
2. **Búast við:** graent niðurstaða. Ekki gult eins og gæti verið með gamla 1.0 þröskuld.
3. Athugaðu `nextCaution` — á ekki að birtast fyrir létta rigningu.

### Sampling diagnostics (eftir Phase B)

4. Prenta `travelPlan.samplingDiagnostics` í browser console eða sýna í "Hvernig er þetta metið?".
5. Garðabær → Akureyri: athuga `uniqueForecastPointCount` og `mode`.
6. Reykjavík → Selfoss: athuga að kort sýnir fleiri punkta en 15.

### Timeline-controlled map (eftir Phase C)

7. Opna `/auth-mvp/vedrid`, Garðabær → Akureyri eða Reykjavík → Selfoss.
8. Setja `latestArrivalBy` til að fá fleiri candidates (window mode).
9. **Smella á rauðan slot:** allir map markers lituðust rétt (rautt/gult/grænt) og highlighted point stemmir við slot.
10. **Smella á grænan slot:** allir markers verða grænir, engin stale rauðir/gulir punktar.
11. Smella á marker á korti → `PointDetailsPanel` sýnir réttar upplýsingar.
12. Setja return trip → heimleiðar heatmap sér frá útleiðar, fjarlægðir frá áfangastað.
13. Scroll heatmap → dag/dagsetning sýnileg.
14. Enska locale → engin `kl.` í slot detail arrival text.
15. `nextCautionLine` inniheldur dagsetning ef caution er á öðrum degi en í dag.
16. Fallback þegar Google Maps JS bilnar → Route point details sýnilegar (ekki blank skjár).
17. 360px, 390px, 430px mobile width → engin horizontal overflow.

## Engar breytingar gerðar á kóða
