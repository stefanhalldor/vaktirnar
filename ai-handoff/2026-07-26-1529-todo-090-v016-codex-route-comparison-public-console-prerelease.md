# Prerelease handoff: public console, route comparison and durable graph warm-up

**TODO:** 090  
**Agent:** Codex  
**Date:** 2026-07-26 15:29 Atlantic/Reykjavik  
**Status:** Implementation complete; automated checks green; localhost visual verification pending.

The OTP retry/delivery work in the same dirty worktree is documented separately in
`2026-07-26-1259-todo-046-v014-codex-otp-delivery-reliability-prerelease.md`.
This handoff covers only the road/weather changes made after that handoff.

## 1. Plan for this phase

1. Trace the public `/vedrid` 401s and invalid manifest response.
2. Keep public weather reads public only at exact middleware paths while preserving handler validation and feature boundaries.
3. Replace terminal Teskeið candidate timeout UX with a pending/background warm-up flow and a cache shared across serverless instances.
4. Shorten the mobile Google warning and move map expansion controls away from attribution.
5. Add a full-screen multi-route map with stable per-route colours, instant preview selection and one explicit weather recalculation action.
6. Update route documentation, translations and regression tests.

## 2. What was actually done

- `/manifest.json` is excluded from auth middleware, so production can serve the real static JSON instead of an HTML redirect response.
- Exact read-only road-intelligence paths are allowed through middleware. Their own handlers remain responsible for `AUTH_MVP_ENABLED`, `WEATHER_ENABLED`, auth/feature checks, bbox/source validation and upstream safety limits. Prefix subpaths remain closed.
- The strict `teskeid-routing-v1` candidate endpoint remains per-user and fail-closed. Public users still receive no Teskeið candidate.
- Road-graph source data now has a six-hour shared Next Data Cache entry plus the existing in-process materialized graph cache.
- An eight-second candidate response budget now yields `pending`, not terminal `timeout`. `after()` lets graph warm-up continue after the response, and the client retries with backoff while the current route request remains active.
- The UI no longer displays “Tók of langan tíma. Prófaðu aftur.” A genuine unavailable result has an explicit retry action.
- The Google warning is one short sentence rather than a large two-paragraph disclaimer.
- The existing journey-map “Stækka kort” action moved to the top-right with a 40 px minimum touch target so MapLibre attribution cannot cover it.
- The compact route-comparison map now has its own “Stækka kort” action.
- The full-screen route map shows all drawable alternatives at once. Every route has a stable distinct colour shared by line, legend and card.
- Clicking a route line or route card only changes the preview. MapLibre line paint/source data is updated in place, so selection does not rebuild the map.
- “Skoða veðurskilyrði fyrir þessa leið” remains the explicit apply boundary that recalculates weather/stations/scrubber only when the selected route differs from the applied route.
- The full-screen view respects safe-area bottom padding, locks background scroll, closes with Escape and uses 40 px or larger controls.
- `IcelandRoadmap.md` and the route package README now describe the pending/cache behavior and the remaining production-hardening boundary.

## 3. Files inspected

- `AGENTS.md`, `WORKFLOW.md`, `Design.md`
- `app/vedrid/page.tsx`
- `app/auth-mvp/vedrid/page.tsx`
- public road-intelligence route handlers under `app/api/teskeid/road-intelligence/`
- current route candidate, graph source/runtime/provider and Weather UI implementations
- existing middleware, route comparison, travel API and route forecast tests
- `IcelandRoadmap.md`, `lib/iceland-routes/README.md`, `ai-handoff/README.md`

## 4. Files changed

