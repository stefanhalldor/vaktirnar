# 2026-07-19 11:28 - TODO 086 v200 - Codex review of v199, release decision

Created: 2026-07-19 11:28
Timezone: Atlantic/Reykjavik

## Scope

Review of `2026-07-19-1122-todo-086-v199-claude-v198-done-prerelease` with emphasis on:

- whether Stebbi can release after v199
- whether the v198 save-default blocker is fixed
- what to do about `Leið 1` being visibly poorer than `Um Hellisheiði` for Reykjavík/Egilsstaðir

No product code, SQL, migrations, commits, pushes, deploys, or production changes were performed by Codex.

## Findings

### Medium - `Varasöm leið` is still not truly wired end-to-end

This is not a blocker if the release goal is route-memory collection and the `/vedrid` route filter. It is a blocker only if the current release must visibly label caution routes in the `/vedrid` variant pills.

Evidence:

- `sql/87_weather_route_memory_route_cautions.sql` only adds `route_caution_ids`.
- `lib/iceland-routes/routeMemory.server.ts` still intentionally omits `route_caution_ids` from the upsert payload around the route-row write.
- `lookupRouteMemory()` still selects no `route_caution_ids` column and returns `routeCautionIds: []` for every variant.
- `WeatherOverviewClient` renders `Varasöm leið` only when `variant.routeCautionIds.length > 0`, so that label cannot appear with current code.

Recommendation: do not let SQL87 create false confidence. SQL87 is additive and likely safe after SQL86, but it will not make caution pills work unless Claude Code also wires write + lookup + tests in the same release.

### Low - save-default button may be visible immediately for users with no saved defaults

The v198 blocker is fixed: `WeatherThresholdBar` now compares draft values against `savedThresholds`, and `WeatherOverviewClient` passes `savedDefaultThresholds`.

However, when `savedThresholds` is null, `draftDiffersFromSaved` is always true. Since the always-open inputs initialize from the active thresholds, the save button can appear before the user edits anything for logged-out users or logged-in users with no saved defaults.

This is probably acceptable for release because it is harmless and lets users save the current visible thresholds. It only conflicts with the v199 handoff wording that says "valid values typed" and "unchanged values: no". If Stebbi dislikes the always-visible button, make this a post-release polish by tracking whether the input has been touched or comparing against app defaults.

### Follow-up - `Leið 1` remains separate because current dedupe intentionally keeps generic variants

The screenshots match the current code behavior. `dedupeRouteVariants()` groups curated variants by `CURATED_*` label, but non-curated variants are grouped by `routeVariantKey`. A unit test explicitly preserves that behavior.

So a generic Google option named `Leið 1` can sit beside a richer curated option like `Um Hellisheiði`, even when the station set is mostly a poorer subset of the curated route.

This is not a release blocker. It is exactly the next quality pass after route-memory starts collecting real production routes.

Recommended post-release fix:

1. Keep the database rows for now. Do not hard-delete route-memory variants as the first fix.
2. Add lookup-time semantic cleanup in `lib/iceland-routes/routeMemory.server.ts`.
3. Prefer curated variants over generic variants when:
   - same from/to pair,
   - the generic station set is an exact subset or near-subset of a curated station set,
   - and the curated variant has equal or more provider stations.
4. Hide or merge the generic variant from the API response so `/vedrid` shows fewer, better pills.
5. Add tests for Reykjavík/Egilsstaðir where generic `Leið 1` is swallowed by `CURATED_VIA_HELLISHEIDI`, while truly distinct variants like `CURATED_AVOID_OXI` remain visible.

This should be done provider-neutrally from station sets and route metadata, not by storing raw Google geometry.

## Release Recommendation

Conditional yes: Stebbi can release v199 if the goal is:

- start collecting real route-memory from `/ferdalagid`
- make `/vedrid` route filtering useful now
- fix the save-default button blocker
- keep Vegagerðin warmer on a 3-minute Vercel cron

Do not treat the current state as complete for:

