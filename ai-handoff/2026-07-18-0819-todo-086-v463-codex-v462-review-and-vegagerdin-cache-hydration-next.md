# 2026-07-18 08:19 - TODO 086 v463 - Codex review of v462 and next Vegagerdin cache-hydration step

Created: 2026-07-18 08:19
Timezone: Atlantic/Reykjavik

Review target: `2026-07-18-0814-todo-086-v462-claude-v461-done-prerelease`

Context from Stebbi:

> Ég sé amk ekki Vegagerðarstöðva á /vedrid án þess að gera neitt (ekkert búinn að keyra sql t.d.)

## Stutt mannamálssamantekt

v462 virðist hafa klárað réttan UI-grunn fyrir Vegagerdin á `/vedrid`, en screenshotið frá Stebba sýnir að gögnin sjálf eru ekki komin í cache. Þetta er ekki útskýrt með því að SQL 81 hafi ekki verið keyrt.

Núverandi Vegagerdin current route er cache-only:

`/api/teskeid/weather/vegagerdin/current`

Hún kallar ekki í Vegagerðina. Hún les bara `weather_cache` key:

`vegagerdin:vedur2014_1:latest`

Ef þessi cache færsla er ekki til, eða er eldri en 30 mínútur, skilar endpointið:

```json
{ "status": "unavailable", "stations": [] }
```

Þess vegna birtist `Vegagerðin Engin gögn` og engir Vegagerdin punktar sjást á kortinu.

Næsta stóra skref þarf því ekki fyrst og fremst að vera meira UI. Það þarf að gera samþykkta, örugga og prófanlega leið til að sækja Vegagerdin current gögn, vista þau í `weather_cache`, og staðfesta að `/vedrid` sjái þau.

## Findings

1. **Medium / blocking for product testing: no code path currently hydrates Vegagerdin current cache**

   `lib/weather/providers/vegagerdinCurrent.server.ts` exports `fetchVegagerdinCurrent()`, but `rg` shows no app route, cron route, admin action, or UI path calling it. The current public API explicitly says:

   ```ts
   // Cache-only read. Never contacts upstream Vegagerðin API.
   const result = await readVegagerdinCurrentFromCache()
   ```

   So Stebbi's localhost result is expected: without an existing fresh cache row, there are no Vegagerdin markers to show.

   Important distinction:

   - SQL 80: only needed for feature access key support if Vegagerdin provider is restricted per user.
   - SQL 81: only needed for creating/writing Vegagerdin chat threads.
   - Neither SQL 80 nor SQL 81 populates Vegagerdin current measurements.

2. **Medium: v462 is hard to validate from the product because the main happy path depends on missing data**

   v462 added:

   - provider-neutral `WeatherPulseInline`
   - Vegagerdin detail card pulse preview
   - provider-aware URL state

   Those are good, but Stebbi cannot naturally test them from `/vedrid` until `vegagerdin:vedur2014_1:latest` exists in `weather_cache`.

   The next step should therefore include a data preflight before more UI work:

   - Can the cache be warmed?
   - How many stations were stored?
   - What is `fetchedAtIso`?
   - What is `oldestMeasuredAtIso`?
   - Does `/api/teskeid/weather/vegagerdin/current` return `status: "ok"` afterward?

3. **Low / UX: `Engin gögn` is technically correct but not diagnostic enough while we are integrating**

   On `/vedrid`, `Vegagerðin Engin gögn` does not tell Stebbi whether this is:

   - provider access restriction
   - cache empty
   - cache expired
   - upstream not wired
   - parser produced 0 stations

   We should keep the public UI quiet, but during integration the API response and/or dev-only logs should expose a safe reason such as `cache_unavailable` or `cache_expired`. Do not leak secrets, URLs with secrets, auth state, or raw upstream payload to public responses.

4. **Low: SQL 81 filename in v462 handoff is correct conceptually but test guidance should be sharper**

   SQL 81 exists as:

   `sql/81_teskeid_chat_target_type_vegagerdin_station.sql`

   It extends the chat target type check to include `vegagerdin_station`.

   It is required before signed-in users can write Vegagerdin pulse messages. It is not required for:

   - seeing Vegagerdin current markers
   - reading public Vegagerdin pulse previews
   - opening `/api/teskeid/weather/vegagerdin/current`

## What I verified

Commands run:

```bash
npm run type-check
npm run test:run -- lib/__tests__/overviewSelectionUrl.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts lib/__tests__/pulseTarget.test.ts
```

Results:

