# TODO 086 v166 - Codex review of v165 prerelease

Created: 2026-07-14 19:16:57 +00:00

Source handoff reviewed:
- `ai-handoff/2026-07-14-1900-todo-086-v165-claude-v164-done-prerelease.md`

Mode:
- Review only.
- No application code, SQL, env, migration, commit, push, deploy or Supabase action was performed by Codex.

## Findings

### Blocker - Freshness is still too permissive: one fresh station can make stale route data look fresh

v165 correctly moves `alreadyFresh` away from `finished_at` and onto `result_atime`, but the value being written is currently the **maximum** `atimeIso` across successfully projected stations:

- `lib/weather/providers/vedurstofan.server.ts:585`
- `lib/weather/providers/vedurstofan.server.ts:659-662`
- `lib/weather/providers/vedurstofan.server.ts:877-916`

The manual refresh endpoint also reports success with:

- `app/api/teskeid/weather/vedurstofan/refresh/route.ts:87`

```ts
const dataIsFresh = warmResult.fresh > 0
```

That is too weak for Stebbi's product requirement. If one Veðurstofan station has the expected cycle but the route stations visible to the user are still on an older cycle, the API can return `fresh` / later `alreadyFresh` even though the user is still looking at stale route data.

This can recreate the exact confusing state Stebbi complained about: banner/card says the route station forecast is old, user clicks “Sækja ný gögn”, and the system says it is fresh because some other station refreshed.

Recommended fix:
- Treat all-station freshness conservatively.
- Either store a conservative `result_atime` as the **minimum** `atimeIso` across successfully projected usable stations, or store both min/max and use the min for `alreadyFresh`.
- In the refresh endpoint, do not use `warmResult.fresh > 0`. Use a conservative rule such as `warmResult.fresh > 0 && warmResult.stale === 0`, or better, return status from the same `result_atime` rule used by `getVedurstofanRunState`.
- Add tests for mixed provider cycles:
  - station A has expected cycle, station B has stale cycle;
  - run must not become `alreadyFresh` if the conservative result is stale;
  - endpoint must return `stillStale`, not `fresh`.

If Claude Code intentionally wants route-specific freshness instead of all-station freshness, the endpoint needs route context. Current `/refresh` endpoint has no route/station context, so global “fresh” must be conservative.

### Blocker - Manual refresh does not reload the displayed Veðurstofan layer

`handleRefreshVedurstofan` calls the refresh endpoint and only updates `vedurstofanRefreshState`:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:465-477`

It does not refetch `/api/teskeid/weather/travel`, replace `vedurstofanLayer`, or otherwise update the currently displayed forecast rows.

So even if the background refresh writes new rows to Supabase, the current screen can keep rendering the old `vedurstofanLayer` that was loaded before the user clicked “Sækja ný gögn”. Worse, if the endpoint returns `fresh` or `alreadyFresh`, the UI state becomes `fresh` while stale rows may still be visible until the user recomputes the route or reloads the page.

Recommended fix:
- After a successful refresh that returns `fresh` or `alreadyFresh`, refetch the current travel result/layer with the same route inputs and selected route context.
- Keep the banner in `refreshing`/pending state while the follow-up layer read is happening.
- Only set UI state to `fresh` after the currently displayed `vedurstofanLayer.layerAtimeIso` is fresh according to `isVedurstofanCycleFresh`.
- If the follow-up layer still contains old station data, show `stillStale`.

This is also a Design.md/navigation-state issue: loading/pending states should reflect the actual data update, not only the warm API response.

### High - Worst-point summary still has bespoke Veðurstofan rendering

This was acknowledged as deferred in v165. It remains open:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1313-1423`
- `components/weather/VedurstofanPointCard.tsx` is used for selected map point and all-points list, but not for the “Á leiðinni” worst-point summary.

Stebbi explicitly asked that the same Veðurstofan content model be used materially across:
- worst point;
- selected point;
- all points.

Recommendation:
- Do not make this a big design fork.
- Extract a shared `VedurstofanPointDisplayModel` / selector helper for `prev`, `used`, `next`, issue time, ETA, road distance and source link.
- Render that model with two presentational variants:
  - compact summary rows for `Á leiðinni`;
  - full card for selected/all points.

That follows `Design.md` structured-summary guidance without duplicating weather semantics.

### Medium - Two Veðurstofan flags now exist and the contract is unclear

I found two separate gates:

