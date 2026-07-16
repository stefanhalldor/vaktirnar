# 2026-07-15 23:00 - TODO-086 v282 - Codex review of v281 public preview

Created: 2026-07-15 23:00  
Timezone: Atlantic/Reykjavik

Reviewed handoff: `2026-07-15-2256-todo-086-v281-claude-v280-done`

## Findings

### Medium - Safnpuls feed still exposes full display names

`lib/chat/repository.server.ts:364` still sets:

```ts
authorName: row.user_id ? (profileMap.get(row.user_id) ?? null) : null
```

That bypasses the new `toPublicFirstName(...)` helper. `WeatherPulseFeed` renders those values through `ChatMessageRow` in `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx:505-512`, so Safnpuls can still show full names even though station preview/full thread now show first name only.

Fix before commit/release of this phase:

```ts
authorName: row.user_id ? toPublicFirstName(profileMap.get(row.user_id) ?? null) : null
```

Add a regression test where profile display name is e.g. `Stefan Halldor Jonsson` and `getFeedMessages(...)` returns `authorName: "Stefan"`.

### Medium - Public preview endpoint has no direct tests

New route: `app/api/teskeid/weather/vedurpuls/stations/[stationId]/preview/route.ts`.

The implementation looks mostly right: no auth, validates station id, calls `getPreviewMessages`, and does not create a thread. But because this is an unauthenticated public endpoint, it should have direct tests before we get too comfortable.

Recommended tests:

- known station returns `200` with latest preview messages
- unknown station returns `400`
- no existing thread returns `[]`
- deleted/hidden messages are omitted from preview
- author name is first-name-only
- route calls repository with `{ domain: 'weather', targetType: 'vedurstofan_station', targetId: stationId }`
- preview stays fixed at 3 messages or clamps any future caller-supplied limit

### Low/Medium - Middleware opens a broad public prefix

`middleware.ts:32-33` adds the whole `/api/teskeid/weather/vedurpuls` prefix to public paths. That is okay for the one current read-only preview route, but it makes future routes under the same prefix public at middleware level by default.

Safer: make the public bypass shape-specific for:

```text
/api/teskeid/weather/vedurpuls/stations/[stationId]/preview
```

Route handlers still need their own auth checks, but the middleware allowlist should stay narrow.

### Low/Medium - Composer UX should invite signed-in users to write immediately

`WeatherPulseSummary` always renders `Skrifa umferdarfrett` (`VedurstofanStationExplorerClient.tsx:394-412`). Anonymous users click it, get a 401/403/503 from `/api/auth-mvp/vedurpuls/thread`, and then see access denied.

Stebbi's updated product direction:

- Anonymous/public users: show read-only preview only, max 3 latest pulse messages. No composer.
- Signed-in users without pulse access: show read-only preview only. No composer.
- Signed-in users with pulse access: show the compact input box open by default on the station card. This should feel like "just throw in one line", not like the user has to decide to open a form first.
- Full pulse route remains the place for the longer 50-message view.

Important implementation nuance: avoid creating empty threads for every station card just because the input is visible. The UI can show the input by default, but thread creation should still be lazy: create/init the thread on focus, first non-empty input, or send. Server-side posting stays auth/access-gated.

This is not a security issue because posting is server-gated, but it matters for product adoption. The whole point of Veðurpuls is to lower the friction enough that users actually share a short road/weather observation.

### Low - Full pulse route still lacks station/weather context

Already marked as pending in v281. Not a blocker for this phase, but still important for the final Veðurpuls experience: `/auth-mvp/vedrid/puls/stod/[stationId]` should eventually show station metadata/current Veðurstofan values above the chat.

## What Looks Good

- The public preview route is read-only and uses `getPreviewMessages(...)`; it does not call `getOrCreateThread`.
- Preview messages omit deleted/hidden rows at query level.
- Full route and message posting still go through `checkChatAccess`.
- Generic chat components remain mostly product-agnostic:
  - `components/chat/ChatMessageRow.tsx`
  - `components/chat/ChatPreviewList.tsx`
  - `components/chat/ScopedChatPanel.tsx`
- `ScopedChatPanel` keeps reusable `pageSize` behavior with a default and caller override.
- Station card composer is lazy: thread creation only happens when user tries to write.

## Commands Run

Read-only inspection:

```powershell
Get-Content -Encoding UTF8 'ai-handoff/2026-07-15-2256-todo-086-v281-claude-v280-done.md'
rg -n "public preview|preview|firstName|authorName|vedurpuls" app components lib messages sql
git diff --name-only
git status --short -- app/api/teskeid/weather/vedurpuls app/api/auth-mvp/vedurpuls app/auth-mvp/vedrid/puls components/chat lib/chat lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/chat-repository.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/chat-access.test.ts messages/is.json messages/en.json middleware.ts
```

Verification:

```powershell
npm run type-check
```

Result: exit 0.

```powershell
npm run test:run -- lib/__tests__/chat-repository.test.ts lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/chat-access.test.ts
```

Result: exit 0. 4 test files passed, 103 tests passed.

## SQL / Supabase / RLS

No SQL was run in this review.  
No migration was applied.  
No Supabase data, RLS policy, grant, auth setting, or production setting was changed.

## Recommendation

Do one small fix pass before commit:

1. Fix `getFeedMessages(...)` to use first-name-only author names.
2. Add the feed first-name regression test.
3. Add at least minimal public preview route tests.
4. Prefer narrowing the middleware public allowlist now, while this is still small.
5. Adjust station-card composer UX:
   - read-only preview only for anonymous/no-access users
   - compact input visible by default for signed-in users with pulse access
   - keep thread creation lazy so previewing stations does not create empty threads

After those pass, this phase looks reasonable to commit under the existing Veðurpuls/Veðurstofan gating.

## Localhost checks for Stebbi

After Claude Code fixes the above:

1. Open `/auth-mvp/vedrid/elta-vedrid` as a user with Veðurstofan/Veðurpuls access.
2. Open Safnpuls and confirm names show first name only, not full names.
3. Open a station card and confirm the preview shows at most 3 latest messages.
4. Confirm anonymous/public preview still loads without signing in where the station card is visible.
5. Confirm anonymous/no-access users do not see a station-card composer, and server still rejects posting if someone calls the POST endpoint manually.
6. Confirm signed-in users with pulse access see the compact input open by default on the station card.
7. Confirm writing and sending from the station card works, closes/clears appropriately, and the preview updates.
8. Confirm simply opening/selecting stations does not create empty threads before the user interacts with the input.
9. Confirm full route `/auth-mvp/vedrid/puls/stod/[stationId]` still loads for allowed signed-in users and uses 50-message page size.

Do not test with real sensitive personal information in messages yet. Treat this as public-by-design weather-road-condition reporting.

## Uncertainty / Needs Confirmation

- I did not run full test suite, only type-check and targeted chat/Veðurpuls tests.
- I did not browser-test the UI; Stebbi should verify mobile/card behavior on localhost.
- Public preview currently returns the generic `MessageDto`, including `threadId`. That is not user-private, but it is more internal data than the preview needs. Consider a smaller public preview DTO in a later hardening pass.
