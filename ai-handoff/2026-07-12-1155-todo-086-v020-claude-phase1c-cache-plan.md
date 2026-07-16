# TODO 086 - Claude Code Phase 1C cache-first architecture plan

Created: 2026-07-12 11:55
Timezone: Atlantic/Reykjavik
Author: Claude Code
Type: Plan / review - no code changes

Read:
- `ai-handoff/2026-07-12-1137-todo-086-v018-codex-v017-station-expansion-review.md`
- `ai-handoff/2026-07-12-1143-todo-086-v019-codex-phase1c-cache-architecture-addendum.md`
- `sql/67_weather_cache.sql`
- `lib/weather/metno.server.ts`

No code was changed. No SQL, Supabase, commit, push or deploy.

---

## Corrections from v018

v018 (Codex) correctly flagged that my v017 review used `vedurstofan:{stationId}` as a shorthand cache key. This must not become implementation. Acknowledged. The plan below uses the correct key shape throughout.

---

## Answers to v019 questions

### 1. Cache-first wrapper reading from `weather_cache` first

Yes. Same pattern as `metno.server.ts`: check cache first, return immediately if fresh, only fetch on miss/stale, upsert after successful fetch, return stale if fetch fails.

### 2. Does `weather_cache` support Veðurstofan without schema changes?

Yes, no SQL migration needed. The existing schema handles everything:

```sql
cache_key    text PRIMARY KEY          -- station/shape-specific key
response_body jsonb NOT NULL           -- parsed JSONB, not raw XML
expires_at   timestamptz NOT NULL      -- computed from TTL
last_modified text                     -- not used for Veðurstofan XML; store null
fetched_at   timestamptz NOT NULL      -- set to now() on upsert
updated_at   timestamptz NOT NULL      -- set to now() on upsert
```

`response_body` is `jsonb NOT NULL`. We parse XML to a typed JS object in Phase 1A and store that as JSONB. This is exactly the intended use. No column additions, no new table, no migration.

### 3. Cache key

Do not use `vedurstofan:{stationId}`. Use:

```
vedurstofan:xml:forec:is:3h:F-D-T-R-W:{stationId}
```

This encodes all response-shape dimensions: source, transport format, type (forec vs obs), language, time step, param set, and station. Consistent with MET key pattern `metno:locationforecast:2.0:compact:{lat}:{lon}`.

Define as a constant function:

```ts
function cacheKey(stationId: string): string {
  return `vedurstofan:xml:forec:is:3h:F-D-T-R-W:${stationId}`
}
```

### 4. Parsed JSONB payload shape

The attribution and `fetchedAtIso` fields must be present in every cached payload, even before UI. This makes freshness and provenance auditable later without a schema migration. The `FG`/`FX` fields from Phase 1A are parsed but must not be used in scoring.

```ts
type VedurstofanStationForecastCache = {
  source: 'vedurstofan'
  endpoint: 'xml'
  type: 'forec'
  lang: 'is'
  timeStep: '3h'
  params: ['F', 'D', 'T', 'R', 'W']
  stationId: string
  stationName: string
  fetchedAtIso: string
  expiresAtIso: string
  attribution: {
    provider: 'Veðurstofa Íslands'
    downloadedAtIso: string
    serviceUrl: string
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

Note: `rawR` is preserved in Phase 1A's parser output for debugging but does not need to be stored in cache. `parseErrors` should be stored so stale-cache consumers can see if the fetch was clean.

### 5. Missing/stale/fetch-failure/stale-fallback behavior

Follow the same three-case pattern as `metno.server.ts`:

| State | Behavior |
|---|---|
| Cache hit, not expired | Return cached payload immediately, no fetch |
| Cache miss or expired, fetch succeeds | Parse XML, upsert cache, return fresh payload |
| Cache miss or expired, fetch fails | Return stale payload if available; return `null` per station if no cache; never throw |

"Return null" per station means the route result has no Veðurstofan data for that station and can note it as unavailable. This must not propagate as an exception or touch MET/Yr pipeline.

Phase 1C does not raise errors to the caller for Veðurstofan failures. It logs and returns `null`.

### 6. Cron/prewarm in Phase 1C or Phase 1D?

Phase 1D. Phase 1C is on-demand cache-fill only.

Reasons to defer:
- Cron introduces deployment config (Vercel Cron, Supabase scheduled function, or internal admin route).
- It needs separate permission scope from Stebbi.
- Phase 1C on-demand fill is enough to prove Phase 1C value before investing in scheduled warming.
- Prewarm may be unnecessary if most `/vedrid` routes share a small number of stations with reasonable cache-hit rates.

Phase 1D can add a scheduled warmer if on-demand latency proves unacceptable or Veðurstofan reachability proves unreliable.

### 7. TTL

Veðurstofan XML service does not guarantee an `Expires` header with the same semantics as MET. Use a fixed conservative TTL of **90 minutes**, documented as a Veðurstofan-specific choice:

- Veðurstofan 3h-step forecasts update less frequently than MET point forecasts.
- 90 min is conservative: multiple cache hits per forecast cycle, low fetch pressure.
- If the XML response provides a trustworthy `Expires` header, it can be parsed in a later phase.

This is not "aligned with MET behavior". It is independently justified for Veðurstofan. Document this in code.

---

## Public API shape for Phase 1C

A single server-only function:

```ts
// lib/weather/providers/vedurstofan.server.ts
import 'server-only'

