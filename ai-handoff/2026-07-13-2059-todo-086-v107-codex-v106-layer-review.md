# TODO 086 v107 - Codex review of v106 Veðurstofan travel layer

Created: 2026-07-13 20:59
Timezone: Atlantic/Reykjavik
Agent: Codex
Reviewed handoff: `2026-07-13-1930-todo-086-v106-claude-vedurstofan-layer-done.md`

## Verdict

v106 is directionally good: MET/Yr baseline remains unchanged, Veðurstofan is behind a server flag plus `elta-vedrid` access, no extra Google/met.no calls are introduced, and the new blend helper is well tested.

I would not move straight into UI yet. Claude Code should do a small hardening patch first so the API contract is safer for the next phase.

## Findings

### Medium - Product-table read has no response budget

`app/api/teskeid/weather/travel/route.ts:255-259` now awaits `readVedurstofanProductForStations(...)` directly. The helper itself catches thrown errors, but it does not impose a timeout around the Supabase/PostgREST reads in `lib/weather/providers/vedurstofan.server.ts:241-250`.

This means a slow or hanging Supabase product-table read can still delay the main travel-weather response for users with the layer enabled. That breaks the important product rule: Veðurstofan must be fail-open and must not make the normal MET/Yr travel result feel slower or fragile.

Recommended fix:

- Reintroduce a small route-level budget around the product-table read, for example 1000-2000 ms.
- On timeout, return `null` or an unavailable layer and still return the baseline MET/Yr result.
- Restore/add a test where `readVedurstofanProductForStations` never resolves and the API still returns a normal 200 baseline response after the budget.

### Medium - Layer status hides partial coverage

`app/api/teskeid/weather/travel/route.ts:341-345` sets:

```ts
status: layerPoints.length > 0 ? 'available' : 'unavailable'
```

That collapses partial coverage into `available`. Given the known current state, where local warm runs return 246 fresh/projected and 34 unavailable stations, this matters a lot. The UI must not imply "Veðurstofan available for the route" if only some mapped route points/stations have usable rows.

Recommended fix before UI:

- Extend `VedurstofanTravelLayer.status` in `lib/weather/providers/vedurstofanBlend.ts` to include `partial`.
- Add counts, for example `mappedStationCount`, `availableStationCount`, `staleStationCount`, `unavailableStationCount`.
- Use `available` only when every mapped station/route point that should have data has usable data.
- Use `partial` when at least one point has data but one or more mapped points are missing/unavailable.

### Low - `routePointId` should use the existing stable point identity

`app/api/teskeid/weather/travel/route.ts:329-331` uses:

```ts
routePointId: `${pf.lat},${pf.lon}`,
```

The rest of the travel-weather system identifies route points by `routeIndex` and `RouteWeatherPoint.id = rwp_${pt.routeIndex}` (`lib/weather/travel.ts:245-247`, `lib/weather/types.ts:23-32`). Lat/lon strings are harder to join reliably in the UI and can create awkward floating-point/string matching later.

Recommended fix:

- Include `routeIndex: pf.routeIndex`.
- Set `routePointId: `rwp_${pf.routeIndex}``.
- Keep lat/lon/distance if the UI needs display context, but do not make them the primary join key.

### Low - Add one denied-access test

`lib/__tests__/weather-travel-api.test.ts` covers flag off, enabled with data, unavailable, stale, and no mapped stations. It does not explicitly cover:

- `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`
- authenticated user exists
- `checkFeatureAccess(..., 'elta-vedrid')` returns false
- product table is not read and no `vedurstofanLayer` is returned

The code appears to do the right thing, but this is an easy regression test and protects the per-user gate Stebbi asked for.

## What looks good

- Baseline `result` remains the existing MET/Yr result.
- `vedurstofanLayer` is optional and additive.
- The blend helper only raises wind/precipitation and never lowers MET/Yr.
- Temperature is not blended into scoring yet.
- Stale station rows are preserved in layer metadata.
- The old `vedurstofanStation` mutation on `travelPlan.routeWeatherPoints` was removed from this path.
- Tests confirm disabled layer does not call the product table.

## Flag/access clarification

This implementation is gated by three things in practice:

1. `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true` in the server environment.
2. `WEATHER_ELTA_VEDRID_FLAG=true`, because `checkFeatureAccess(..., 'elta-vedrid')` requires it.
3. Per-user `elta-vedrid` access in `feature_access`.

That is a good safety model. It should be documented in the next handoff so Vercel/local setup does not accidentally miss one of the flags.

## Commands run by Codex

```powershell
git status --short
git diff -- app/api/teskeid/weather/travel/route.ts lib/__tests__/weather-travel-api.test.ts lib/weather/providers/vedurstofanBlend.ts lib/__tests__/weather-vedurstofan-blend.test.ts
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
npm run type-check
npm run test:run
```

Results:

- Targeted tests: 2 files passed, 22 tests passed.
- Type-check: exit 0.
- Full test suite: 81 files passed, 2398 passed, 27 skipped, 8 todo.
- Full suite printed two jsdom `Not implemented: navigation to another Document` messages, but exit code was 0.

## Recommended next step for Claude Code

Claude Code should do a small v108 hardening patch before UI:

1. Add route-level timeout/fallback around `readVedurstofanProductForStations`.
2. Add test for never-resolving product-table read.
3. Add `partial` status and simple counts to `VedurstofanTravelLayer`.
4. Change layer point identity to `routeIndex` / `rwp_${routeIndex}`.
5. Add denied-access test for `elta-vedrid`.

After that, the API contract is stable enough for the small UI toggle/disclaimer phase.

## Localhost checks for Stebbi

After Claude Code patches v108:

1. With `VEDURSTOFAN_TRAVEL_LAYER_ENABLED` unset/false:
   - Run a normal ferðaveður route.
   - Expected: UI behaves exactly like before, and the API response has no `vedurstofanLayer`.

2. With all three gates enabled for Stebbi:
   - `WEATHER_ELTA_VEDRID_FLAG=true`
   - `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`
   - Stebbi has per-user `elta-vedrid` access
   - Run the same route.
   - Expected: baseline result still appears, `vedurstofanLayer` is present, and `status` can honestly show `available`, `partial`, or `unavailable`.

3. For a route that maps near unavailable stations:
   - Expected: baseline still works, layer says `partial` or `unavailable`, and the UI later can explain that Veðurstofugögn are still in testing.

4. Do not test production cron, production Vercel env vars, or production Supabase changes casually. Those need explicit Stebbi approval.

## Confidence / uncertainty

Confidence is high on the API review points above. I did not inspect every unrelated dirty file in the worktree; the review is intentionally scoped to v106 files and their immediate dependencies.
