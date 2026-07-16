# TODO 086 - Veðurstofan web service findings

Created: 2026-07-12 10:30
Timezone: Atlantic/Reykjavik
Author: Codex
Type: Research handoff / architecture constraints

Context:
- Stebbi asked Codex/Claude Code to own the research: "Þið sjáið um að finna út úr því hvað er í boði í veðurstofuvefþjónustunni."
- Reviewed: `ai-handoff/2026-07-12-1006-todo-086-v004-claude-phase0-findings.md`
- This is research and planning only. No app code, SQL, env, Supabase, production, commit, push or deploy changes were made.

## Short Answer

Veðurstofan's documented and usable public service for this work is the XML service at `xmlweather.vedur.is`.

It can provide:

- station forecasts (`type=forec`)
- station observations (`type=obs`)
- text forecasts / regional descriptions (`type=txt`)
- forecast model metadata (`type=forec-info`)
- XML, RSS and CSV output formats

For Teskeið travel weather, the MVP should use `type=forec` with explicit params:

```text
F;D;T;R;W
```

That gives wind speed, wind direction, temperature, precipitation and weather description in station forecasts.

Important: live probes showed forecast gust fields (`FG` / `FX`) did not come back for the sample forecast calls, even when requested. `FG` was available in observations. So do not reintroduce forecast gust thresholds or route scoring from Veðurstofan in this phase. If gusts come back later, treat them as a separate verified enhancement.

## Official Sources Used

- Veðurstofa XML overview: https://www.vedur.is/um-vi/vefurinn/xml/
- Veðurstofa XML PDF: https://www.vedur.is/media/vedurstofan/XMLthjonusta.pdf
- Station list / station info pages: https://www.vedur.is/vedur/stodvar
- Example station info:
  - Hellisheiði: https://www.vedur.is/vedur/stodvar/?s=hellh

Key official constraints:

- The XML service is free and open; no registration is required.
- The service can return latest station forecasts, text forecasts and observations.
- The service does not update as quickly as the website.
- Station changes and forecast-type changes are not announced to users.
- The docs explicitly warn not to fetch too often; IPs causing too much load may be rejected for an unspecified period.

## Live Probe Results

Codex ran a few read-only `Invoke-WebRequest` calls against official public endpoints. No files or production services were changed.

### 1. Forecast for Hellisheiði, default fields

Endpoint shape:

```text
https://xmlweather.vedur.is/?op_w=xml&type=forec&lang=is&view=xml&ids=31392&time=3h
```

Observed:

- HTTP 200
- One station: `31392`, Hellisheiði
- 62 `<forecast>` rows
- Forecast timestamps in 3-hour steps for the first span
- Default returned fields were `F`, `D`, `T`, `W`
- Default did not include precipitation `R`

Sample schema shape:

```xml
<forecasts>
  <station id="31392" valid="1">
    <name>Hellisheiði</name>
    <atime>2026-07-12 06:00:00</atime>
    <err></err>
    <forecast>
      <ftime>2026-07-12 09:00:00</ftime>
      <F>11</F>
      <D>SSA</D>
      <T>9</T>
      <W>Lítils háttar rigning</W>
    </forecast>
  </station>
</forecasts>
```

### 2. Forecast with explicit params

Endpoint shape:

```text
https://xmlweather.vedur.is/?op_w=xml&type=forec&lang=is&view=xml&ids=31392&time=3h&params=F;FG;FX;D;T;R;W
```

Tested stations:

- Hellisheiði `31392`
- Egilsstaðaflugvöllur `571`
- Höfn í Hornafirði `5544`

Observed:

- HTTP 200 for all three
- `F`, `D`, `T`, `R`, `W` returned
- `R` is available in forecast when explicitly requested
- `FG` and `FX` did not return in forecast for these sample stations
- Each sample had 62 forecast rows

Counts for all three sample stations:

```text
F_tags=62
FG_tags=0
FX_tags=0
R_tags=62
T_tags=62
```

Conclusion: forecast precipitation is usable; forecast gust/max-wind is not reliable enough to design against in MVP.

### 3. Observation with explicit params

Endpoint shape:

```text
https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=is&view=xml&ids=31392&params=F;FG;D;T;R
```

Observed:

- HTTP 200
- Hellisheiði observation included `F`, `FG`, `D`, `T`, `R`
- Example: `<FG>15</FG>`

Conclusion: observations can include gusts, but observations are not route-time forecasts. They may be useful later as "current observed conditions near this point", but should not feed the current departure-time route forecast model unless we design that explicitly.

### 4. Multiple stations in one forecast request

Endpoint shape:

```text
https://xmlweather.vedur.is/?op_w=xml&type=forec&lang=is&view=xml&ids=31392;571;5544&time=3h&params=F;D;T;R;W
```

Observed:

- HTTP 200
- One XML response containing three `<station>` nodes
- Station names: Hellisheiði, Egilsstaðaflugvöllur, Höfn í Hornafirði
- 186 forecast rows total, i.e. 62 per station

Conclusion: batching multiple station IDs in one request is supported and should be used carefully to reduce request count.

