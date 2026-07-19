# 2026-07-18 09:06 - TODO 086 v471 - Codex review of v470 and second live warm gate

Created: 2026-07-18 09:06
Timezone: Atlantic/Reykjavik

Reviewed handoff: `2026-07-18-0904-todo-086-v470-claude-v469-done-prerelease`

## Short version

v470 looks directionally correct. The parser now uses the live Vegagerdin field names that came back from the first `parse_zero` diagnostic, and the timestamp test flake appears fixed.

I see no runtime blocker to Stebbi doing the **second manual localhost warm** now. Still not ready for Vercel cron/scheduling or release without at least one successful warm plus UI validation on `/vedrid`.

Before commit/release, Claude Code should clean up two small but important paper cuts:

- stale comments in `vegagerdinCurrentTypes.ts` / parser helper still mention old field names and "pending verification";
- v470 localhost-check has a typo in the API URL: `vegaderdin` should be `vegagerdin`.

## Findings

1. **Low/Medium: stale comments still document the old Vegagerdin schema**

   `lib/weather/providers/vegagerdinCurrentTypes.ts:9` still says live response shape is "PENDING VERIFICATION", and lines 17-22 still list old field names like `Vindstefna`, `Vindstef_txt`, `Hitastig`, `Vegahitastig`, and `Maelir_nr`. The file then has a second, newer docblock at lines 34-38 saying the shape is verified. That contradiction is exactly the kind of breadcrumb that can make a later agent "fix" the parser back to the wrong shape.

   Related small stale comment: `lib/weather/providers/vegagerdinCurrent.server.ts:93` still says Vegagerdin uses `Maelir_nr`, but the parser now correctly reads `Nr`.

   Runtime impact: none right now. Maintenance risk: real. Fix before commit/release.

2. **Low: v470 localhost-check URL has a typo**

   In `ai-handoff/2026-07-18-0904-todo-086-v470-claude-v469-done-prerelease.md`, the first after-warm check uses:

   ```text
   /api/teskeid/weather/vegaderdin/current
   ```

   It should be:

   ```text
   /api/teskeid/weather/vegagerdin/current
   ```

   This is only in the handoff text, not product code, but it could waste Stebbi's testing time.

3. **Low: live verification source should be recorded carefully**

   v470 says the "first live warm attempt returned `parse_zero`", but also says "No live upstream fetch" under commands. I read that as: Stebbi ran the live warm manually, then Claude Code adjusted code from the safe `shapeInfo` keys without itself making another upstream request.

   That is fine, but future handoffs should phrase this more explicitly:

   - "Stebbi provided `shapeInfo.firstItemKeys` from a manual live warm."
   - "Claude Code did not run a live upstream fetch."

   This matters because external fetches need explicit approval and we want the audit trail crisp.

## What looks good

- Parser mapping in `lib/weather/providers/vegagerdinCurrent.server.ts` now uses `Nr`, `Breidd`, `Lengd`, `VindattAsc`, `Vindatt`, `Hiti`, and `Veghiti`.
- `VegagerdinRawItem` in `lib/weather/providers/vegagerdinCurrentTypes.ts` matches the new parser fields.
- The warm cron timestamp tests now share the exact fetched payload with the verify cache fixture. That removes the v469 timing-sensitive mismatch.
- `buildSafeShapeInfo()` now prefers `results` / `data` before falling back to first array-valued key.
- Protected warm route still requires `CRON_SECRET`, returns safe metadata only, and verifies the just-written payload before claiming success.
- Public/current route remains cache-only and does not call upstream.

## Commands I ran

```powershell
npm run type-check
```

Result: exit 0.

```powershell
npm run test:run -- lib/__tests__/warm-vegagerdin-cron.test.ts lib/__tests__/weather-vegagerdin-current.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/middleware.test.ts lib/__tests__/overviewSelectionUrl.test.ts
```

Result: exit 0, 5 files, 144 tests passed.

```powershell
npm run test:run -- lib/__tests__/warm-vegagerdin-cron.test.ts lib/__tests__/weather-vegagerdin-current.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/middleware.test.ts lib/__tests__/overviewSelectionUrl.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts lib/__tests__/pulseTarget.test.ts
```

Result: exit 0, 7 files, 168 tests passed.

No live upstream fetch by Codex. No localhost browser checks. No SQL. No product-code changes. No commit/push/deploy.

## Recommendation

Proceed with the second manual localhost warm when Stebbi is ready. If it returns `status: "ok"`, the next step is product validation on `/vedrid` with real cached Vegagerdin data.

Do not set up scheduled Vercel cron yet. We still need at least:

- one successful live warm,
- UI proof that Vegagerdin markers render and restore from URL,
- stale comment cleanup,
- decision on stronger concurrent-warm protection before scheduling.

## Localhost checks for Stebbi

These checks involve a live call only at the warm step. Do not paste the actual secret into chat or handoff files.

1. Run the protected warm route locally in PowerShell:

   ```powershell
   curl.exe -s -H 'Authorization: Bearer <CRON_SECRET>' http://localhost:3004/api/cron/warm-vegagerdin
   ```

   This contacts `gagnaveita.vegagerdin.is`.

2. Expected successful response:

   ```json
   {
     "status": "ok",
     "stationCount": 202,
     "fetchedAtIso": "2026-07-18T...",
     "oldestMeasuredAtIso": "2026-07-18T...",
     "measurementFreshness": "fresh"
   }
   ```

   The exact count may vary slightly, but it should be clearly above zero.

3. If warm succeeds, open:

   ```text
   http://localhost:3004/api/teskeid/weather/vegagerdin/current
   ```

   Expected: `status: "ok"`, `stations.length > 0`, and no raw upstream-only fields leaking beyond the DTO.

4. Open:

   ```text
   http://localhost:3004/vedrid
   ```

   Expected:

   - Vegagerdin provider indicator no longer says "Engin gogn".
   - Vegagerdin markers appear on the map.
   - Clicking a Vegagerdin marker opens the provider-neutral preview with current measurements.
   - URL becomes `?provider=vegagerdin&stationId=...`.
   - Reloading that URL restores the same Vegagerdin marker/card.
   - Vedurstofan markers still work, including legacy `?stationId=31392`.

5. If response is still `parse_zero`, share only `shapeInfo` keys, not raw payload values.

6. If response is `write_failed`, `cache_verify_failed`, or `cache_verify_mismatch`, stop UI testing and inspect the cache/Supabase path first.

## Suggested next Claude Code step after successful warm

If Stebbi gets `status: "ok"` from the second warm, ask Claude Code for one larger validation/polish pass:

1. Clean stale Vegagerdin schema comments and fix the handoff URL typo in the next handoff/checklist.
2. Validate `/vedrid` with real cached Vegagerdin data and add any missing regression tests for URL restore/provider selection if the manual test reveals gaps.
3. Add a short "first live Vegagerdin warm result" handoff with safe metadata only: station count, freshness, and whether markers rendered.
4. Decide whether the immediate next branch is:
   - SQL 81 and Vegagerdin pulse compose,
   - Vercel cron scheduling with stronger anti-stampede/recent-attempt guard,
   - or route-selection provider overlays.

## Uncertainty / needs confirmation

- Codex did not see the actual live `shapeInfo`; I am trusting v470's statement that Stebbi/Claude Code used key names only.
- Codex did not run the second live warm.
- Codex did not inspect Supabase cache rows or run SQL.