- `middleware.ts`
- `app/api/teskeid/weather/travel/route-candidate/route.ts`
- `components/weather/DriveJourneyPanel.tsx`
- `components/weather/DriveRouteMap.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/RouteComparisonMiniMap.tsx`
- `lib/iceland-routes/roadGraphCandidate.server.ts`
- `lib/iceland-routes/roadGraphRuntime.server.ts`
- `lib/iceland-routes/vegagerdinRoadGraphSource.server.ts`
- `lib/iceland-routes/README.md`
- `IcelandRoadmap.md`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/middleware.test.ts`
- `lib/__tests__/road-graph-candidate.test.ts`
- `lib/__tests__/road-graph-runtime-cache.test.ts` (new)
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- `lib/__tests__/weather-route-candidate-api.test.ts`

The pre-existing user-owned `.obsidian/workspace.json` change and TODO-046 auth changes were preserved and not rewritten as part of this phase.

## 5. Commands run

- `npm.cmd run type-check`
- `npm.cmd run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/road-graph-candidate.test.ts lib/__tests__/road-graph-runtime-cache.test.ts lib/__tests__/weather-route-candidate-api.test.ts lib/__tests__/route-comparison-mini-map.test.tsx --reporter=dot`
- `npm.cmd run test:run -- lib/__tests__/weather-page-routing-access.test.tsx lib/__tests__/weather-routes-api.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/weather-travel.test.ts lib/__tests__/drive-journey-panel.test.ts lib/__tests__/road-map-route-forecast.test.ts lib/__tests__/road-map-navigation.test.ts lib/__tests__/road-intelligence-map-proxy.test.ts lib/__tests__/road-intelligence-road-surface.test.ts lib/__tests__/road-intelligence-segments.test.ts --reporter=dot`
- `npm.cmd run test:run -- --reporter=dot`
- `git diff --check`
- read-only `rg`, `Get-Content`, `Get-ChildItem`, `git diff` and `git status` inspections

## 6. Results and exit codes

- TypeScript type-check: exit 0.
- Focused middleware/cache/API/UI tests: 5 files, 83 tests passed, exit 0.
- Wider Weather/route regression tests: 10 files, 218 passed, 5 skipped, exit 0.
- Full Vitest suite: 151 files passed, 1 skipped; 3,731 tests passed, 28 skipped, 8 todo; exit 0.
- `git diff --check`: exit 0.
- Expected stderr from deliberate failure-path tests remains present; the suite is green.

## 7. Failed or skipped work

- No browser automation or visual screenshot test was run because Stebbi owns the localhost/dev server under project workflow.
- No `next build` was run so the active localhost server/build state would not be disturbed. Type-check and the full test suite were run instead.
- No live Vegagerðin import was run; normal tests remain independent of external services.
- No SQL, migration, Supabase write, env change, commit, push, deployment or production change was performed.

## 8. Decisions made

- The response budget remains bounded to protect Google-route latency, but budget expiry is modelled as pending work rather than a failed route.
- Next Data Cache is the code-only shared cache available without a new database/storage migration. The existing process cache remains an L1 optimization.
- Route selection in the comparison UI is split into preview and apply. Only apply triggers the expensive weather calculation.
- Colours are assigned by stable route order, not only by provider, so multiple Google or Teskeið routes remain visually distinct.
- Middleware exposes exact public reads rather than the whole road-intelligence prefix.
- The implementation follows `Design.md`: mobile-first fixed layout, semantic Teskeið colours for controls, 40 px touch targets, no horizontal page overflow, safe-area padding, visible pending feedback and accessible dialog controls.

## 9. Remaining risk

- The first ever graph materialisation still depends on live Vegagerðin source availability and can take longer than one response. The UX now waits safely and retries, but production should monitor completion time and cache write size.
- Next Data Cache is an intermediate durable layer, not a versioned last-known-good road-graph snapshot. If production cache size/refresh constraints prove insufficient, add a separately reviewed snapshot store and scheduled refresh before broader rollout.
- `after()` behavior and Data Cache persistence need one Vercel preview smoke test; unit tests verify the boundary but cannot emulate Vercel instance reuse.
- Full-screen MapLibre line hit-testing and mobile browser chrome need Stebbi's real-device visual check.
- Public road reads are still protected by their route handlers, but rollout should confirm there are no unexpected 401s and no public access when `WEATHER_ENABLED` is not `All`.

## 10. Recommended next step

Stebbi should run the localhost checks below. If they pass, ask Claude Code to review this handoff and the diff, with special attention to the serverless cache lifecycle, exact middleware boundary, MapLibre in-place updates and preview/apply state separation. After review, use a Vercel preview deployment for the cold-cache smoke test before production rollout.

## 11. Questions for Codex/Claude review

1. Can any `pending` branch still become a misleading terminal error while the same route request remains active?
2. Does `unstable_cache` hold the normalized source payload within the target Vercel cache limits, or should the next phase store a compact/versioned graph snapshot?
3. Are all road-intelligence routes now reachable for public weather only through exact middleware paths while preserving handler-level gates?
4. Can MapLibre layer ordering or transparent hit layers cause the wrong overlapping route to be selected on a real phone?
5. Does the full-screen preview ever mutate applied weather state before the explicit CTA?

## 12. Supabase, auth, RLS and production impact

- SQL file: none.
- SQL executed: no.
- Supabase reads/writes added: none.
- RLS, grants, policies, functions and auth schema: unchanged.
- Raw routes, addresses and user history: not persisted.
- The route-candidate endpoint still requires all three gates: global env flag, authenticated user and `teskeid-routing-v1` per-user access.
- Public weather only receives road-intelligence reads when `WEATHER_ENABLED=All`; route handlers retain validation and fail-closed access behavior in other modes.
- Production, Vercel env, deployment and user data were not touched.

## 13. Localhost checks for Stebbi

### A. Public console and manifest

Setup: `AUTH_MVP_ENABLED=true`, `WEATHER_ENABLED=All`; use a signed-out/private browser window. Do not enable Teskeið routing for a public user.

1. Open `http://localhost:3004/vedrid` and open DevTools Console/Network.
2. Load Spágögn, Kort and Akstur; calculate Reykjavík → Ísafjörður.
3. Open `http://localhost:3004/manifest.json` directly.

