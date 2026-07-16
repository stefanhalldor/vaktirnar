# TODO 086 v164 - Codex review of v163 prerelease

Created: 2026-07-14 18:06:18 +00:00

Source handoff reviewed:
- `ai-handoff/2026-07-14-1810-todo-086-v163-claude-v162-done-prerelease.md`

Mode:
- Review only.
- No application code, SQL, env, migration, commit, push, deploy or Supabase action was performed by Codex.

## Findings

### Blocker - `alreadyFresh` can mark stale Veðurstofan data as fresh

`lib/weather/providers/vedurstofan.server.ts:791-802` decides `alreadyFresh` from `weather_fetch_runs.finished_at >= expectedAtimeIso`.

That is not the same thing as “Veðurstofan delivered the expected forecast cycle”. A manual run at e.g. 15:05 can finish successfully while the provider still returns an old `atime` such as 09:00 or 12:00. Because `result_atime` is added in `sql/75_weather_fetch_runs_metadata.sql:42` but not populated in `writeRunRecord` (`lib/weather/providers/vedurstofan.server.ts:870-913`), the next manual refresh can return `alreadyFresh` from `app/api/teskeid/weather/vedurstofan/refresh/route.ts:54-55` even though the actual product rows are stale.

This directly conflicts with Stebbi's requirement: stale Veðurstofan data must be visible as stale, and the user-triggered refresh must honestly say whether new provider data arrived.

Recommended fix:
- Populate `result_atime` during projection/warm completion from the actual projected Veðurstofan payload cycle.
- Make `alreadyFresh` depend on `result_atime >= expected_atime` or the same freshness helper used by the UI, not on `finished_at`.
- Keep `finished_at` as “when our job ended”, not as proof that provider data is fresh.
- If a manual run completes but `result_atime` is still older than expected, return `recentlyAttempted` or `stillStale`, not `alreadyFresh`.

### Blocker - early projection failures can leave manual runs stuck as `running`

`projectVedurstofanCacheToProductTables(context?)` correctly accepts a run context at `lib/weather/providers/vedurstofan.server.ts:554`, and the normal final `writeRunRecord` passes that context at `lib/weather/providers/vedurstofan.server.ts:666-674`.

But the two early failure paths do not pass the context:
- `lib/weather/providers/vedurstofan.server.ts:570`
- `lib/weather/providers/vedurstofan.server.ts:576`

If the manual refresh endpoint has already inserted a `running` row (`app/api/teskeid/weather/vedurstofan/refresh/route.ts:72`) and then one of those early paths fires, the pre-inserted row can remain `status='running', finished_at=null`. Then `getVedurstofanRunState` will continue to report `running` for that expected cycle (`lib/weather/providers/vedurstofan.server.ts:804-815`), blocking further manual refresh attempts.

Recommended fix:
- Pass `context` into every `writeRunRecord` call inside projection.
- Prefer one helper/finally path that always finalizes `existingRunId`.
- Add a test for “manual running row is finalized when weather_cache read fails”.

### High - summary/worst Veðurstofan UI still bypasses the shared card

`components/weather/VedurstofanPointCard.tsx` is now used for:
- map selected point: `components/weather/TravelAuditMap.tsx:746`
- all points list: `app/auth-mvp/vedrid/FerdalagidClient.tsx:1760-1767`

But the “Á leiðinni” / worst-point summary still has bespoke Veðurstofan rendering in `app/auth-mvp/vedrid/FerdalagidClient.tsx:1313-1423`.

That means the same Veðurstofan station can still show different labels, time semantics and detail density depending on where the user sees it. Stebbi specifically asked for the Veðurstofan card content to be materially shared between worst point, selected point and all points.

Recommended fix:
- Extract the data selection/formatting into a provider-agnostic display model, or make `VedurstofanPointCard` support a compact summary variant.
- Use the same selected `prev / used / next` rows and “spá gefin út” semantics everywhere.
- Keep the summary visually compact per `Design.md` structured-summary guidance, but do not duplicate the weather meaning in a separate custom block.

