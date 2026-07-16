# TODO 086 v197 - Codex handoff: Vegagerðin current wind/gust measurements

Created: 2026-07-15 07:09
Timezone: Atlantic/Reykjavik

Mode:
- Rýni og project-aðlagað implementation handoff.
- Engar kóðabreytingar, engin SQL skrifuð/keyrð, ekkert commit/push/deploy.
- Byggt á `ai-handoff/2026-07-15-0658-Vegagerdin-ChatGPT`, núverandi weather architecture í repo, og staðfestingu Vegagerðarinnar í skjalinu.

## Stutt niðurstaða

Vegagerðin hefur staðfest að Teskeið má nýta gögnin. Mikilvægustu operational reglurnar úr svari Vegagerðarinnar:

- Ekki sækja í vefþjónusturnar oftar en um 1 mínútu.
- Algengt fetch-bil er 2-3 mínútur, eftir því hvað seinkun má vera mikil.
- Veðurstöðvar mæla á 10 mínútna fresti.
- Flestar mælingar berast fljótlega eftir mælingu, oft um mínútur 1-3, 11-13 o.s.frv.
- Null getur þýtt hreinsaða villu eða að stöð mæli ekki viðkomandi atriði.

Codex er sammála ChatGPT-scopeinu í meginatriðum, en aðlagar það að Teskeið:

1. Fyrsta MVP á að nota Vegagerðina sem **númælingalag**, ekki framtíðarspá.
2. Vegagerðin á **ekki** að breyta scrubber/status/worst-point útreikningi í fyrsta skrefi.
3. Ekki sækja frá browser. Allt fer server-side gegnum sameiginlegt cache.
4. Byrja án nýrrar product table ef hægt er: nota `weather_cache` fyrir raw/shared cache.
5. Fyrsta sýnileg afurð: route-matched Vegagerðarstöðvar með `Vindhradi`, `Vindhvida`, vindátt, mælitíma, aldur og fjarlægð frá leið.

## Critical review of ChatGPT block

### Strong points

- Rétt að byrja á `vedur2014_1`, ekki DATEX II.
- Rétt að halda `Vindhradi` og `Vindhvida` merkingar aðskildum.
- Rétt að kalla þetta númælingu, ekki spá.
- Rétt að byrja með route polyline proximity frekar en `IdButur`.
- Rétt að forðast client polling og per-user upstream calls.
- Rétt að gera parser/normalizer/tests áður en UI verður stórt.

### Adjustments for this repo

- Repo-ið er þegar með provider-aware weather flow:
  - `lib/weather/providerComparator.ts` skilgreinir nú þegar `WeatherProviderKey = 'metno' | 'vedurstofan' | 'vegagerdin'`.
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx` er þegar komið með provider toggle UI og generic comments fyrir framtíðar provider.
  - `app/api/teskeid/weather/travel/route.ts` byggir nú þegar Veðurstofu layer fail-open við hlið MET/Yr.
- Route polyline projection er þegar til í `app/api/teskeid/weather/travel/route.ts` sem `projectToPolyline`, en hún er local helper. Fyrir Vegagerðina ætti Claude Code að extract-a hana í shared helper áður en hún er endurnýtt.
- Existing Supabase `weather_cache` passar vel fyrir fyrsta raw/shared cache. Ekki þarf product table í fyrsta skrefi nema Stebbi vilji persistence/query layer strax.
- `weather_fetch_runs.source` leyfir bara `vedurstofan` í migration 74. Ekki nota `weather_fetch_runs` fyrir Vegagerðina fyrr en ný migration víkkar CHECK constraint. Fyrsta MVP getur skráð `fetchedAt` í `weather_cache` payload án run table.
- Per-user flag fyrir Vegagerðina þarf líklega nýja feature key migration síðar, t.d. `weather-provider-vegagerdin`. Ekki skrifa/keyra hana í fyrsta discovery-provider scope nema Stebbi samþykki sérstaklega.

### Main product correction

Ekki setja Vegagerðina sem þriðju línu í sama forecast comparison:

```text
met.no 11 m/s
Veðurstofan 12 m/s
Vegagerðin 20 m/s
```

Þetta væri villandi því `20 m/s` er hviða síðustu 10 mínútna, ekki spá fyrir komutíma.

Rétt:

```text
Spá þegar þú kemur:
met.no / Veðurstofan ...

