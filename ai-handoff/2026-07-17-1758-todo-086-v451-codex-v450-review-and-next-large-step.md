# TODO-086 v451 — Codex Review of v450 and Next Large Step

Created: 2026-07-17 17:58  
Timezone: Atlantic/Reykjavik  
Reviewed handoff: `2026-07-17-1752-todo-086-v450-claude-v449-done-prerelease`

## Short Verdict

v450 is directionally good and materially improves the reusable conditions-feed path:

- `ConditionsFeedPreview` now receives target objects instead of raw station IDs.
- `useConditionsFeedPreview` removes duplicated polling from the overview page.
- middleware `?next=` handling is more consistent.
- the listed type-check and focused tests pass locally for Codex too.

I would not treat this as fully finished architecture yet. The next step should harden the feed contract before building more Vegagerðin-facing UI on top of it.

## Findings

1. **Medium: public feed-preview ignores `WEATHER_ENABLED=Authenticated` semantics**

   `middleware.ts` exact-publics `/api/teskeid/weather/vedurpuls/feed-preview`, and the route only blocks when `getWeatherEnabledMode() === 'off'`.

   Relevant files:

   - `middleware.ts`
   - `app/api/teskeid/weather/vedurpuls/feed-preview/route.ts`

   This means that if Stebbi sets `WEATHER_ENABLED=Authenticated`, signed-out users may still fetch the community conditions feed directly from the public API, even though the base weather product should be closed to public users in that mode.

   Current production may be `WEATHER_ENABLED=All`, where public preview is intended, so this is not necessarily an immediate release blocker. But it is a contract bug before we rely on `Authenticated` as a real public-off mode.

   Fix direction:

   - If mode is `all`: allow public.
   - If mode is `authenticated`: require a signed-in user inside the route handler, or return 401/404 for anonymous callers.
   - If mode is `off`: keep 404.
   - Add tests using actual mode values `all`, `authenticated`, `off`, not mocked legacy strings like `All` or `true`.

2. **Medium: target-neutral work is only halfway through the stack**

   The UI DTO is now `targetId`/`targetName`/`targetType`, which is the right direction. But several names and API shapes are still station-specific:

   - API response is still `{ stations: [...] }`.
   - hook option is still `limitStations`.
   - repository helper is still `getLatestStationConditionPreviews`.
   - tests still include stale wording like `ConditionsFeedStationPreviewDto`.
   - `ChatTargetType` now includes `vegagerdin_station`, but `sql/78_teskeid_chat_core.sql` still constrains `target_type IN ('vedurstofan_station')`.

   This is okay as a transitional state if write-side Vegagerðin chat is not implemented yet. But before we make Vegagerðin conditions/pulse writable, we need a migration to extend the DB constraint. Before we add more consumers, we should finish the naming/contract cleanup so new code does not copy the old station-only vocabulary.

3. **Low/UX: drawer badge can reappear for items that arrived while the drawer was open**

   `useConditionsFeedPreview` acknowledges only when the drawer opens. If a new item arrives while the drawer is already open, the item becomes visible, but the hook can still count it as new after the user closes the drawer.

   This is subtle, but it can make the “X ný síðan þú opnaðir síðuna” badge feel slightly wrong.

   Fix direction:

   - Either call acknowledge again when `items` changes while the drawer is open.
   - Or let the hook accept `isOpen` and auto-ack visible items.
   - Or explicitly decide that “new” means “arrived after last drawer-open event” even if visible while open, and adjust copy.

4. **Low: route-scoped feed still has its own polling/fetch logic**

   `VedurstofanRoutePulseSummary` now uses `ConditionsFeedPreview`, which is good, but it still owns its own POST fetch, interval, and refresh event handling.

   That is not wrong because route-preview is a different endpoint and different shape, but this is exactly where we should avoid creating a second “almost same” feed system. The next step should extract a shared feed-loader pattern or make the hook accept a fetcher/key so overview and route feed share polling, acknowledgement and error behavior.

## Verified By Codex

Commands run:

```bash
npm run type-check
npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/chat-repository.test.ts lib/__tests__/weather-conditions-feed-preview-api.test.ts lib/__tests__/loginNext.test.ts lib/__tests__/innskraning-page.test.tsx lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/weather-vegagerdin-current.test.ts
```

Results:

- `type-check`: clean
- Vitest: 8 files passed, 205 tests passed

No full suite, no localhost/browser validation, no Supabase/SQL execution.

## Next Large Step for Claude Code