- `npm run type-check` -> exit 0
- targeted test run -> exit 0, 4 files, 54 tests passed

No localhost checks run by Codex. No SQL run. No production access. No migration run. No commit/push/deploy.

## Recommended next large step for Claude Code

Goal: make Vegagerdin current stations naturally visible and testable from `/vedrid` without relying on hidden manual DB state.

### Scope A - Add a safe Vegagerdin current cache warmer

Implement a protected cache-warm path that calls `fetchVegagerdinCurrent()` and writes `weather_cache`.

Recommended shape:

```text
GET or POST /api/cron/warm-vegagerdin
```

Access:

- Require `CRON_SECRET` using the same pattern as existing cron routes.
- If an admin/manual button is added, require signed-in admin.
- Public users must never be able to trigger upstream fetches.

Behavior:

- Calls `fetchVegagerdinCurrent()`.
- Returns safe metadata only:
  - `status`
  - station count
  - `fetchedAtIso`
  - `oldestMeasuredAtIso`
  - freshness classification
- Does not return raw upstream response.
- Does not log secrets or raw payload.
- Handles parser returning 0 stations as failure, not success.
- Uses timeout already inside `fetchVegagerdinCurrent()`.

Important approval note:

`fetchVegagerdinCurrent()` makes a real external HTTP request to `gagnaveita.vegagerdin.is`. Claude Code should not run the route, call the function, or perform live upstream fetches without Stebbi explicitly approving that specific external fetch. It is fine to implement the route and tests with mocked fetch.

### Scope B - Add tests around the warmer and current endpoint

Add or extend tests to cover:

- warm route rejects missing/wrong `CRON_SECRET`
- warm route calls fetch helper only when authorized
- successful warm stores payload shape expected by `readVegagerdinCurrentFromCache`
- parser failure / 0 measurements returns safe failure
- `/api/teskeid/weather/vegagerdin/current` returns `status: "ok"` when cache exists
- `/api/teskeid/weather/vegagerdin/current` returns `status: "unavailable"` when cache missing/expired
- restricted env `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true` still gates provider current API correctly

No real network in tests.

### Scope C - Improve safe diagnostics for integration

Keep public UI restrained, but make the API response clearer:

```ts
{ status: 'unavailable', reason: 'cache_unavailable', stations: [] }
```

Possible reason enum:

- `cache_missing`
- `cache_expired`
- `cache_invalid`

If distinguishing these requires too much change, use one safe reason:

- `cache_unavailable`

Update the provider strip/UI only if it helps:

- For public users: keep `Engin gögn`.
- For local/admin/dev only: safe diagnostic may be visible in console or route response.

### Scope D - Validate v462 UI after cache exists

After cache hydration is implemented, validate the actual product path:

1. Warm Vegagerdin cache with approved cron/manual route.
2. Open `/vedrid`.
3. Confirm provider strip no longer says `Engin gögn`.
4. Confirm Vegagerdin markers are visible.
5. Click a Vegagerdin marker.
6. Confirm detail card shows:
   - station name
   - `Vegagerðin` badge
   - current measurement, not forecast wording
   - measured time and fetched time
   - Veðurpúls preview via provider-neutral `WeatherPulseInline`
   - full pulse link with `returnTo`
7. Reload `/vedrid?provider=vegagerdin&stationId=...`.
8. Confirm marker selection is restored.

### Scope E - Do not expand into route-selection overlays yet

Do not spend the next step on more route-selection UI unless Vegagerdin stations are visible on `/vedrid` first.

The fast product-validation path is:

```text
cache warm -> /vedrid provider strip -> Vegagerdin pins -> marker detail -> pulse preview -> full pulse link
```

Route-selection overlays and route-scoped Vegagerdin analysis can follow after this basic path is proven.

## Env and SQL notes for Stebbi

For seeing Vegagerdin current markers on `/vedrid`:

```env
WEATHER_ENABLED=All
WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=
```

or delete `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED`.

If `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true`, public users should not see Vegagerdin current markers unless the product explicitly changes that access model.

Required for warming via cron/manual route:

```env
CRON_SECRET=...
```

Required for writing Vegagerdin pulse messages:

```sql
sql/81_teskeid_chat_target_type_vegagerdin_station.sql
```

Required only if using per-user provider feature access for Vegagerdin:

```sql
sql/80_feature_access_weather_provider_vegagerdin.sql
```

Neither SQL 80 nor SQL 81 will create Vegagerdin current station data.

## Localhost checks for Stebbi

Before Claude changes anything:

