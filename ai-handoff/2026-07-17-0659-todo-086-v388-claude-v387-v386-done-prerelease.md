# 2026-07-17 07:02 — TODO-086 v388 — B0.7 + B0.6 done, prerelease

Created: 2026-07-17 07:02
Timezone: Atlantic/Reykjavik
Author: Claude Code

## Status

B0.7 (Öxi caution evidence fix) and B0.6 (route control points) implemented.
Type check passes. 85/85 tests pass (28 new across 3 test files).

---

## B0.7 — Provider evidence for Öxi caution (v387)

### Root cause confirmed

The Höfn → Egilsstaðir route passes the Veðurstofan `Öxi` station at 0.0 km but the
`oxi-axarvegur-939` caution never fired. The approximate corridor point `(64.860, -14.365)`
is ~14 km from the actual station `(64.8257, -14.6573)`. With 10 km radius, the detection
missed.

### Changes

**`lib/weather/routeCautions.ts`**

- Extended `present-near-corridor` detection type with optional `evidencePoints`:
  - Exact-coordinate markers (e.g. Veðurstofan stations) that supplement approximate
    corridor points with tight-radius detection.
  - Independent of provider feature access — road intelligence facts, not forecast data.

- Added evidence point to Öxi segment:
  ```ts
  evidencePoints: [{ lat: 64.8257, lon: -14.6573, radiusM: 1_500,
    note: 'Veðurstofan station Öxi (stationId 35963)' }]
  ```

- Updated `matchRouteCautions`: `present-near-corridor` now fires when EITHER
  `corridorPoints` OR `evidencePoints` triggers. Backward-compatible — existing tests pass.

**`lib/__tests__/weather-route-cautions.test.ts`** — 2 new tests:
- Route via actual station coordinates `(64.826, -14.658)` fires caution
- Existing corridor point detection still fires (backward compat)

---

## B0.6 — Route control points (v386)

### Problem

Google HIGH_QUALITY polyline + RDP still produces chord geometry in known problem areas
(e.g. Route 1 between Vík and Skeiðflötur). Provider stations near the actual road can be
missed when matched against the chord.

### New file: `lib/weather/routeControlPoints.ts`

- `RouteControlSection` type:
  - `gates` — all must match for anchors to activate (prevents injection on unrelated routes)
  - `anchors` — ordered road-following points replacing the chord between gate-nearest points
  - `verified: boolean` — must be set `true` after localhost visual check

- `ROUTE_CONTROL_SECTIONS` registry — first entry:
  ```
  id: 'ring-road-vik-skeidflotur'
  PENDING VERIFICATION — approximate coordinates for Route 1 Vík/Skeiðflötur/Vatnsskarðshólar
  gates: west of Vík (63.418, -19.383, r=8km) + east of Skeiðflötur (63.440, -18.550, r=8km)
  anchors: 6 points following coastal Route 1 between the gates
  ```

- `augmentProviderMatchingPoints(points, sections?, maxPoints?)`:
  - For each section where all gates match, replaces chord with section anchors
  - Handles both travel directions (east→west and west→east)
  - Caps at maxPoints using endpoint-preserving stride (same pattern as samplePoints)
  - Returns unchanged points when no section matches

### `lib/weather/google.server.ts`

- Imports `augmentProviderMatchingPoints` and `ROUTE_CONTROL_SECTIONS`
- `providerMatchingPointsFrom` now: RDP → augment → cap (cap is inside augment)
- All three route functions (`getRouteGeometry`, `getRouteOptions`, `fetchCuratedRoute`)
  automatically use the updated `providerMatchingPointsFrom`

### `lib/__tests__/routeControlPoints.test.ts` — new file, 13 tests:
- Unrelated route: no augmentation
- Single gate only: no augmentation
- Both gates matched: anchors injected
- First/last points preserved after augmentation
- Cap never exceeded after augmentation (dense 990-point route)
- Empty input handled safely
- Reversed direction (east→west) works
- Regression: station near anchor (not near chord) found at 1 km threshold
- Registry: unique IDs, ≥2 gates per section, ≥2 anchors per section

---

## What was NOT done

- B0.5 provider preview shell — deferred, separate phase
- Vegagerðin, SQL, route cache, heatmap, overview map, env, commit, push, deploy

---

## Localhost checks for Stebbi

### B0.7 — Öxi caution
1. Open `http://localhost:3004/vedrid`
2. Test `Höfn → Egilsstaðir`
3. Confirm route option shows caution chip `Varasamt með eftirvagna` and Öxi summary text
4. Confirm alternate `Til að sleppa við Öxi` via Reyðarfjörður appears
5. Test `Egilsstaðir → Höfn` (reverse) — same caution should fire
6. Test a coastal fjord route that does NOT go over Öxi — no caution

### B0.6 — Route control points (Vík/Skeiðflötur)
**These coordinates are APPROXIMATE. Verification is required:**

1. Open `http://localhost:3004/vedrid`
2. Test `Reykjavík → Egilsstaðir` (or similar long east route)
3. On route-selection map near Vík/Skeiðflötur, confirm Veðurstofan stations appear
   that previously fell just outside 1 km from the chord
4. Test a short route (e.g. Selfoss → Þorlákshöfn) and confirm no spurious stations
   appear from the Vík section injecting anchors on unrelated routes
5. Check developer console for any errors

**If gate coordinates are wrong (section never activates or activates on wrong routes):**
- Update `gates` coordinates in `ROUTE_CONTROL_SECTIONS` in `routeControlPoints.ts`
- Update `verified: false` → `true` only after confirmed visual check
- No SQL, deploy, or push needed — just code edit

---

## Open for Codex review

- Are the Vík/Skeiðflötur gate coordinates conservative enough to avoid false positives
  on routes that only pass through Vík but don't go east toward Skeiðflötur?
- Should anchor injection happen before RDP (on allPoints) rather than after? RDP then
  runs on corrected geometry and might preserve anchors more naturally.
- Should `verified: false` sections be skipped in production builds?
