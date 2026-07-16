# TODO 086 v067 - Claude: sql/74 Veðurstofan product tables migration

Created: 2026-07-13 07:51
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input:
- `2026-07-13-0735-todo-086-v066-codex-v064-review-and-v065-forward.md`
- `2026-07-13-0721-todo-086-v065-codex-v064-architecture-review.md`
- Stebbi: "Setjum upp Supabase töfluna - ég vil gera það"

## What was done

Wrote `sql/74_vedurstofan_product_tables.sql`.

Migration has not been run. Stebbi runs all migrations himself.

## Migration contents

Four tables, all service_role only (RLS enabled, no policies, no client access):

### `vedurstofan_stations`

PK: `station_id` (text, e.g. `'31392'`)

Columns matching `VedurstofanStationRegistryEntry`:
- `slug`, `name`, `station_type`
- `wmo_number`, `abbreviation`
- `forecast_area_name`, `forecast_area_code`
- `lat`, `lon` (numeric 9,6), `coordinates_raw`
- `elevation_m`, `start_year`, `owner`
- `source_url`, `mapping_status` (CHECK constraint with all 5 valid values)
- `registry_generated_at`, `synced_at`

Indexes: `slug`, `forecast_area_code`

### `vedurstofan_forecasts_latest`

PK: `(station_id, forecast_time)` — one row per station per future time slot.

Columns:
- `wind_speed_ms`, `wind_direction_text`, `temperature_c`, `precipitation_mm_per_hour`, `weather_text`
- `atime` (analysis/reference time from XML)
- `fetched_at`

FK: `station_id → vedurstofan_stations(station_id) ON DELETE CASCADE`

On each background refresh: delete old rows for station, insert new set.

Indexes: `station_id`, `forecast_time`

### `vedurstofan_observations_latest`

PK: `station_id` — one row per station (latest observation only).

Columns:
- `obs_time`
- `wind_speed_ms`, `wind_direction_text`
- `wind_gust_fx_ms` (FX, 10-min max), `wind_gust_fg_ms` (FG, gust)
- `temperature_c`, `weather_text`, `visibility_m`, `precipitation_mm`
- `fetched_at`, `updated_at`

FK: `station_id → vedurstofan_stations(station_id) ON DELETE CASCADE`

### `weather_fetch_runs`

PK: `id` (bigint GENERATED ALWAYS AS IDENTITY)

Columns:
- `source` CHECK IN ('vedurstofan', 'metno')
- `fetch_type` CHECK IN ('obs', 'forec')
- `started_at`, `finished_at`
- `stations_attempted`, `stations_succeeded`, `stations_failed`
- `error_summary`

Index: `(source, fetch_type, started_at DESC)`

## Architecture notes carried from v065/v066

- `weather_cache` stays as raw key/value provider cache layer.
- These 4 tables are the queryable product layer on top.
- `vedurstofan_stations` will be seeded from `VEDURSTOFAN_STATIONS_REGISTRY` (280 stations) — separate backfill step, not in this migration.
- `vedurstofan_forecasts_latest` and `vedurstofan_observations_latest` will be populated by a background cache warmer — separate implementation step.
- `app/api/teskeid/weather/travel/route.ts` still uses live Veðurstofan enrichment in the travel request path. Converting it to read from these tables is a future step (Phase 2B3 or later).

## Pending — needs separate explicit approval from Stebbi

- Seed `vedurstofan_stations` from the 280-station registry (backfill script or one-time admin job)
- Cache warmer / background job to populate `vedurstofan_forecasts_latest` from `weather_cache` or live fetch
- `type=obs` observation parser (needed before `vedurstofan_observations_latest` can be populated)
- Convert travel route to read from product tables instead of live Veðurstofan fetch
- Cron job setup for scheduled refresh

## Rollback

```sql
DROP TABLE IF EXISTS public.weather_fetch_runs;
DROP TABLE IF EXISTS public.vedurstofan_observations_latest;
DROP TABLE IF EXISTS public.vedurstofan_forecasts_latest;
DROP TABLE IF EXISTS public.vedurstofan_stations;
```

## Localhost checks for Stebbi before running migration

None required before running this migration — it only adds new tables and does not touch any existing tables or constraints.

After running:
1. Confirm all 4 tables exist in Supabase dashboard.
2. Confirm no client/anon access (RLS enabled, no policies).
3. Existing `weather_cache`, `feature_access`, and all other tables unchanged.
