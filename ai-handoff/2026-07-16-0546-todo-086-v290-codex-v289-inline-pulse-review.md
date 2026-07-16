# 2026-07-16 05:46 - TODO-086 v290 - Codex review of v289 inline pulse fixes

Created: 2026-07-16 05:46
Timezone: Atlantic/Reykjavik

Review target: `2026-07-16-0542-todo-086-v289-claude-v288-done-prerelease`

## Findings

### High - `Sjá fleiri skilaboð` from `/vedrid` travel context drops the user into `elta-vedrid` instead of returning to the route result

Files:
- `components/weather/VedurstofanPulseInline.tsx:141-146`
- `components/weather/VedurstofanPointCard.tsx:174`
- `components/weather/VedurstofanPointCard.tsx:289`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx:18-25`

v289 adds a full pulse link to the inline pulse block:

```tsx
href={`/auth-mvp/vedrid/puls/stod/${stationId}`}
```

This component is now used inside route-result/weather-card contexts:

- `VedurstofanJourneySummary`
- `VedurstofanPointCard`

The full pulse route has no route-result context when opened this way. Its fallback back-link is:

```tsx
/auth-mvp/vedrid/elta-vedrid?stationId=${stationId}
```

That means a user who is viewing a `/vedrid` route result, opens “Sjá fleiri skilaboð”, and then taps “Til baka” will not return to the same travel result state. They are sent to the station explorer instead.

This is exactly the state-preservation risk we called out in v284/v286, and it becomes more serious now that the link is embedded in the route result cards.

Recommended narrow fix:

- Do not let `VedurstofanPulseInline` hardcode the full-pulse href.
- Give it route-aware props, for example:
  - `fullHref?: string`
  - `showFullLink?: boolean`
  - or `returnTo?: string`
- In `elta-vedrid`, build the href with `returnTo=/auth-mvp/vedrid/elta-vedrid?stationId=...`.
- In `/vedrid` travel result context, either:
  - pass a real route-result return target if the current result is URL-backed enough to restore, or
  - temporarily hide/disable the full link until result-state preservation is solved.

I would prefer not shipping the full link from `/vedrid` route-result cards until the return path is deterministic. Inline preview + inline composer can still ship without the full link.

### Medium - Anonymous full-pulse navigation likely lands on legacy `/login` or home, not the canonical Teskeið login flow

Files:
- `components/weather/VedurstofanPulseInline.tsx:141-146`
- `middleware.ts:184-192`
- `middleware.ts:77-101`

For anonymous users, clicking the full pulse URL enters `/auth-mvp/vedrid/puls/stod/[stationId]`. Middleware then redirects unauthenticated non-public pages to:

```ts
url.pathname = '/login'
```

But `/login` is also listed as a legacy UI prefix that redirects to `/` when `LEGACY_ENABLED !== 'true'`.

So depending on env, anonymous users may click “Sjá fleiri skilaboð” and end up on the home page or an old login page instead of canonical `/innskraning`.

Recommended fix:

- For this product path, send anonymous users directly to `/innskraning`.
- Ideally preserve the intended full pulse URL as a safe `next`/return target once the login flow supports it.
- If the login flow cannot preserve next yet, at least avoid `/login` for this new Teskeið surface.

### Low - The access endpoint behavior has no direct tests

File:
- `app/api/auth-mvp/vedurpuls/access/route.ts`

The endpoint is small and uses the same `checkChatAccess`/`chatAccessError` path as other routes, which is good. But because it now drives visible UI state, I would add a small route or unit test when practical:

- no session -> 401
- allowed -> 200 `{ canPost: true }`
- no pulse/provider/chat disabled -> 403/503 as appropriate

This is not a release blocker if covered manually, but it is a useful guard for future flag/access changes.

### Low - `VedurstofanPulseInline` still duplicates chat sending logic rather than using the reusable chat core

File:
- `components/weather/VedurstofanPulseInline.tsx`

v289 fixes the product behavior from v288, but the component still owns:

- preview fetch
- access fetch
- lazy thread init
- send state
- error handling
- message refresh after send

That is acceptable as a short-term adapter, but we should keep the architecture line clear:

- reusable core = Chat
- Veðurpúls = weather adapter

The next cleanup should move common preview/composer behavior into a product-agnostic chat component or hook, with `VedurstofanPulseInline` passing labels, target, route builders, and access state.

## What looks good

- v288 High is fixed: inline input is now `text-base` and `min-h-10`; send button is `min-h-10`.
- Public preview and posting access are now separated:
  - preview remains visible
  - composer appears only for `postingAccess === 'allowed'`
  - 403/503 no longer hides the full preview block
- Anonymous users get an immediate login prompt for posting instead of writing first and failing after send.
- Thread creation remains lazy on first send.
- The change does not touch SQL, RLS, grants, policies, env vars, or migrations.
- Type-check and targeted chat/pulse tests pass.

## Design.md notes

Relevant `Design.md` guidance:

- mobile inputs must be at least 16 px
- touch targets should generally be at least 40x40 px
- mobile app flows should preserve context and avoid jarring navigation resets
- translated user text belongs in `messages/is.json` and `messages/en.json`

v289 now satisfies the mobile input/touch target issue from v288.

The remaining design issue is navigation context from route-result cards into full pulse and back.

## Commands run

```powershell
npm run type-check
```

Result: exit 0.

```powershell
npm run test:run -- lib/__tests__/chat-repository.test.ts lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/vedurpuls-preview.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/chat-access.test.ts
```

Result: exit 0. 5 test files passed, 115 tests passed.

## Files inspected

- `ai-handoff/2026-07-16-0542-todo-086-v289-claude-v288-done-prerelease.md`
- `components/weather/VedurstofanPulseInline.tsx`
- `components/weather/VedurstofanPointCard.tsx`
- `app/api/auth-mvp/vedurpuls/access/route.ts`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `middleware.ts`
- `lib/chat/access.server.ts`
- `lib/chat/api.server.ts`
- `components/chat/ScopedChatPanel.tsx`
- `messages/is.json`
- `messages/en.json`
- `Design.md`
- `WORKFLOW.md`

## SQL / Supabase

No SQL was written or run in this review.

No RLS, grants, policies, functions, auth tables, or production data were changed by this review.

## Recommended next step for Claude Code

Please do one narrow follow-up:

1. Fix or hide the full-pulse link from `/vedrid` route-result contexts so users do not lose their route result.
2. Ensure anonymous full-pulse navigation uses canonical `/innskraning`, not legacy `/login` or home.
3. Do not change SQL, schema, feature flags, env vars, or the chat core in this pass.
4. Keep the inline preview/composer otherwise unchanged.

## Localhost checks for Stebbi

After Claude Code fixes the above:

1. Open `/vedrid` as a public/anonymous user.
2. Build a route that shows Veðurstofan station cards.
3. Confirm:
   - preview is visible
   - composer is not visible
   - login prompt for writing points to canonical Teskeið login
4. If “Sjá fleiri skilaboð” is still visible:
   - click it as anonymous user
   - expected: user is sent to `/innskraning`, not `/login` or home
5. Sign in as a user with Veðurpúls access.
6. Build the same route in `/auth-mvp/vedrid`.
7. Open a Veðurstofan station card and click “Sjá fleiri skilaboð” if it is present.
8. Tap “Til baka” from the full pulse route.
9. Expected: user returns to the same route-result context, not a fresh `elta-vedrid` station explorer page.
10. Regression check:
    - `/auth-mvp/vedrid/elta-vedrid` station explorer still supports full pulse route.
    - station explorer back-link still preserves `stationId`.
    - inline composer remains mobile-safe and open by default only for allowed signed-in users.

No SQL, Supabase dashboard, Vercel env, commit, push, or deploy is needed for this localhost test.

## Óvissa / þarf að staðfesta

- I did not browser-test the anonymous full-pulse redirect. The finding is based on middleware inspection.
- I do not know yet whether `/vedrid` route results are fully URL-backed enough to restore the exact result after login/back navigation. If not, the safer short-term choice is to hide the full link in `/vedrid` contexts and keep inline preview/composer there.
