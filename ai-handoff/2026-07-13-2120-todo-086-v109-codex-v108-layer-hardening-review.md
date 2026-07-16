# TODO 086 v109 - Codex review of v108 Veðurstofan layer hardening

Created: 2026-07-13 21:20
Timezone: Atlantic/Reykjavik
Agent: Codex
Reviewed handoff: `2026-07-13-2115-todo-086-v108-claude-layer-hardened.md`

## Verdict

v108 resolves the important v107 concerns well enough to proceed toward the small UI toggle/disclaimer phase.

No blocking findings found. I would still do one tiny cleanup before or during the UI phase so the response contract is not misleading.

## Findings

### Low - Timeout timer is not cleared when product-table read wins

`app/api/teskeid/weather/travel/route.ts:260-264` uses an inline `Promise.race`:

```ts
Promise.race([
  readVedurstofanProductForStations(vedurstofanStationIds),
  new Promise<null>(resolve => setTimeout(() => resolve(null), VEDURSTOFAN_LAYER_BUDGET_MS)),
])
```

This correctly bounds the response wait, but if the Supabase product-table read resolves quickly, the timeout still remains scheduled until 1500 ms elapses. The older `withTimeout` helper cleared the timer in `finally`.

This is not a functional blocker, but for a user-facing API path it is cleaner to restore a small helper that clears the timer after the winning branch resolves.

Recommended follow-up:

- Reintroduce a `withTimeout<T>(promise, ms, fallback)` helper with `clearTimeout` in `finally`, or localize the same cleanup around this read.
- Keep the existing timeout test.

### Low - Count names say "Station" but implementation counts route points

`app/api/teskeid/weather/travel/route.ts:328-356` increments:

- `mappedStationCount`
- `availableStationCount`
- `staleStationCount`
- `unavailableStationCount`

inside a loop over `pointForecasts`. If multiple route points map to the same station, these counts are route-point coverage counts, not unique station counts.

That may be fine for the UI, because the user cares about route coverage. But the response names should not imply unique stations if they are not unique.

Recommended follow-up before UI labels:

- Either rename to `mappedPointCount`, `availablePointCount`, `stalePointCount`, `unavailablePointCount`, or
- dedupe by `stationId` if the product really wants station counts.

I lean toward point counts for the travel layer and station counts for the Elta veðrið validation page.

## What looks good

- The layer is still gated by both `VEDURSTOFAN_TRAVEL_LAYER_ENABLED` and per-user `elta-vedrid` access.
- Because `checkFeatureAccess(..., 'elta-vedrid')` itself requires `WEATHER_ELTA_VEDRID_FLAG=true`, the real rollout gate is still three-part:
  - `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`
  - `WEATHER_ELTA_VEDRID_FLAG=true`
  - per-user `elta-vedrid` access
- Timeout fallback now protects the normal MET/Yr result.
- Access denied path is tested.
- Timeout path is tested.
- `routePointId: rwp_${routeIndex}` and `routeIndex` are now aligned with `RouteWeatherPoint`.
- `partial` status exists and is ready for UI wording.
- Baseline response remains backwards-compatible.
- No extra Google or met.no calls are introduced.

## Commands run by Codex

```powershell
git status --short
git diff -- app/api/teskeid/weather/travel/route.ts lib/__tests__/weather-travel-api.test.ts
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
npm run type-check
npm run test:run
```

Results:

- Targeted tests: 2 files passed, 24 tests passed.
- Type-check: exit 0.
- Full test suite: 81 files passed, 2400 passed, 27 skipped, 8 todo.
- Full suite printed two jsdom `Not implemented: navigation to another Document` lines, but exit code was 0.

## Recommended next step

Proceed to the small UI phase, with one caveat:

1. Claude Code may either do the timer cleanup/count naming first, or fold it into the UI branch before commit.
2. Then add the UI toggle and disclaimer:
   - `Veðurstofan (í prófun)`
   - client-side instant switch between baseline `result` and `vedurstofanLayer.augmentedResult`
   - clear disclaimer that MET/Yr remains the baseline and Vegagerðin is not included yet
3. Keep the UI behind the same effective gates. If `vedurstofanLayer` is absent, the UI should behave exactly as today.

## Localhost checks for Stebbi

Before release, Stebbi should test locally:

1. With `VEDURSTOFAN_TRAVEL_LAYER_ENABLED` unset/false:
   - Run normal ferðaveður.
   - Expected: no `vedurstofanLayer` in network response and UI behaves exactly like before.

2. With all gates enabled:
   - `WEATHER_ELTA_VEDRID_FLAG=true`
   - `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`
   - Stebbi has per-user `elta-vedrid` access
   - Run the same route.
   - Expected: `vedurstofanLayer` exists, baseline `stada` remains present, and `travelPlan.routeWeatherPoints[n].vedurstofanStation` remains undefined.

3. For UI phase:
   - Toggle should not trigger new Google or met.no network calls.
   - Toggle should be instant and client-side.
   - Disclaimer should be visible when Veðurstofan layer is shown.
   - Test mobile widths around 360, 390, and 460 px for overflow/wrapping.

Do not test production cron, production Vercel env vars, production Supabase, or production feature grants without explicit approval.

## Confidence / uncertainty

Confidence is high for the v108 API/helper review. I did not inspect unrelated dirty files such as `TODO.md`, `WORKFLOW.md`, `app/auth-mvp/vedrid/page.tsx`, or the separate trip files; this review is scoped to v108.
