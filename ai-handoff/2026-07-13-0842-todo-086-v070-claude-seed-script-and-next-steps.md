# TODO 086 v070 - Claude: seed script ready, asking Codex for next step guidance

Created: 2026-07-13 08:42
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input:
- `2026-07-13-0758-todo-086-v069-claude-v068-done.md`
- `2026-07-13-0754-todo-086-v068-codex-sql74-product-tables-review.md`

## State of the world

### What is done and committed

- `sql/74_vedurstofan_product_tables.sql` — committed, run by Stebbi. Four empty service-role tables now exist in Supabase:
  - `vedurstofan_stations`
  - `vedurstofan_forecasts_latest`
  - `vedurstofan_observations_latest`
  - `weather_fetch_runs`

- `lib/__tests__/sql-migration.test.ts` — 13 new static tests for sql/74, all passing (171/171).

- Commit: `fece243`

### What is written but NOT yet run

- `scripts/seed-vedurstofan-stations.mjs` — seeds `vedurstofan_stations` from the 280-station `VEDURSTOFAN_STATIONS_REGISTRY`.

  Run with:
  ```bash
  node scripts/seed-vedurstofan-stations.mjs
  ```

  - Reads `.env.local` for `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
  - Parses `lib/weather/providers/vedurstofanStationsRegistry.ts` (array literal is valid JS, uses `new Function()`)
  - Upserts all 280 rows with `onConflict: 'station_id'` — safe to re-run
  - Skips entries where `stationId === null` (none expected — all 280 have IDs)
  - Prints parsed count, upsert count, and any error

### What is NOT done yet

The following all need separate explicit approval from Stebbi before any implementation:

1. **Run the seed script** — Stebbi runs `node scripts/seed-vedurstofan-stations.mjs`
2. **Cache warmer for `vedurstofan_forecasts_latest`** — background job that reads `weather_cache` (or does live fetch) and populates forecast rows per station. Requires design decision: read from `weather_cache` first (no live Veðurstofan calls) or live-fetch all 280 stations.
3. **`type=obs` observation parser** — parses Veðurstofan XML `type=obs` into structured obs rows. Units to be confirmed (V=meters, R=mm assumed, not yet verified).
4. **Convert travel route** — `app/api/teskeid/weather/travel/route.ts` still live-fetches Veðurstofan in the request path. Converting to read from `vedurstofan_forecasts_latest` is a later phase.
5. **Cron job** — scheduled background refresh of all 280 stations. Separate implementation step.
6. **Elta veðrið release** — Codex v066 said v064 looks good for release. Has not been released yet (no push since commit `b775316`).

## Open architecture questions for Codex

1. **Should the seed script be run before or after review?**
   The script is straightforward (upsert only, no schema changes) but Codex may want to review it first.

2. **Cache warmer design choice:**
   - Option A: Read from `weather_cache` only — no live Veðurstofan calls. Fast, safe, no external dependency. Populates whatever is already cached.
   - Option B: Live-fetch all 280 stations in background — gets fresh data immediately. Slower, depends on Veðurstofan uptime.
   - Option C: Try `weather_cache` first, fall back to live fetch for misses — hybrid, more complex.

3. **Is Elta veðrið ready to push/release now?**
   Codex v066 approved v064 for Elta veðrið release. Since then: sql/73 run, sql/74 written and run, seed script written. None of those changes affect the Elta veðrið UI or API. The UI still reads from `weather_cache` via `readVedurstofanCacheForStations`. Should Stebbi push and release now, or wait until more of the product-table pipeline is in place?

4. **Next implementation priority:**
   Given the current state (tables empty, seed not run, no cache warmer), what should Claude Code work on next? Options:
   - Seed script review + run
   - Cache warmer design + implementation
   - Elta veðrið release
   - Something else

## Current git state

```
Branch: main
Latest commits:
  fece243 feat: Veðurstofan product tables migration and static tests (#86)
  b775316 Fix: cache-only API, full registry metadata in UI
  56ad2d5 Phase 2B1 expand to 280 official stations
  a662362 Phase 2B0 elta-vedrid station explorer with feature flag (#86)
```

Modified but uncommitted (unrelated to TODO 086):
- `TODO.md`, `WORKFLOW.md`, `app/auth-mvp/vedrid/page.tsx`
- `lib/__tests__/weather-trip-assessment.test.ts`, `lib/__tests__/weather-trip.test.ts`
- `lib/weather/trip-assessment.ts`, `lib/weather/trip.ts`

These are from other TODO work and should not be touched here.
