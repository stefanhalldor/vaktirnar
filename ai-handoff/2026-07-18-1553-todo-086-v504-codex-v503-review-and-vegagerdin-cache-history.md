# 2026-07-18 15:53 - TODO 086 v504 - Codex review of v503 + Vegagerdin cache/history next step

Created: 2026-07-18 15:53
Timezone: Atlantic/Reykjavik

Sources reviewed:
- `ai-handoff/2026-07-18-1550-todo-086-v503-claude-v501-v502-done-prerelease.md`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherOverviewShell.tsx`
- `app/api/teskeid/weather/vegagerdin/current/route.ts`
- `app/api/cron/warm-vegagerdin/route.ts`
- `lib/weather/providers/vegagerdinCurrent.server.ts`
- `sql/75_weather_fetch_runs_metadata.sql`
- `sql/77_vedurstofan_forecasts_history.sql`

## Findings

1. **No blocking issue in v503 itself.**
   The immediate UX fix is reasonable: Vegagerdin empty-cache no longer makes the provider look disabled, and the `Ferðalagið` CTA now uses semantic Teskeid primary colors instead of a one-off black button. The relevant v503 logic is in `components/weather/WeatherOverviewClient.tsx:307`, `components/weather/WeatherOverviewClient.tsx:331`, and `components/weather/WeatherOverviewShell.tsx:337`.

2. **Medium / architecture: v503 still only explains empty cache; it does not prevent empty cache.**
   The user-facing endpoint still returns `status: 'unavailable'` when `readVegagerdinCurrentFromCache()` says the cache is missing, invalid, or older than the 30-minute stale window (`app/api/teskeid/weather/vegagerdin/current/route.ts:40`, `lib/weather/providers/vegagerdinCurrent.server.ts:248`). So if Vercel cron misses, cache expires, a deploy clears a first-run state, or the upstream request fails long enough, `/vedrid` can still have no Vegagerdin stations. Stebbi's instinct is right: the permanent fix is a real warm/cache/history model, not just a nicer empty message.

3. **Low: one stale comment mentions an unavailableReason value that does not exist.**
   `components/weather/WeatherOverviewClient.tsx:345` says empty cache is visible with `unavailableReason='empty'`, but the actual config uses `undefined` for empty/stale and only `restricted`/`error` for disabling (`components/weather/WeatherOverviewClient.tsx:307`). No runtime issue, but worth cleaning while touching the area again.

## Review Notes

v503 is fine as a narrow prerelease patch, but I would treat it as a temporary safety net. The product goal should be: `/vedrid` has Vegagerdin data from a cache/history path almost always, and if the newest measurement is old, the UI says that clearly without disabling the provider or making the map disappear.

The current `warm-vegagerdin` route is already shaped in the right direction:
- protected by `CRON_SECRET`
- skips when cache is fresh
- fetches upstream only from the cron/manual route
- verifies the cache read path after writing

The missing layer is persistence beyond the single `weather_cache` row.

## Next Large Implementation Handoff For Claude Code

Copy/paste this as the next implementation scope if Stebbi wants to move quickly:

```md
Workflow

Claude Code, review this as devil's advocate first. If there are no blocking questions, implement the next Vegagerðin reliability phase. Do not commit, push, deploy, run SQL, change Vercel, or trigger live upstream fetches unless Stebbi explicitly approves those actions separately.

Goal:
Make Vegagerðin data reliable on `/vedrid` by keeping a latest cache plus a service-role-only history table, so the UI can show the newest known measurements even when the short cache is empty/expired. This should mirror the Veðurstofan history approach conceptually, but it is current observations, not forecasts.

Scope:
1. Add a new SQL migration, likely `sql/83_vegagerdin_measurements_history.sql` if 82 is still the latest.
2. Do not run the migration.
3. Update server-side Vegagerðin warm/read logic to write latest cache and history.
4. Update read fallback so `/api/teskeid/weather/vegagerdin/current` can return newest known history rows when `weather_cache` is missing/expired.
5. Keep `/vedrid` marker colors driven by wind thresholds, not freshness.
6. Keep stale/old measurement age visible in station details/provider UI, because old current-measurement data can be safety-sensitive.
7. Add focused tests.

SQL design:
- Create `public.vegagerdin_measurements_history`.
- Suggested columns:
  - `station_id text not null`
  - `measured_at timestamptz not null`
  - `station_name text not null`
  - `lat numeric(9,6) not null`
  - `lon numeric(9,6) not null`
  - `mean_wind_ms numeric(6,2)`
  - `gust_last_10_min_ms numeric(6,2)`
  - `wind_direction_deg numeric(6,1)`
  - `wind_direction_text text`
  - `air_temperature_c numeric(5,1)`
  - `road_temperature_c numeric(5,1)`
  - `data_quality text not null check (data_quality in ('complete','partial'))`
  - `fetched_at timestamptz not null`
  - `first_fetched_at timestamptz not null default now()`
  - `last_fetched_at timestamptz not null`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
  - primary key `(station_id, measured_at)`
- Enable RLS.
- Revoke all from `PUBLIC`, `anon`, `authenticated`.
- Grant service_role only.
- Add indexes for newest batch lookup:
  - `(measured_at desc)`
  - `(station_id, measured_at desc)`
- Add updated_at trigger using `public.teskeid_set_updated_at()`.
- Add rollback comments.
- Use no FK unless there is already a stable Vegagerdin stations table. A station registry can come later.

