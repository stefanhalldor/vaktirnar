# TODO-090 — Public Teskeiðarleiðir local prerelease

**Created:** 2026-07-27 20:12 Atlantic/Reykjavik (UTC+00:00)
**Agent:** Codex
**Status:** Local implementation ready for Stebbi verification; not committed or released

## Approval and scope

Stebbi explicitly authorized opening Teskeiðarleiðir to signed-out Weather users
and asked to be notified when the change was ready to test locally.

This phase changed local code, tests and documentation only. It did **not**
commit, push, deploy, change Vercel environment variables, run SQL, or write to
Supabase. `.obsidian/workspace.json` and existing unrelated untracked handoffs
were not edited.

## Plan

1. Trace the public, authenticated and final-submit route gates.
2. Open the feature without giving anonymous traffic an unbounded graph path.
3. Preserve signed route identity through every client and refresh path.
4. Add targeted auth, rate-limit, envelope, restore and UI wiring regressions.
5. Run targeted tests, type-check, lint, build and independent read-only review.

## What was implemented

- `/vedrid` now passes the global `TESKEID_ROUTE_CANDIDATE_ENABLED` switch to
  the public RoadMap client instead of hard-disabling Teskeiðarleiðir.
- The legacy per-user `teskeid-routing-v1` row is no longer required by the
  candidate, route-options or final-submit APIs. The global switch remains the
  emergency kill switch.
- A signed-out candidate request must include a fresh, HMAC-signed Google route
  envelope for the exact origin/destination pair. A missing, modified, expired,
  wrong-provider or wrong-endpoint grant is rejected before graph work.
- Anonymous graph `warmOnly` remains closed.
- Anonymous candidate retries and alternatives use a separate HMAC-IP bucket
  of 60 requests per Reykjavik calendar day. The existing route-options bucket
  remains separate. Raw IP addresses are not persisted.
- The candidate bucket fails closed when its IP header, signing secret or RPC
  limiter is unavailable. The existing route-options bucket retains its
  availability-first behavior.
- The old `w.YYYY-MM-DD` value sent into the SQL `DATE` RPC parameter was fixed.
  Scope separation now belongs in the HMAC input while the RPC receives a real
  `YYYY-MM-DD` date.
- Email-less Supabase identities are treated as anonymous public traffic. They
  cannot warm the graph, bypass the candidate bucket/grant, or submit a bare
  Teskeið route ID.
- Final anonymous Teskeið submission requires the signed Teskeið envelope. A
  bare Teskeið route ID fails closed.
- RoadMap public discovery waits for the normal, rate-limited Google response
  and reuses its signed envelope as the candidate grant. Signed-in discovery
  retains its parallel behavior and warm-up path.
- Expired public grants are reacquired through `/travel/routes`, so that refresh
  remains inside the normal public route-options budget.
- `FerdalagidClient` now retains route envelopes for every choice, centralizes
  all three final/refresh calls through one envelope-aware helper, refreshes an
  envelope with less than 60 seconds remaining, and retries exactly once after
  `route_envelope_invalid`.
- A restored Teskeið result never silently falls back to Google route #1. Real
  route edits clear the restore intent; a missing restored route fails closed.
- `IcelandRoadmap.md` and `lib/iceland-routes/README.md` now describe the public
  access and its security boundary.

## Route Intelligence / design check

The change affects only access, ephemeral signed transport and client route
selection. It does not add canonical segments, persist raw Google route data,
change route-memory ownership, or add SQL. The signed envelope stays short-lived
and provider route content remains request/session scoped.

`Design.md` was reviewed. This phase adds no new visible controls or text and
keeps the existing mobile-first map and loader behavior. All new client wiring
uses the existing generic route cards and CTA.

## Files inspected

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- Public and authenticated Weather pages/clients
- Route-options, route-candidate and final travel API handlers
- Signed route-envelope implementation
- Public rate-limit implementation and SQL contract
- Relevant Weather, guard and RoadMap tests

## Files changed for this phase

