# TODO 086 - v083 fixes review

Created: 2026-07-13 16:03
Timezone: Atlantic/Reykjavik

Codex review of `2026-07-13-1600-todo-086-v083-claude-v081-fixes-done`.

Reviewed state: uncommitted working-tree changes on top of `5981d58`.

## Findings

### P1 - Dynamic error object is still logged, just moved from `console.error` to `console.log`

Files:

- `app/api/admin/weather/project-vedurstofan/route.ts:16`
- `app/api/admin/weather/warm-vedurstofan/route.ts:18`

The log-safety test now passes because it only scans `console.error` and `console.warn`, but both routes still log the caught dynamic `err` object through `console.log`.

That passes the current AST test, but it defeats the safety intent: these admin routes call service-role weather pipeline code, and dynamic error objects can include stack traces, SQL/Supabase details, request information, or other operational details that should not be written casually to production logs.

Recommendation before release:

- Remove the dynamic `console.log(..., err)` lines.
- Keep only static server logs here.
- If structured diagnostics are needed later, add a deliberate safe logger that records fixed error codes or sanitized categories, not raw Error objects.

### P2 - Warmer still hides stale-cache vs freshly fetched counts

File: `lib/weather/providers/vedurstofan.server.ts:571`

v081 asked the warmer result to distinguish fresh/stale/unavailable. v083 adds `skipped` and `errors`, which is good, but `ok` is still calculated as every status that is not `unavailable`:

```ts
if (r.status !== 'unavailable') ok++
```

That means `ok` includes both fresh/live-success and stale fallback. For Stebbi's validation goal, this matters: a run can look like `ok: 280` even if many stations were served from stale cache because Veðurstofan fetch failed or timed out.

Recommendation before relying on the admin result:

- Return `fresh` and `stale` separately, or at least `ok`, `stale`, `unavailable`.
- Make the UI label clear, for example `Í lagi`, `Gömul`, `Vantar`.
- Keep `projected`, `skipped`, `errors`, and `projectionRunId`.

### P2 - `maxDuration = 300` depends on deployment plan support

File: `app/api/admin/weather/warm-vedurstofan/route.ts:6`

`maxDuration = 300` is the right kind of route-level signal for the long warmer, and the local build accepts it. The remaining assumption is that the deployed Vercel plan/environment actually supports a 300 second function.

Before deploy, Stebbi/Claude Code should verify the production Vercel plan limit. If the plan does not support 300 seconds, the warmer should be chunked or kept out of production until the execution model is changed.

## What Looks Good

- The previous full-suite blocker is fixed: `npm run test:run` now passes.
- `npm run type-check` passes.
- `npm run build` passes.
- The explicit `running` state is a real improvement over `useTransition` for these async admin requests.
- The warmer button now asks for confirmation before live Veðurstofan calls and Supabase writes.
- `skipped` and `errors` are surfaced from projection into the warmer result and admin UI.
- The new `weather-vedurstofan-warmer.test.ts` gives direct warmer coverage.

## Verification Commands Run By Codex

```powershell
npm run test:run
```

Result: exit code `0`.

Summary:

- 78 test files passed
- 2358 tests passed
- 27 skipped
- 8 todo

```powershell
npm run type-check
```

Result: exit code `0`.

```powershell
npm run build
```

Result: exit code `0`.

Notes:

- Build emitted existing warnings in `app/s/[sessionId]/page.tsx`, `components/landing/Avatar.tsx`, and `components/weather/TravelAuditMap.tsx`; these do not appear related to TODO 086.
- No Supabase command, migration, seed script, dev server, commit, push, or deploy was run by Codex.

## Suggested Next Step For Claude Code

Before commit/release:

1. Remove the two dynamic `console.log(..., err)` lines from the admin weather routes.
2. Decide whether stale-vs-fresh counts should be fixed now. Codex recommends fixing it now because the admin warmer is specifically a validation tool for Veðurstofan station coverage.
3. Re-run:

```powershell
npm run test:run
npm run type-check
npm run build
```

Then hand back a concise prerelease review.

## Localhost Checks For Stebbi

After the two review items are addressed:

1. Confirm `.env.local` points to the intended Supabase project.
2. Open `/admin` as an admin user.
3. Confirm both Veðurstofan controls appear near the bottom:
   - `Sækja allar 280 stöðvar`
   - `Keyra breytara`
4. Click `Keyra breytara` if you only want cache-to-product projection.
5. Click `Sækja allar 280 stöðvar` only when you intentionally want live Veðurstofan calls plus Supabase writes.
6. Confirm the warmer asks for confirmation before it starts.
7. Confirm the button stays disabled while the request is running.
8. Confirm the result distinguishes stale/gömul data from fresh/ok data if that fix is added.

Do not test the warmer casually against production. It can write to `weather_cache`, `vedurstofan_forecasts_latest`, and `weather_fetch_runs`.
