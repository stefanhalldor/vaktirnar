# 2026-07-17 17:37 — Codex review of v448 and reusable next large step

Created: 2026-07-17 17:37  
Timezone: Atlantic/Reykjavik  
Review target: `2026-07-17-1733-todo-086-v448-claude-v447-returnto-fix-drawer-done-prerelease`  
Mode: Review + next-step handoff. No code, SQL, env, commit, push, deploy, or production changes by Codex.

## Short Human Summary

v448 is mostly good and moves in the right direction:

- `returnTo` after login should now preserve the pulse URL instead of dropping users onto `/auth-mvp/heim`.
- The overview feed is now a collapsible drawer by default.
- `ConditionsFeedPreview` is becoming the reusable UI for condition reports.
- Tests are green.

But before building much more on top of this, Claude Code should harden the reusable contract. Right now it is *almost* provider-neutral, but still leaks Veðurstofan/station assumptions in a few places (`stationId`, `stationName`, `stationHref(stationId)`, keying by station ID). That is fine for the current Veðurstofan-only preview, but it will bite us when Vegagerðin gets its own station IDs and later when Teskeiðarspjall is used outside weather.

The next large step should be:

1. fix the drawer new-message counter behavior
2. make the feed DTO/component target-neutral enough for multiple providers
3. unify auth-mvp `?next=` handling
4. continue into the Vegagerðin overview layer using the same shell/card/feed primitives, not duplicate provider-specific UI

## Workflow / Reusable Principles Check

`WORKFLOW.md` says Teskeið should be built from reusable, clear core pieces rather than one-off shortcuts. It specifically calls out components, hooks, helpers, types, API contracts, provider layers and chat/pulse patterns.

Codex assessment:

- **Good:** v448 reuses `ConditionsFeedPreview` in overview and route context instead of keeping two separate message-list renderers.
- **Good:** v448 hardened the repository test for `allowedTargetTypes`, which protects the provider-neutral feed contract.
- **Good:** v448 did not start Vegagerðin write-side chat before the DB constraint supports it.
- **Needs tightening:** `ConditionsFeedPreview` is reusable visually, but its API is still station-specific. A truly reusable chat/conditions core should talk about `targetId`, `targetName`, `targetType`, and `provider`, with station wording only at the adapter/copy layer.
- **Needs tightening:** the new-message counter is local component state, but the meaning of “new since page opened” belongs closer to the data/feed state. Otherwise the component hides the badge forever after the first open.
- **Needs tightening:** auth redirect behavior should be one shared auth-mvp rule, not a generic rule plus three older special cases.

No need to stop the project. Just use the next step to clean the contract while the surface area is still small.

## Findings

1. **Medium: “new since page opened” badge is permanently disabled after the drawer has been opened once**

   In `components/weather/ConditionsFeedPreview.tsx`, `hasBeenOpened` is initialized from `defaultOpen`, set to `true` on first open, and then never reset. `showBadge` requires `!hasBeenOpened`.

   Effect:

   - user opens the drawer once
   - user closes it
   - new condition reports arrive later
   - badge does **not** show again, even though they are new since the user opened the page

   That weakens Stebbi’s intended “X ný síðan þú opnaðir síðuna” behavior.

   Recommended fix:

   - parent/feed state should track `lastAcknowledgedAt` or `baselineAt`
   - opening the drawer should acknowledge current newest item
   - if new items arrive after that, badge should be allowed to show again when drawer is closed
   - if the drawer is open when new items arrive, showing no badge is fine because the user can see the feed

2. **Medium: provider-neutral feed still uses station-specific DTO and callback naming**

   Current shape:

   - `ConditionsFeedStationPreviewDto.stationId`
   - `ConditionsFeedStationPreviewDto.stationName`
   - `ConditionsFeedPreview` keys rows by `item.stationId`
   - `stationHref?: (stationId: string) => string`
   - `onSelectStation?: (stationId: string) => void`

   This is okay for today, but not robust for:

   - Vegagerðin station IDs that could collide with Veðurstofan IDs
   - future target types that are not weather stations
   - reusable Teskeiðarspjall outside weather

   Recommended fix:

   - Introduce neutral fields: `targetId`, `targetName`, `targetType`, `provider`
   - Use key: `${targetType}:${targetId}`
   - Use callbacks that receive the item or a neutral target object:

     ```ts
     onSelectTarget?: (target: ConditionFeedTarget) => void
     targetHref?: (target: ConditionFeedTarget) => string
     ```

   - Keep backwards compatibility only if needed during transition.

