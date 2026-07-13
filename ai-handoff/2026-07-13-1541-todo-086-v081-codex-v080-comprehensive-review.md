# TODO 086 - v080 comprehensive review

Created: 2026-07-13 15:41
Timezone: Atlantic/Reykjavik

Codex review of `2026-07-13-1536-todo-086-v080-claude-phase2b4-2b5-done-comprehensive`.

Reviewed commits:

- `9980559 feat: add Veðurstofan projector button to admin page (#86)`
- `5981d58 feat: Veðurstofan background warmer for all 280 stations (#86)`

## Findings

### P1 - Full test suite fails because the two new admin weather routes violate log-safety

Files:

- `app/api/admin/weather/project-vedurstofan/route.ts:15`
- `app/api/admin/weather/warm-vedurstofan/route.ts:15`

Both routes log the caught error object:

```ts
console.error('[admin/weather/project-vedurstofan] unexpected error', err)
console.error('[admin/weather/warm-vedurstofan] unexpected error', err)
```

The repo has an AST log-safety test that rejects dynamic values in `console.error/warn`. `npm run test:run` fails on these two lines. This blocks release until fixed.

Suggested fix:

- Log only a static message, or use an existing safe logging helper/pattern if the repo has one.
- Keep the client response generic, as it is now.

### P1 - The 280-station warmer is a long-running serverless route with no timeout/chunking strategy

Files:

- `lib/weather/providers/vedurstofan.server.ts:31`
- `lib/weather/providers/vedurstofan.server.ts:336`
- `lib/weather/providers/vedurstofan.server.ts:557`
- `app/api/admin/weather/warm-vedurstofan/route.ts:6`

`warmVedurstofanForecastCache()` sends all registry IDs through `fetchVedurstofanForecastsForStations(allIds, { timeoutMs: 8000 })`. The fetcher uses `BATCH_MAX = 10` and processes batches sequentially. With 280 stations, that is up to 28 batches. Worst case is roughly 28 * 8 seconds, before projection and DB writes.

That can work on localhost, but it is fragile in Vercel/serverless production. I found no `maxDuration` or route-level runtime configuration for this route in `vercel.json` or `next.config.js`.

This should not be shipped as a production admin button that promises "1-3 minutes" unless the runtime limit is explicitly handled.

Safer options:

- Add a route-specific `maxDuration` only if the deployed Vercel plan supports the required duration.
- Split the warmer into chunked/admin-step calls, for example 20-40 stations per click/job.
- Move this into a proper background/cron worker with progress/run-state records.
- Keep the route local-only until the production execution model is decided.

### P2 - Admin buttons can submit duplicate long-running requests

File: `app/(admin)/admin/page.tsx:374`

Both new admin sections use `useTransition()` with an async callback. In React 18 this does not reliably hold `isPending` true for the whole awaited `fetch`. The button may re-enable while the request is still running, especially for the 1-3 minute warmer.

That can cause accidental duplicate 280-station fetches and concurrent product-table projections.

Suggested fix:

- Use explicit `const [running, setRunning] = useState(false)` around the fetch.
- Disable the button while `running`.
- Consider a browser `confirm()` before the warmer because it makes live Veðurstofan calls and writes Supabase data.

### P2 - Warmer result hides important failure detail

File: `lib/weather/providers/vedurstofan.server.ts:576`

The warmer returns only:

```ts
{ ok, unavailable, projected, projectionRunId }
```

It does not surface `projection.errors`, `projection.skipped`, or whether the projection failed. If `projectVedurstofanCacheToProductTables()` unexpectedly throws, the catch returns `{ projected: 0, skipped: 0, errors: 0, runId: null }` internally and the admin UI only sees `projected: 0`.

For a data pipeline validation tool, Stebbi needs to know whether the run:

- fetched fresh data,
- served stale cache,
- had unavailable stations,
- skipped malformed cache rows,
- hit projection errors,
- wrote a projection run row.

Suggested fix:

- Include projection `errors` and `skipped` in `VedurstofanWarmResult`.
- Distinguish fresh/stale/unavailable counts, not just `ok`.
- If the fetch phase itself is considered a run, write or plan a separate run/status record for the warmer phase. Right now `weather_fetch_runs` is still only written by the projector.

### P2 - Core warmer logic is not directly tested

File: `lib/__tests__/weather-vedurstofan-warmer-route.test.ts:14`

The new warmer route tests mock `warmVedurstofanForecastCache()`, which is good for route auth tests. But there are no tests for the actual warmer function behavior:

- calls `fetchVedurstofanForecastsForStations()` with all registry station IDs
- uses the intended 8 second timeout
- calls projector after fetch/cache phase
- returns fresh/stale/unavailable/projection failure counts correctly
- never throws on fetch or projection failure

Given this function is the bridge from "246 cached rows" to "all 280 station product data", it needs direct unit coverage before cron/UI dependency.

## What Looks Good

- The routes are admin-only via `requireAdmin`.
- The Elta veðrið UI still reads cache-only and is not switched to product tables yet.
- The warmer reuses the existing cache-first fetcher rather than inventing a second Veðurstofan fetch path.
- The admin UI makes the distinction between "warmer" and "projector" visible to Stebbi.
- The projector safety improvements from v078 are still present.

## Commands Run By Codex

```powershell
npm run test:run
```

Result: exit code `1`.

Summary:

- 1 failed test file
- 2 failed tests
- 76 passed test files
- 2345 passed tests
- failures are both in `lib/__tests__/log-safety.test.ts`

Failing lines:

- `app/api/admin/weather/project-vedurstofan/route.ts:15`
- `app/api/admin/weather/warm-vedurstofan/route.ts:15`

```powershell
npm run type-check
```

Result: exit code `0`.

No Supabase command, migration, seed script, dev server, commit, push, or deploy was run by Codex.

## Suggested Next Step For Claude Code

Before any release/push/deploy:

1. Fix the two log-safety failures.
2. Replace `useTransition` pending with explicit request-running state in both admin sections.
3. Decide whether the all-280 warmer route is allowed in production as one long request. If yes, document and configure the runtime limit. If no, chunk it or keep it local/manual only.
4. Add direct unit tests for `warmVedurstofanForecastCache()`.
5. Expand warmer result shape so Stebbi can see projection errors/skips and fresh/stale/unavailable counts.

## Localhost Checks For Stebbi

Do not use the new warmer casually against production Supabase. It makes live Veðurstofan calls and writes to `weather_cache`, `vedurstofan_forecasts_latest`, and `weather_fetch_runs` through the projector.

After Claude Code fixes the P1 items:

1. Confirm `.env.local` points to the intended Supabase project.
2. Open `/admin` as an admin user.
3. Scroll to the two Veðurstofan sections.
4. Click `Keyra breytara` first if you only want cache-to-product projection with no live Veðurstofan calls.
5. Click `Sækja allar 280 stöðvar` only when you intentionally want live fetch/cache warm/product projection.
6. While it is running, confirm the button stays disabled and cannot be double-clicked.
7. Confirm the result shows enough detail to distinguish unavailable, skipped, projection errors, and run id.
8. Check Supabase only intentionally:
   - `weather_cache` should have Veðurstofan forecast cache rows.
   - `vedurstofan_forecasts_latest` should have product forecast rows.
   - `weather_fetch_runs` should contain the expected projection run rows.

Expected regression checks:

- `/auth-mvp/vedrid/elta-vedrid` still loads and remains cache-only.
- `/auth-mvp/vedrid` travel weather still works.
- Non-admin users cannot call either admin route.
