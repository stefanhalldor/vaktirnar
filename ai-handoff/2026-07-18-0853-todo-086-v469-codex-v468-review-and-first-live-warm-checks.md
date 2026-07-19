# 2026-07-18 08:53 - TODO 086 v469 - Codex review of v468 and first live warm checks

Created: 2026-07-18 08:53
Timezone: Atlantic/Reykjavik

Reviewed handoff: `2026-07-18-0846-todo-086-v468-claude-v467-done-prerelease`

## Short version

v468 fixes the main blockers from v467. I think Stebbi can do the first **manual localhost warm** now, as long as it is treated as a controlled live test of Vegagerdin upstream and not as release/scheduling approval.

Do **not** set up Vercel cron or call this production-ready yet. First prove:

- the live parser returns real stations,
- the cache write/readback succeeds,
- `/api/teskeid/weather/vegagerdin/current` returns `status: "ok"`,
- `/vedrid` actually shows Vegagerdin markers from the cache.

## Findings

1. **Medium: warm cron test has a likely timestamp flake after the new verify rule**

   `lib/__tests__/warm-vegagerdin-cron.test.ts` now depends on the fetched payload and verification cache payload having the same `fetchedAtIso`. In the test helpers, `makeFetchOk()` and `makeCacheOk()` each create their own `new Date().toISOString()`. On my first wider targeted test run this failed with:

   - expected HTTP `200`
   - got HTTP `500`
   - failing assertion: `warm-vegagerdin-cron.test.ts:173`

   Running the exact Claude five-file command then passed, and rerunning the wider seven-file command also passed. That points to a timing-sensitive fixture, not necessarily a product bug.

   Fix before relying on these tests as a release gate: make the success tests deterministic by sharing one payload/timestamp between `mockFetch` and the verify `mockReadCache`, or let `makeCacheOk(payload)` reuse the exact fetched payload. The new production verify rule is good; the test should model it exactly.

2. **Low/Medium: `readFromCache()` still collapses read errors into `cache_missing`**

   `lib/weather/providers/vegagerdinCurrent.server.ts` catches cache read exceptions and returns `null`, which becomes `cache_missing`. For public UI this is fine and non-leaky, but during first live warm it can blur the difference between “no cache row yet” and “Supabase read path is broken”.

   This is not a blocker for the first manual warm because the protected warm route now has a readback verify step. If it fails, it returns `cache_verify_failed` or `cache_verify_mismatch`. Still, after first warm I would consider adding internal logging or a non-public diagnostic reason such as `cache_read_failed`.

3. **Low: `buildSafeShapeInfo()` says well-known wrapper keys but uses first array-valued key**

   The implementation checks the first array-valued key in an object, not specifically `results` or `data`. That is safer than before and likely fine for diagnosis, but if upstream returns `{ metadataArray: [...], results: [...] }`, `firstItemKeys` could describe the wrong array.

   Suggested hardening: prefer `results`, then `data`, then fallback to first array-valued key. Not required before the first warm, because the response remains keys-only and safe.

## What looks good

- `app/api/cron/warm-vegagerdin/route.ts` requires `CRON_SECRET` before any cache check or upstream fetch.
- The route still returns safe metadata only. It does not return raw upstream payload, raw measurements, or secrets.
- `writeToCache()` now checks Supabase `{ error }`, which fixes the major v467 concern.
- Warm verification compares the just-written `fetchedAtIso`, so stale fallback cache can no longer falsely prove a successful write.
- `/api/teskeid/weather/vegagerdin/current` remains cache-only and does not contact Vegagerdin upstream.
- SQL 80 is still only for per-user provider access; SQL 81 is still only for Vegagerdin pulse compose/write. Neither is required just to warm cache and show markers.

## Commands I ran

```powershell
npm run type-check
```

Result: exit 0.

```powershell
npm run test:run -- lib/__tests__/warm-vegagerdin-cron.test.ts lib/__tests__/weather-vegagerdin-current.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/middleware.test.ts lib/__tests__/overviewSelectionUrl.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts lib/__tests__/pulseTarget.test.ts
```

