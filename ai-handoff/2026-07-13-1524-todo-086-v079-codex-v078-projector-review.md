# TODO 086 - v078 projector fixes review

Created: 2026-07-13 15:24
Timezone: Atlantic/Reykjavik

Codex review of `2026-07-13-1521-todo-086-v078-claude-v077-done`.

Reviewed commit: `0f5cef6 fix: projector replace semantics, validation, and scan-failure signal (#86)`

## Findings

### No blocking findings for the manual projector route

The v077 P1 issue is closed for the important safety case: an upsert/insert failure can no longer delete the last good product rows for a station. The code now upserts first and only runs stale cleanup after a successful upsert.

The v077 P2 scan-failure issue is also closed: cache scan failures now return `errors: 1` and preserve the inserted `runId` when available.

The route-level auth coverage is a useful addition. The admin route still uses `requireAdmin`, and the tests verify unauthenticated, non-admin, admin success, unexpected projector failure, and no admin identity in the JSON response.

### P2 - Replace semantics are still not exact enough for the future product/UI dependency

File: `lib/weather/providers/vedurstofan.server.ts:507`

The cleanup step deletes stale rows using:

```ts
.eq('station_id', stationId)
.lt('fetched_at', payload.fetchedAtIso)
```

This is safe in the sense that it avoids emptying the station, but it is not an exact replacement of "the current forecast set for this station." Rows omitted from the current payload can remain if their `fetched_at` is equal to, or newer than, `payload.fetchedAtIso`.

That is acceptable for a manual projector/bootstrap step because stale extra rows are safer than missing rows. Before `vedurstofan_forecasts_latest` becomes the UI or cron source of truth, Claude Code should tighten this into true per-station replacement, ideally with one of these approaches:

- DB transaction/RPC: replace one station's forecast set atomically.
- Generation marker: write a projection run id or payload fetched timestamp to all new rows, then cleanup rows not in the new generation.
- Exact forecast-time cleanup: after successful upsert, delete rows for the station whose `forecast_time` is not in the validated current payload, while still preserving rows if cleanup fails.

This is not a release blocker for the current manual admin route, but it should not be forgotten before the UI starts reading from the product table.

## Notes

- The source scan prefix is still correct: `vedurstofan:xml:forec:is:3h:F-D-T-R-W:`.
- The projector still reads structured cached JSON from `weather_cache`; no XML re-parse and no live Veðurstofan HTTP.
- Validation now catches cache-key/payload station mismatch and drops empty `ftimeIso` rows before writes.
- Small handoff mismatch: v078 says the route test file has 8 tests, but the actual file has 6 tests. The important route cases are covered.

## Commands Run By Codex

```powershell
npm run test:run -- lib/__tests__/weather-vedurstofan-projector.test.ts lib/__tests__/weather-vedurstofan-projector-route.test.ts lib/__tests__/weather-vedurstofan-server.test.ts lib/__tests__/sql-migration.test.ts
```

Result: exit code `0`, 4 test files passed, 227 tests passed.

```powershell
npm run type-check
```

Result: exit code `0`.

No Supabase command, migration, seed script, dev server, commit, push, or deploy was run by Codex.

## Suggested Next Step

For the current state, Codex is comfortable with Stebbi sending this back as "review accepted for manual projector safety."

Next implementation should not be direct UI switch yet. The better sequence is:

1. Use this manual projector only intentionally, against the intended Supabase project.
2. Build the live background warmer/product refresh plan next, including how it handles all 280 stations, stale source data, partial failures, and run reporting.
3. Before the UI reads `vedurstofan_forecasts_latest`, decide whether exact per-station replacement needs an RPC/transaction.

## Localhost Checks For Stebbi

No user-facing page changed in v078.

If Stebbi intentionally tests the admin route locally, it writes real data to the Supabase project configured in `.env.local`. Do not test this casually against production.

Manual check:

1. Confirm `.env.local` points at the intended Supabase project.
2. Log in locally as an admin user.
3. Send a POST request to:

```text
http://localhost:3000/api/admin/weather/project-vedurstofan
```

Expected:

- JSON includes `projected`, `skipped`, `errors`, and `runId`.
- Clean run should return `errors: 0`.
- `weather_fetch_runs` gets one new `source='vedurstofan'`, `fetch_type='forec'` row.
- `vedurstofan_forecasts_latest` gets forecast rows for stations with valid cached forecast payloads.

Regression to watch:

- If an upsert fails for one station, existing forecast rows for that station should remain.
- Route must return 401/403 for non-admin access and must not expose admin identity in response JSON.
