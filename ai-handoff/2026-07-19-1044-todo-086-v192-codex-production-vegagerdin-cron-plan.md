# 2026-07-19 10:44 - TODO 086 v192 - Codex production Vegagerðin cron plan

Created: 2026-07-19 10:44
Timezone: Atlantic/Reykjavik

## Context

Stebbi reported that Vegagerðin is gray on production and said:

> Við þurfum að tryggja að CRON keyri á þriggja mínútna fresti á raun... núna er Vegagerðin bara grá á raun

Codex inspected the repo and Vercel docs. No production change was made by
Codex.

## Findings

### 1. Production cron for Vegagerðin is not registered in `vercel.json`

Severity: high.

Current `vercel.json` only contains:

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-chats",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/warm-vedurstofan",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

But the route exists:

- `app/api/cron/warm-vegagerdin/route.ts`

So production likely never invokes the Vegagerðin warmer. That matches the
gray/unavailable Vegagerðin state.

### 2. The intended production schedule should be explicit

Recommended `vercel.json` entry:

```json
{
  "path": "/api/cron/warm-vegagerdin",
  "schedule": "*/3 * * * *"
}
```

This must be deployed to production before Vercel registers it.

Official Vercel docs used:

- Cron Jobs overview: https://vercel.com/docs/cron-jobs
- Managing Cron Jobs: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- `vercel.json` cron config: https://vercel.com/docs/project-configuration/vercel-json

Relevant doc points:

- Vercel cron jobs are configured in `vercel.json` and invoke production
  deployment paths.
- Updating cron jobs requires changing `vercel.json` and redeploying.
- If `CRON_SECRET` exists, Vercel sends it as the `Authorization` bearer header.
- Vercel does not retry failed cron invocations.
- Cron jobs can overlap; endpoints must be idempotent / concurrency-safe.
- Hobby has a severe frequency restriction: once per day. Non-Hobby teams can
  run minute-level schedules.

### 3. `warm-vegagerdin` endpoint is already protected and mostly safe for cron

`app/api/cron/warm-vegagerdin/route.ts`:

- requires `Authorization: Bearer ${CRON_SECRET}`
- uses `getWeatherEnabledMode()`
- skips when cache is already fresh
- calls `fetchVegagerdinCurrent()`
- verifies cache write by reading cache back
- returns safe metadata only

`lib/weather/providers/vegagerdinCurrent.server.ts`:

- cache key: `vegagerdin:vedur2014_1:latest`
- fresh TTL: 2 minutes
- stale fallback: 30 minutes
- history fallback: newest batch up to 24 hours old, if `sql83` has been run

With a 3-minute cron, the cache may be fresh most of the time and stale for
short gaps. It should not become gray/unavailable unless cron is failing,
missing, unauthorized, weather is disabled, or both cache and history are empty
/ expired.

## Required Preconditions Before Production Release

1. Confirm production Vercel plan supports `*/3 * * * *`.
   - If the project is Hobby, Vercel docs say more-than-daily cron will fail
     deployment.
   - If Pro/team, 3-minute cron should be allowed.
2. Confirm `CRON_SECRET` is set in production Vercel env.
   - The route will return `401` without it.
3. Confirm `sql/83_vegagerdin_measurements_history.sql` has been run in the
   production Supabase project.
   - Cron can still write the short `weather_cache` without sql83, but history
     fallback will fail and production becomes more fragile after cache expiry.
4. Confirm `WEATHER_ENABLED` is not `off` in production.
5. After deploy, check Vercel Cron Jobs dashboard for:
   - `/api/cron/warm-vegagerdin`
   - schedule `*/3 * * * *`
   - recent successful invocations

## Recommended Handoff To Claude Code

Claude Code should do a small production-readiness pass:

1. Update `vercel.json`:
   - add `/api/cron/warm-vegagerdin`
   - schedule `*/3 * * * *`
   - leave existing crons untouched
2. Add or update tests/static checks if there is an existing vercel-json test
   pattern:
   - asserts `warm-vegagerdin` exists in `vercel.json`
   - asserts schedule is `*/3 * * * *`
3. Re-run:
   - `npm run type-check`
   - targeted cron tests, especially `lib/__tests__/warm-vegagerdin-cron.test.ts`
   - any static config tests if present
4. Do not run the cron manually unless Stebbi explicitly approves the external
   Vegagerðin fetch.
5. Do not deploy unless Stebbi explicitly approves deploy.

## Suggested Production Verification After Deploy

