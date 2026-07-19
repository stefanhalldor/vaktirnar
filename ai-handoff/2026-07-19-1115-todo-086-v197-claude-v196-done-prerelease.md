# 2026-07-19 11:15 - TODO 086 v197 - Claude done: v196 dedupe + save button fix, pre-release

Created: 2026-07-19 11:15
Timezone: Atlantic/Reykjavik

## What Was Implemented

### 1. Save button hidden until values actually change (Stebbi request)

File: `components/weather/WeatherThresholdBar.tsx`

In `alwaysOpen` mode, the save button is now only rendered when:
- Draft values are valid (finite, positive, caution < danger)
- AND draft values differ from the currently applied thresholds

When the inputs are at their current applied values, the button is absent. It
appears as soon as the user makes a valid change. This eliminates wasted space
and makes the button a deliberate affordance.

### 2. Phase 1: Lookup-time variant dedupe (non-destructive)

File: `lib/iceland-routes/routeMemory.server.ts`

Added `dedupeRouteVariants(variants)` (exported for testing).

Groups by semantic key:
- Curated variants (`CURATED_*` label): group by label — multiple DB rows from
  repeated Google calculations of "avoid Öxi" collapse into one pill.
- Non-curated variants: group by `routeVariantKey`.

Within each group, keeps the best row:
- Most total station IDs (vedurstofan + vegagerdin combined).
- Ties broken by most recent `lastSeenAt`.

`lookupRouteMemory` now calls `dedupeRouteVariants(variants)` before returning.
No DB rows are deleted; this is a read-time collapse only.

### 3. Phase 2: Write-time canonical variant key

File: `app/api/teskeid/weather/travel/routes/route.ts`

`warmRouteMemoryFromOptions` now uses `stableVariantKey`:
- Curated: `stableVariantKey = curatedLabel` (e.g. `'CURATED_AVOID_OXI'`)
- Non-curated: `stableVariantKey = routeOption.id` (unchanged behavior)

Both `routeKey` (the upsert conflict key) and `routeVariantKey` use this stable
value. Effect: calculating "avoid Öxi" again upserts the same DB row with fresh
station data, instead of creating a new row with a different Google ID.

Combined with Phase 1, this means:
- Existing old duplicate rows: collapsed at read time by dedupe.
- New calculations: go into the canonical row, no new duplicates.

### 4. Tests: 7 new tests for dedupeRouteVariants

File: `lib/__tests__/weather-route-memory-migration.test.ts`

New describe block `dedupeRouteVariants` (7 tests):
- Single variant returned unchanged
- Two rows with same CURATED_ label collapse to one
- Distinct CURATED_ labels remain separate pills
- Best row wins by station count
- Ties broken by most recent lastSeenAt
- Non-curated variants grouped by routeVariantKey (not label)
- Curated and non-curated do not merge

## Test Results

- `npm run type-check`: exit 0
- `npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts`
  32 tests, exit 0 (was 25 before; 7 new dedupe tests)

## What Duplicate Rows Look Like After This Fix

Before (Stebbi's screenshot):
- "Til að sleppa við Öxi" × 2
- "Um Hellisheiði" × 2
- "Leið 3", "Leið 5" (non-curated fallbacks)

After:
- "Til að sleppa við Öxi" × 1 (best of the two old rows)
- "Um Hellisheiði" × 1 (best of the two old rows)
- Non-curated fallbacks may still appear if they are truly distinct variant keys
  (they were never curated, so dedupe groups them by routeVariantKey separately)

Note: "Leið 3" / "Leið 5" in the UI are from `routeVariantFallbackLabel` — they
appear when the route has no curated label. If those rows had different
routeVariantKeys AND no curated label, they remain as separate pills. Phase 2
won't help them for new calculations unless a curated label is present.

## Migration Status (Unchanged)

- sql/82: required for saved wind thresholds
- sql/83: required for Vegagerðin history fallback
- sql/86: required for route-memory
- sql/87: prepared, NOT required, NOT deployed
- sql/85: do not run

## All Files Changed This Session

- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherThresholdBar.tsx`
- `lib/iceland-routes/routeMemory.server.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `lib/__tests__/weather-route-memory-migration.test.ts`
- `vercel.json`
- `messages/is.json`
- `messages/en.json`
- `sql/87_weather_route_memory_route_cautions.sql` (new, not run)