First run: exit 1, 1 flaky-looking failure in `warm-vegagerdin-cron.test.ts`.

Rerun of Claude's exact five-file set:

```powershell
npm run test:run -- lib/__tests__/warm-vegagerdin-cron.test.ts lib/__tests__/weather-vegagerdin-current.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/middleware.test.ts lib/__tests__/overviewSelectionUrl.test.ts
```

Result: exit 0, 5 files, 144 tests passed.

Rerun of the wider seven-file set:

```powershell
npm run test:run -- lib/__tests__/warm-vegagerdin-cron.test.ts lib/__tests__/weather-vegagerdin-current.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/middleware.test.ts lib/__tests__/overviewSelectionUrl.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts lib/__tests__/pulseTarget.test.ts
```

Result: exit 0, 7 files, 168 tests passed.

No localhost browser checks. No live upstream fetch. No SQL. No code changes. No commit/push/deploy.

## Recommendation

Proceed with the first manual localhost warm if Stebbi explicitly chooses to make the live call to Vegagerdin.

Do not deploy or schedule cron yet. The next decision should be based on the live warm response:

- `status: "ok"`: move to UI verification on `/vedrid`, then fix the timestamp test flake before treating this as release-ready.
- `reason: "parse_zero"` with `shapeInfo`: pause and update parser field names from keys only.
- `reason: "write_failed"`, `cache_verify_failed`, or `cache_verify_mismatch`: pause and inspect Supabase/cache path before doing any UI work.

## Localhost checks for Stebbi

These checks make one controlled live request only if Stebbi chooses to run the warm command. Do not paste the secret into chat or handoff files.

1. Before warming, open:

   ```text
   http://localhost:3004/api/teskeid/weather/vegagerdin/current
   ```

   Expected if cache is empty: `status: "unavailable"` with `stations: []`.

2. Run the protected warm route from PowerShell, replacing the placeholder locally:

   ```powershell
   curl.exe -s -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3004/api/cron/warm-vegagerdin
   ```

   This contacts `gagnaveita.vegagerdin.is`. That is the first live upstream fetch.

3. If the response is `status: "ok"`, open:

   ```text
   http://localhost:3004/api/teskeid/weather/vegagerdin/current
   ```

   Expected: `status: "ok"`, `stations.length > 0`, and sensible `fetchedAtIso` / `oldestMeasuredAtIso`.

4. Open:

   ```text
   http://localhost:3004/vedrid
   ```

   Expected:

   - Vegagerdin provider indicator is no longer “Engin gogn”.
   - Vegagerdin markers are visible on the overview map.
   - Clicking a Vegagerdin marker opens the same provider-neutral station preview style.
   - URL becomes provider-specific, e.g. `?provider=vegagerdin&stationId=...`.
   - Reloading that URL restores the selected marker.
   - Vedurstofan markers still work, including legacy `?stationId=...`.

5. If the warm response is `parse_zero`, only share `shapeInfo` key names back to Codex/Claude Code. Do not share raw payload values.

6. If the warm response is `cache_verify_failed`, `cache_verify_mismatch`, or `write_failed`, stop there. Do not continue to UI validation until the cache path is understood.

## Next big step after successful warm

If the first live warm succeeds, the next larger Claude Code step should be:

1. Fix the warm cron timestamp test fixture so success verification is deterministic.
2. Verify `/vedrid` marker visibility, marker selection, reload restore, and provider-neutral preview with real cached Vegagerdin data.
3. Add a small handoff with the actual warm result shape and station count.
4. Only after that decide whether to:
   - enable SQL 81 for Vegagerdin pulse writes,
   - add Vercel cron scheduling,
   - or continue with route-selection provider overlays.

## Uncertainty / needs confirmation

- I did not make the live Vegagerdin request.
- I did not verify the actual upstream field names.
- I did not inspect Supabase production state or run SQL.
- The timestamp test failure reproduced once and then passed twice; treat it as a likely flake until Claude Code hardens the fixture.
