# TODO 086 v073 - Codex review of v072 and next steps

Created: 2026-07-13 08:58
Timezone: Atlantic/Reykjavik
Agent: Codex
Input: `2026-07-13-0848-todo-086-v072-claude-v071-done.md`

## Findings

No release-blocking findings in v072.

The two v071 blockers appear fixed:

- `scripts/seed-vedurstofan-stations.mjs` now locates the actual `= [` assignment instead of the `Entry[]` type annotation.
- `lib/__tests__/sql-migration.test.ts` no longer uses the ES2018 `/s` regex flag.
- `--dry-run` parses the registry without reading env, creating a Supabase client, or writing data.

One caution remains: the real seed command writes to Supabase with the service-role key. Codex did not run it.

## Verification run by Codex

Codex ran:

```bash
node scripts\seed-vedurstofan-stations.mjs --dry-run
```

Result:

```text
Registry parsed: 280 total, 280 with stationId, 0 skipped.
Registry generated at: 2026-07-13T06:50:11.876Z
First: 2655 Æðey
Last:  33431 Vatnsskarð
Hellisheiði (31392): FOUND — Hellisheiði, lat=64.0188

Dry run complete. No Supabase writes performed.
```

Codex ran:

```bash
npm run test:run -- lib/__tests__/sql-migration.test.ts lib/__tests__/weather-vedurstofan-registry.test.ts
```

Result:

- Exit code: 0
- 2 files passed
- 196 tests passed

Codex ran:

```bash
npm run type-check
```

Result:

- Exit code: 0
- TypeScript clean

Codex did not run the real seed and did not touch Supabase.

## Hvað nú?

Recommended next sequence:

1. Stebbi confirms `.env.local` points at the intended Supabase project.
2. Stebbi runs the real seed:

   ```bash
   node scripts/seed-vedurstofan-stations.mjs
   ```

3. Stebbi verifies in Supabase that `public.vedurstofan_stations` has 280 rows.
4. Stebbi spot-checks representative rows, for example Hellisheiði `31392`, Æðey `2655`, and Vatnsskarð `33431`.
5. If seed output and row checks look right, send Claude Code the result.
6. Next Claude Code task should be a plan for the product-table projector/cache warmer, not cron/deploy yet.

## Recommended next Claude Code scope

After seed is confirmed, ask Claude Code for a plan for Phase 2B4:

- Read existing `weather_cache` Veðurstofan `forec` entries.
- Project them into `vedurstofan_forecasts_latest`.
- Write `weather_fetch_runs` rows.
- Preserve stale rows if projection/fetch fails.
- Keep this as server/service-role only.
- Do not add cron yet.
- Do not live-fetch all 280 stations yet unless Stebbi explicitly approves that scope.

This gives us a no-live-call bridge from raw cache to product tables before the full background warmer.

## Release guidance

Elta veðrið can be released independently once Stebbi decides, because the current UI still reads registry + `weather_cache` and is feature-gated.

But the cleanest order is:

1. Seed `vedurstofan_stations`.
2. Verify seed.
3. Then decide whether to release Elta veðrið as the validation UI.
4. Continue with projector/cache warmer afterward.

## Localhost checks for Stebbi

Before the real seed:

1. No browser check needed.
2. Confirm dry-run output above matches locally if rerun.
3. Confirm `.env.local` is the intended Supabase environment.

After the real seed:

1. Confirm `vedurstofan_stations` has 280 rows in Supabase.
2. Confirm no anon/authenticated policies were added.
3. Open `/auth-mvp/vedrid/elta-vedrid` and confirm it still loads.
4. Confirm regular `/auth-mvp/vedrid` still works.

Do not run cache warmer, cron, all-station live fetch, or deploy unless Stebbi explicitly chooses that next.

## Bottom line

The seed script is now ready from Codex's review perspective.

Next action is Stebbi-run seed, then verification, then a separate Claude Code plan for projecting cached Veðurstofan forecast data into the product tables.
