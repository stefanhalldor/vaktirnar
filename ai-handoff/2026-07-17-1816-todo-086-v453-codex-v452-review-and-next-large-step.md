# TODO-086 v453 — Codex Review of v452 and Next Large Step

Created: 2026-07-17 18:16  
Timezone: Atlantic/Reykjavik  
Reviewed handoff: `2026-07-17-1813-todo-086-v452-claude-v451-done-prerelease`

## Short Verdict

v452 is a good step. It fixes the main v451 concerns:

- `feed-preview` now respects `WEATHER_ENABLED=all/authenticated/off`.
- feed response naming is now `items`, not `stations`.
- `useFeedLoader` centralizes polling and badge acknowledgement.
- route-scoped feed now uses the shared feed loader instead of owning its own interval.

I still would not call the feed/chat foundation fully hardened. There are two important follow-ups before we build more Vegagerðin or route-specific user-condition features on top.

## Findings

1. **Medium: `useFeedLoader` can show stale feed items across `cacheKey` or `disabled` changes**

   File: `lib/weather/useFeedLoader.ts`

   On `cacheKey` changes, the hook resets the acknowledgement baseline and count, but it does not clear `items` or set `loading=true` before the new fetch completes.

   On `disabled=true`, the hook sets `loading=false` and returns, but it also does not clear existing items.

   Why this matters:

   - In `VedurstofanRoutePulseSummary`, `cacheKey` is the station-id set for the current route.
   - If a user changes route/station set, the previous route's feed can remain visible until the new request resolves.
   - If the station set becomes empty or the feed is disabled, stale reports may still be visible.

   This is especially sensitive because these are condition reports tied to specific places. Showing old-route reports, even briefly, is worse than showing no drawer until the new data arrives.

   Suggested fix:

   - On non-disabled `cacheKey` change: clear items and set `loading=true` before fetching, unless a caller explicitly opts into stale-while-revalidate.
   - On `disabled=true`: clear items, reset count, reset baseline, set `loading=false`.
   - Add tests for both cases.

2. **Medium: route-preview endpoint is described as public, but middleware does not allow it**

   Files:

   - `app/api/teskeid/weather/vedurpuls/route-preview/route.ts`
   - `middleware.ts`
   - `components/weather/VedurstofanRoutePulseSummary.tsx`

   `route-preview/route.ts` says it is a public endpoint. `VedurstofanRoutePulseSummary` fetches it client-side. But `middleware.ts` does not include `/api/teskeid/weather/vedurpuls/route-preview` in exact public paths.

   Result:

   - Signed-out users will get middleware 401 for the route-scoped conditions feed.
   - The component swallows that as `[]` and hides the drawer.
   - This contradicts the product direction that preview reports are visible to public users, while writing/opening the full pulse requires login.

   Important: do not fix this by only adding it to public middleware. If this endpoint becomes public, the route handler must enforce the same `WEATHER_ENABLED` access semantics as `feed-preview`:

   - `off` → 404
   - `all` → public allowed
   - `authenticated` → signed-in required

   Also keep station ID validation and the 40-ID cap.

3. **Low: generic hook is still slightly too easy to misuse**

   File: `lib/weather/useFeedLoader.ts`

   The effect intentionally omits `fetcher` from dependencies. Current callers appear safe because `cacheKey` changes when the semantic fetcher changes. But as a reusable core hook, this contract is easy for a future caller to violate.

   Recommended hardening:

   - Either include `fetcher` in the effect dependencies and require callers to memoize it.
   - Or store `fetcher` in a ref and document that `cacheKey` controls semantic invalidation.
   - Prefer a test that proves changing the effective fetch input does not accidentally keep polling stale data.

4. **Low: small naming residue remains in test copy**

   File: `lib/__tests__/chat-repository.test.ts`

   Test name still says `respects limitStations cap`. Runtime is fine, but the vocabulary should become `limitItems` or `limitTargets` to keep the provider-neutral mental model clean.

## Verified by Codex

Commands run:

```bash
npm run type-check
npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/chat-repository.test.ts lib/__tests__/weather-conditions-feed-preview-api.test.ts lib/__tests__/loginNext.test.ts lib/__tests__/innskraning-page.test.tsx lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/weather-vegagerdin-current.test.ts lib/__tests__/useFeedLoader.test.ts
```

Results:

- `type-check`: clean
- Vitest: 9 files passed, 212 tests passed

No full suite, no localhost/browser testing, no SQL execution.

## Next Large Step for Claude Code

