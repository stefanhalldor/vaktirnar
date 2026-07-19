# 2026-07-19 11:56 - TODO 086 v204 - Codex v203 release review

Created: 2026-07-19 11:56
Timezone: Atlantic/Reykjavik

## Findings

1. **Blocking: do not release until build is green.**
   `npm run build` currently exits non-zero after compilation with:
   - `PageNotFoundError: Cannot find module for page: /contacts`
   - `PageNotFoundError: Cannot find module for page: /home`

   Source routes do exist under `app/(app)/contacts` and `app/(app)/home`, and compiled files exist under `.next/server/app/(app)/...`, but `.next/server/app-paths-manifest.json` is incomplete after the failed build. This may be a stale/corrupt local `.next` artifact, but it is still a release blocker until Claude Code proves a clean local build or Vercel build is green.

2. **Blocking: `sql/87_weather_route_memory_route_cautions.sql` must be run before deploying v203.**
   v203 code now writes and reads `route_caution_ids` in `weather_route_memory_routes`. SQL87 is additive and looks safe after SQL86, but deploying code before SQL87 means route-memory writes can fail and route-memory lookup can miss because the selected column does not exist. The v203 handoff says both "must be run before deploy" and later "safe to deploy before sql/87"; Codex disagrees with the latter.

3. **Important pre-release check: SQL83 history is not populated yet.**
   Stebbi's read-only check showed `vegagerdin_measurements_history` has `0` rows and `newest_batch = null`. The latest manual cron returned `skipped: "alreadyFresh"`, so it did not write a fresh history batch. This is understandable, but the history fallback is not proven until a later cron run returns `status: "ok"` and rows appear, ideally around the current station count.

4. **Non-blocking: route-variant dominance is still conservative.**
   The new dedupe drops exact station-set subsets only. If `Leið 1` and `Um Hellisheiði` differ by even one station, both can still appear. That is acceptable for this release, but it explains why Stebbi may still see some near-duplicate route pills.

5. **Good: the v202 dirty-flag blocker appears fixed.**
   `WeatherThresholdBar` no longer resets `dirty` from the prop-sync effect, and targeted tests pass. I did not find a blocker in that part.

## Reviewed

- `ai-handoff/2026-07-19-1147-todo-086-v203-claude-v202-done-prerelease.md`
- `components/weather/WeatherThresholdBar.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- `lib/iceland-routes/routeMemory.server.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `messages/is.json`
- `messages/en.json`
- `vercel.json`
- `sql/87_weather_route_memory_route_cautions.sql`
- `tsconfig.json`
- `.next/server/app-paths-manifest.json` for local build diagnosis

## Commands run

- `npm run type-check` - failed locally because `.next/types/...` files were missing, including app route/page generated type files.
- `npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-observation.test.ts` - exit 0, 80 tests passed.
- `npm run build` - failed with `PageNotFoundError` for `/contacts` and `/home`.
- Read-only inspection commands for route references, `.next/server/app`, `package.json`, `tsconfig.json`, `sql/87...`, `WORKFLOW.md`, and the v203 handoff.

No SQL, deploy, commit, push, or production mutation was performed by Codex.

## SQL / production sequencing

- SQL82: should already be run before saved wind thresholds are considered production-ready.
- SQL83: table appears to exist, but history rows are not populated yet.
- SQL86: required before route memory.
- SQL87: required before deploying v203 because v203 references `route_caution_ids`.
- SQL85: do not run.

SQL87 itself is minimal:

- Adds `route_caution_ids text[] not null default '{}'` to `public.weather_route_memory_routes`.
- Adds a column comment.
- Does not change RLS, grants, auth, policies, functions, or existing data except by adding the defaulted column.

## Route intelligence check

- Affected route family: route-memory variants for `/ferdalagid` and `/vedrid`, especially Reykjavík <-> Egilsstaðir and curated variants such as `Um Hellisheiði` / `Til að sleppa við Öxi`.
- Provider coupling: station memory remains provider-qualified (`vedurstofan`, `vegagerdin`) and does not store raw Google geometry, steps, user IDs, or addresses.
- Current limitation: dedupe is station-set based, not route-family/quality based. That is simple and safe for release, but future cleanup should probably use canonical route variant metadata and station coverage quality rather than exact subset only.
- `IcelandRoadmap.md` was not updated by Codex in this review because this was a release gate review, not an implementation pass.

## Localhost checks for Stebbi

1. After SQL87 is run locally or in the target DB, calculate a route with cautions in `/ferdalagid`, then open `/vedrid` for the same pair and confirm the relevant route pill can show `Varasöm leið`.
2. On `/vedrid`, edit wind thresholds and confirm the map updates immediately and `Vista sem sjálfgefin vindmörk` stays visible until save/reset when it should.
3. Test Reykjavík <-> Egilsstaðir and confirm route pills are usable, no station pulse opens when a pill is clicked, and exact duplicate generic routes do not appear beside stronger curated variants.
4. After production cron is no longer `alreadyFresh`, run the cron once and confirm `vegagerdin_measurements_history` has rows and `/vedrid` does not show Vegagerðin as gray because of missing current data.
5. Run a clean production build before deploy. If local `.next` is stale, clean that build artifact first with explicit approval, then rerun `npm run build`.

## Verdict

**Do not deploy immediately from this state.**

Release is fine after these gates are green:

1. SQL87 has been run in production after SQL86.
2. A clean `npm run build` or Vercel build passes.
3. Stebbi accepts that SQL83 history fallback may need one fresh non-skipped cron run before rows appear, or verifies that run before release.