- `WEATHER_ELTA_VEDRID_FLAG` controls `elta-vedrid` feature access through `lib/loans/guard.ts:80-83`.
- `VEDURSTOFAN_TRAVEL_LAYER_ENABLED` controls whether `/api/teskeid/weather/travel` reads the product table in `app/api/teskeid/weather/travel/route.ts:342-358`.

`app/api/teskeid/weather/vedurstofan/refresh/route.ts` uses `checkFeatureAccess(..., 'elta-vedrid')`, so it respects `WEATHER_ELTA_VEDRID_FLAG`, but it does not check `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`.

This may be intentional, but it needs to be explicit before release. If Stebbi's intended contract is “all Veðurstofan travel-layer behavior is under the same flag”, then this split is a footgun.

Recommendation:
- Prefer one clearly named flag for the whole experimental Veðurstofan travel layer, plus per-user `elta-vedrid`.
- If keeping both:
  - document why;
  - add `.env.example`;
  - make refresh endpoint require the same travel-layer flag if refresh is only useful for that layer;
  - add tests for flag-off behavior on both travel and refresh endpoints.

### Low - Run-state tests do not assert the query contract

The new `weather-vedurstofan-run-state.test.ts` is helpful, but the fluent mock returns whatever `maybeSingle` is configured to return. It does not assert that `getVedurstofanRunState` actually filters by:

- `.not('result_atime', 'is', null)`
- `.gte('result_atime', expectedAtimeIso)`
- `expected_atime` for running/recent attempts.

Static review confirms the code currently uses `result_atime`, but the regression test would not fail if the query accidentally went back to `finished_at`.

Recommendation:
- Add a table-aware query mock or spy chain that records `eq`, `not`, `gte`, `in`, and verifies the critical filters.

## What Looks Good

- v165 fixes the v164 direct blocker where `finished_at` was treated as proof of freshness.
- Early projection failures now pass `context` to `writeRunRecord` and can finalize pre-inserted running rows.
- `VedurstofanPointCard` now shows ETA without requiring distance-from-origin and includes `0 m` road distance.
- SQL 75 remains additive and does not weaken RLS/grants.
- The new sql/projector/run-state tests are a solid move, though they need the mixed-cycle cases above.

## Recommended Next Step For Claude Code

Do not release v165 yet.

Implement a small v167 patch focused on correctness:

1. Make `result_atime` conservative:
   - use minimum projected `atimeIso`, or store min/max and use min for freshness gating;
   - update `alreadyFresh` tests accordingly.

2. Make refresh response conservative:
   - never return `fresh` from “at least one station fresh”;
   - add mixed-cycle/stale-station tests.

3. Make UI refresh reload displayed data:
   - after `fresh`/`alreadyFresh`, refetch the travel layer/current route result;
   - only show “fresh” when the newly displayed layer is fresh;
   - keep stale message if the provider remains stale.

4. Clarify/align flags:
   - either use the same experimental flag everywhere, or document and test the two-flag contract.

5. Then address shared Veðurstofan summary rendering:
   - shared display model first;
   - compact summary variant second.

## Localhost Checks For Stebbi

After Claude Code's next patch:

1. Open `/auth-mvp/vedrid` with a user that has `vedrid`, `ferdalagid`, and `elta-vedrid` access.
2. Use a route with visible Veðurstofan stations, for example Reykjavík to Stóra-Borg.
3. Toggle `met.no` off and `Veðurstofan` on.
4. Confirm stale banner behavior:
   - if any displayed route station uses old Veðurstofan `atime`, the banner should remain stale;
   - click “Sækja ný gögn”;
   - the UI should show a pending/refreshing state until the visible layer is reloaded;
   - if the visible route stations are still stale, it must say still stale, not fresh.
5. Confirm mixed-provider mode:
   - toggle both `met.no` and `Veðurstofan` on;
   - scrubber and summary should reflect the worst status from all selected providers.
6. Confirm summary consistency:
   - “Á leiðinni”, selected map point, and “Allir spápunktar” should agree on station, used forecast time, forecast issue time, and values.
7. Confirm unflagged behavior:
   - with the Veðurstofan layer flag off or user lacking `elta-vedrid`, the route result should remain met.no-only and no Veðurstofan layer/refresh controls should appear.

Supabase caution:
- Do not run `sql/75_weather_fetch_runs_metadata.sql` on production without explicit approval.
- Do not test manual refresh casually against production unless Stebbi intends to trigger all-station Veðurstofan warm and product-table writes.
