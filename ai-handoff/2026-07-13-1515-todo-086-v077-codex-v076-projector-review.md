# TODO 086 - v076 projector review

Codex review of `2026-07-13-1511-todo-086-v076-claude-v075-projector-done`.

Reviewed commit: `dbbf432 feat: cache-to-product projector for Veðurstofan forecasts (#86)`

## Findings

### P1 - Insert failure can remove the last good product forecast rows for a station

File: `lib/weather/providers/vedurstofan.server.ts:476`

The projector validates the payload, deletes all existing `vedurstofan_forecasts_latest` rows for the station, and only then inserts the replacement rows. If the insert fails after the delete succeeds, that station is left with no product forecast rows.

This contradicts the comment and intended behavior at `lib/weather/providers/vedurstofan.server.ts:407`, which says existing rows are preserved if insert fails. It also conflicts with the larger TODO 086 direction: the product layer should be able to keep serving old/stale data when upstream or refresh work fails.

This can happen with a transient DB insert failure, bad timestamp value, numeric shape mismatch, FK issue, or any other insert-side error. The current test at `lib/__tests__/weather-vedurstofan-projector.test.ts:237` verifies the error count, but it does not catch the product-data loss because the mocked DB has no persistent old rows.

Recommendation before cron/UI dependency:

- Do not delete old rows before the replacement write is known to be durable.
- Prefer an atomic DB operation/RPC that validates, deletes, and inserts per station in one transaction.
- If avoiding SQL for this patch, a safer non-atomic fallback is upsert-new-rows-first, then delete stale rows only after upsert succeeds. A stale extra row is much safer than an empty station.

### P2 - Cache read failures are reported as a clean zero-result projection

File: `lib/weather/providers/vedurstofan.server.ts:429`

When reading `weather_cache` fails, the function writes a run record attempt but returns:

```ts
{ projected: 0, skipped: 0, errors: 0, runId: null }
```

That makes a real projector failure look almost the same as "there was simply nothing to project." The inserted run id is also discarded, and `stations_failed` is written as `0`, even though the run failed before station processing.

Recommendation:

- Return a visible failure signal, for example `errors: 1` or an `errorSummary` field.
- Return the `runId` if `writeRunRecord` succeeds.
- Consider `stations_failed: 1` for run-level failures, or add an explicit run status field later if these run records become operational monitoring.

### P2 - Payload validation should bind the cache key to the payload and validate forecast row shape before any write

File: `lib/weather/providers/vedurstofan.server.ts:449`

The validation currently checks only source/type/stationId/forecast array presence. It does not verify:

- `payload.stationId` matches the station id suffix in `row.cache_key`
- `stationId` exists in the registry/product station table before writing
- each forecast has a usable `ftimeIso`
- timestamp fields intended for `timestamptz` are valid enough to insert

Because the projector uses `payload.stationId` for the delete and insert, a mismatched cache row could project the wrong station. Bad forecast row shape also feeds into the P1 delete-then-insert problem.

Recommendation:

- Parse the station id from `cache_key` and require it to equal `payload.stationId`.
- Validate all forecast rows into a typed `forecastRows` array before touching product tables.
- Skip malformed payloads without deleting existing product rows.

## What Looks Good

- The projector uses the correct actual cache prefix: `vedurstofan:xml:forec:is:3h:F-D-T-R-W:`.
- It reads structured cached JSON from `weather_cache`; it does not parse XML again.
- It does not call Veðurstofan/live HTTP during projection.
- The route is POST-only and uses existing `requireAdmin`.
- The current UI is not switched to `vedurstofan_forecasts_latest` yet, so the product-table risk is contained until manual route use or future phases.

## Test Coverage Notes

The new unit tests cover the happy path, skip logic, field mapping, no-live-fetch behavior, error counting, and run-record insertion.

Still missing before this becomes operational:

- a test proving old product rows survive an insert failure
- a test for `cache_key` station id mismatch
- route-level auth tests for `POST /api/admin/weather/project-vedurstofan` returning 401/403 for non-admin users

## Commands Run By Codex

```powershell
npm run test:run -- lib/__tests__/weather-vedurstofan-projector.test.ts lib/__tests__/weather-vedurstofan-server.test.ts lib/__tests__/sql-migration.test.ts
```

Result: exit code `0`, 3 test files passed, 216 tests passed.

```powershell
npm run type-check
```

Result: exit code `0`.

No Supabase command, migration, seed script, dev server, commit, push, or deploy was run by Codex.

## Suggested Next Step For Claude Code

Patch the projector before wiring it into cron or making the UI depend on `vedurstofan_forecasts_latest`.

Minimum patch:

1. Add stricter validation before writes:
   - cache key suffix must equal `payload.stationId`
   - station id must be known
   - all forecast rows must have required valid timestamps
2. Change replace semantics so an insert failure cannot leave a station empty.
3. Make cache-scan failures visible in the returned result and run record.
4. Add tests for those cases.

If Claude Code wants true atomic replacement, propose a small separate SQL/RPC plan first. Do not write or run that SQL without Stebbi's explicit approval.

## Localhost Checks For Stebbi

There is no user-visible UI change to inspect yet unless you intentionally trigger the admin route.

If you do test the route locally, treat it as a real database write:

1. First confirm `.env.local` points at the Supabase project you intend to modify.
2. Log in locally as an admin user.
3. POST to:

```text
http://localhost:3000/api/admin/weather/project-vedurstofan
```

Expected result after the P1/P2 fixes: JSON with `projected`, `skipped`, `errors`, and ideally a `runId`. `errors` should be `0` for a clean projection.

Then confirm in Supabase:

- `weather_fetch_runs` has one new `source='vedurstofan'`, `fetch_type='forec'` run row.
- `vedurstofan_forecasts_latest` has forecast rows only for stations with valid cached forecast payloads.
- Re-running the projector must not empty a station if one station insert fails.

Do not run this route casually against production. It writes to `vedurstofan_forecasts_latest` and `weather_fetch_runs`.