3. **Medium/Low: auth-mvp `?next=` handling is not fully unified**

   v448 fixes the generic auth-mvp fallthrough redirect, which covers the pulse page and should solve the bug Stebbi saw.

   However, these earlier special cases still redirect to `/innskraning` without `?next=`:

   - `/auth-mvp/heim`
   - `/auth-mvp/minn-profill`
   - `/auth-mvp/lanad-og-skilad`

   This is not necessarily a blocker for weather pulse, but it means the auth redirect rule is not reusable and consistent yet.

   Recommended fix:

   - create one helper for auth-mvp login redirect
   - use it for all auth-mvp protected pages that redirect unauthenticated users
   - preserve `pathname + search` unless there is a deliberate reason not to
   - keep API routes JSON-only

4. **Low: English copy typo**

   `messages/en.json` has:

   > Condition reports from Teskeiðarinn users

   This should be corrected. Suggested English:

   > Condition reports from Teskeið users

   Icelandic copy is correct:

   > Fréttir af aðstæðum frá notendum Teskeiðarinnar

5. **Low / design: 30s polling is okay for now, but should be centralized before it spreads**

   `WeatherOverviewClient` now polls feed-preview every 30 seconds. That is a safe fallback and avoids realtime/RLS complexity, but if route context, station drawers and provider previews all start polling separately, this can become noisy.

   Recommended next step:

   - keep polling for now
   - extract a small reusable hook, e.g. `useConditionsFeedPreview`
   - one hook owns polling, baseline, acknowledged time and new-count logic
   - components render, hooks manage data

## Confirmed By Codex

Codex ran:

```bash
npm run type-check
```

Result:

- exit code 0

Codex ran:

```bash
npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/loginNext.test.ts lib/__tests__/innskraning-page.test.tsx lib/__tests__/chat-repository.test.ts lib/__tests__/weather-conditions-feed-preview-api.test.ts lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/weather-vegagerdin-current.test.ts
```

Result:

- exit code 0
- 8 test files passed
- 201 tests passed

Codex did not run localhost, did not start/restart dev server, did not run SQL, and did not touch production.

## Next Large Step For Claude Code

### Goal

Turn the conditions/feed drawer into a durable reusable core, then continue the Vegagerðin overview integration on top of the same provider shell and preview-card system.

This should be one larger, coherent implementation step, but still no commit/push/deploy/migration run.

### Non-goals

Do not do these in this step unless Stebbi explicitly asks:

- no production deploy
- no push or commit
- no migration run
- no live upstream Vegagerðin fetch if not already safely cached
- no Vegagerðin route-risk calculations
- no AI summarization
- no broad station-list redesign beyond avoiding obvious regressions

### Step 1 — Extract A Reusable Conditions Feed Hook

Create a small hook or helper to own feed fetching and new-count state.

Suggested name:

- `useConditionsFeedPreview`

Responsibilities:

- fetch preview items from feed-preview endpoint
- support polling interval, default 30 seconds
- store initial baseline
- track `newSinceOpenCount`
- expose an acknowledge/reset function when the user opens the drawer
- handle optional disabled state
- fail safely to empty items

Recommended return shape:

```ts
{
  items,
  loading,
  newSinceOpenCount,
  acknowledgeCurrentItems,
  refresh,
}
```

This keeps `ConditionsFeedPreview` as a presentational component.

### Step 2 — Fix New-Message Badge Semantics

Implement expected behavior:

- drawer closed by default
- if new reports arrive after page load, show `X ný síðan þú opnaðir síðuna`
- opening the drawer acknowledges the currently visible newest item
- if new reports arrive after the drawer was opened/closed, show the badge again
- if the drawer is currently open, no badge is needed

Avoid permanent “has opened once, never show badge again” state.

### Step 3 — Make Feed Target-Neutral

Refactor types and component props toward target-neutral naming.

Recommended types:

```ts
type ConditionFeedTarget = {
  targetType: ChatTargetType
  targetId: string
  targetName: string
  provider: string | null
}

type ConditionFeedPreviewItemDto = ConditionFeedTarget & {
  latestMessage: MessageDto
  latestAt: string
}
```

Component props should become:

```ts
onSelectTarget?: (target: ConditionFeedTarget) => void
targetHref?: (target: ConditionFeedTarget) => string
```

If a full rename is too disruptive, add the neutral fields now and keep station aliases only temporarily.

Important details:

- React keys should use `targetType + targetId`, not just `stationId`
- href generation should receive target type/provider, not only ID
- preserve current public payload safety: no user ID, no email

