# TODO 086 v120 - Codex review of Claude v119 station-layer correction

Created: 2026-07-13 22:35
Timezone: Atlantic/Reykjavik
Agent: Codex
Reviewed handoff: `2026-07-13-2232-todo-086-v119-claude-v118-done-prerelease.md`
Relevant prior direction: `2026-07-13-2222-todo-086-v118-codex-station-points-correction.md`

## Findings

### 1. Medium/high - station distance is still not true distance to the route line

References:
- `app/api/teskeid/weather/travel/route.ts:35-42`
- `app/api/teskeid/weather/travel/route.ts:370-372`
- `lib/weather/google.server.ts:38-49`
- `lib/weather/google.server.ts:289`

v119 correctly stops duplicating one Veðurstofan station per MET/Yr sample, but the new `distanceToPolylineM` only checks distance from the station to each sampled route vertex:

```ts
for (const pt of polyline) {
  const d = haversineM(lat, lon, pt.lat, pt.lon)
  if (d < min) min = d
}
```

That means a station can be directly beside the road segment between two route points and still show as far away if the nearest sampled vertex is several km away. This matters because Stebbi's core correction was semantic accuracy: Veðurstofan distance must mean "this station is X from the route/road", not "X from a nearby MET/Yr point" or "X from the nearest sampled route vertex".

There is a second subtlety: `routeGeometry.points` comes from `samplePoints(..., MAX_ROUTE_POINTS)` in `google.server.ts`, so it is not necessarily the full Google GeoJSON route line. Measuring against sampled vertices makes this even more approximate.

Recommendation for Claude Code:
- Minimum safe fix: compute minimum point-to-segment distance across consecutive `routeGeometry.points`, not only vertex distance.
- Better future-proof fix: keep both concepts separate in the route provider:
  - full or denser route polyline for geometry/distance/audit,
  - sampled route weather points for MET/Yr forecasts.
- Add a test where the station lies on the midpoint of a route segment; expected distance should be near zero even if both vertices are far away.

Until this is fixed, the UI should not be trusted as accurate for `N km frá leið`.

### 2. Medium - the regression Stebbi saw is not locked by tests

References:
- `lib/__tests__/weather-travel-api.test.ts:272-289`
- `lib/__tests__/weather-travel-api.test.ts:287`

The current targeted API test checks that one happy-path station returns one layer point:

```ts
expect(body.vedurstofanLayer.points).toHaveLength(1)
expect(body.vedurstofanLayer.points[0].stationId).toBe(HELLISH_ID)
```

That is useful, but it does not specifically protect against the bug Stebbi found: 72 MET/Yr route samples each rendering the nearest Veðurstofan station as repeated Veðurstofan cards.

Recommendation for Claude Code:
- Add a regression test that proves `vedurstofanLayer.points` is station-based:
  - multiple route/MET sample points exist,
  - they would map to the same station in the old model,
  - the final layer has exactly one `routePointId === vedurstofan_${stationId}`.
- Add at least one assertion for `distanceM` semantics so the helper cannot quietly fall back to nearest-vertex math again.

This is exactly the kind of product bug that will reappear unless the test states the model in code.

### 3. Medium - v119 does not fully complete the user-facing v118 request

References:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1281-1317`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1813-1846`

v119 fixes the "Allir spápunktarnir" Veðurstofan list model, but it does not yet show station-based Veðurstofan cards in all the places Stebbi explicitly named:

- worst/summary point card
- selected point on map/card
- all forecast points/list

The current `VedurstofanPointRow` is only rendered inside the explainer/all-points area. v119 also states this as an open gap, so this is not a hidden mistake, but the handoff says it "Implements v118"; that is too strong. It implements the station-list correction part of v118.

Recommendation for Claude Code:
- Do not treat v118 as done/final.
- Next UI phase should extract a provider-aware point/card component and use it consistently in the three surfaces.
- Keep MET/Yr and Veðurstofan visually separate until the blended calculation is product-approved.

### 4. Low/medium - type names/comments still carry the old route-point mental model

References:
- `lib/weather/providers/vedurstofanBlend.ts:55-64`
- `lib/weather/providers/vedurstofanBlend.ts:72`

The comments now partly contradict the station-based model:

