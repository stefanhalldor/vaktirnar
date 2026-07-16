# TODO 086 v370 - Codex review of v369 prerelease

Created: 2026-07-16 22:37
Timezone: Atlantic/Reykjavik
Author: Codex

Related handoff:
- `2026-07-16-2235-todo-086-v369-claude-v368-done-prerelease.md`

## Findings

No blocking findings.

v369 does what it says on the tin: it removes the dead `pointToSegmentM(...)` helper from `lib/weather/providerRouteMatching.ts` and strengthens the test setup/commentary around the route-geometry-vs-sampled-MET/Yr regression in `lib/__tests__/weather-travel-api.test.ts`.

The two v368 findings are addressed:

- Dead helper removed: `lib/weather/providerRouteMatching.ts:39` now goes directly into `ProjectionResult`; no unused `pointToSegmentM(...)` remains.
- Test coordinate confusion improved: `lib/__tests__/weather-travel-api.test.ts:317` and `lib/__tests__/weather-travel-api.test.ts:320` now use Hellisheidi-ish station coordinates that are distinct from the sampled Gardabaer point at `lib/__tests__/weather-travel-api.test.ts:515`.

## Notes

The route API test still mocks `matchProviderPointsToRoute(...)`, so it is not a full spatial integration test. That is acceptable here because:

- `providerRouteMatching.test.ts` covers the pure spatial behavior.
- `weather-travel-api.test.ts` covers that the API uses the route matcher path rather than the sampled MET/Yr station path.
- `passes route geometry points (not sampled weather points) to matchProviderPointsToRoute` continues to assert the key contract.

No SQL, RLS, auth, env, Vercel, deployment, or production-data changes were included.

## Verification Run by Codex

```text
npm run type-check
→ passed

npm run test:run -- lib/__tests__/providerRouteMatching.test.ts lib/__tests__/weather-travel-api.test.ts
→ 2 files passed, 33 tests passed
```

## Localhost checks for Stebbi

No new user-visible behavior is expected from v369 alone; this is cleanup plus test correction.

If Stebbi wants a quick sanity check anyway:

1. Open `/vedrid`.
2. Calculate a route with Veðurstofan visible.
3. Confirm the same station set appears as after v367.
4. Confirm met.no-only behavior is unchanged.

For the next product phase, use the v368 handoff as the larger direction:

- provider station layer on route-selection map
- lazy station preview
- later scrubber/threshold coloring
- later Yr-at-same-station comparison, carefully framed as comparison rather than baseline replacement

## Recommendation

v369 is ready to hand back to Claude Code as accepted cleanup, assuming Stebbi's localhost sanity check does not reveal an unrelated regression.

Do not expand directly into Phase B-E without a separate scoped handoff/Workflow message, because those phases touch visible UX and route-selection behavior.