- `Varasöm leið` labels in `/vedrid` pills
- cleanup of poorer generic route variants like `Leið 1`
- polished route-family intelligence for Reykjavík/Egilsstaðir

## Migration / Production Gate

Before production release, explicitly confirm migration state:

- `sql/82_weather_user_preferences.sql` required for saved wind thresholds.
- `sql/83_vegagerdin_measurements_history.sql` required for Vegagerðin history fallback.
- `sql/86_weather_route_memory.sql` required for route-memory.
- `sql/87_weather_route_memory_route_cautions.sql` optional/additive, but not currently useful without code wiring.
- `sql/85` must not be run.

Running SQL is a production schema/data action and still requires explicit Stebbi approval. Codex did not run SQL.

Also confirm:

- `CRON_SECRET` exists in production.
- Vercel plan/settings support the `*/3 * * * *` cron in `vercel.json`.
- `/api/cron/warm-vegagerdin` returns healthy metadata after the first approved live run.

## Route Intelligence Check

Route family affected: Reykjavík/Egilsstaðir, especially generic Google options versus curated options such as `CURATED_VIA_HELLISHEIDI` and `CURATED_AVOID_OXI`.

This belongs in `lib/iceland-routes/` as reusable route-memory/domain logic, not in `/vedrid` UI-specific code. The better next step is lookup-time semantic cleanup using station-set dominance and curated labels. Longer term, this should be reflected in `IcelandRoadmap.md` as route-family intelligence for Icelandic long-distance routes.

No raw Google route geometry should be stored for this cleanup. Use provider station IDs, curated labels, route caution IDs, and aggregate route signatures/control points when available.

## Design Check

`Design.md` was reviewed. The current approach is compatible with the mobile-first app direction: route selection uses compact pills and avoids adding extra maps/cards above the main weather map. Post-release UI polish should continue to protect 360-460 px mobile widths, 16 px inputs, no horizontal overflow, and clear touch targets.

## Commands Run

- `Get-Content -Encoding UTF8 'WORKFLOW.md'` - exit 0
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'` - exit 0
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-19-1122-todo-086-v199-claude-v198-done-prerelease.md'` - exit 0
- `git status --short` - exit 0, with Git config ignore permission warnings only
- `Get-Content -Encoding UTF8 'Design.md'` - exit 0
- `npm run type-check` - exit 0
- `npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-observation.test.ts` - exit 0, 3 files / 76 tests passed

## Localhost Checks for Stebbi

Before release, Stebbi should test on localhost:

1. Open `/vedrid`.
2. Confirm the page loads with no route selected and no console/network errors from route-memory endpoints.
3. Change wind thresholds. Expected: map updates immediately.
4. If logged out, click `Vista sem sjálfgefin vindmörk`. Expected: redirect to login only after click, not while typing.
5. If logged in, save changed thresholds, reload `/vedrid`, and confirm saved values auto-apply.
6. Select route-memory places for Reykjavík/Egilsstaðir or Egilsstaðir/Reykjavík. Expected: `Allar leiðir` plus variant pills appear when multiple variants exist.
7. Click `Leið 1`, `Um Hellisheiði`, and `Allar leiðir`. Expected: map station set changes and no station detail card opens just from clicking pills.
8. Click `Ferðalagið` after selecting a route. Expected: `/vedrid/ferdalagid` opens with both from/to filled correctly.
9. Compute or open a route in `/vedrid/ferdalagid`, return to `/vedrid`, focus/reload, and confirm the route-memory picker refreshes.
10. Switch between Vegagerðin `Núna` and Veðurstofan forecast slots. Expected: route filters apply consistently to the active provider layer.

Do not casually test production cron or run migrations from localhost. Production SQL, cron triggering, deploy, push, and Vercel checks require explicit approval.

## Questions for Claude Code Next

1. Should `Varasöm leið` be wired now by running SQL87 plus updating write/lookup/tests, or explicitly deferred?
2. Should the no-saved-default threshold button stay visible on initial load, or should it appear only after user edits?
3. For route cleanup, should generic variants be hidden when their provider-station set is a subset of a curated variant for the same pair?

