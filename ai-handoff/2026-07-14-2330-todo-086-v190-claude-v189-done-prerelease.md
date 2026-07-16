# 2026-07-14-2345 | todo-086 | v190 | claude | v189 done — prerelease

## Status
All v189 scope implemented. TypeScript clean. Tests pass (407 passed, 5 skipped).
Ready for Stebbi to run migration 77 and do localhost testing.

---

## What was done

### sql/77_vedurstofan_forecasts_history.sql (new)
New migration. Table `vedurstofan_forecasts_history` with:
- PK `(station_id, atime, forecast_time)`
- `first_fetched_at` — preserved on first insert (DB DEFAULT, never overwritten)
- `last_fetched_at` — updated on every upsert
- RLS enabled, service_role only, anon/authenticated revoked
- Index on `(station_id, atime, forecast_time)` (covering) and on `atime` (retention sweep)
- `updated_at` trigger via `moddatetime`
- Rollback comment at bottom

**Stebbi must run this migration in Supabase before testing.**

### lib/__tests__/sql-migration.test.ts
Added `sql77` describe block — 11 tests covering all structural requirements.

### lib/weather/providers/vedurstofan.server.ts
**Projector** (`projectVedurstofanForStations`):
- After successful latest upsert, also upserts to `vedurstofan_forecasts_history`
- History rows omit `first_fetched_at` (DB DEFAULT fires on INSERT, not overwritten on UPDATE)
- After successful history upsert, deletes rows where `atime < now() - 14 days`
- History upsert failure is non-fatal (warn + continue)
- Only runs when `payload.atimeIso` is present

**Reader** (`readVedurstofanProductForStations`):
- New optional `opts?: { etaWindowFromIso?: string; etaWindowToIso?: string }`
- When opts provided: after reading latest, queries history for same `atime` per station within the ETA window
- Dedupes by `forecast_time` (latest rows take precedence)
- Sorted by `forecast_time`
- No cross-cycle contamination: history rows must match `atime` from the current latest fetch per station

### app/api/teskeid/weather/travel/route.ts
Computes ETA window before calling reader:
- `etaWindowFromIso = earliestDepartureAt - 6h` (or `now - 6h`)
- `etaWindowToIso = latestArrivalBy + 3h` (or `departure + routeDuration + 3h`)
- Passes `{ etaWindowFromIso, etaWindowToIso }` to `readVedurstofanProductForStations`

### app/auth-mvp/vedrid/FerdalagidClient.tsx
"All points" section in the "how assessed" explainer now builds a `combinedPoints` array:
- Merges met.no `routeWeatherPoints` and Veðurstofan `vedurstofanLayer.points`
- Sorted by `distanceFromOriginM`
- When both providers are active, section label shows `allProviderPointsSectionLabel` ("Allir spápunktar á leiðinni ({count})")
- TypeScript: uses `RouteWeatherPoint` and `VedurstofanTravelLayer['points'][number]` directly (both already imported)

### messages/is.json + messages/en.json
Added:
- `"allProviderPointsSectionLabel": "Allir spápunktar á leiðinni ({count})"` (IS)
- `"allProviderPointsSectionLabel": "All forecast points on route ({count})"` (EN)

---

## What this solves

### Missing prev forecast row (e.g. 21:00)
`vedurstofan_forecasts_latest` deletes old rows on each fetch, and the Veðurstofan API never returns past hours. The history table now preserves rows by `(station_id, atime, forecast_time)`. The reader merges history rows (same `atime` only, within ETA window) so the detail card can show prev/used/next even when the prev row has aged out of the latest table.

### Mixed provider travel-order sorting
When both met.no and Veðurstofan are active, all points now appear interleaved in road order (by `distanceFromOriginM`) instead of two separate provider blocks.

---

## What Stebbi needs to do

1. Run `sql/77_vedurstofan_forecasts_history.sql` in Supabase SQL editor
2. Do localhost testing (see `2026-07-14-2215-todo-086-v184-claude-localhost-todo-vedrid.md`)
3. After next Veðurstofan cron cycle, check that history rows appear (wait ~1h)
4. Test a route with both providers active and verify travel-order sorting

---

## Not in this scope (for future)
- v185 items #1 (manual refresh cooldown) and #2 (provider filter copy/layout)
- Shared weather-card presentation component
- `vegagerdin_conditions_history` and `weather_route_assessments_history` tables (future)