Expected:

- Forecast/road-intelligence requests used by the public page do not return 401.
- `manifest.json` is JSON, not the Teskeið homepage HTML and not a syntax error.
- Teskeið route-candidate is not shown or requested for the signed-out public user.
- Next-generated “preloaded but not used” warnings may still appear; they are unrelated performance warnings, not auth failures.

### B. Compact disclaimer and existing map expansion

1. As a route-enabled authenticated user, calculate any route.
2. Verify the Google warning is one short sentence.
3. Scroll to the ordinary route-weather map and press “Stækka kort”.

Expected:

- The warning no longer dominates the mobile viewport.
- “Stækka kort” is at the top-right, is easy to tap and is never covered by MapLibre attribution.

### C. Full-screen route comparison

Setup: authenticated user with `road-intelligence-v1`; use a route with at least two Google alternatives. Add `teskeid-routing-v1` plus the global flag if testing Teskeið routes.

1. Calculate Reykjavík → Ísafjörður.
2. In the route comparison panel press “Stækka kort”.
3. Select each route first by its bottom card, then by tapping its coloured line.
4. Close with X and, on desktop, Escape. Reopen it.
5. Select a route and press “Skoða veðurskilyrði fyrir þessa leið”.

Expected:

- Every route uses a clearly different and stable colour in line, legend and card.
- Selection highlighting changes immediately without a visible map rebuild or weather recalculation.
- The page behind the dialog does not scroll; the bottom CTA stays above mobile safe areas/browser chrome.
- Only the CTA closes the preview and recalculates weather/stations/scrubber for a newly selected route.
- Closing without applying keeps the previously applied route weather.

Test at approximately 360 px, 390 px and 460 px widths. Watch for horizontal page overflow, clipped route cards, attribution overlap and unreachable controls.

### D. Cold Teskeið graph behavior

Setup: authenticated user with `teskeid-routing-v1` and `TESKEID_ROUTE_CANDIDATE_ENABLED=true`. A local server restart may be used by Stebbi if he deliberately wants a cold process; Codex did not control the server.

1. Calculate Ísafjörður → Reykjavík immediately after a cold start.
2. Leave the route comparison visible while Teskeið works.
3. If available, inspect Network calls to `/api/teskeid/weather/travel/route-candidate`.
4. After the route appears, calculate the reverse direction or retry the same pair.

Expected:

- Google alternatives appear first and remain usable.
- Teskeið shows calculating/pending text, never “Tók of langan tíma. Prófaðu aftur.”
- The Teskeið route adds itself when ready; a genuine source failure shows a retry control without breaking Google.
- A warm calculation should reuse cache and complete materially faster.
- Selecting the Teskeið route and applying it restores the full departure scrubber, not only current Vegagerðin stations.

### Safety notes

- Do not test by changing production Vercel flags or user entitlements casually; use localhost/local Supabase state or a separately approved preview environment.
- Do not run SQL for this handoff; it contains no migration.
- The route remains experimental and must not be treated as safety navigation, closure information or a production ETA.