Núverandi mæling við leiðina:
Vegagerðin: vindur 13 m/s · hviður 20 m/s · mælt fyrir 6 mín.
```

## Current repo facts from Codex review

### Weather data fetches

- MET/Yr:
  - `lib/weather/metno.server.ts`
  - server-side fetch, uses `weather_cache`
  - cache key per rounded lat/lon
  - falls back to cached response on upstream failure

- Veðurstofan:
  - `lib/weather/providers/vedurstofan.server.ts`
  - raw cache in `weather_cache`
  - product/latest/history tables added in SQL 74/77
  - travel route reads product table through `readVedurstofanProductForStations`
  - fail-open budget in travel route: `VEDURSTOFAN_LAYER_BUDGET_MS = 1500`

### Route geometry / matching

- `app/api/teskeid/weather/travel/route.ts` has:
  - `pointToSegmentM`
  - `distanceToPolylineM`
  - `projectToPolyline`
  - `haversineM`
- Veðurstofan currently uses `projectToPolyline` to place one station point per station.
- Vegagerðin should reuse this same idea, but not by copy/pasting helpers again. Extract to shared module first.

### Provider UI and future Vegagerðin slot

- `FerdalagidClient.tsx` already has disabled Vegagerðin tile and `providerVegagerdinLabel`.
- `messages/is.json` has Vegagerðin provider labels/helper text.
- Current provider selector is forecast-provider-ish; first Vegagerðin layer is a current measurement layer. Be careful not to imply it affects forecast assessment until we intentionally design that.

## Recommended first implementation scope

### Phase 0 - repo and endpoint preflight, no UI

Goal: prove the endpoint shape and create a stable fixture.

Claude Code should first ask for explicit approval before any external fetch or file write.

Tasks:
1. Fetch a small sample from:
   - `https://gagnaveita.vegagerdin.is/api/vedur2014_1`
2. Confirm:
   - content type
   - top-level shape
   - actual field casing
   - whether values are strings or numbers
   - date format/timezone
   - null behavior
   - whether `Vindhvida` exists and is populated
3. Save a small fixture under tests, if approved.
4. Do not touch UI yet.
5. Do not add SQL yet.

If the endpoint response is huge, store a trimmed fixture with 2-5 representative rows:
- complete row
- row with null gust
- row with string numbers if present
- row with invalid/null fields if present

### Phase 1 - provider/parser/cache, still display-only

Goal: build a server-only provider that returns normalized current measurements.

Suggested files:

```text
lib/weather/providers/vegagerdinCurrent.ts
lib/weather/providers/vegagerdinCurrentTypes.ts
lib/weather/providers/vegagerdinCurrentSchema.ts
lib/weather/providers/vegagerdinCurrentTime.ts
lib/__tests__/weather-vegagerdin-current.test.ts
lib/__tests__/weather-vegagerdin-current-time.test.ts
```

Use existing repo style if Claude Code sees a cleaner naming convention.

Normalized type should preserve semantics:

```ts
export type VegagerdinCurrentMeasurement = {
  source: 'vegagerdin'
  stationId: string
  stationName: string
  lat: number
  lon: number
  elevationM: number | null
  measuredAtIso: string
  fetchedAtIso: string
  windDirectionDeg: number | null
  windDirectionText: string | null
  meanWindMs: number | null
  gustLast10MinMs: number | null
  airTemperatureC: number | null
  roadTemperatureC: number | null
  roadSegmentIds: string[]
  dataQuality: 'complete' | 'partial'
}
```

Important:
- `Vindhradi` -> `meanWindMs`
- `Vindhvida` -> `gustLast10MinMs`
- Null stays null. Never convert missing/null to 0.
- Explicitly parse `Dags`; do not rely on `new Date(raw.Dags)` unless response is ISO and verified.

### Phase 2 - shared cache, no new SQL initially

Use existing `weather_cache` as a single shared raw/provider cache entry:

```text
vegagerdin:vedur2014_1:latest
```

Suggested behavior:

- TTL: 2 minutes initially.
- Never fetch upstream if cache is fresh.
- Stale fallback max: 30 minutes initially, clearly marked.
- Timeout: 8 seconds or less.
- No client/browser polling.
- No per-route upstream fetch. The endpoint returns all stations, so one cached fetch serves all routes.

Why not product table immediately:
- First need to verify endpoint shape and route matching.
- Current measurement list is small enough to filter in memory for MVP.
- Avoids migration risk while Veðurstofan SQL work is still active.

Later, if needed:
- `vegagerdin_weather_measurements_latest`
- `vegagerdin_weather_measurements_history`
- extend `weather_fetch_runs.source` CHECK to include `vegagerdin`

