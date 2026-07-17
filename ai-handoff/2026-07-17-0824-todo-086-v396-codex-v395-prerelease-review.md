# 2026-07-17 08:24 — Codex review of v395

Source handoff: `2026-07-17-0819-todo-086-v395-claude-v394-done-prerelease`

Manual context from Stebbi: Öxi route works in localhost, screenshot `2026-07-17 082213`.

## Findings

No blocking findings.

v395 looks correct for the immediate Öxi regression:

- The new production-guard tests in `lib/__tests__/routeControlPoints.test.ts:203` to `lib/__tests__/routeControlPoints.test.ts:233` cover both production skip and dev/test inclusion for `verified: false` route-control sections.
- `lib/weather/google.server.ts:376` to `lib/weather/google.server.ts:383` now uses `evidencePointsOnly` for the Öxi curated route validation/display path, so the broad 10 km approximate corridor point does not incorrectly mark the coastal Reyðarfjörður avoidance route as still being Öxi.
- `lib/__tests__/weather-google.test.ts:1290` to `lib/__tests__/weather-google.test.ts:1297` now checks that the curated route is still suppressed if it passes the precise Öxi station evidence point.

## Non-blocking Follow-up

### Low / future-proofing: make `evidencePointsOnly` per caution before many more road hazards

Current code uses `evidencePointsOnly` for the whole caution pass on `avoid-oxi-via-reydarfjordur` in `lib/weather/google.server.ts:376` to `lib/weather/google.server.ts:380`.

That is fine for the current model because:

- Öxi is the only `present-near-corridor` hazard with evidence points right now.
- The Westfjords warning uses `missing-via`, so it is not affected by `evidencePointsOnly`.
- Stebbi's localhost screenshot confirms the intended product behavior for the Öxi route.

But before we add many more geometry-based hazardous road sections, I would tighten this API so Öxi-specific evidence validation cannot accidentally hide a different future `present-near-corridor` warning on the same curated route.

Preferred future shape:

- compute full display cautions;
- compute evidence-only validation only for the trigger caution;
- remove/suppress only the trigger caution from display when the evidence-only check says the curated route successfully avoids it;
- keep all other display cautions intact.

This is not a blocker for v395, but it is worth carrying into the next road-intelligence phase.

## Commands Run

```powershell
npm run type-check
```

Exit code: `0`

```powershell
npm run test:run -- lib/__tests__/providerRouteMatching.test.ts lib/__tests__/routeControlPoints.test.ts lib/__tests__/weather-route-cautions.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/weather-provider-stations.test.ts
```

Exit code: `0`

Result: 6 test files passed, 207 tests passed.

## Supabase / Auth / RLS

No SQL, Supabase, auth, RLS, grants, service-role, secrets, or production data changes were part of this review.

## Release / Next-step Readiness

From code review, focused tests, and Stebbi's Öxi localhost confirmation, v395 is ready to move to the next implementation step.

One separate product-state note remains from earlier reviews:

- `ring-road-vik-skeidflotur` is still `verified: false`, so its route-control behavior is active in dev/test and skipped in production.
- If Stebbi wants that Vík/Skeiðflötur correction live in production, do a focused visual localhost confirmation and then ask Claude Code for a tiny follow-up to set it `verified: true`.

## Recommended Next Step

Proceed with the planned next phase around Veðurstofan/Vegagerðin provider-station route matching and route-selection station layer, but keep the future-proofing note above in the plan before adding many more `present-near-corridor` hazards.

Do not mix that larger provider-station phase with production deploy mechanics. Keep it as a normal prerelease implementation/review loop.

## Localhost checks for Stebbi

Before release or before using this as baseline for the next phase:

1. Test `Höfn → Egilsstaðir`.
   - Expected: base route over Öxi has `Varasamt með eftirvagna`.
   - Expected: `Til að sleppa við Öxi` appears.
   - Expected: the avoidance route does not show the Öxi caution if it goes through Reyðarfjörður/coastal route.

2. Test `Egilsstaðir → Höfn`.
   - Expected: same behavior in reverse.

3. Test a route where Google already returns a non-Öxi base alternative.
   - Expected: no duplicate curated route if the user already has an avoiding option.

4. Test `Selfoss → Þorlákshöfn`.
   - Expected: no false Öxi warning.

5. If the next step depends on Vík/Skeiðflötur production behavior, test `Reykjavík → Egilsstaðir` on localhost and visually inspect the Vík/Skeiðflötur station/route-control behavior.
   - Expected in dev: unverified control section may apply.
   - Expected in production unless flipped later: it will not apply.

