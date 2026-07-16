# TODO 086 - Veðurstofan - Phase 0 findings

Created: 2026-07-12 10:06
Timezone: Atlantic/Reykjavik
Author: Claude Code
Type: Phase 0 read-only investigation handoff

Reviewed: `ai-handoff/2026-07-12-1003-todo-086-v003-codex-v002-phase0-review.md`

Engum skrám breytt. Engar external API calls. Les eingöngu.

---

## 1. `weather_cache.response_body` er `jsonb NOT NULL`

Staðfest úr `sql/67_weather_cache.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.weather_cache (
  cache_key     text PRIMARY KEY,
  response_body jsonb NOT NULL,
  ...
);
```

### Hvað þetta þýðir fyrir MET (núverandi)

Í `metno.server.ts` er `body = await res.json()` (JS object) geymt beint í Supabase:

```ts
await saveToCache(key, body, expiresAt, lastModified)
// body er native JS object frá JSON.parse → Supabase serializes → JSONB
```

Lestur: `cached.response_body` kemur til baka sem `unknown` í TypeScript, en Supabase sér til þess að JSONB -> JS object roundtrip virkar vandræðalaust.

### Hvað þetta þýðir fyrir Veðurstofan (XML)

Veðurstofan skilar XML, ekki JSON. `res.json()` virkar ekki. Þrír kostir:

**Kostur A: Parse XML strax, cache sem JSON (mælt)**

```ts
const xmlText = await res.text()
const parsed = parseVedurstofanXml(xmlText)  // → { stations: [...], fetchedAtIso, ... }
await saveToCache(key, parsed, expiresAt, null)
```

- Cleanest: JSONB inniheldur structured data, sama mynstur og MET.
- Tap: raw XML er ekki geymt, ef parser-bug kemur upp er ekki hægt að re-parse cache.
- Þetta er rétta aðferðin fyrir MVP.

**Kostur B: Wrap XML string í JSON object**

```ts
const xmlText = await res.text()
await saveToCache(key, { xmlString: xmlText, parsedAtIso: now }, expiresAt, null)
```

- Geymir raw XML, en lesa þarf `cached.response_body.xmlString` og parse-a aftur við hverja lestur.
- Supabase/JSONB getur geymt stóran string-value án vandræða.
- Hentugur ef við viljum re-parse á ný format án re-fetch.

**Kostur C: Sér `weather_cache_xml` tafla**

- Þarfnast SQL migration.
- Ekki nauðsynlegt í Phase 0 eða Phase 2.
- Kemur ekki til greina fyrr en Kost A/B hefur verið prófað.

**Niðurstaða:** Kostur A í MVP, með þeirri viðbót að parser-version eða `fetchedAtIso` metadata er geymt í structured JSON svo við getum invalidated cache ef XML schema breytist.

---

## 2. Route-level fetch pattern

Núverandi MET mynstur í `route.ts` lína 242-248:

```ts
Promise.allSettled(weatherPoints.map((pt) => fetchForecast(pt.lat, pt.lon)))
```

`weatherPoints` getur verið allt að 120 punktar. Þetta er í lagi fyrir MET af því:
- MET cache key er `{lat3}:{lon3}` — margir route points deila cache key
- Supabase cache hit er cheap
- Hver fetch er coordinated → sama rounded coordinate fær eitt network request

Þetta **virkar ekki** fyrir Veðurstofuna:

- Veðurstofan er station-based, ekki coordinate-based
- Sama stöð gæti þjónað 5-20 route points → ef við notum per-point pattern = 5-20× overuse
- Veðurstofan bannar IP-tölur sem yfirgnæfa þjónustuna

**Réttur pattern fyrir Veðurstofan:**

```
weatherPoints
  → mapRoutePointsToStationIds()     // nearest station per point
  → unique station IDs               // deduplicate
  → fetchEachStationOnce()           // 1 request per unique station
  → attachResultsBackToPoints()      // + confidence metadata
```