Stebbi or Claude Code should verify after production deploy:

1. Vercel dashboard -> project -> Settings -> Cron Jobs:
   - `/api/cron/warm-vegagerdin` exists
   - schedule is `*/3 * * * *`
2. Vercel runtime logs:
   - filter `requestPath:/api/cron/warm-vegagerdin`
   - expect 200 responses
   - no `401`, `500`, or redirects
3. Production `/vedrid`:
   - Vegagerðin pill is active/available
   - markers are not gray because provider is unavailable
   - selected station pulse can open
4. Supabase read-only spot checks if needed:
   - `weather_cache` has recent `vegagerdin:vedur2014_1:latest`
   - if sql83 has been run, `vegagerdin_measurements_history` has recent
     `last_fetched_at`

## Diagnostic SQL For Stebbi (Read-only)

Use only in Supabase SQL editor when checking status. This is read-only.

```sql
select
  cache_key,
  fetched_at,
  expires_at,
  now() as checked_at,
  case
    when expires_at >= now() then 'fresh'
    else 'expired'
  end as cache_freshness
from public.weather_cache
where cache_key = 'vegagerdin:vedur2014_1:latest';
```

If `sql83` has been run:

```sql
select
  max(last_fetched_at) as newest_history_batch,
  count(*) filter (
    where last_fetched_at = (
      select max(last_fetched_at)
      from public.vegagerdin_measurements_history
    )
  ) as newest_batch_rows,
  now() as checked_at
from public.vegagerdin_measurements_history;
```

## Commands Run By Codex

- `Get-Content -Encoding UTF8 vercel.json`
  - exit 0
- `rg -n "cron|warm|vegagerdin|Vegagerðin|measurements|history" app lib sql vercel.json package.json`
  - exit 0
- `Get-ChildItem -Recurse -File app/api | Where-Object { $_.FullName -match 'cron|vegagerdin|warm' } | Select-Object FullName,Length | Sort-Object FullName`
  - exit 0
- `Get-Content -Encoding UTF8 sql/83_vegagerdin_measurements_history.sql`
  - exit 0
- `Get-Content -Encoding UTF8 app/api/cron/warm-vegagerdin/route.ts`
  - exit 0
- `Get-Content -Encoding UTF8 lib/weather/providers/vegagerdinCurrent.server.ts`
  - exit 0

Codex also checked official Vercel documentation via web browsing.

## Design Check

No UI implementation requested here. The user-facing result is that Vegagerðin
stops appearing unavailable/gray on production once cache warming works.

If Claude Code adds any error banner or admin status UI, it must use
`messages/is.json` and `messages/en.json`, preserve mobile layout, and avoid
layout shift.

## Route Intelligence Check

This is route-adjacent because Vegagerðin station availability affects:

- `/vedrid` map
- `/ferdalagid` route-memory warming
- route station matching for Vegagerðin points

No new IcelandRoadmap route knowledge is needed. The change is provider cache
availability, not segment or route-family logic.

Provider neutrality: this cron is provider-specific by design, but it feeds the
shared route-memory and overview map path through existing provider-neutral
station matching.

Privacy: the cron stores provider measurements and station metadata only. No
user IDs, raw route geometry, raw addresses, or Google data.

## Localhost Checks For Stebbi

Before deployment:

1. No localhost UI check proves Vercel cron registration.
2. Claude Code can run tests locally after editing `vercel.json`.
3. Do not manually call `/api/cron/warm-vegagerdin` unless Stebbi explicitly
   approves a live external fetch to Vegagerðin.

After production deploy:

1. Check Vercel Cron Jobs dashboard.
2. Check runtime logs for `/api/cron/warm-vegagerdin`.
3. Open production `/vedrid`.
4. Expected:
   - Vegagerðin is no longer unavailable/gray because cache is missing
   - markers appear from current or history fallback data
   - no cron 401s in logs

## Release Stance

This should be treated as a production release blocker for Vegagerðin. The route
exists, but production scheduling is missing from `vercel.json`.

Do not rely on users opening `/vedrid` to warm Vegagerðin; the user-facing API
is intentionally cache/history-only and never contacts upstream.

## Uncertainty / Needs Confirmation

- Codex cannot confirm Vercel plan from local repo.
- Codex cannot confirm production `CRON_SECRET`.
- Codex cannot confirm whether `sql83` has been run in production.
- Codex did not edit `vercel.json`, run cron, deploy, or call external
  Vegagerðin upstream.