### Step 4 — Keep Weather Station Adapters Thin

Veðurstofan can adapt neutral target data into station UI, but the shared component should not know that every target is Veðurstofan.

Route context can still be “stations on the route”, but it should feed neutral items into the shared component.

### Step 5 — Unify Auth-MVP Login Redirect Helper

Create a small helper in middleware or nearby utility:

```ts
function redirectToInnskraningWithNext(request: NextRequest): NextResponse
```

Use it for all unauthenticated auth-mvp page redirects where preserving context is safe.

Keep API routes JSON-only.

Add tests:

- `/auth-mvp/vedrid/puls/stod/123?returnTo=...` preserves next
- `/auth-mvp/minn-profill?next=...` or plain `/auth-mvp/minn-profill` preserves current path/query
- `/auth-mvp/lanad-og-skilad/...` preserves current path/query
- external next is still rejected by `resolveSafeLoginNext`

### Step 6 — Continue Vegagerðin Overview Layer Using Shared Primitives

After Steps 1-5, continue the planned Vegagerðin overview integration.

Rules:

- use `WeatherOverviewShell`
- use `ProviderStationPreviewCard`
- if showing a conditions/news feed for Vegagerðin, use the same target-neutral `ConditionsFeedPreview`
- Vegagerðin stations are current observations, not forecasts
- no Vegagerðin data in scrubber/worst-point/trip-risk
- provider access should follow `weather-provider-vegagerdin` gates

If Vegagerðin chat threads need to be created:

- first write a new SQL migration that widens `teskeid_chat_threads_target_type_check`
- do not run it without explicit Stebbi approval

### Step 7 — Tests

Run at minimum:

```bash
npm run type-check
npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/loginNext.test.ts lib/__tests__/innskraning-page.test.tsx lib/__tests__/chat-repository.test.ts lib/__tests__/weather-conditions-feed-preview-api.test.ts lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/weather-vegagerdin-current.test.ts
```

Add focused tests if practical for:

- target-neutral feed DTO/key behavior
- new-count reappears if new items arrive after drawer was opened once
- auth-mvp redirect helper preserves path/query

If no component-test pattern exists, state that explicitly in the handoff and cover UI through localhost checks.

## Localhost Checks For Stebbi

After Claude Code implements the next step, Stebbi should test:

1. Public overview drawer
   - Open `/vedrid`.
   - Expected: drawer title is `Fréttir af aðstæðum frá notendum Teskeiðarinnar`.
   - Expected: drawer is closed by default.
   - Expected: if no condition reports exist, drawer is hidden.

2. New-count behavior
   - Open `/vedrid` or `/auth-mvp/vedrid`.
   - Leave page open.
   - Add a new report from another tab/session.
   - Expected: drawer header shows `1 ný síðan þú opnaðir síðuna`.
   - Open drawer.
   - Expected: count disappears because current reports are acknowledged.
   - Close drawer and add another report.
   - Expected: count appears again.

3. Pulse auth return flow
   - As public user, click `Sjá fleiri skilaboð eða segja frá aðstæðum`.
   - Expected: `/innskraning?next=...` contains the original auth pulse URL and its `returnTo`.
   - Log in.
   - Expected: land on the pulse page, not `/auth-mvp/heim`.
   - Back/return should preserve station context.

4. Auth-mvp generic redirect regression
   - Visit an authenticated-only auth-mvp page while logged out.
   - Expected: after login, user returns to the originally requested page where appropriate.

5. Provider overview
   - Open `/vedrid` and `/auth-mvp/vedrid`.
   - Expected: Veðurstofan layer works as before.
   - If Vegagerðin cache/provider is available, expected: Vegagerðin layer uses the same shell/card style and is clearly labelled as current measurement.

6. Travel calculation regression
   - Calculate a normal route in `/vedrid/ferdalagid` or `/auth-mvp/vedrid/ferdalagid`.
   - Expected: scrubber, worst point, selected point and route-risk are unchanged.
   - Expected: no Vegagerðin current observation affects route risk.

Do not run migrations, change production env, deploy, or test production data writes casually.

## Óvissa / þarf að staðfesta

- Codex did not inspect every consumer of `ConditionsFeedPreview`, only the overview/route/feed/middleware paths relevant to v448.
- It is not confirmed whether the project has a clean React component test pattern for this drawer. If not, localhost checks should cover the UI behavior.
- If Claude Code decides to use realtime instead of polling, it must first confirm no RLS/grant weakening is required. Polling is acceptable for now.