- `IcelandRoadmap.md`
- `app/api/teskeid/weather/travel/route-candidate/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `app/vedrid/page.tsx`
- `components/weather/RoadMapPrototypeMap.tsx` (also contains the already
  approved local sticky-CTA/loader package)
- `lib/iceland-routes/README.md`
- `lib/iceland-routes/routeEnvelopeClient.ts` (new)
- `lib/loans/guard.ts` (contract comment only)
- `lib/weather/ip-rate-limit.server.ts`
- `lib/__tests__/ferdalagid-route-envelope.test.ts` (new)
- `lib/__tests__/weather-page-routing-access.test.tsx`
- `lib/__tests__/weather-public-route-client.test.ts` (new)
- `lib/__tests__/weather-public.test.ts`
- `lib/__tests__/weather-route-candidate-api.test.ts`
- `lib/__tests__/weather-routes-api.test.ts`
- `lib/__tests__/weather-travel-api.test.ts`
- `lib/__tests__/road-map-route-loading-ui.test.ts` (also contains the already
  approved local sticky-CTA/loader tests)

Existing local changes in `RouteComparisonMiniMap.tsx`, its test,
`routeResultsDisplayState.ts`, `.obsidian/workspace.json`, and older untracked
handoffs were preserved and are not part of this public-routing implementation.

## Commands and results

1. Targeted Vitest package after final hardening:

   `npm.cmd run test:run -- lib/__tests__/weather-page-routing-access.test.tsx lib/__tests__/weather-route-candidate-api.test.ts lib/__tests__/weather-routes-api.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/weather-public.test.ts lib/__tests__/weather-public-route-client.test.ts lib/__tests__/ferdalagid-route-envelope.test.ts lib/__tests__/road-map-route-loading-ui.test.ts`

   Exit 0 — 8 files, 160 tests passed.

2. `npm.cmd run type-check`

   Exit 0.

3. `npm.cmd run lint`

   Exit 0. Existing repository warnings remain in unrelated hooks/image code;
   no new lint error was introduced.

4. `npm.cmd run build`

   Exit 0 — production build compiled and generated 107 pages. The same existing
   lint warnings were printed. Next reported `.env.local` as an automatically
   loaded build environment; Codex did not inspect or modify that file or any
   secret value.

5. `git diff --check`

   Exit 0. Only line-ending notices were printed.

An initial targeted run exposed two stale test expectations (an exact source
string and the removed per-user gate). They were corrected and every subsequent
targeted run passed. An initial `npm run lint` invocation hit the Windows
PowerShell `npm.ps1` execution policy; the same command succeeded through
`npm.cmd`.

## Independent review

- UI/client review found no blocker and independently passed 79 targeted tests.
- Auth/rate/envelope review found the email-less identity bypass; it was fixed
  and covered by three regressions. Re-review found no remaining release blocker.
- Candidate limiter outage behavior was subsequently hardened from fail-open to
  fail-closed, with dedicated RPC-error and missing-IP tests.

## Remaining risk and decisions

- Signed route envelopes are replayable bearer capabilities for at most 15
  minutes. They are HMAC-protected and bound to exact endpoints. Adding a signed
  purpose/audience claim is a sensible later v2 hardening before more signer
  contexts are introduced.
- Invalid large envelopes are parsed and verified before the candidate bucket,
  so repeated schema-valid garbage can consume bounded request CPU, but never
  graph work. Tightening envelope point/byte caps or adding a cheap pre-verification
  limiter is a later defense-in-depth task.
- Reacquiring an envelope after 15 minutes calls the paid/rate-limited
  `/travel/routes` endpoint and consumes another public route-options allowance.
  This is intentional: stale authorization must not bypass the public budget.
- The full Vitest suite was not run; targeted tests, type-check, lint and the full
  Next production build are green.

## Supabase / SQL / production impact

- SQL written: none.
- SQL run: none.
- Supabase reads/writes by Codex: none.
- RLS, grants, auth policies, functions and production data changed: none.
- Existing runtime RPC contract is used with a corrected SQL `DATE` value.
- Commit/push/deploy/environment-variable changes: none.

## Localhost checks for Stebbi

Stebbi runs the existing localhost server. Do not restart or kill it for this
check.

### Primary signed-out check

1. Open an InPrivate/Incognito window at `http://localhost:3004/vedrid` and
   confirm you are signed out.
2. Choose two ordinary Icelandic places, for example Reykjavík → Hveragerði,
   and calculate the route.
3. Expect the large comparison map to open normally. Google choices may arrive
   first; a Teskeiðarleið should then appear when the global candidate switch is
   enabled and the graph has a route.
4. Confirm there is no candidate `404` or `403` in Network/Console. A first
   response may be `pending`, followed by a successful retry.
5. Press **Finna fleiri Teskeiðarleiðir**. Expect either additional choices or
   the existing honest no-more/unavailable state, not a dead button.
6. Select a Teskeiðarleið and press **Skoða veðurskilyrði fyrir þessa leið**.
   Expect the Weather summary for that exact selected route, not Google route #1.

Expected network shape for a successful run:

- `POST /api/teskeid/weather/travel/routes` → 200
- `POST /api/teskeid/weather/travel/route-candidate` → 200 (`pending` then 200 is valid)
- `POST /api/teskeid/weather/travel` → 200

Do not repeatedly spam new public route pairs: the repaired public rate limiter
now actually receives its SQL `DATE` correctly, and localhost traffic can consume
the configured daily public allowance.

### Regression checks

1. While still signed out, choose a Google route and confirm its final Weather
   summary still works.
2. If useful, repeat the flow at `http://localhost:3004/vedrid/ferdalagid` and
   confirm a Teskeið choice can be submitted there too.
3. Sign in and repeat one route at `http://localhost:3004/auth-mvp/vedrid`.
   Signed-in Teskeið discovery should still work without the old per-user row.
4. Closing/reopening the large map must preserve the applied route; switching
   to a different route must still recalculate before showing its summary.

If the Teskeið candidate flag is off locally, Google-only behavior is expected;
no environment file was changed in this phase.

## Recommended next step

Stebbi performs the primary signed-out localhost check above and reports the
visible result plus any Network status that is not 200/pending. After explicit
approval, prepare a scope audit that separates this public-routing package from
the already-local sticky CTA/loader package before commit or production rollout.

The proposal to replace Codex email notifications with Teskeið's generic chat is
good, but should be a separate phase: it needs an authenticated agent bridge,
message ownership, delivery state and an explicit reply-processing contract.