### Medium - the new card can hide required route-distance fields

In `components/weather/VedurstofanPointCard.tsx`:
- ETA is only shown when both `etaIso` and `distFromOriginKm !== null` are true (`lines 145-152`).
- road distance is only shown when `distFromRoadM > 0` (`lines 153-159`).

This means:
- if ETA exists but distance-from-origin is missing, the card hides the ETA entirely;
- if the station is projected at exactly 0 m from the route, the card hides “Spápunktur um 0 m frá veginum”.

Recommended fix:
- Show ETA when `etaIso` exists, even if distance-from-origin is unknown.
- Show road distance when the value is known, including `0 m`.

### Medium - migration 75 lacks dedicated SQL / lifecycle tests

The handoff reports `npx tsc --noEmit` and `npm test` passing, and existing tests cover warmer/projector/route behavior broadly. I did not find dedicated test coverage for:
- `sql/75_weather_fetch_runs_metadata.sql`;
- the `result_atime` lifecycle;
- concurrent manual refresh state transitions;
- stale-provider response after a successful manual run;
- finalizing a pre-inserted `running` row on early failures.

Given this migration controls manual refresh correctness and anti-stampede behavior, add targeted tests before release.

## Notes

Migration 75 itself is directionally fine:
- It is additive and idempotent.
- It does not weaken RLS or grants.
- The partial unique index is a sensible DB-level guard for concurrent in-progress runs.

The problem is not the schema shape. The problem is that the new `result_atime` column is not yet used as the source of truth.

Design.md was checked for this review. Relevant constraints:
- keep mobile-first behavior and avoid overflow;
- use structured summary panels rather than nested cards;
- keep loading/disabled states stable;
- toggles are appropriate for binary provider selection.

## Recommended Next Step For Claude Code

Do not release v163 as-is.

Implement a focused v165 patch:

1. Make run freshness truthfully cycle-based:
   - derive `result_atime` from projected payloads;
   - write it for both cron and manual runs;
   - use it in `getVedurstofanRunState`;
   - only return `alreadyFresh` when actual provider cycle is fresh.

2. Harden run finalization:
   - ensure every projection failure path finalizes `existingRunId`;
   - add tests for early failure after running-row insert.

3. Finish the shared Veðurstofan card contract:
   - use the same Veðurstofan detail model/card content in worst, selected and all-points contexts;
   - preserve compact summary layout without inventing a second set of wording.

4. Add tests:
   - sql75 structure test;
   - `alreadyFresh` with stale `result_atime` must not pass;
   - `recentlyAttempted` after a stale manual attempt;
   - stuck-running prevention;
   - card field visibility for ETA-only and `0 m` route distance.

## Localhost Checks For Stebbi

Do these after Claude Code's next patch, not on current v163.

1. Run the app locally with a user that has `elta-vedrid` access and `WEATHER_ELTA_VEDRID_FLAG=true`.
2. Open `/auth-mvp/vedrid`.
3. Select a route that includes Veðurstofan stations, for example Reykjavík to Stóra-Borg.
4. Toggle `met.no` off and `Veðurstofan` on.
5. Confirm the map only shows Veðurstofan points for the Veðurstofan-only mode.
6. Confirm the scrubber, summary “Á leiðinni”, selected map point and “Allir spápunktar” all agree on:
   - same station;
   - same used forecast row;
   - same forecast issue time;
   - previous / used / next forecast rows where applicable.
7. If the UI says Veðurstofan data is stale, click “Sækja ný gögn”.
8. Expected result:
   - if Veðurstofan returns the expected cycle, the stale warning clears;
   - if Veðurstofan still returns old provider data, the UI says the refresh was attempted but the provider data is still stale;
   - a second immediate click should not start another full warm, but should explain that a recent attempt already happened.

Supabase caution:
- Do not run `sql/75_weather_fetch_runs_metadata.sql` on production until Stebbi explicitly approves it.
- Do not test manual refresh against production casually because it can call Veðurstofan for all stations and write product/cache/run rows.