Þetta þýðir að Veðurstofu-fetch er ekki `fetchForecast(lat, lon)` clone heldur:

```ts
async function fetchVedurstofanForRoute(
  weatherPoints: SampledWeatherPoint[],
): Promise<VedurstofanRouteResult>
```

Þetta er **route-level** fall, ekki point-level. Það passar ekki í núverandi `Promise.allSettled` mynstur og þarfnast sérstaks call-site í `route.ts`.

---

## 3. Endpoint val

Ég geri ekki external API calls í Phase 0. Hér eru þær upplýsingar sem eru til úr Codex v001 handoff og almennum docs:

### Gamla XML/CSV þjónusta (`xmlweather.vedur.is`)

- Station-based: velur stöð með `ids` parameter
- Skilar XML með `forec` (forecast) og `obs` (observations)
- Þekkt fields: `F` (vindur), `FG` (hviða), `FX` (hámarksvindur), `D` (átt), `T` (hiti), `R` (úrkoma), `TD` (daggarmark), `W` (veðurlag), `N` (skýjahula)
- Rate limit: óljóst, docs segja "not too often", IP ban mögulegt
- Docs: https://www.vedur.is/um-vi/vefurinn/xml/ og PDF

### Nýja REST API (`api.vedur.is`)

- Óstaðfest hvort það sé þroskað og skráð
- Codex nefnir það sem mögulegt alternative
- **Óvissa: high** — við vitum ekki hvort þetta API sé public, stable, eða hvort documentation er tiltæk

### MVP val (forsenda, þarf staðfestingu)

Gamla XML þjónustan er tried-and-true og vel skjölganleg. `api.vedur.is` þarf meira rannsóknarvinnu. MVP ætti að fara í XML fyrst.

---

## 4. Mælt Phase 2a/2b/2c

### Phase 2a — Station list og mapping skeleton (bakvið flagg)

Verk (engar breytingar á núverandi files):

1. Búa til `lib/weather/providers/vedurstofanStations.ts`:
   - Handcrafter curated lista yfir helstu stöðvar á algengum leiðum
   - `mapRoutePointToStation(pt)` → `{ stationId, stationName, lat, lon, distanceM, confidence }`
   - Byrja á 20-40 stöðvum á helstu leiðum (1, 41, 48, 51, Hringvegurinn)
   - Confidence: `good` (< 5 km), `ok` (5-15 km), `weak` (> 15 km)
2. Tests sem sanna mapping logic
3. Engin fetch, engin cache, engin route.ts breyting

### Phase 2b — Parser og cache per stöð (bakvið flagg)

Verk:

1. Búa til `lib/weather/providers/vedurstofanProvider.server.ts`:
   - `fetchVedurstofanStation(stationId)` → `ForecastProviderResult | null`
   - Parse XML → normalísera í `HourPoint[]` með `null`-aware fields
   - Cache key: `vedurstofan:forec:{stationId}`
   - Geyma parsed JSON (Kostur A), ekki raw XML
2. Tests með XML fixture (ekki live API)
3. Engar breytingar á `route.ts` eða `assessment.ts`

### Phase 2c — Route-level batcher (bakvið flagg)

Verk:

1. `fetchVedurstofanForRoute(weatherPoints)` → `VedurstofanRouteResult`
2. Kallar Phase 2a mapping + Phase 2b fetch per unique station
3. Skilar per-point results með confidence metadata
4. Kallað **aðeins** úr `route.ts` þegar `WEATHER_VEDURSTOFAN_SHADOW_COMPARE=true`
5. Ekki í default route path

---

## 5. Provider interface (tillaga)

Byggt á Codex v001 tillögu, lagað eftir Phase 0 findings:

