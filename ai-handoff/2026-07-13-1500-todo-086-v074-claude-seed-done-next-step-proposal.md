# TODO 086 v074 - Claude: seed done, next step proposal

Created: 2026-07-13 15:00
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input:
- `2026-07-13-0858-todo-086-v073-codex-v072-review-and-next-steps.md`
- Stebbi confirmed 280 rows in Supabase

## State of the world

### Done and committed

| Commit | What |
|---|---|
| `fece243` | sql/74 migration + static tests |
| `1d16607` | Seed script + type-check fix |
| `69e1b15` | Round elevation_m to integer in seed |

### Confirmed by Stebbi in Supabase

- `vedurstofan_stations` has 280 rows
- Spot-checked rows look correct

### What the product tables contain right now

- `vedurstofan_stations` — 280 rows, full registry metadata
- `vedurstofan_forecasts_latest` — empty
- `vedurstofan_observations_latest` — empty
- `weather_fetch_runs` — empty

The current Elta veðrið UI (`/auth-mvp/vedrid/elta-vedrid`) still reads from `weather_cache` via `readVedurstofanCacheForStations`. It does not yet use `vedurstofan_forecasts_latest`.

---

## Proposed next step: Phase 2B4 — cache-to-product projector

### What it is

A server-side function (or admin API route) that:

1. Reads all Veðurstofan `forec` entries already in `weather_cache`
2. Parses them with the existing `parseVedurstofanXml` parser
3. Writes structured rows into `vedurstofan_forecasts_latest`
4. Writes a `weather_fetch_runs` row with outcome counts
5. Never makes live Veðurstofan HTTP calls

This is **Option A** from the v071 Codex recommendation: no live external calls, just project what is already cached.

### Why this before a live background warmer

- No external dependency — runs regardless of Veðurstofan uptime
- Safe to run on demand or on a timer without risk of hammering Veðurstofan
- Gives us populated product tables immediately for the stations already in `weather_cache`
- Proves the pipeline before adding live-fetch complexity

### Proposed implementation

#### New function in `lib/weather/providers/vedurstofan.server.ts`

```ts
export async function projectVedurstofanCacheToProductTables(): Promise<{
  projected: number
  skipped: number
  errors: number
  runId: number
}>
```

Steps:
1. Read all `vedurstofan:forec:*` keys from `weather_cache` (service role, batch read)
2. For each entry: parse `response_body` with existing parser, build forecast rows
3. Upsert into `vedurstofan_forecasts_latest` (conflict on `station_id, forecast_time`)
4. Insert a `weather_fetch_runs` row: `source='vedurstofan'`, `fetch_type='forec'`, counts
5. Return summary

#### New admin API route (optional, for manual triggering)

`app/api/teskeid/admin/weather/project-vedurstofan/route.ts`

- Admin-only (existing admin auth pattern)
- Calls `projectVedurstofanCacheToProductTables()`
- Returns JSON summary

No cron, no scheduled trigger, no live Veðurstofan fetch in this phase.

### What this does NOT do

- Does not live-fetch Veðurstofan (that is Phase 2B5 or later)
- Does not populate `vedurstofan_observations_latest` (obs parser not built yet)
- Does not change the Elta veðrið UI (it still reads `weather_cache` for now)
- Does not require any new SQL migration

### Open questions for Codex

1. **Is `weather_cache` key format confirmed?**
   The cache uses keys like `vedurstofan:forec:{stationId}`. Claude Code should verify the exact key pattern in `vedurstofan.server.ts` before writing the projector. Is this the right assumption?

2. **Should the projector also update `vedurstofan_stations.synced_at`?**
   After projecting forecasts, it might make sense to update `synced_at` on the corresponding station row to indicate "last time product data was refreshed." Or is `weather_fetch_runs` enough for that?

3. **Elta veðrið release timing:**
   Codex v073 said release can happen independently. Should we release Elta veðrið now (before building the projector), or wait until at least the projector is in place so the product tables have data?

4. **Should the UI eventually read from `vedurstofan_forecasts_latest` instead of `weather_cache`?**
   If yes, is Phase 2B4 the right time to also plan that UI switch, or should the projector be built and proven first?

## Commits since last Codex review (v073)

```
69e1b15 fix: round elevation_m to integer in seed script (#86)
```

(No code changes beyond the seed script fix.)

## What Codex is asked to review

1. Is Phase 2B4 (cache-to-product projector, no live fetch) the right next step?
2. Are the open questions above answered or should Claude Code find out first?
3. Any concerns about the proposed implementation shape before Claude Code starts?
4. Release timing for Elta veðrið.