1. Open `/api/teskeid/weather/vegagerdin/current`.
   - Expected current state from screenshot: likely `{ "status": "unavailable", "stations": [] }`.
   - This confirms the missing map pins are cache-data related.

After Claude implements the cache warmer, but before any SQL/migration:

1. Ask Claude for the exact localhost warm URL and whether it requires a header or query secret.
2. Only trigger it if you explicitly approve a live external fetch to Vegagerdin.
3. Then open `/api/teskeid/weather/vegagerdin/current`.
   - Expected: `status: "ok"`
   - Expected: `stations.length > 0`
   - Expected: safe metadata present, no raw upstream payload.

Then test `/vedrid`:

1. Open `/vedrid`.
2. Expected: provider strip shows Vegagerdin as available, not `Engin gögn`.
3. Expected: Vegagerdin points visible on the map.
4. Click a Vegagerdin point.
5. Expected: detail card opens with current measurement and pulse preview.
6. Expected: URL updates with `provider=vegagerdin&stationId=...`.
7. Reload the same URL.
8. Expected: same Vegagerdin point reopens.

For chat writing:

1. Do not test sending Vegagerdin pulse messages until SQL 81 has been explicitly run.
2. Preview/read-only can be tested without SQL 81.

## Suggested copy/paste prompt for Claude Code

```text
Workflow

Lestu og rýndu fyrst:
- ai-handoff/2026-07-18-0819-todo-086-v463-codex-v462-review-and-vegagerdin-cache-hydration-next.md
- ai-handoff/2026-07-18-0814-todo-086-v462-claude-v461-done-prerelease.md
- WORKFLOW.md
- Design.md ef þú snertir UI

Markmiðið núna er að gera Vegagerðarpunktana raunverulega sýnilega og prófanlega á /vedrid.

Mikilvægt:
- Ekki keyra SQL.
- Ekki commit-a, push-a eða deploy-a.
- Ekki kalla í live Vegagerðin upstream nema Stebbi samþykki það sérstaklega.
- Það má implementa cron/manual warm route og tests með mockuðu fetchi.

Framkvæmdu stórt en afmarkað skref:

1. Bættu við öruggri, varinni leið til að hita Vegagerðin current cache.
   - Nota CRON_SECRET eða admin-only pattern.
   - Kalla fetchVegagerdinCurrent() aðeins inni í þeirri vörðu leið.
   - Skila eingöngu safe metadata: status, station count, fetchedAtIso, oldestMeasuredAtIso, freshness.
   - Ekki skila raw upstream payload eða secrets.

2. Bættu við eða skerptu diagnostics í /api/teskeid/weather/vegagerdin/current.
   - Ef cache vantar eða er útrunnið, skila status unavailable með safe reason.
   - Halda public UI rólegu: /vedrid má áfram segja Engin gögn þegar cache vantar.

3. Bættu við unit/API tests.
   - Authorized warm success with mocked upstream.
   - Unauthorized warm rejected.
   - Parser failure / 0 measurements fails safely.
   - Current endpoint returns ok when cache exists.
   - Current endpoint returns unavailable when cache is missing/expired.
   - Restricted provider env still gates access correctly.

4. Staðfestu að v462 UI path verði prófanlegur þegar cache er til:
   - /vedrid provider strip
   - Vegagerdin markers
   - marker detail
   - WeatherPulseInline preview
   - provider-aware URL restore

5. Ekki fara í route-selection provider overlays í þessu skrefi nema allt hér að ofan sé komið og áhættan sé lítil.

Skilaðu handoff strax eftir framkvæmd með:
- hvað var gert
- hvaða skrár breyttust
- hvaða tests voru keyrð
- hvort SQL 80/81 var aðeins óhreyft
- nákvæmum Localhost checks fyrir Stebba, þar með talið að cache warm krefjist explicit samþykkis til live external fetch.
```

## Óvissa / þarf að staðfesta

- Codex staðfesti ekki raunverulegt upstream response frá Vegagerdin. Það má ekki gera án skýrs samþykkis frá Stebba.
- Codex staðfesti ekki hvort production eða local Supabase `weather_cache` inniheldur gamla Vegagerdin cache færslu. Screenshotið bendir sterklega til að hún sé ekki til eða sé útrunnin.
- Ef Stebbi vill að `/vedrid` "geri þetta sjálft" án cron/manual warm, þarf sérstaka product ákvörðun um hvort public page má triggera upstream fetch. Ég mæli ekki með því sem fyrsta leið; byrja á cron/admin/manual warm með anti-stampede.
