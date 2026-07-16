# TODO 086 v076 - Claude: Phase 2B4 cache-to-product projector done

Created: 2026-07-13 15:11
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input: `2026-07-13-1503-todo-086-v075-codex-v074-projector-review.md`

## What was done

### Commit: `dbbf432`

Three files added/modified:

---

### `lib/weather/providers/vedurstofan.server.ts`

Added `FOREC_CACHE_KEY_PREFIX` constant (used by `cacheKeyForStation` internally and by the projector for scanning).

Added new exported function and type:

```ts
export type VedurstofanProjectionResult = {
  projected: number
  skipped: number
  errors: number
  runId: number | null
}

export async function projectVedurstofanCacheToProductTables(): Promise<VedurstofanProjectionResult>
```

**Behavior:**

1. Scans `weather_cache` via `.like('cache_key', 'vedurstofan:xml:forec:is:3h:F-D-T-R-W:%')`
2. For each row: validates `source='vedurstofan'`, `type='forec'`, `stationId` string, `forecasts.length > 0`
3. Invalid/empty: counted as `skipped`, product tables untouched
4. Valid: delete existing `vedurstofan_forecasts_latest` rows for that `station_id`, then insert new set
5. Delete/insert error: counted as `errors`, does not affect other stations (fail-open)
6. Maps `atimeIso → atime`, `expiresAtIso → expires_at`, `fetchedAtIso → fetched_at`
7. Writes one `weather_fetch_runs` row: `source='vedurstofan'`, `fetch_type='forec'`, counts
8. Never makes live HTTP requests. Never throws.

Private helper `writeRunRecord()` handles the fetch run insert.

---

### `app/api/admin/weather/project-vedurstofan/route.ts`

POST-only route. Uses `requireAdmin(supabase)` (existing admin auth). Calls `projectVedurstofanCacheToProductTables()` and returns JSON summary:

```json
{ "projected": 12, "skipped": 0, "errors": 0, "runId": 1 }
```

No GET handler. No raw payload returned.

---

### `lib/__tests__/weather-vedurstofan-projector.test.ts`

20 unit tests in 4 describe blocks:

- **cache key prefix**: correct prefix used in scan, no `fetch()` called
- **validation**: skips null, wrong source, wrong type, empty forecasts; never deletes on skip
- **projection**: correct counts, delete-before-insert order, `atime`/`expires_at`/`fetched_at` fields, full field mapping
- **error handling**: cache scan failure, delete failure, insert failure, fail-open (one station error doesn't stop others), exception handling
- **weather_fetch_runs**: run record written, `runId` returned, null `runId` on run insert failure, projection result preserved regardless

---

## Test results

```
npm run test:run -- lib/__tests__/weather-vedurstofan-projector.test.ts
                    lib/__tests__/weather-vedurstofan-server.test.ts
                    lib/__tests__/sql-migration.test.ts
Tests: 216 passed (216)
Exit code: 0

npm run type-check
Exit code: 0
```

---

## What is NOT done (pending separate approval)

- Elta veðrið release (push)
- Live background warmer: fetch all 280 stations in background, write to product tables
- `type=obs` observation parser and `vedurstofan_observations_latest` population
- UI switch: Elta veðrið reading from `vedurstofan_forecasts_latest` instead of `weather_cache`
- Travel route: converting live Veðurstofan enrichment to product-table reads
- Cron job for scheduled projection/refresh

---

## Localhost checks for Stebbi

1. Open `/auth-mvp/vedrid/elta-vedrid` — confirm still loads (UI unchanged).
2. Call `POST /api/admin/weather/project-vedurstofan` as admin user (e.g. via curl or Postman with session cookie):
   ```
   POST https://localhost:3000/api/admin/weather/project-vedurstofan
   ```
   Expect JSON: `{ projected: N, skipped: M, errors: 0, runId: K }`
3. Confirm `vedurstofan_forecasts_latest` has rows in Supabase (for stations that were in `weather_cache`).
4. Confirm `weather_fetch_runs` has one row.
5. Confirm `/auth-mvp/vedrid` still works.

Do not run live warmer, cron, or migrate obs tables without separate approval.
