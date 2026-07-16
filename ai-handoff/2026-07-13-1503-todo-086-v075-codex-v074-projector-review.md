# TODO 086 v075 - Codex review of v074 cache-to-product projector proposal

Created: 2026-07-13 15:03
Timezone: Atlantic/Reykjavik
Agent: Codex
Input: `2026-07-13-1500-todo-086-v074-claude-seed-done-next-step-proposal.md`

## Findings

### P1 - Correct the weather_cache assumptions before implementation

`lib/weather/providers/vedurstofan.server.ts:13`, `lib/weather/providers/vedurstofan.server.ts:91-92`, `lib/weather/providers/vedurstofan.server.ts:115-127`

v074 asks whether the key format is confirmed and suggests keys like:

```text
vedurstofan:forec:{stationId}
```

That is not the current key format. The current format is:

```text
vedurstofan:xml:forec:is:3h:F-D-T-R-W:{stationId}
```

Also, `weather_cache.response_body` for Veðurstofan does not store raw XML. It stores the parsed `VedurstofanStationForecastCache` payload:

- `stationId`
- `stationName`
- `atimeIso`
- `fetchedAtIso`
- `expiresAtIso`
- `forecasts[]`
- `parseErrors[]`

So Phase 2B4 should **not** parse XML from `weather_cache`. It should read the structured cached payload and project `payload.forecasts` into `vedurstofan_forecasts_latest`.

Recommended implementation wording:

- select `weather_cache` rows where `cache_key LIKE 'vedurstofan:xml:forec:is:3h:F-D-T-R-W:%'`
- validate `response_body` has `source='vedurstofan'`, `type='forec'`, `stationId`, `forecasts`
- map existing payload fields into product rows
- set `expires_at` from `payload.expiresAtIso`
- set `fetched_at` from `payload.fetchedAtIso`
- set `atime` from `payload.atimeIso`

### P2 - Projection should replace per-station forecast rows, not only upsert

`sql/74_vedurstofan_product_tables.sql:66-84`

The table comment says old rows for a station are deleted and replaced on refresh. That matters.

If the projector only upserts `(station_id, forecast_time)`, old forecast rows can linger when a station's newer payload has fewer or different `forecast_time` values. For a `latest` table, stale extra rows are misleading.

Recommended per-station behavior:

1. Validate payload first.
2. Build all rows for that station.
3. Delete existing `vedurstofan_forecasts_latest` rows for that `station_id`.
4. Insert/upsert the new set.
5. If validation fails, do not delete existing rows for that station.

This keeps stale product rows from accumulating while still preserving old product data when the current cache payload is unusable.

### P2 - Do not update `vedurstofan_stations.synced_at` during forecast projection

`sql/74_vedurstofan_product_tables.sql:52-53`

`synced_at` on `vedurstofan_stations` should mean "registry metadata synced from the station registry." Forecast projection is a different lifecycle.

For forecast freshness, use:

- `vedurstofan_forecasts_latest.fetched_at`
- `vedurstofan_forecasts_latest.expires_at`
- `weather_fetch_runs.started_at/finished_at`

If we later want per-station product refresh metadata, add an explicit field or table such as `last_forecast_projected_at`; do not overload registry `synced_at`.

### P2 - Admin API route is okay only if it follows existing admin auth and is not public/manual-by-obscurity

v074 proposes:

```text
app/api/teskeid/admin/weather/project-vedurstofan/route.ts
```

This route must use the existing admin auth pattern, likely `requireAdmin` from `lib/teskeid/admin-auth.ts`, not only feature flags or a hidden URL. It should be POST-only, return summary counts, and avoid returning raw payloads or secrets.

It is also acceptable to skip the admin route initially and implement only a server function plus tests, then add route/manual trigger in a follow-up.

### P3 - Add tests around projection contracts before any manual trigger

The implementation should add focused unit tests for:

- selecting the real cache prefix `vedurstofan:xml:forec:is:3h:F-D-T-R-W:%`
- projecting parsed cached payloads, not XML strings
- setting `atime`, `fetched_at`, `expires_at`
- deleting existing rows for a station only after payload validation succeeds
- recording `weather_fetch_runs` success/failure counts
- fail-open behavior if one station payload is malformed
- no live `fetch()` calls

## Answers to v074 open questions

### 1. Is `weather_cache` key format confirmed?

Yes. The current key format is:

```text
vedurstofan:xml:forec:is:3h:F-D-T-R-W:{stationId}
```

Use `cacheKeyForStation(stationId)` when working station-by-station. For scanning cache rows, use the matching prefix:

```text
vedurstofan:xml:forec:is:3h:F-D-T-R-W:
```

Also note: cached body is parsed JSON, not raw XML.

### 2. Should the projector update `vedurstofan_stations.synced_at`?

No. Keep `synced_at` for registry metadata sync only.

Use forecast table timestamps and `weather_fetch_runs` for forecast/product refresh tracking.

### 3. Elta veðrið release timing

Elta veðrið can still release independently if Stebbi wants the feature-gated validation UI now.

Reasons:

- Current Elta UI does not depend on `vedurstofan_forecasts_latest`.
- It is feature-gated.
- Station registry and product table seed are now in place.

But set expectations: until cache warmer/product projector/live refresh work is finished, many stations can still show missing/unavailable forecast data depending on `weather_cache`.

### 4. Should UI eventually read from `vedurstofan_forecasts_latest`?

Yes, eventually.

But not in the first projector patch. Recommended order:

1. Build projector.
2. Prove product table rows are correct.
3. Add read API/helper for product tables.
4. Switch Elta veðrið to product tables behind the existing feature gate.
5. Later convert travel route away from live Veðurstofan request-path fetch.

## Recommended next Claude Code scope

Codex agrees Phase 2B4 is the right next technical direction, with corrected scope:

- Build cache-to-product projector.
- No live Veðurstofan HTTP calls.
- No cron.
- No UI switch yet.
- No new SQL migration.
- Add tests.
- Use parsed cached payloads and the real cache key prefix.
- Write `weather_fetch_runs`.

If Claude Code wants to expose a manual trigger, prefer a POST admin route using existing `requireAdmin`, and keep the route out of normal user flows.

## Verification run by Codex

Codex inspected:

- `lib/weather/providers/vedurstofan.server.ts`
- `lib/__tests__/weather-vedurstofan-server.test.ts`
- existing admin route/auth references

Codex ran:

```bash
npm run test:run -- lib/__tests__/weather-vedurstofan-server.test.ts lib/__tests__/sql-migration.test.ts lib/__tests__/weather-vedurstofan-registry.test.ts
```

Result:

- Exit code: 0
- 3 files passed
- 221 tests passed

Codex ran:

```bash
npm run type-check
```

Result:

- Exit code: 0
- TypeScript clean

Codex did not run Supabase writes, migrations, cron, deploy, or live Veðurstofan fetches.

## Localhost checks for Stebbi

No browser check is needed for the projector plan before implementation.

After implementation, Stebbi should test:

1. Trigger projector only through the approved manual route/script.
2. Confirm it does not call live Veðurstofan.
3. Confirm `weather_fetch_runs` gets one `source='vedurstofan'`, `fetch_type='forec'` row.
4. Confirm `vedurstofan_forecasts_latest` gets rows only for stations that had valid `weather_cache` payloads.
5. Confirm `/auth-mvp/vedrid/elta-vedrid` still loads.
6. Confirm regular `/auth-mvp/vedrid` still works.

Do not add cron or switch UI/travel route to product tables until a separate review.

## Bottom line

Yes, Phase 2B4 is the right next step, but v074's implementation assumptions need correction:

- real cache key prefix is `vedurstofan:xml:forec:is:3h:F-D-T-R-W:`
- cache body is already parsed JSON, not XML
- projection should replace per-station rows after validation
- station registry `synced_at` should not be updated by forecast projection

With those corrections, Claude Code can safely plan/implement the no-live-call projector.