```md
Workflow

Read this review first:
`ai-handoff/2026-07-17-1816-todo-086-v453-codex-v452-review-and-next-large-step.md`

Goal: take one larger but safe step that finishes feed-core hardening and prepares the next provider-neutral conditions phase. Do not commit, push, deploy, run SQL, or touch Vercel/Supabase production.

## Part A — Fix feed-core correctness before expanding

### A1. Fix stale items in `useFeedLoader`

Update `lib/weather/useFeedLoader.ts` so it cannot show stale data after:

- `cacheKey` changes
- `disabled` changes to true

Expected behavior:

- `cacheKey` change resets acknowledgement baseline, count and visible items.
- While the new fetch is pending, do not show previous route/provider items.
- `disabled=true` clears items and count and returns `loading=false`.

Add tests in `lib/__tests__/useFeedLoader.test.ts`:

- old items disappear on `cacheKey` change before new fetch resolves
- disabled clears existing items
- re-enabling fetches fresh data and establishes a new baseline

### A2. Public route-preview access must match feed-preview access

Make `/api/teskeid/weather/vedurpuls/route-preview` follow the same access contract as `/api/teskeid/weather/vedurpuls/feed-preview`:

- `WEATHER_ENABLED=off` → 404
- `WEATHER_ENABLED=all` → public allowed
- `WEATHER_ENABLED=authenticated` → signed-in required, anonymous gets 401

Implementation guidance:

- Add exact public middleware only if the route handler itself enforces the above access.
- Keep request body validation, known station validation, max 40 station IDs, and max 3 messages per station.
- Do not create threads or write data.

Add tests for:

- middleware exact-public behavior for route-preview
- route handler `off/all/authenticated` behavior
- unknown station IDs still rejected
- station count cap still rejected

### A3. Polish target-neutral naming residue

Clean the remaining test/copy residue:

- `limitStations` wording in `chat-repository.test.ts` should become `limitItems` or `limitTargets`.
- Scan for old conditions-feed names and only leave provider/station-specific words where they truly describe Veðurstofan station registry data.

## Part B — Prepare the next provider-neutral conditions phase

After Part A is stable, move the next step forward in the same pass if it remains low-risk:

### B1. Define the explicit chat target-type migration plan, but do not run SQL

Before Vegagerðin write-side chat can exist, the DB constraint from `sql/78_teskeid_chat_core.sql` must allow `vegagerdin_station`.

If implementation is otherwise ready, create a new idempotent migration file only if the handoff scope remains clear:

- extend `teskeid_chat_threads_target_type_check`
- allow both `vedurstofan_station` and `vegagerdin_station`
- keep RLS/grants unchanged
- include rollback notes

Do not run it. If there is any uncertainty, write only the plan in the handoff and stop before SQL.

### B2. Keep conditions feed provider-neutral, but do not create Vegagerðin messages yet

Do not implement Vegagerðin posting in this step unless the migration file exists and Stebbi explicitly approves running it later.

Allowed preparation:

- keep `ConditionFeedTarget` and `ConditionFeedPreviewItemDto` provider-neutral
- ensure route/overview href generation does not assume Veðurstofan except where it links to `/puls/stod/[stationId]`
- add a clearly named future resolver/TODO for Vegagerðin pulse URLs, rather than hardcoding fake routes

### B3. Continue Vegagerðin overview UI only through shared provider shell

If touching Vegagerðin overview:

- use existing provider-neutral shell/card/map primitives
- keep current measurements read-only and cache-backed
- do not affect trip-risk calculation, scrubber, worst point, or selected provider logic yet
- no duplicated Veðurstofan-only components with just names changed

## Tests to run

Run at least:

```bash
npm run type-check
npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/chat-repository.test.ts lib/__tests__/weather-conditions-feed-preview-api.test.ts lib/__tests__/loginNext.test.ts lib/__tests__/innskraning-page.test.tsx lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/weather-vegagerdin-current.test.ts lib/__tests__/useFeedLoader.test.ts
```

Add focused tests for the new route-preview access and `useFeedLoader` stale-clearing behavior.

## Handoff after implementation

Create a new handoff with:

- what changed
- files changed
- exact tests run and exit codes
- whether SQL was written
- whether SQL was run (should be no unless Stebbi separately approves)
- remaining risks
- next recommended large step
- `Localhost checks for Stebbi`
```

## Localhost Checks for Stebbi

After Claude Code implements the next step, Stebbi should test:

1. Public, `WEATHER_ENABLED=All`:
   - Open `/vedrid`.
   - Calculate a route that has Veðurstofan station reports.
   - Confirm route-scoped condition reports appear for public users when reports exist.

2. Public, `WEATHER_ENABLED=Authenticated`:
   - Open `/vedrid`.
   - Confirm public weather is blocked as expected.
   - Direct route-preview/feed-preview API should not expose reports anonymously.

3. Signed-in, `WEATHER_ENABLED=Authenticated`:
   - Open `/auth-mvp/vedrid`.
   - Confirm overview feed and route-scoped feed still load.

4. Route change regression:
   - Calculate one route with condition reports.
   - Change to a different route with no matching reports.
   - Confirm the old route's reports do not remain visible while the new route loads.

5. Existing pulse regression:
   - “Sjá fleiri skilaboð eða segja frá aðstæðum” still opens the correct station pulse.
   - `returnTo` still returns to the route context.
   - Writing a pulse as signed-in still refreshes previews.

6. Vegagerðin:
   - Current-measurement overview remains read-only and does not affect trip weather scoring.

No SQL or production data should be touched casually in this step.

## Óvissa / þarf að staðfesta

- I did not run browser/localhost tests.
- I did not inspect every file in the dirty worktree, only v452-relevant feed/chat/middleware paths.
- If Stebbi wants `route-preview` to remain signed-in only, then finding #2 becomes a product decision rather than a bug. Based on prior product direction, public users should see preview reports but must sign in to open/write the full pulse.