```ts
// lib/weather/providers/forecastProvider.types.ts

type ForecastSourceId = 'metno' | 'vedurstofan'

type ForecastSourceLocation =
  | { kind: 'coordinate'; lat: number; lon: number }
  | { kind: 'station'; stationId: string; stationName: string; lat: number; lon: number; distanceFromRoutePointM: number }

type ForecastProviderResult = {
  sourceId: ForecastSourceId
  hours: HourPoint[]                // null-fields eru null, ekki 0
  fetchedAtIso: string
  sourceLocation: ForecastSourceLocation
  timeResolutionMinutes: number     // MET: 60, Veðurstofan: 180 eða 360
  quality: {
    status: 'ok' | 'partial' | 'stale' | 'unavailable'
    mappingConfidence?: 'good' | 'ok' | 'weak'  // station-based only
  }
}
```

Athugasemd: `HourPoint` hefur `number` fields (ekki `number | null`). Veðurstofan-provider þarf annaðhvort:
- a) Nota extended `HourPointWithMissing` type með nullable fields í provider layer, normalize við samanburð
- b) Sleppa hours með missing critical fields (eins og MET gerir nú með `wind_speed === undefined` filter)

Mælt: **b)** í MVP. Einfaldara, sama mynstur og MET, hægt að strengja seinna.

---

## 6. Hvort spike-script sé nauðsynlegt

**Já, en það þarf sérstakt leyfi.**

Spike script (`scripts/vedurstofan-spike.ts` eða sambærilegt) er nauðsynlegt til að:

- Staðfesta raunverulegt XML schema (docs eru ekki alltaf réttir)
- Finna hvaða fields eru til raunverulega vs theory
- Mæla time resolution per stöð
- Mæla coverage á helstu leiðum

**Hvað þarf Stebbi að samþykkja fyrir spike:**

> "Claude Code, búðu til local-only spike script í `scripts/vedurstofan-spike.ts` sem sækir forecast fyrir [2-3 station IDs] frá xmlweather.vedur.is og skýrslar fields og time resolution. Keyra má það eingöngu á localhost. Engar breytingar á production kóða, engar Supabase breytingar."

Þetta er sér framkvæmdarleyfi. Ég bíð eftir því.

---

## 7. Hvað er EKKI klart enn

| Spurning | Staða |
|---|---|
| `api.vedur.is` vs XML: hvort er mælt? | XML mælt, REST óstaðfest |
| Raunverulegt XML schema og fields | Þarf spike |
| Station coverage á ísl. vegum | Þarf spike + curate |
| Time resolution per station | Þarf spike |
| Rate-limit policy nákvæmlega | Þarf spike + observation |
| Kostur A vs B fyrir XML caching | A mælt, þarf raunprófun |

---

## 8. Localhost checks for Stebbi

Þetta Phase 0 handoff breytir engu í production kóðanum.

- `/vedrid` hegðar sér óbreytt
- Engar SQL breytingar
- Engin Vercel deploy

Þegar spike-script er samþykkt og keyrt (Phase 0b):

- Keyra á localhost eingöngu: `npx tsx scripts/vedurstofan-spike.ts`
- Staðfesta að það nái í Veðurstofu endpoint og printi fields
- Staðfesta að það hammri **ekki** endpointinn í lykkju — eitt request per station test

---

## Næsta skref

Stebbi ákveður:

**A. Samþykkja spike-script**: "Claude Code, búðu til `scripts/vedurstofan-spike.ts`..."

**B. Byrja Phase 2a station list án spike**: Claude Code útbýr curated stöðvalista fyrir helstu leiðir handvirkt (byggt á opinberum stöðvalista Veðurstofunnar sem Codex vísar í).

**C. Bíða**: Stebbi skoðar sjálfur Veðurstofu endpoint í browser og kemur með niðurstöður.

Mælt er **B** ef Stebbi vill hreyfa sig án external API calls, **A** ef við viljum fullkomna staðfestingu á schema áður en við curateum stöðvalista.
