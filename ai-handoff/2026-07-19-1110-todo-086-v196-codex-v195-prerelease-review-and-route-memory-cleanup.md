# 2026-07-19 11:10 - TODO 086 v196 - Codex review of Claude v195 and route-memory cleanup follow-up

Created: 2026-07-19 11:10
Timezone: Atlantic/Reykjavik

Review target:

- `2026-07-19-1108-todo-086-v195-claude-v194-done-prerelease.md`

Additional Stebbi context:

- Screenshot shows `/vedrid` route pills cluttered with duplicate/similar variants:
  - `Allar leiðir`
  - `Til að sleppa við Öxi`
  - `Til að sleppa við Öxi`
  - `Leið 3`
  - `Um Hellisheiði`
  - `Leið 5`
  - `Um Hellisheiði`
- Stebbi wants automatic cleanup/deduping of route-memory rows, especially when a route comes in again with better/more detailed station data.

## Findings

### No blocker found in the v195 hotfix scope

The two v194 blockers appear fixed in code:

- `route_caution_ids` is no longer included in the `weather_route_memory_routes` upsert payload.
  - See `lib/iceland-routes/routeMemory.server.ts:69-84`.
  - This means deploying without `sql/87` should no longer break route-memory writes.
- `WeatherThresholdBar` now separates local threshold apply from explicit default save.
  - Typing calls `onApply`.
  - The save button calls `onSaveDefault` when provided.
  - `/vedrid` passes `onApply={setOverrides only}` and `onSaveDefault={handleSaveAsDefault}`.

Route-memory refetch stale-response guard also looks reasonable:

- request keys are captured at fetch start
- response is ignored if the currently selected pair changed

### Major follow-up: route-memory variants need canonical dedupe/cleanup

Files involved:

- `lib/iceland-routes/routeMemory.server.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- possibly `sql/86_weather_route_memory.sql` follow-up migration, not by editing sql/86 if already run
- possibly a new cleanup/preflight SQL script or migration

Current root cause:

- Route-memory stores one row per `route_key`.
- `route_key` is built from `{from_place_key}--{to_place_key}--{route_variant_key}`.
- `routeVariantKey` currently comes from `routeOption.id`.
- For Google/base route options, IDs can be unstable or overly granular across recalculations.
- Curated labels like `CURATED_AVOID_OXI` / `CURATED_VIA_HELLISHEIDI` can repeat in multiple rows.
- Lookup returns up to 20 rows ordered by `last_seen_at`, and UI renders each row as a pill.

Result:

- `/vedrid` can show duplicate or semantically identical route pills.
- The quick route screen becomes noisy.
- "Allar leiðir" can include stale or low-detail variants instead of the best current representation.

This is not necessarily a hard release blocker if Stebbi wants to ship now, but it is product-visible and will get worse as more routes are warmed in production.

## Recommended Route-Memory Cleanup Direction

Do not hard-delete blindly by label alone. We need a stable, provider-neutral route-variant identity and a conservative replacement policy.

### Phase 1: UI/API dedupe before deeper schema work

Fastest safe improvement:

- In `lookupRouteMemory`, collapse variants before returning them to the UI.
- Group by a semantic variant key:
  - preferred: `route_variant_label` when it is a curated `CURATED_*` label
  - fallback: normalized station-set signature, for example sorted provider/station IDs
  - final fallback: existing `route_variant_key`
- For each group, keep the "best" row:
  - prefer rows with more total station IDs
  - prefer rows with both providers present
  - prefer newer `last_seen_at`
- Return only collapsed variants to `/vedrid`.

This avoids destructive cleanup and can be released safely.

### Phase 2: write-time canonical variant keys

Better durable fix:

- Change route-memory writer to build stable `route_variant_key` for curated options:
  - `CURATED_AVOID_OXI`
  - `CURATED_VIA_HELLISHEIDI`
  - `CURATED_VIA_HOLMAVIK`
  - etc.
- For non-curated Google alternatives, use a provider-neutral signature:
  - possibly based on major control points / route labels / station-set signature
  - not raw Google route ID
  - not raw geometry
- Then repeated calculations naturally update the same row instead of creating new pills.

### Phase 3: database cleanup for existing duplicates

Only after Phase 1/2 logic is stable:

- Create a read-only diagnostic query first to identify duplicates by from/to + semantic group.
- Then create a carefully reviewed cleanup SQL or service-role admin script that:
  - preserves the winning route row
  - moves/keeps station rows from the best-detail row
  - deletes only rows that are confirmed duplicates
  - never deletes unrelated from/to pairs

Do not run destructive cleanup in production without Stebbi explicitly approving the exact SQL.

## Suggested Handoff To Claude Code

If Stebbi sends this to Claude Code, recommended scope:

1. Keep v195 hotfixes as-is.
2. Add non-destructive lookup-time dedupe for `/vedrid` route variants.
3. Do not write destructive SQL.
4. Do not change already-run `sql/86`.
5. Add tests for variant dedupe:
   - duplicate curated labels keep only one pill
   - best row wins by station count / provider completeness / recency
   - distinct curated labels remain separate
   - unknown variants without matching station signatures remain separate
6. Handoff before commit/push/deploy.

## Migration Guidance

Current migration stance:

- `sql/82`: required for saved wind thresholds.
- `sql/83`: required for Vegagerðin history fallback.
- `sql/86`: required for route-memory.
- `sql/87`: safe/prepared additive migration, but not required by v195 code anymore because upsert does not write `route_caution_ids`.
- `sql/85`: do not run.

Duplicate cleanup should not be implemented as a destructive migration yet.

If later cleanup SQL is needed, use a separate explicitly named SQL file or admin script with:

- read-only preview query
- exact affected row count
- transaction
- rollback/recovery strategy
- Stebbi approval before running

## Test Status

Codex ran:

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-observation.test.ts
```