Do not use `weather_fetch_runs` yet without migration because it currently restricts `source IN ('vedurstofan')`.

### Phase 3 - route matching layer

Goal: match current Vegagerðin stations to the selected route.

Suggested files:

```text
lib/weather/routeProjection.ts
lib/weather/providers/vegagerdinRouteLayer.ts
lib/__tests__/weather-route-projection.test.ts
lib/__tests__/weather-vegagerdin-route-layer.test.ts
```

Extract from `app/api/teskeid/weather/travel/route.ts`:
- `haversineM`
- `pointToSegmentM`
- `projectToPolyline`

Then use it for both Veðurstofan and Vegagerðin, so we do not keep two subtly different projection implementations.

Suggested layer type:

```ts
export type VegagerdinCurrentLayer = {
  experimental: true
  status: 'available' | 'partial' | 'unavailable'
  source: 'vegagerdin'
  fetchedAtIso: string | null
  points: Array<{
    routePointId: string
    stationId: string
    stationName: string
    lat: number
    lon: number
    distanceM: number
    distanceFromOriginM: number
    routeFraction: number
    measuredAtIso: string
    measurementAgeMinutes: number
    freshness: 'fresh' | 'aging' | 'stale'
    meanWindMs: number | null
    gustLast10MinMs: number | null
    windDirectionDeg: number | null
    windDirectionText: string | null
    roadTemperatureC: number | null
    roadSegmentIds: string[]
    matchQuality: 'high' | 'medium' | 'low'
  }>
}
```

First matching config should be centralized, not magic numbers:

```ts
const VEGAGERDIN_ROUTE_MATCHING = {
  preferredDistanceFromRouteM: 2_000,
  maxDistanceFromRouteM: 10_000,
  maxStationsPerRoute: 8,
}
```

These values are starting points only. Claude Code should adjust after local routes are inspected.

### Phase 4 - travel API integration, fail-open

Integrate into `app/api/teskeid/weather/travel/route.ts` only after provider/cache/tests are in place.

Rules:
- Guard behind env kill switch and per-user feature access when exposing to UI.
- Suggested env:
  - `WEATHER_PROVIDER_VEGAGERDIN_ENABLED=true`
- Suggested feature key later:
  - `weather-provider-vegagerdin`
- If feature key is used, SQL migration is required to add it to `feature_access` CHECK constraint and admin API allowlist. Do not sneak this into code without migration plan.
- Read provider/cache in parallel with other weather layers.
- Budget it like Veðurstofan or lower, e.g. 500-1000ms.
- Failure must not break MET/Yr result.
- Return `{ ...result, vegagerdinCurrentLayer }` only when available and enabled.

Critical: do not feed Vegagerðin current measurement into:
- `checkTravelWeather`
- `DepartureHeatmap`
- scrubber statuses
- selected provider aggregation
- worst forecast point

Not in first MVP.

### Phase 5 - minimal UI

First UI should be separate from forecast cards.

Suggested copy:

```text
Núverandi mæling við leiðina

Sandskeið
Vindur 13 m/s · hviður 20 m/s
SSA
Mælt fyrir 6 mín.
0,8 km frá leiðinni
Heimild: Vegagerðin
```

Rules:
- Say `Núverandi mæling`, `Síðasta mæling`, or `Mælt kl.`
- Say `mesta vindhviða síðustu 10 mín.` in detail/tooltip if possible.
- Do not say `Vegagerðin spáir`.
- Do not say `hviður verða`.
- Do not say `öruggt`, `hættulaust`, or imply driving advice.
- If stale, show age clearly.

Possible placement:
- Below summary/threshold/provider filter as an attention/info section.
- Later: map markers and all-points list.
- Do not initially merge into same provider forecast card rows.

## What is explicitly out of scope

Do not include in first implementation:

- DATEX II
- færð
- lokanir
- cameras
- WFS road geometry
- automatic road segment matching by `IdButur`
- changing route forecast assessment/status
- changing user thresholds
- future forecast from Vegagerðin
- history table
- SQL migration unless Stebbi explicitly approves
- cron schedule change unless Stebbi explicitly approves
- deploy/commit/push

## Security and privacy notes

- Do not expose raw upstream response to clients.
- Do not log user route geometry or origin/destination in detail.
- It is OK to log anonymized counts/status:
  - cache hit/miss
  - station count
  - valid/invalid count
  - fetch latency
  - response status
