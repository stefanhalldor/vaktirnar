# TODO 086 v123 - Codex review of Claude v122 provider split

Created: 2026-07-13 22:45
Timezone: Atlantic/Reykjavik
Agent: Codex
Reviewed handoff: `2026-07-13-2242-todo-086-v122-claude-v121-done-prerelease.md`
Prior Codex direction: `2026-07-13-2237-todo-086-v121-codex-v119-screenshot-correction.md`

## Findings

### 1. Medium - distance-to-segment fix still lacks a direct regression test

References:
- `app/api/teskeid/weather/travel/route.ts:35-65`
- `app/api/teskeid/weather/travel/route.ts:393-395`
- `lib/__tests__/weather-travel-api.test.ts:394-422`
- `lib/__tests__/weather-travel-api.test.ts:424-435`

The implementation now uses a point-to-segment calculation instead of nearest route vertex, which is the right direction. But I do not see a direct test asserting the critical behavior from v120: a station near the midpoint of a route segment should be near-zero distance even when both segment vertices are far away.

The two new API tests cover station-based dedupe and `routePointId` shape, but not distance semantics. This matters because `N km frá leið` is now one of the main validation facts in the Veðurstofan cards.

Recommendation:
- Add one focused test around `distanceM`, either through the route API with a controlled route geometry and a known station coordinate, or by extracting the geometry helper into a small tested module.
- Test case should fail under nearest-vertex math and pass under point-to-segment math.

This does not block Stebbi from localhost-checking v122, but I would not call the distance work fully locked until this test exists.

### 2. Low/medium - top status chips may still read as "all shown points" even though they are MET/Yr route assessment counts

References:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1206-1211`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1278-1328`

v122 fixes the all-points list itself: MET/Yr gets `met.no punktar ({count})` and Veðurstofan gets `Veðurstofustöðvar við leiðina ({count}, í prófun)`.

However, Stebbi's screenshot also showed top status chips near the map summing to 72. Those appear to come from the route assessment / `TravelAuditMap` path and still reflect MET/Yr route points, not the combined provider point universe.

This is not necessarily wrong, because the main assessment is still MET/Yr-based/blended and the station list is a validation layer. But if Stebbi still reads those chips as "all points currently shown", then the UI is still ambiguous.

Recommendation:
- For this prerelease, Stebbi should specifically check whether the new section headings are enough.
- If it still feels confusing, next patch should label those chips as route-assessment/MET-derived counts or move provider counts closer to the map.

### 3. Low - v122 handoff localhost step 8 slightly contradicts current UI

References:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1281-1287`

The v122 handoff says that with `Veðurstofan` off and `met.no` on, there is "no section heading since vedurstofanLayer exists but isn't shown." Current code still shows the `met.no punktar ({count})` heading whenever `vedurstofanLayer` exists and `showMetno` is true.

That behavior is probably fine, and arguably clearer. But the handoff check should not tell Stebbi to expect no heading.

Recommendation:
- Treat this as a handoff wording mismatch, not a code blocker.

## What looks good

- The screenshot bug is materially addressed in code:
  - `RoutePointRow` now receives `providerLabel={tf('providerMetnoLabel')}` at `FerdalagidClient.tsx:1299`.
  - MET/Yr section count is separate at `FerdalagidClient.tsx:1281-1287`.
  - Veðurstofan station section count uses `vedurstofanLayer.points.length` at `FerdalagidClient.tsx:1321-1328`.
- The Veðurstofan cards are no longer presented as `Punktur 1/72`, `Yr`, or `Hrá met.no gögn` in the station list.
- Backend station list remains one point per `stationId`.
- Type comments in `vedurstofanBlend.ts` now reflect station-based points better.
- No SQL, migration, cron, Supabase, deploy, commit, push, or production operation was part of this patch.

## Tests run by Codex

```bash
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
```

Result: exit 0. 2 files passed, 26 tests passed.

```bash
npm run type-check
```

Result: exit 0.

## Design.md notes

Relevant Design.md rules checked:
- mobile-first (`Design.md:55`, `Design.md:133`)
- touch targets around 40x40 px (`Design.md:168`, `Design.md:400`)
- status meaning must not rely only on color (`Design.md:95`)
- all user-facing text belongs in messages (`Design.md:127`)
- binary settings use toggles (`Design.md:310-313`)

v122 is aligned with these at a high level: provider toggles keep `min-h-[40px]`, the new section labels are translated in both message files, and provider grouping improves meaning beyond color alone. Stebbi still needs to check real mobile wrapping at 360/390/460 px because the new headings are longer.

## Recommended next step

I would not ask Claude Code for another broad UI refactor yet.

Recommended sequence:

1. Stebbi does the localhost checks below on the exact route from the screenshot.
2. If the provider split now feels correct, Claude Code should add the missing distance regression test as a small hardening patch.
3. After that, move to the next planned UI phase: reusable provider-aware cards for worst point, selected map point, and all-points.

If Stebbi still sees only "72" and feels the Veðurstofan station count is hidden or confusing, the next patch should target the top map/status chip area before moving on.

## Localhost checks for Stebbi

Preconditions: `elta-vedrid` access, Veðurstofan layer flag on, product table warmed.

1. Run the same route as in the screenshot.
2. Turn both `met.no` and `Veðurstofan` on.
3. Open "Allir spápunktarnir".
4. Confirm MET/Yr has its own heading, for example `met.no punktar (72)`.
5. Confirm Veðurstofan has its own heading, for example `Veðurstofustöðvar við leiðina (N, í prófun)`.
6. Confirm MET/Yr cards say only `met.no`, not `met.no + Veðurstofan`.
7. Confirm Veðurstofan cards do not show `Punktur 1/72`, `Yr`, or `Hrá met.no gögn`.
8. Turn `met.no` off and leave `Veðurstofan` on. Confirm the 72 MET/Yr cards disappear and only station cards remain.
9. Turn `Veðurstofan` off and leave `met.no` on. Confirm normal MET/Yr cards remain and the route still works.
10. Look at the status chips near the map. Decide whether they are now clearly route-assessment/MET counts, or whether they still make the page feel like there are only 72 total points.
11. Check station distances for sanity against the map. Stations visually on/near the route should not show implausibly large distances.
12. Check 360, 390, and 460 px widths for heading/card wrapping and no horizontal overflow.

Do not run migrations, Supabase changes, production cron, deploy, push, or commit as part of these checks.

## Remaining open gaps

- Missing direct test for point-to-segment station distance.
- Top-level all-stale layer status still reports `available`.
- Veðurstofan stations are not yet on the map markers.
- Worst-point and selected-map-point surfaces still do not show provider-aware Veðurstofan station cards.
- `metnoBlendedLabel` remains in message files but is no longer referenced.