Results:

- TypeScript: pass
- Vitest targeted suite: 3 files passed, 69 tests passed

## Route Intelligence Check

- Route-family affected: all route-memory route variants shown on `/vedrid`, especially Reykjavík -> Egilsstaðir.
- Provider-neutrality: dedupe should be based on Teskeið route semantics, curated labels, station sets, or IcelandRoadmap/control-point signatures, not raw Google route IDs.
- Google cost: lookup-time dedupe adds no Google calls.
- Privacy: keep using normalized place keys/labels and station IDs only. Do not store raw addresses, raw Google route geometry, place IDs, user IDs, duration, or distance.
- IcelandRoadmap: if Phase 2 introduces canonical route signatures/control points, update `IcelandRoadmap.md` and/or `lib/iceland-routes/` accordingly. Phase 1 lookup dedupe can document why no roadmap update is needed.

## Design Check

Relevant `Design.md` points:

- `/vedrid` should stay app-like and low-clutter.
- Pills are good, but repeated pills with identical labels make the UI feel broken.
- Use small stable controls; avoid adding another map or complex picker for this release.
- Keep the route selector mobile-first and avoid horizontal overflow.

## Localhost Checks for Stebbi

### v195 hotfix checks

1. Open `/auth-mvp/vedrid`.
2. Change wind thresholds.
3. Expected: map updates immediately.
4. Expected: no redirect or save while typing.
5. Click save defaults.
6. Expected: public users redirect only on click; logged-in users save only on click.
7. Reload logged in.
8. Expected: saved thresholds auto-apply.

### Route variant cleanup checks after follow-up

Use a pair that currently shows duplicates, such as Reykjavík -> Egilsstaðir.

1. Open `/auth-mvp/vedrid`.
2. Select Reykjavík as `Frá`.
3. Select Egilsstaðir as `Til`.
4. Expected after dedupe:
   - `Allar leiðir` appears once.
   - `Til að sleppa við Öxi` appears once.
   - `Um Hellisheiði` appears once.
   - unknown generic variants appear only if they are truly distinct.
5. Click each route pill.
6. Expected: map filters to the corresponding station set.
7. Warm routes again in `/auth-mvp/vedrid/ferdalagid`.
8. Return to `/auth-mvp/vedrid`.
9. Expected: route pills refresh without accumulating duplicates.

### Production caution

Do not test cleanup by hammering `/ferdalagid` route calculations in production. Google cost is real. Prefer localhost/staging, read-only SQL diagnostics, and a few controlled route calculations only when Stebbi approves.

## Óvissa / þarf að staðfesta

- Codex did not inspect actual Supabase route-memory rows; duplicate cause is inferred from schema/writer/lookup behavior and Stebbi's screenshot.
- The exact "best row wins" scoring should be confirmed by Claude Code against real row shapes before implementation.
- If production already has many duplicate rows, UI/API dedupe may be enough for release, while destructive DB cleanup can wait.
