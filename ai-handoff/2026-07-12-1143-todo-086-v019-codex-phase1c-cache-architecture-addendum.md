# TODO 086 - Phase 1C cache architecture addendum

Created: 2026-07-12 11:43
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Architecture handoff / workflow-safe addendum for Claude Code

## Workflow Reminder

Stebbi has not given Claude Code or Codex permission to implement Phase 1C yet.

This handoff is advisory only:

- It may be sent to Claude Code for review/planning.
- It is not permission to change code.
- It is not permission to write SQL or migrations.
- It is not permission to run Supabase operations.
- It is not permission to commit, push or deploy.

Per `WORKFLOW.md`, Claude Code should respond with a plan/review unless Stebbi explicitly says something like:

```text
Claude Code, framkvæmdu Phase 1C ...
```

If Stebbi only sends this filename or asks Claude Code to review it, that means review only.

## Context

Stebbi raised a product/architecture idea after Codex wrote:

- `ai-handoff/2026-07-12-1137-todo-086-v018-codex-v017-station-expansion-review.md`

Stebbi has **not** sent v018 to Claude Code yet.

Stebbi's idea:

Instead of every user or route request calling Veðurstofan directly, Teskeið could store Veðurstofan values in Supabase, update them periodically, and build route results from Teskeið's own cached data.

Codex agrees this should be folded into the next Claude Code handoff before Phase 1C implementation starts.

Recommendation:

- Do not send v018 alone as the next instruction to Claude Code.
- Send v019, or send v018 plus v019 together, so Claude Code reviews the Phase 1C cache model with this architecture direction included.

## Official Source Constraints

Codex checked the official Veðurstofa pages in the prior turn:

- XML service overview: https://www.vedur.is/um-vi/vefurinn/xml/
- Terms of use: https://www.vedur.is/um-vi/vefurinn/notkunarskilmalar/

Important points:

- The XML service is free/open and does not require registration.
- It provides station forecasts, observations and text forecasts in XML/RSS/CSV.
- The XML service does not update as quickly as the website.
- Station changes and forecast-type changes are not announced individually to users.
- Veðurstofan terms allow use of data unless otherwise stated, including commercial use, but require attribution of source and when the data was downloaded if data is displayed/used in publication, presentation or development.
- Veðurstofan does not guarantee uninterrupted access, freshness or fitness for a specific purpose.

Implication for Teskeið:

- Storing parsed Veðurstofan data in Teskeið cache is reasonable.
- We should preserve source attribution and download/fetch timestamps in cached payloads.
- We should not rely on Veðurstofan being available for every live user request.
- We should make cached-data freshness explicit in metadata before anything becomes user-visible.

## Architecture Direction

Codex recommends shifting Phase 1C from:

```text
route request fetches Veðurstofan as needed
```

to:

```text
Teskeið owns a central cache of latest parsed Veðurstofan forecasts.
Route/weather logic reads from Teskeið cache.
Fetch code fills missing/stale station forecasts in a controlled way.
```

This is better for:

- reducing load on Veðurstofan;
- protecting Teskeið from Veðurstofan downtime or rate limiting;
- improving route-request latency;
- making freshness and source metadata consistent;
- enabling a future scheduled cache warmer.

## Recommended V1 Data Model

Use existing `weather_cache` if possible. Do not write SQL unless a later review proves the existing table cannot safely support the payload.

V1 should upsert latest parsed forecast per station and cache-shape, not append endless history.

Suggested parsed JSONB payload shape:

```ts
type VedurstofanStationForecastCache = {
  source: 'vedurstofan'
  endpoint: 'xml'
  type: 'forec'
  lang: 'is'
  view: 'xml'
  timeStep: '3h'
  params: ['F', 'D', 'T', 'R', 'W']
  stationId: string
  stationName: string
  fetchedAtIso: string
  atimeIso: string | null
  expiresAtIso: string
  sourceUrl: string
  attribution: {
    provider: 'Veðurstofa Íslands'
    downloadedAtIso: string
    url: string
  }
  forecasts: Array<{
    ftimeIso: string
    windSpeedMs: number | null
    windDirectionText: string | null
    temperatureC: number | null
    precipitationMmPerHour: number | null
    weatherText: string | null
  }>
  parseErrors: string[]
}
```

Do not use history/snapshot append in v1 unless Claude Code gives a strong reason. History can be a later feature for forecast-quality auditing or comparing forecasts to observations.

## Cache Key Guardrail

Do not use:

```text
vedurstofan:{stationId}
```

It is too broad and could collide when adding observations, text forecasts, 6h forecasts, English responses, or different params.

Use a source/endpoint/type/lang/timeStep/params/station-specific key, for example:

```text
vedurstofan:xml:forec:is:3h:F-D-T-R-W:{stationId}
```

Equivalent constants are fine, but the key must encode the response shape.

## Fetch And Cache Flow

Recommended Phase 1C flow:

1. Input: explicit station IDs, ideally derived from `getUniqueStationIdsForRoute()` or passed directly in tests.
2. Filter station metadata to `coordinatesVerified === true`.
3. Read cached rows from `weather_cache`.
4. Return fresh cache immediately when not stale.
5. For missing/stale station IDs, batch live fetches to `xmlweather.vedur.is`.
6. Batch max: 10 station IDs per request.
7. Parse XML with existing `parseVedurstofanXml()`.
8. Upsert parsed JSONB per station/cache key.
9. If live fetch fails, return stale cache if available.
10. If no cache and fetch fails, return unavailable/partial provider result, not an exception that can break MET/Yr.