export type VedurstofanStationResult =
  | { status: 'ok'; payload: VedurstofanStationForecastCache }
  | { status: 'stale'; payload: VedurstofanStationForecastCache }
  | { status: 'unavailable' }

export async function fetchVedurstofanForecastsForStations(
  stationIds: string[],
): Promise<Map<string, VedurstofanStationResult>>
```

- Input: explicit station IDs only (not lat/lon). Derived from `getUniqueStationIdsForRoute()` by the caller.
- Filter input to `coordinatesVerified === true` stations from `VEDURSTOFAN_STATIONS` before fetching. Caller passes IDs; Phase 1C checks they are in the verified list.
- Returns a `Map<stationId, result>` so callers can look up per-station status without post-processing.
- `status: 'stale'` means the cache existed but was expired and the live fetch failed.
- `status: 'unavailable'` means no cache and fetch failed, or stationId not in verified list.

The `status` field lets the comparison layer (Phase 2) display freshness metadata without inspecting timestamps.

---

## Fetch batching

- Max 10 station IDs per HTTP request to `xmlweather.vedur.is`.
- Batch URL format: `https://xmlweather.vedur.is/?op_w=xml&type=forec&lang=is&view=xml&time=3h&ids={id1};{id2};...&params=F;D;T;R;W`
- If a batch request returns parse errors for some stations, store what was successfully parsed; mark others as `unavailable`.
- Station IDs not returned by the XML service (missing `<forecast>` element for that ID) are silently treated as `unavailable`.

---

## What Phase 1C does NOT include

- No `route.ts`, `assessment.ts`, `travel.ts`, or `trip-assessment.ts` changes.
- No user-visible UI or route result changes.
- No shadow comparison logic.
- No cron, Vercel Cron, Supabase function, or scheduled warming.
- No SQL migration or schema changes.
- No `If-Modified-Since` / `304` handling — not supported by Veðurstofan XML service.
- No use of `FG`/`FX` for scoring.
- No per-lat/lon fetch — station IDs only.

---

## Tests Phase 1C needs

All tests must use fixtures, no live network calls:

1. Cache hit, fresh: returns cached payload without fetch.
2. Cache miss: fetches, parses, upserts, returns fresh payload.
3. Cache expired, fetch succeeds: upserts fresh, returns fresh.
4. Cache expired, fetch fails: returns stale payload.
5. No cache, fetch fails: returns `unavailable`.
6. Batch split: 12 station IDs split into two batches of <=10.
7. Unverified stationId filtered out: station not in `coordinatesVerified === true` list returns `unavailable` without a fetch.
8. Partial batch parse error: successful stations returned, failed station `unavailable`.
9. Cache key matches expected pattern `vedurstofan:xml:forec:is:3h:F-D-T-R-W:{stationId}`.
10. Attribution and `fetchedAtIso` present in every cached payload.

---

## Supabase / RLS / production risks

- `weather_cache` is service-role only, no public/anon/authenticated access. Same as MET.
- No RLS policy change needed.
- No new table, no migration, no Supabase schema change.
- No env var needed beyond what already exists (`SUPABASE_SERVICE_ROLE_KEY` via `getAdmin()`).
- Optional: add `VEDURSTOFAN_ENABLED=true` as a server-only flag so Phase 1C fetches never run unless explicitly enabled. This prevents accidental live calls in CI/CD or preview deployments.

---

## Implementation files for Phase 1C

Only one new file:

```
lib/weather/providers/vedurstofan.server.ts
```

And one new test file:

```
lib/__tests__/weather-vedurstofan-server.test.ts
```

No other files touched.

---

## Phase summary

| Phase | Status | Files |
|---|---|---|
| 1A | Done | `vedurstofanXml.ts`, `weather-vedurstofan-xml.test.ts` |
| 1B | Done | `vedurstofanStations.ts`, `weather-vedurstofan-stations.test.ts` |
| 1C | Awaiting permission | `vedurstofan.server.ts`, `weather-vedurstofan-server.test.ts` |
| 1D | Not planned yet | Scheduled cache warmer |
| 2 | Not planned yet | Shadow comparison + UI layer |

---

## Localhost checks for Stebbi

This handoff changes nothing. No code changed.

For current Phase 1A+1B state:

1. `npm run test:run -- lib/__tests__/weather-vedurstofan-xml.test.ts` — expect 28 pass.
2. `npm run test:run -- lib/__tests__/weather-vedurstofan-stations.test.ts` — expect 21 pass.
3. `npm run type-check` — expect clean.
4. Open `/vedrid` on localhost and calculate a route — no change in behavior, no Veðurstofan network calls.

Phase 1C implementation requires explicit Stebbi permission before any code is written.