- Do not leak service role errors to client.
- Feature should fail closed/hidden if env flag is off.
- Feature should fail open relative to existing weather result: MET/Yr should still work.

## Suggested tests

### Provider and parser

- parses complete row
- parses numeric strings and numbers
- parses null wind/gust as null
- rejects/marks invalid coordinates
- explicit `Dags` parsing
- duplicate station IDs handled deterministically
- malformed response returns structured unavailable/error
- HTTP error falls back to acceptable stale cache if present

### Route matching

- station on route
- station near segment between route vertices
- station outside corridor
- station with no coordinates skipped
- sorting prefers usable wind/gust and freshness over distance when appropriate

### Travel API

- Vegagerðin provider unavailable does not break baseline MET/Yr result
- disabled env means no `vegagerdinCurrentLayer`
- enabled + access means layer appears
- layer does not alter `stada`, scrubber, or `travelPlan` forecast assessment

## Proposed first Claude Code task

Claude Code should not jump straight to UI. First task should be:

1. Do read-only endpoint discovery.
2. Save minimal fixture, if Stebbi approves file write.
3. Implement provider/parser/cache with tests.
4. Return a handoff before travel API/UI integration.

This gives Stebbi and Codex a clean checkpoint before any user-facing behavior changes.

## Localhost checks for Stebbi

After Phase 1 provider/parser/cache is implemented:

1. No UI should change yet.
2. Run the targeted provider tests.
3. Confirm test fixture does not include unnecessary huge payload or sensitive data.
4. Confirm parser prints/returns:
   - station name
   - mean wind
   - gust last 10 min
   - wind direction
   - measured time
   - coordinates
5. Confirm cache behavior with a mocked fetch:
   - first call fetches upstream
   - second call within TTL uses cache
   - upstream failure with acceptable stale cache returns stale status
6. Do not run Supabase migrations or Vercel cron changes casually.
7. Do not test by refreshing repeatedly against Vegagerðin in a tight loop.

After Phase 4/5 UI is later implemented:

1. Open `/auth-mvp/vedrid` with a route near known road-weather stations.
2. Confirm MET/Yr result still appears when Vegagerðin is unavailable.
3. Confirm Vegagerðin appears as current measurement, not forecast.
4. Confirm hviður are labeled as hviður/current measurement, not route status.
5. Toggle met.no/Veðurstofan if available and confirm Vegagerðin does not unexpectedly change forecast scrubber in MVP.

## Suggested copy/paste to Claude Code

```text
Claude Code, please review `ai-handoff/2026-07-15-0709-todo-086-v197-codex-vegagerdin-current-measurements-handoff.md` and start with a short plan before editing anything.

Goal:
Bring Vegagerðin current wind/gust measurements into Teskeið safely as a display-only current-measurement layer.

Important source confirmation:
Vegagerðin confirmed use is allowed. They recommend not fetching more often than about every 1 minute; common fetch interval is 2-3 minutes. Weather stations measure every 10 minutes. Null can mean invalid/cleaned data or unavailable measurement.

First scope:
1. Read-only discovery of `https://gagnaveita.vegagerdin.is/api/vedur2014_1`.
2. Save a small fixture only if Stebbi approves.
3. Build server-only provider/parser/cache for current measurements.
4. Use shared `weather_cache` initially; no new SQL unless Stebbi explicitly approves.
5. Add tests for parsing, null handling, time parsing, and cache behavior.
6. Stop with handoff before travel API/UI integration.

Do not:
- use DATEX II
- add færð/lokanir
- fetch from browser
- change current forecast assessment
- blend current gusts into future forecast statuses
- write/run migrations
- commit/push/deploy

Architecture notes:
- Existing `WeatherProviderKey` already includes `vegagerdin`.
- `projectToPolyline` exists in `app/api/teskeid/weather/travel/route.ts`; later extract it to shared helper before route matching.
- `weather_fetch_runs.source` currently only allows `vedurstofan`; do not use it for Vegagerðin without migration.
- First UI later should say “Núverandi mæling við leiðina”, not “spá”.

Please include `Localhost checks for Stebbi` in your handoff.
```

## Óvissa / þarf að staðfesta

- Codex did not live-verify the `vedur2014_1` response shape in this handoff. The first Claude step must verify the real response before schema is finalized.
- Need to confirm exact date/time format and timezone in current endpoint output.
- Need to confirm whether endpoint requires any headers or has practical response size limits.
- Need Stebbi decision before adding a new per-user feature key and SQL migration for `weather-provider-vegagerdin`.
