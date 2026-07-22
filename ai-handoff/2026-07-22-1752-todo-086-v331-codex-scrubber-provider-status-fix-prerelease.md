# TODO-086 v331 - Codex Scrubber Provider Status Fix

Created: 2026-07-22 17:52
Timezone: Atlantic/Reykjavik

## Context

Stebbi compared the old and new route scrubbers. The old UI showed sensible slot colors, while the new Road Intelligence scrubber marked future slots as dangerous even when selecting e.g. 18:00 showed no dangerous station on the map.

## Root Cause

`buildProviderSlotStatusOverrides()` treated Vegagerdin current observations as a constant floor for every departure slot.

That was wrong for the product model:

- Vegagerdin is current measured road-station weather.
- It belongs to the `Núna` slot.
- Future departure slots should be driven by Veðurstofan ETA-matched forecasts when available.
- Current Vegagerdin danger must not make every future hour dangerous.

## What Changed

Updated [routeSlotStatuses.ts](../lib/road-intelligence/routeSlotStatuses.ts):

- Vegagerdin current worst status now applies only to slot index `0` (`Núna`).
- Future slots start without Vegagerdin current status.
- Future slots use Veðurstofan ETA forecast status when present.
- Slots without a relevant provider status fall back to the native candidate classification.
- Updated file comments so the contract now reflects the product rule.

Updated [road-intelligence-route-slot-statuses.test.ts](../lib/__tests__/road-intelligence-route-slot-statuses.test.ts):

- Replaced tests that enforced the old “Vegagerdin floor across all slots” behavior.
- Added expectations that dangerous/current Vegagerdin values do not color calm future Veðurstofan slots.

## Files Changed

- [lib/road-intelligence/routeSlotStatuses.ts](../lib/road-intelligence/routeSlotStatuses.ts)
- [lib/__tests__/road-intelligence-route-slot-statuses.test.ts](../lib/__tests__/road-intelligence-route-slot-statuses.test.ts)

Working tree also still includes earlier RoadMap prototype changes from the same session:

- [components/weather/RoadMapPrototypeMap.tsx](../components/weather/RoadMapPrototypeMap.tsx)

Unrelated dirty file left untouched:

- `.obsidian/workspace.json`

## Commands Run

- `npm run test:run -- road-intelligence-route-slot-statuses`
  - Exit code: 0
  - 1 test file passed, 25 tests passed.
- `npm run type-check`
  - Exit code: 0
- `git diff --check`
  - Exit code: 0
  - Only CRLF warnings.

## Expected Result

When a route has dangerous Vegagerdin current observations but calm Veðurstofan forecast at a future departure hour:

- `Núna` can still be dangerous.
- Future scrubber dots should no longer inherit the current dangerous Vegagerdin status.
- Selecting a future slot should make the scrubber color agree with the visible forecast station statuses on the map.

## Route Intelligence Check

- Route scope: Road Intelligence prototype route scrubber and provider status calculation.
- Provider-neutrality: this improves provider separation rather than adding UI-specific hacks.
- Provider rule: Vegagerdin = Now/current observations; Veðurstofan = forecast/planning slots.
- IcelandRoadmap impact: no new route data, control points, canonical segments, station matching rule, or storage change.
- Privacy: no new persistence, no SQL, no auth/RLS change, no production data touched.

## Localhost Checks For Stebbi

1. Open `/auth-mvp/vedrid/road-map-prototype`.
2. Calculate the same route as in the screenshot comparison.
3. Click `Ef lagt er af stað kl.` to show future departure slots.
4. Select a future slot such as `18`.
5. Expected:
   - The selected slot color matches the worst visible station status on the map.
   - If there are no dangerous forecast station points at that slot, the slot should not be red.
   - `Núna` can still keep the Vegagerdin current status independently.
6. Toggle status pills, especially `Hættulegt`, and confirm:
   - Future-slot scrubber colors do not claim dangerous if the filtered map has no dangerous future station.
   - Counts under the map stay aligned with selected mode (`Núna` vs forecast slot).
7. Switch route option and repeat one future slot check.

No commit, push, deploy, SQL, migration, Supabase, auth, secrets, billing, or production changes were made.

## Suggested Next Step

If Stebbi confirms scrubber colors are now aligned, the next useful polish step is label behavior:

1. reduce overlap between route wind labels and station-name labels,
2. remove or hard-gate debug logs before release,
3. refine departure-slot loading/empty states,
4. then ask Claude Code for release review under the feature flag.