This keeps Veðurstofan optional and fail-open.

## Scheduled Cache Warmer

Stebbi's idea of a periodic job is good, but it should probably not be Phase 1C's first implementation unless Claude Code can keep it very small and local/flagged.

Recommended sequencing:

### Phase 1C

- Implement cache-first fetch/cache wrapper.
- It can fill missing/stale stations on demand.
- No route/UI integration.
- No cron yet unless separately approved.

### Phase 1D

- Add scheduled/prewarm design.
- Decide runtime:
  - Vercel Cron hitting an internal route;
  - Supabase scheduled function;
  - manual/admin-only refresh;
  - or no cron until shadow comparison proves value.
- Add explicit rate limits and batch pacing.
- Keep it server-only and fail-open.

Why not jump straight to cron:

- It introduces deployment/runtime config.
- It may touch env, auth, Vercel, Supabase or internal admin route design.
- It needs separate permission and review.

## Important Non-Goals For Phase 1C

Do not include:

- No user-visible UI.
- No route result changes.
- No `route.ts` integration unless Stebbi separately approves.
- No `assessment.ts`, `travel.ts`, or `trip-assessment.ts` changes.
- No SQL/migration unless separately approved.
- No direct per-route-point fetches.
- No endless appended history table.
- No use of gusts/FG/FX for scoring.
- No production cron/deploy without explicit approval.

## What Claude Code Should Review Next

Claude Code should review whether Phase 1C can be implemented using existing `weather_cache` safely.

Specific questions:

1. Does `weather_cache` support storing parsed Veðurstofan station forecast JSONB without schema changes?
2. Should Phase 1C expose a single function like `fetchVedurstofanForecastsForStations(stationIds)` or split cache read and fetch refresh into separate helpers?
3. What exact TypeScript result shape should route-shadow later consume without touching current MET/Yr scoring?
4. What stale-cache behavior should be returned when live Veðurstofan fetch fails?
5. Should the first implementation include a manual/admin refresh helper, or leave all warming to later Phase 1D?
6. What TTL is safest: upstream `Expires` if trustworthy, otherwise a fixed conservative fallback?
7. Should attribution/download timestamp be included in every station cache payload now, even before UI?

## Suggested Message To Claude Code

```md
Claude Code, vinsamlegast rýndu TODO 086 Phase 1C út frá nýrri cache-architecture pælingu Stebba.

Ekki framkvæma kóðabreytingar enn.

Stebbi vill skoða hvort Teskeið eigi að vista Veðurstofu-gögn hjá okkur, líklega í Supabase/weather_cache, og byggja niðurstöður á okkar cached gögnum í stað þess að hver notandi eða route request kalli beint í Veðurstofuna.

Lestu:
- `ai-handoff/2026-07-12-1137-todo-086-v018-codex-v017-station-expansion-review.md`
- `ai-handoff/2026-07-12-1143-todo-086-v019-codex-phase1c-cache-architecture-addendum.md`

Skilaðu review/plan handoff sem svarar:
1. Hvort Phase 1C eigi að vera cache-first wrapper sem les fyrst úr `weather_cache`.
2. Hvort núverandi `weather_cache` dugi án SQL/migration.
3. Nákvæmu cache key formi, ekki `vedurstofan:{stationId}` heldur source/endpoint/type/lang/timeStep/params/station-specific key.
4. Hvaða parsed JSONB payload shape á að geyma, með attribution og `fetchedAtIso`.
5. Hvernig missing/stale/fetch-failure/stale-fallback hegðun á að vera.
6. Hvort cron/prewarm eigi að bíða í Phase 1D eða vera hluti af Phase 1C.
7. Hvaða tests þarf.
8. Hvaða Supabase/RLS/production/deployment áhætta er til staðar.
9. Localhost checks for Stebbi.

Engar kóðabreytingar, engin SQL, engin Supabase keyrsla, engin env-breyting, enginn commit, push eða deploy nema Stebbi gefi skýrt framkvæmdarleyfi síðar.
```

## Recommendation

Codex recommendation:

- Send v019 to Claude Code before implementation.
- v018 is still useful, but v019 supersedes it as the next planning context because it includes Stebbi's cache/prewarm idea.
- Ask Claude Code for review/plan only.
- Do not approve Phase 1C implementation until Claude Code has answered the cache-first vs cron/prewarm split.

## Localhost Checks For Stebbi

This handoff changes no user-visible product behavior.

No localhost testing is required for this handoff itself.

For current TODO 086 code state, if Stebbi wants a smoke check:

1. Run `npm run test:run -- lib/__tests__/weather-vedurstofan-stations.test.ts`.
2. Expected: 21 tests pass.
3. Run `npm run type-check`.
4. Expected: TypeScript passes.
5. Open `/vedrid` on localhost and calculate a familiar route.
6. Expected: behavior is unchanged and no Veðurstofan network calls happen.

Do not test by repeatedly hitting `xmlweather.vedur.is`. Live fetching, cache warming, Supabase storage, cron, env, deployment and production behavior require separate explicit approval.

## Óvissa / Þarf Að Staðfesta

- Codex has not checked the actual deployed Supabase table at runtime, only the repository schema and previous handoffs.
- The best TTL for Veðurstofan station forecasts still needs a Phase 1C decision.
- Scheduled warming may involve Vercel/Supabase deployment configuration and should not be bundled into implementation without explicit approval.