- `mappedPointCount` says "Route points (not unique stations)"
- `points` says "Per-route-point station metadata"
- `distanceM` says "nearest vertex", which documents the current approximation but conflicts with the product wording "frá leið"

Recommendation:
- Either rename the count fields to station language before this becomes a stable API, or at least update comments to say they are station counts.
- After fixing finding 1, update `distanceM` docs to "nearest route segment/polyline" rather than "nearest vertex".

This is not a runtime bug, but it invites the exact old-model confusion back into future patches.

### 5. Existing carried-over risk - stale-only layer still reports `available`

References:
- `app/api/teskeid/weather/travel/route.ts:390-393`
- `lib/__tests__/weather-travel-api.test.ts:335-347`

This was already known from earlier reviews and v119 did not try to fix it. Current behavior still reports the layer as `available` when the only returned station rows are stale.

This may be acceptable for an internal validation layer if the UI clearly marks each station stale, but it is risky for user trust once this gets closer to release.

Recommendation:
- Decide product semantics:
  - `available` = at least one usable row, even stale, with row-level stale badges, or
  - `stale`/`partial-stale` top-level status.
- Keep this as a separate small patch if we do not want to block the station-model correction.

## What looks good

- The central model correction is in the right direction: `app/api/teskeid/weather/travel/route.ts:359-388` now loops over `vedurstofanResults` by `stationId`, not over MET/Yr `pointForecasts`.
- `routePointId: vedurstofan_${stationId}` is the right stable identity for station cards.
- The UI now shows station ID, distance, status, wind direction, precipitation unit, temperature, weather text, and `vedur.is` link in the station row.
- `met.no` and `Veðurstofan` are visually more separate in the all-points area than before.
- No SQL, migration, cron, Supabase, deploy, commit, push, or production operation was part of v119.

## Tests run by Codex

```bash
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
```

Result: exit 0. 2 files passed, 24 tests passed.

```bash
npm run type-check
```

Result: exit 0.

## Design.md notes

Relevant rules checked:
- Mobile-first layout at 360/390/460 px.
- Touch targets should generally be at least 40x40 px.
- Text and controls must not overflow or overlap.
- Status meaning must not rely on color alone.
- Translation/user-facing text should live in message files.

v119 is broadly aligned in the station-row area: compact rows, translated unit key for new precipitation text, wrapping metadata, and 40 px provider toggles in the summary card. The remaining design/product issue is consistency: one shared provider-aware point component should eventually power all three surfaces rather than separate ad hoc rows.

## Recommended next step

Ask Claude Code for one focused v121 patch before release-style validation:

1. Replace nearest-vertex distance with point-to-segment route distance.
2. Add tests for station-based dedupe and distance-to-segment semantics.
3. Update `VedurstofanTravelLayer` comments/names so the API describes station points, not route points.
4. Keep map markers/worst/selected reusable card work as the next UI phase after distance correctness is locked.

This is the best sequence because it protects the data model first. UI polish and shared components are easier once the station objects and distance semantics are trustworthy.

## Localhost checks for Stebbi

After Claude Code fixes the distance/test items, Stebbi should test on localhost with `elta-vedrid` access and Veðurstofan layer enabled:

1. Open Ferðaveðrið and run a route where the earlier duplicate station bug was obvious.
2. In provider filters, turn `met.no` off and keep `Veðurstofan` on.
3. Open "Allir spápunktarnir".
4. Confirm each Veðurstofan station appears once only.
5. Confirm the station list count is not tied to the 72 MET/Yr route samples.
6. Check station distances against the map by sanity:
   - stations visually on/near the route should not show many km away,
   - stations clearly off-route should show a plausible larger distance.
7. Turn `met.no` back on and confirm MET/Yr and Veðurstofan sections remain separate and readable.
8. At mobile widths around 360, 390, and 460 px, confirm station name, ID, distance, stale label, weather values, and links wrap without horizontal overflow.
9. Do not run migrations, Supabase changes, deploy, or production cron for this check.

## Questions for Stebbi / Claude Code

- Is "frá leið" allowed to mean approximate distance to the sampled route line, or do we want to preserve/use the full Google polyline for more exact station-to-road distance?
- Should a layer with only stale Veðurstofan rows be top-level `available`, or should the summary clearly say stale/old data?
- Should the next visible UI phase prioritize map markers first, or shared provider cards across worst/selected/all-points first?