### 5. Text forecasts

Endpoint shape:

```text
https://xmlweather.vedur.is/?op_w=xml&type=txt&lang=is&view=xml&ids=2;3;31;39
```

Observed:

- HTTP 200
- Text entries for national, capital-area and regional forecasts
- Includes `title`, `creation`, `valid_from`, `valid_to`, `content`

Conclusion: useful later for regional context, warnings, or a "read more" panel, but not needed for the first provider integration into route point scoring.

## What Is Available

### `type=forec` - station forecasts

Best fit for Teskeið route forecast comparison.

Relevant parameters:

- `ids`: one or more station numbers separated by semicolon
- `params`: one or more measurement symbols separated by semicolon
- `time`: `3h` or `6h`
- `lang`: `is` or `en`
- `view`: `xml`, `rss` or `csv`

Fields relevant to us:

- `F`: wind speed, m/s
- `D`: wind direction
- `T`: temperature, Celsius
- `R`: accumulated precipitation, mm/hour
- `W`: weather description

Fields that exist in docs but should not be assumed for forecasts:

- `FG`: max gust
- `FX`: max wind speed

The docs say not all fields are available in automatic forecasts. Live probes confirmed `FG`/`FX` did not return for sample station forecasts.

### `type=obs` - observations

Useful for current conditions near a station.

Relevant parameters:

- `ids`
- `params`
- `time=1h|3h`
- `anytime=0|1`

Observed data can include `FG`, but this is current/past observation data, not future route forecast data. Keep it out of scoring for now.

### `type=txt` - text forecasts and descriptions

Useful later as context.

Examples from docs:

- `2`: Veðurhorfur á landinu
- `3`: Veðurhorfur á höfuðborgarsvæðinu
- `31`: Suðurland
- `32`: Faxaflói
- `37`: Austurland að Glettingi
- `38`: Austfirðir
- `39`: Suðausturland

Not a route-point data source in MVP.

### `type=forec-info`

Exists in docs as forecast model information. Not probed here. Likely useful later for metadata/source labeling, not needed for Phase 1.

## Station IDs and Mapping

Official station pages expose station IDs, coordinates, type and owner.

Confirmed examples:

| Station | ID | Type | Owner | Notes |
|---|---:|---|---|---|
| Hellisheiði | 31392 | Sjálfvirk veðurathugunarstöð | Vegagerðin | Road-relevant |
| Garðabær - Kauptún | 31475 | Sjálfvirk veðurathugunarstöð | Vegagerðin | Capital-area route start sample |
| Egilsstaðaflugvöllur | 571 | Station forecast available | Veðurstofa | East Iceland sample |
| Höfn í Hornafirði | 5544 | Station forecast available | Veðurstofa | Southeast sample |

Coordinate note:

- Veðurstofa station pages display Icelandic west longitudes as positive-looking values, e.g. Hellisheiði `(64,0188, 21,3424)`.
- In our internal WGS84 coordinate math, longitude must be negative for Iceland, e.g. `lat=64.0188`, `lon=-21.3424`.

## Architecture Conclusions

### 1. Veðurstofan cannot be a simple clone of `fetchForecast(lat, lon)`

MET/Yr is coordinate-based. Veðurstofan XML is station-based.

Correct route-level flow:

```text
route weather points
  -> map each point to nearest/approved station
  -> dedupe station IDs
  -> fetch station forecasts in batches
  -> parse XML into station forecast objects
  -> attach matching station forecast back to each route point
  -> compare/shadow alongside existing MET result
```

### 2. Use explicit params always

Do not rely on default forecast fields. Default omitted `R` in live probes.

Recommended query params:

```text
params=F;D;T;R;W
time=3h
lang=is
view=xml
```

### 3. Batch by station IDs, but cache per station or per stable batch

The XML service supports multiple station IDs in one request.

Recommended implementation pattern:

1. Determine unique station IDs for a route.
2. Split into small stable batches if needed.
3. Fetch each batch once.
4. Parse response by station.
5. Save parsed JSON to `weather_cache.response_body`.

Cache options:

- Per-station cache key: easiest lookup and reuse across routes; fetch batching can still fill multiple station cache entries from one response.
- Per-batch cache key: fewer cache writes but less reusable because station sets vary by route.

Recommendation: per-station parsed JSON cache, with optional batch fetch to populate missing stations.

### 4. Store parsed JSON, not raw XML, in `weather_cache`

`weather_cache.response_body` is `jsonb NOT NULL`.

Recommended shape:

```ts
type VedurstofanStationForecastCache = {
  source: 'vedurstofan'
  type: 'forec'
  stationId: string
  stationName: string
  atimeIso: string | null
  fetchedAtIso: string
  params: ['F', 'D', 'T', 'R', 'W']
  timeStep: '3h'
  forecasts: Array<{
    ftimeIso: string
    windSpeedMps: number | null
    windDirectionText: string | null
    temperatureC: number | null
    precipitationMmPerHour: number | null
    weatherText: string | null
  }>
}
```

Implementation must parse Icelandic decimal comma, e.g. `0,6` -> `0.6`.

