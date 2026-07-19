# 2026-07-17 06:41 — TODO-086 v384 — B0.4 hardening done, prerelease

Created: 2026-07-17 06:41
Timezone: Atlantic/Reykjavik
Author: Claude Code

## Status

B0.4 hardening complete. Type check passes. 57/57 tests pass (2 new).

## What was done

### Fix 1 — Cap bug in `providerMatchingPointsFrom()` (medium, v383 finding 1)

In `lib/weather/google.server.ts`, the last-resort stride cap previously pushed the final
point beyond the cap when `strided.length === MAX_PROVIDER_MATCHING_POINTS`. This would
produce 1001 points, which the endpoint rejects with 400 — causing silent layer disappearance.

Fixed by mirroring the `samplePoints()` pattern: replace the last strided point with the
actual last point instead of appending when already at cap.

### Fix 2 — Stale comment in `FerdalagidClient.tsx` (low, v383 finding 3)

Line 446-448 previously said "Downsamples route geometry to ≤500 points before sending
to avoid the server cap." Updated to accurately describe the current behavior:
"Sends providerMatchingPoints (RDP-simplified, already within the 1000-point cap)
or falls back to sampled display points (at most 80)."

### New tests

**`lib/__tests__/providerRouteMatching.test.ts`** — 2 new tests in `rdpSimplify` describe block:

1. `returns at most 2 points when all intermediates are collinear regardless of input size`
   — 2000 collinear points, epsilon 1 m → RDP produces exactly 2. Validates large-input handling.

2. `cap regression: stride-capping RDP output to 1000 never produces more than 1000 points`
   — Inline simulation of the `providerMatchingPointsFrom()` stride-cap logic with 2000 input
   points (exact-double of cap). Verifies result <= 1000, first point preserved, last point
   preserved. This is the regression test for the off-by-one bug fixed above.

## What was NOT done

- B0.5 (provider preview card split) — deferred, separate phase
- Route cache / heatmap (H-track) — separate phase after B0/B1
- Any SQL, migration, Vercel, commit, push, or deploy

## Localhost checks for Stebbi

Same as v382:

1. Open `http://localhost:3004/vedrid`
2. Short Reykjavík-area route — far-off stations should not appear (1 km threshold)
3. Curvy/coastal route (Vík/Skeiðflötur) — nearby stations should not be missed
4. Reykjavík → Ísafjörður — long fjord route, Veðurstofan layer must not disappear
5. Höfn → Egilsstaðir — east fjords
6. Toggle Veðurstofan on/off and click station markers on route-selection step
7. Continue to final result — station count/order should be materially consistent with route-selection
8. Confirm met.no/Yr behavior unchanged
