# 2026-07-17 06:42 — TODO-086 v385 — Codex review of v384 B0.4 hardening

Created: 2026-07-17 06:42  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Reviewed handoff: `2026-07-17-0641-todo-086-v384-claude-v383-b04-hardening-prerelease`

## Findings

1. **Low: cap regression test duplicates private helper logic instead of testing the helper boundary directly**

   The actual product fix in `lib/weather/google.server.ts:100-111` looks correct: when the strided array is already at `MAX_PROVIDER_MATCHING_POINTS`, it replaces the last strided point with the real route endpoint instead of appending a 1001st point.

   The new regression test in `lib/__tests__/providerRouteMatching.test.ts:207-227` copies the same stride-cap logic into the test rather than exercising `providerMatchingPointsFrom()` itself. That means a future edit to the private helper could drift from the copied test code without the test failing.

   This is not a release blocker for this prerelease because the implementation itself was inspected and the focused tests pass. If Claude Code touches this area again, preferred follow-up is one of:

   - extract/export a small `capPolylinePoints(points, maxPoints)` helper and test that directly, or
   - cover `providerMatchingPointsFrom()` through a `google.server` route-response unit test that asserts returned `providerMatchingPoints.length <= 1000`.

2. **Low / deferred: provider preview shell is still not provider-neutral**

   This was intentionally deferred from v384, so I am not treating it as a regression. It remains true that `components/weather/ProviderStationPreviewCard.tsx` imports Veðurstofan forecast row rendering directly, so B0.5 should still split the shell before Vegagerðin work builds on it.

## What Looks Good

- The 1001-point cap bug from v383 is fixed in the actual implementation.
- The stale client comment in `app/auth-mvp/vedrid/FerdalagidClient.tsx:446-448` was corrected.
- The B0.4 scope stayed clean: no route cache, heatmap, overview page, Vegagerðin, SQL, Vercel, commit, push, or deploy.
- The route-cache / interest-heatmap track from `2026-07-17-0627-todo-086-v382-codex-route-cache-and-interest-heatmap` should remain in the plan as the H-track from v383; nothing in v384 conflicts with it.

## Commands Run By Codex

- `npm run type-check`  
  Result: passed, exit 0.
- `npm run test:run -- lib/__tests__/providerRouteMatching.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/weather-provider-stations.test.ts`  
  Result: passed, 3 files / 57 tests, exit 0.

No dev server was started. No SQL, migrations, env changes, commit, push, deploy, or production changes were performed.

## Recommendation

This is ready for Stebbi localhost validation for B0.4.

I would not block on the test-quality note above. The next implementation phase should be **B0.5 provider preview shell cleanup**, then B1 localhost validation, while preserving the H-track route-cache/interest-heatmap work after B0/B1 and before the large overview map.

## Localhost Checks For Stebbi

1. Open `http://localhost:3004/vedrid`.
2. Test a short Reykjavík-area route. Far-off stations should not appear with the 1 km threshold.
3. Test a curvy/coastal route such as Vík / Skeiðflötur. Nearby stations should not be missed because of route chording.
4. Test Reykjavík -> Ísafjörður. The Veðurstofan layer should not disappear on the long fjord-heavy route.
5. Test Höfn -> Egilsstaðir. Confirm stations appear sensibly around east-fjord curves and Öxi-adjacent routing.
6. On the route-selection step, toggle Veðurstofan off/on and click a station marker.
7. Continue to final result and compare the visible stations with the route-selection layer. They should be materially consistent.
8. Confirm met.no/Yr route points, summary, worst point, selected point, and all-points behavior still feel unchanged.

Do not test Supabase, SQL, migrations, Vercel, env, or production from this handoff.

## Open Questions

- Does any real route still exceed the provider-stations cap after the fix? If Stebbi sees the layer disappear on a long route, check the provider-stations request payload length first.
- Should B0.5 split the station preview shell before or after a quick localhost validation pass? My preference: quick validation now, then B0.5 before Vegagerðin.
