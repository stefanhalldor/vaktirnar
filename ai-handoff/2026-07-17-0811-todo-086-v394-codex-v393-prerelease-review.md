# 2026-07-17 08:11 — Codex review of v393

Source handoff: `2026-07-17-0742-todo-086-v393-claude-v392-done-prerelease`

## Findings

No blocking findings.

v393 fixes the v392 blockers I found:

- `lib/__tests__/routeControlPoints.test.ts:122` now uses `Set<number>` instead of narrowing to the literal anchor longitude union.
- `lib/__tests__/providerRouteMatching.test.ts:323` now uses a less brittle `> 40_000` assertion for the synthetic distance check.
- `lib/weather/google.server.ts:370` to `lib/weather/google.server.ts:402` now separates display cautions from curated-route validation cautions, so the Öxi curated route can be validated with evidence points only while still displaying normal route cautions to users.
- `lib/weather/routeControlPoints.ts:138` now skips unverified control sections in production.

## Non-blocking Notes

### Low: unverified route-control behavior should get one explicit test

`lib/weather/routeControlPoints.ts:138` intentionally skips `verified: false` sections in production. That is a good safety rail, especially for `ring-road-vik-skeidflotur` at `lib/weather/routeControlPoints.ts:74` to `lib/weather/routeControlPoints.ts:84`.

The remaining gap is that the production skip itself does not appear to have a dedicated test. This is not a release blocker because the behavior is simple and inspected, but I would add a small unit test later so future refactors do not accidentally enable unverified road-control sections in production.

### Product expectation: Vík/Skeiðflötur fix is dev/test-only until verified

Because `ring-road-vik-skeidflotur` remains `verified: false`, that control-point correction will not affect production after deploy. That is likely the right call until Stebbi visually verifies it, but it should be explicit:

- If Stebbi expects production to include this Vík/Skeiðflötur/Vatnsskarðshólar correction, do a focused localhost visual check first, then make a tiny follow-up setting that section to `verified: true`.
- If not, current v393 is fine as a prerelease safety state.

## What I Checked

- `lib/weather/google.server.ts`
- `lib/weather/routeControlPoints.ts`
- `lib/weather/routeCautions.ts`
- `lib/__tests__/routeControlPoints.test.ts`
- `lib/__tests__/providerRouteMatching.test.ts`
- git dirty state for context

## Commands Run

```powershell
npm run type-check
```

Exit code: `0`

```powershell
npm run test:run -- lib/__tests__/providerRouteMatching.test.ts lib/__tests__/routeControlPoints.test.ts lib/__tests__/weather-route-cautions.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/weather-provider-stations.test.ts
```

Exit code: `0`

Result: 6 test files passed, 205 tests passed.

## Supabase / Auth / RLS

No SQL, Supabase, auth, RLS, grants, service-role, secrets, or production data changes were part of this review.

## Release Readiness

From code review and focused tests, v393 is ready for localhost verification.

I would not describe it as "production includes the new Vík/Skeiðflötur road-control correction" until that section is visually verified and flipped to `verified: true`. Everything else in the v392 fix set looks ready.

## Suggested Next Step

Ask Claude Code for either:

1. no further code changes, only Stebbi localhost checks, or
2. a tiny follow-up test for the production skip behavior of unverified route-control sections.

After Stebbi visually confirms the Vík/Skeiðflötur segment, create a separate tiny handoff to set `ring-road-vik-skeidflotur.verified = true`.

## Localhost checks for Stebbi

1. Test `Höfn → Egilsstaðir`.
   - Expected: route over Öxi is detected as varasöm when Google chooses it.
   - Expected: an alternative "Til að sleppa við Öxi" / firðir route appears when applicable.
   - Expected: if the alternative still touches Öxi, it should be suppressed rather than shown as safe.

2. Test `Egilsstaðir → Höfn`.
   - Expected: same Öxi detection in reverse direction.

3. Test `Reykjavík → Egilsstaðir` on localhost/dev.
   - Expected in dev: Vík/Skeiðflötur route-control points can help nearby Veðurstofan stations attach to the route.
   - Important: this is not yet expected in production while the section is `verified: false`.

4. Test a nearby non-target route, for example `Selfoss → Þorlákshöfn`.
   - Expected: no false Öxi or Vík/Skeiðflötur warning/control behavior.

5. Open the route selection map and final weather result.
   - Expected: met.no behavior is not changed by this fix set.
   - Expected: Veðurstofan station matching remains based on provider station route matching and route-control augmentation only where relevant.