### 5. Keep Veðurstofan as shadow/enrichment first

Do not replace current MET/Yr scoring in the first implementation phase.

Recommended feature flag sequence:

1. Parser + fixtures only.
2. Station mapping + tests.
3. Batch fetcher behind server-only flag.
4. Shadow compare logs/admin-only diagnostics.
5. Only later decide whether and how to expose Veðurstofan values in UI.

## Key Risks

### P1 - Service stability / rate limit risk

The official docs explicitly warn not to fetch too often and say IPs may be rejected if they cause too much load. The provider must be cache-first and batch-aware from day one.

Guardrails:

- Never call per route point.
- Cache parsed station forecasts.
- Add request caps per route.
- Add timeout and fail-open behavior.
- Treat Veðurstofan as optional shadow source until stable.

### P1 - Forecast gusts are not verified

Docs list `FG` and `FX`, but forecast calls for sample stations returned none. Observations returned `FG`.

Guardrail:

- Do not use Veðurstofan gust data in route forecast scoring for now.
- If later added, implement as separate observed/current condition or only when verified in forecast response.

### P1 - Station mapping can mislead users

Station data is not coordinate-specific. A route point may be far from the nearest/selected station or in a different microclimate.

Guardrails:

- Store `distanceFromRoutePointM`.
- Add mapping confidence: `good`, `ok`, `weak`.
- Do not silently treat weak station data as equivalent to MET coordinate forecast.

### P2 - Time resolution is coarser and variable

`forec` supports 3h/6h steps. Docs say step availability and forecast length can vary by model.

Guardrails:

- Matching must tolerate missing exact hour.
- Use nearest forecast step with explicit `forecastTimeIso`.
- Show or log source time where relevant.
- Do not assume hourly forecast.

### P2 - Schema changes are possible

The docs state station/forecast changes are not announced.

Guardrails:

- Parser must be null-tolerant.
- Missing critical values should result in `partial`/`unavailable`, not crash.
- Keep fixture tests for known response shapes.

## Recommended Next Handoff to Claude Code

If Stebbi wants Claude Code to continue, the next implementation should be small and future-proof:

### Phase 1A - Parser only, no route integration

Scope:

- Add XML parser module for `type=forec` responses.
- Add fixture-based tests using a minimal sanitized XML sample.
- Normalize only `F`, `D`, `T`, `R`, `W`.
- Parse multiple `<station>` nodes.
- Parse decimal comma.
- Return nullable fields safely.
- No network calls in tests.
- No route.ts changes.
- No UI changes.
- No SQL changes.

Suggested files, if Stebbi gives explicit implementation permission:

- `lib/weather/providers/vedurstofanXml.ts`
- `lib/weather/providers/__tests__/vedurstofanXml.test.ts`

### Phase 1B - Station mapping skeleton

Scope:

- Add curated station list with coordinates and station IDs.
- Add nearest-station mapping function.
- Add tests for key route points: Hellisheiði, Garðabær, Egilsstaðir, Höfn.
- No fetch.
- No UI.

### Phase 1C - Fetch/cache wrapper behind flag

Scope:

- Server-only fetcher with timeout.
- Cache-first.
- Batch request missing station IDs.
- Save parsed JSONB per station.
- Behind flag, no user-facing behavior.

## Commands / Actions Codex Ran

Read-only local file reads:

- `Get-Content -Encoding UTF8 WORKFLOW.md`
- `Get-Content -Encoding UTF8 ai-handoff/2026-07-12-1006-todo-086-v004-claude-phase0-findings.md`
- `Get-Content -Encoding UTF8 ai-handoff/README.md`
- `Get-Date -Format "yyyy-MM-dd HH:mm"`

Read-only external official HTTP probes:

- `Invoke-WebRequest` against `xmlweather.vedur.is` forecast, observation and text forecast endpoints.
- All were public official endpoints.
- No local files, Supabase, production data, secrets, billing, auth, GitHub, deployment or user data were touched.

File created:

- `ai-handoff/2026-07-12-1030-todo-086-v005-codex-vedurstofan-webservice-findings.md`

## Localhost checks for Stebbi

Nothing user-visible changed in this research step.

No localhost testing is required for this handoff itself.

When Claude Code later implements parser/mapping/fetching:

1. First verify tests only; no browser behavior should change.
2. If a shadow flag is introduced, keep it off by default on production.
3. On localhost, confirm `/vedrid` still uses the current MET/Yr result path unless the explicit shadow flag is enabled.
4. Confirm route calculation does not become slower or fail when Veðurstofan is unavailable.
5. Do not test by repeatedly hammering live Veðurstofa endpoints; use fixtures and cache where possible.

## Óvissa / Þarf að staðfesta

- `api.vedur.is` was not useful from the official landing page in this research pass. XML is the only confirmed public/documented service.
- I did not probe `forec-info`; it is likely metadata, not MVP-critical.
- I probed a small station sample, not a full national station coverage map.
- Some Veðurstofa station pages use display coordinate format that must be converted carefully to WGS84 west-longitude negative values.
