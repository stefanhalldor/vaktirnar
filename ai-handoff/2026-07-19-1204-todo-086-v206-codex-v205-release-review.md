# 2026-07-19 12:04 - TODO 086 v206 - Codex v205 release review

Created: 2026-07-19 12:04
Timezone: Atlantic/Reykjavik

## Findings

1. **No code/build blocker found now.**
   Codex re-ran the key checks after Claude Code's v205 handoff. The previous `/contacts` and `/home` build failure is gone.

2. **Release remains gated on SQL87 before deploy.**
   v203+ code reads and writes `weather_route_memory_routes.route_caution_ids`. Production must have `sql/87_weather_route_memory_route_cautions.sql` applied after SQL86 before this code is deployed.

3. **SQL83 history fallback is not yet proven with rows.**
   Stebbi previously saw `vegagerdin_measurements_history` with `0` rows because cron returned `alreadyFresh`. This does not block the code release if current cache is fresh, but it must be verified soon after a non-skipped cron run so Vegagerðin does not silently depend only on short-lived cache.

## Verification run by Codex

- `npm run type-check` - exit 0.
- `npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-observation.test.ts` - exit 0, 80 tests passed.
- `npm run build` - exit 0, 97 routes built successfully, including `/contacts`, `/home`, `/vedrid`, `/vedrid/ferdalagid`, and relevant weather API routes.

Build emitted existing warnings in these areas, but they did not fail the build:

- `app/s/[sessionId]/page.tsx` hook dependencies.
- `components/landing/Avatar.tsx` raw `<img>`.
- `components/weather/IcelandOverviewMap.tsx` ref cleanup warning.
- `components/weather/TravelAuditMap.tsx` hook dependencies.
- `components/weather/WeatherOverviewClient.tsx` memo dependency warnings for route filter ID arrays.

## SQL / production sequencing

Before deploy:

1. Confirm SQL82 is already applied if saved wind thresholds are expected.
2. Confirm SQL83 is applied. Rows may still be empty until a non-skipped cron run.
3. Confirm SQL86 is applied.
4. Run SQL87.
5. Do not run SQL85.

After deploy:

1. Confirm Vercel build is green.
2. Confirm Vercel cron exists for `/api/cron/warm-vegagerdin` on `*/3 * * * *`.
3. Run or wait for a non-skipped `/api/cron/warm-vegagerdin` and verify `vegagerdin_measurements_history` gets rows.

## Route intelligence check

- Affected flow: `/ferdalagid` route calculations write route memory; `/vedrid` reads the remembered route variants and station sets.
- Affected route examples: Reykjavík <-> Egilsstaðir, especially `Um Hellisheiði`, `Til að sleppa við Öxi`, and generic fallback variants.
- The current approach stores provider station IDs and route caution IDs, not raw Google geometry, route steps, user IDs, raw addresses, or Google place IDs.
- Remaining product nuance: station-set dominance removes exact subset duplicates. Near-duplicates can still remain if station sets differ. That is acceptable for release, but should be revisited later with route-quality/canonical-route intelligence.

## Localhost checks for Stebbi

1. Open `/vedrid` and confirm the page loads without JS/runtime errors.
2. Change wind thresholds and confirm the map updates immediately and the default-threshold save button behaves correctly.
3. Select Reykjavík <-> Egilsstaðir route pills and confirm filtering changes the map without opening station pulse cards.
4. After SQL87 is applied and a route with cautions has been recalculated, confirm relevant route pills can show `Varasöm leið`.
5. Open `/vedrid/ferdalagid` from the route CTA and confirm selected `Frá`/`Til` hydrate into the first step correctly.
6. Do not casually test destructive cleanup SQL or production route-memory deletes during release verification.

## Verdict

**Code is ready for release after SQL87 is applied in production.**

Codex does not recommend deploying v203+ before SQL87. Once SQL87 is run, commit/push/deploy can proceed if Stebbi gives explicit permission to Claude Code.