```md
Workflow

Read this review first:
`ai-handoff/2026-07-17-1758-todo-086-v451-codex-v450-review-and-next-large-step.md`

Goal: take one larger but still safe step that hardens the reusable conditions-feed/chat foundation before expanding more Vegagerðin UI.

Do not commit, push, deploy, run SQL, or touch production/Vercel/Supabase. This is code/test execution only.

## Required work

### 1. Harden feed-preview access semantics

Fix `/api/teskeid/weather/vedurpuls/feed-preview` so it respects the `WEATHER_ENABLED` mode:

- `off` → not found.
- `all` → public access allowed.
- `authenticated` → anonymous requests must not receive the feed.
- authenticated users may receive the feed.

Use an existing auth/server-client pattern from nearby API routes where possible. Do not invent a new auth helper unless there is a clear reuse benefit.

Update tests so they use the real normalized mode vocabulary from `getWeatherEnabledMode()`:

- `all`
- `authenticated`
- `off`

Avoid tests that mock impossible values such as `All` or `true` at the route-helper boundary unless they are explicitly testing legacy env parsing in `weatherEnabledMode.server.ts`.

### 2. Finish target-neutral feed contract names

Rename the public conditions feed contract so future providers do not inherit Veðurstofan/station-only naming:

- API response should become `items`, not `stations`.
- hook option should become `limitTargets` or `limitItems`, not `limitStations`.
- repository helper should become target-neutral, e.g. `getLatestConditionFeedPreviews`.
- Tests should stop referring to `ConditionsFeedStationPreviewDto`.

If you keep a temporary backwards-compatible alias for internal callers, document why and remove it from new code paths.

### 3. Make the reusable feed loader truly reusable

Avoid duplicating polling/ack/error behavior between:

- global overview conditions feed
- route-scoped conditions feed

Preferred shape:

- extract a reusable hook that can take a `fetcher` or endpoint/key and return `{ items, loading, newSinceOpenCount, acknowledgeCurrentItems, refresh }`
- keep target rendering in `ConditionsFeedPreview`
- keep route-specific station selection/returnTo logic outside the core

Also decide and implement the drawer-open semantics:

- if the drawer is open and new data arrives, should it be considered seen?
- choose the behavior that feels least confusing for users and cover it with a focused unit test if feasible.

### 4. Prepare, but do not enable, Vegagerðin write-side chat

Do not implement Vegagerðin message posting yet unless this handoff explicitly already includes it elsewhere.

But do add a clearly documented TODO or follow-up note in code/handoff:

- TypeScript now has `vegagerdin_station`.
- DB migration 78 still allows only `vedurstofan_station`.
- Before creating Vegagerðin threads/messages, a new migration must extend the chat target-type constraint.

If you write such a migration file, do not run it. If the implementation does not need the migration yet, prefer only documenting it in the handoff.

### 5. Keep the next provider UI on the shared shell

If you touch overview/provider UI in this step:

- use existing provider-neutral shell/card/map/feed primitives
- do not create a Vegagerðin-only duplicate of a Veðurstofan component unless the difference is truly domain-specific
- keep Vegagerðin current measurements read-only and cache-backed
- do not let Vegagerðin affect travel-risk calculation yet

## Tests to run

Run at least:

```bash
npm run type-check
npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/chat-repository.test.ts lib/__tests__/weather-conditions-feed-preview-api.test.ts lib/__tests__/loginNext.test.ts lib/__tests__/innskraning-page.test.tsx lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/weather-vegagerdin-current.test.ts
```

Add/adjust tests for:

- feed-preview access in `all`, `authenticated`, `off`
- target-neutral response shape
- new-count acknowledgement behavior if changed
- target-neutral repository helper using both `vedurstofan_station` and `vegagerdin_station` as server-controlled allowed target types

## Handoff after implementation

Create a new handoff with:

- what changed
- exact files changed
- tests run and exit codes
- whether any SQL was written or not
- whether any SQL was run or not
- remaining risks
- next recommended large step
- `Localhost checks for Stebbi`
```

## Localhost Checks for Stebbi

After Claude Code implements the next step, Stebbi should test:

1. Public user, `WEATHER_ENABLED=All`:
   - Open `/vedrid`.
   - Confirm the overview conditions drawer appears only when there are condition reports.
   - Open/close the drawer and confirm the “new since” badge does not behave strangely.

2. Public user, `WEATHER_ENABLED=Authenticated`:
   - Open `/vedrid`.
   - Confirm public weather is blocked as expected.
   - Direct API behavior should not expose `/api/teskeid/weather/vedurpuls/feed-preview` anonymously.

3. Signed-in user, `WEATHER_ENABLED=Authenticated`:
   - Open `/auth-mvp/vedrid`.
   - Confirm the weather shell and conditions feed still work.

4. Route flow:
   - Calculate a route with Veðurstofan stations that have condition reports.
   - Confirm the route-scoped conditions drawer still shows the newest relevant reports.
   - Add a new report in another tab and verify the route drawer updates after polling or refresh.

5. Regression checks:
   - Station pulse pages still open with `returnTo`.
   - “Sjá fleiri skilaboð eða segja frá aðstæðum” still leads to the right pulse page and returns to the trip context.
   - Vegagerðin current-measurement layer still remains read-only and does not affect trip risk.

No Supabase migration should be run for this step unless Stebbi gives explicit separate permission.

## Óvissa / Þarf að Staðfesta

- I did not run full browser tests.
- I did not inspect every changed file in the large dirty tree, only the v450-relevant feed/middleware/chat paths.
- The access finding depends on intended semantics for `WEATHER_ENABLED=Authenticated`; based on the existing weather access docs, anonymous users should not get public weather data in that mode.