Server behavior:
- Keep `weather_cache` as the fast latest payload.
- Add an idempotent history upsert helper in `lib/weather/providers/vegagerdinCurrent.server.ts`.
- During `fetchVegagerdinCurrent()`:
  - parse upstream
  - write latest cache
  - upsert normalized history rows with `(station_id, measured_at)` conflict
  - do not log raw upstream values or secrets
- Decide explicitly whether history write failure blocks cron success:
  - Recommendation: cache write must remain primary for UI freshness; history failure should make cron response `status: 'partial'` or include `historyStatus: 'failed'`, with safe logging, but should not throw away a successful latest cache.
- Add `readVegagerdinCurrentFromHistory()` or equivalent:
  - Find newest `measured_at` batch/window.
  - Return all rows from that newest measurement batch/window as `VegagerdinCachePayload`-compatible shape.
  - Use an explicit max fallback age. Recommendation: allow stale display for maybe 24 hours with clear age labeling; if older, return unavailable rather than presenting ancient road data as current.
- Update `readVegagerdinCurrentFromCache()` or create a wrapper:
  - First read `weather_cache`.
  - If fresh/stale within current window, use it.
  - If missing/expired, fallback to history.
  - Return enough metadata for the API/UI to distinguish `cacheStatus: 'fresh' | 'stale' | 'history_fallback'`.

Cron / scheduling plan:
- Prepare code for a 3-minute Vercel cron schedule, but do not change Vercel/deploy in this step unless Stebbi asks.
- Before production scheduling, confirm the Vercel project/plan supports the desired frequency and that Vegagerðin terms/rate limits allow it.
- Current cron route has an anti-stampede cache freshness skip. Keep it, but consider adding a DB-level run lock using `weather_fetch_runs` or a provider-specific advisory lock before running every 3 minutes.
- Do not make the browser or public API trigger live upstream fetches.

UI behavior:
- `/vedrid` should not go blank for Vegagerðin just because short cache expired.
- Vegagerðin pill stays active when data is old.
- Marker colors remain threshold-driven.
- Station detail still shows measured time and fetched/age/freshness context.
- Empty-cache text should become exceptional: use it only when there is no cache and no acceptable history fallback.

Tests:
- Add tests for history migration presence/shape if the repo has migration tests.
- Unit-test parser/upsert mapping for null-preserving fields.
- Test cache read uses current cache first.
- Test expired/missing cache falls back to newest history rows.
- Test too-old history returns unavailable or explicit stale-too-old state.
- Test `/api/teskeid/weather/vegagerdin/current` returns DTO rows from history fallback without contacting upstream.
- Test cron auth still rejects public callers.

Do not do:
- Do not run SQL.
- Do not call the live Vegagerðin upstream route from tests or localhost without explicit approval.
- Do not weaken RLS or expose history table to anon/authenticated.
- Do not change map status colors back to freshness-driven colors.
- Do not commit, push, deploy, or edit Vercel cron config without separate approval.

Localhost checks for Stebbi:
1. Before running any new SQL, note that history fallback cannot work until the migration is applied, but the app should still build and existing cache behavior should remain unchanged.
2. After migration is later applied and cache is warmed with explicit approval:
   - Open `/vedrid`.
   - Confirm Vegagerðin markers appear from latest cache.
   - Wait beyond short cache TTL or simulate expired cache only in local/dev-safe data, not production.
   - Confirm markers still appear from history fallback with measured-time/freshness context.
   - Confirm the provider pill remains clickable.
   - Confirm no public user can trigger the cron endpoint.
   - Confirm no raw upstream payload or secrets appear in responses/logs.
3. Regression checks:
   - Veðurstofan overview still loads.
   - `/ferdalagid` threshold colors still match `/vedrid`.
   - Vegagerðin pulse routes still work after SQL81 is applied.
```

## Commands Run By Codex

```
npm run type-check
```

Exit code: 0.

```
npm run test:run -- lib/__tests__/windObservationStatus.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts lib/__tests__/overviewSelectionUrl.test.ts lib/__tests__/weather-travel.test.ts lib/__tests__/travelAuditMap.helpers.test.ts
```

Exit code: 0. Result: 6 files passed, 246 tests passed, 5 skipped.

## Localhost Checks For Stebbi

For v503 specifically:
1. Open `/vedrid`.
2. Toggle to Vegagerðin-only.
3. If cache has data: map should render, Vegagerðin pill should remain active, and station cards should show measurement values.
4. If cache is empty: the calm empty-cache text should appear instead of a dead/disabled provider.
5. Confirm `Ferðalagið` CTA is green and still centered at the bottom.

For the next cache/history phase:
1. Do not expect permanent fallback until a future SQL migration is written and later run.
2. Do not run the warm cron casually from browser/public.
3. When the history phase is ready, test with expired cache locally or in a safe dev state, not by corrupting production rows.

## Uncertainty / Needs Confirmation

- I did not verify Vercel's current cron-frequency limits for this exact project/plan. Before setting `*/3 * * * *` in production, Claude Code or Stebbi should confirm it is supported and acceptable.
- I did not verify Vegagerðin's official rate-limit/usage terms. A 3-minute fetch cadence is probably modest, but it should still be checked before production scheduling.
- The workspace is heavily dirty/untracked, so this review is scoped to v503 and the files named above, not the whole current diff.
