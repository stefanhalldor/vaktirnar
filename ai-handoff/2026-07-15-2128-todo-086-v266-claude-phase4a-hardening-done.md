# 2026-07-15 21:28 - TODO-086 v266 - Claude: Phase 4A hardening done

Created: 2026-07-15 21:28
Timezone: Atlantic/Reykjavik

## What Changed

Implements all Codex v265 hardening fixes + Stebbi UI requests from the same session.
No SQL migration. Reads from existing teskeid_chat_* and profiles tables.

### Fix 1 (Codex v265): `ScopedChatPanel` is now truly reusable

**New export:** `ScopedChatTransport` type in `components/chat/ScopedChatPanel.tsx`

```ts
export type ScopedChatTransport = {
  loadMessages(threadId: string): Promise<MessageDto[]>
  markRead(threadId: string): Promise<void>
  sendMessage(threadId: string, body: string): Promise<MessageDto>
}
```

`ScopedChatPanel` now takes `transport: ScopedChatTransport` as a required prop.
All `/api/auth-mvp/vedurpuls/*` fetch calls removed from the component.

**New module-level constant** in `VedurstofanStationExplorerClient.tsx`:

```ts
const VEDURPULS_TRANSPORT: ScopedChatTransport = {
  async loadMessages(threadId) { ... fetch /messages ... },
  async markRead(threadId) { ... fetch /read ... },
  async sendMessage(threadId, body) { ... fetch /messages POST ... },
}
```

Passed as `transport={VEDURPULS_TRANSPORT}` to `ScopedChatPanel` inside `WeatherPulsePanel`.

### Fix 2 (Codex v265): Safnpúls feed returns newest messages first

`getFeedMessages` in `lib/chat/repository.server.ts` changed from `ascending: true` to `ascending: false`.

`before` cursor semantics: `lt('created_at', before)` returns messages older than the cursor timestamp, which with descending order gives the next page of older messages. This is the correct contract for a newest-first feed.

Test added to `lib/__tests__/chat-repository.test.ts`: verifies `order` is called with `{ ascending: false }`.

### Fix 3 (Stebbi): Sender name shown next to timestamp

`authorName: string | null` added to `MessageDto` and `FeedMessageDto` in `lib/chat/types.ts`.

**New helper** `fetchProfileMap(userIds: string[])` in `lib/chat/repository.server.ts`:
- Queries `profiles.display_name` for a batch of user IDs
- Never throws — returns empty map on any error, so callers degrade to `authorName: null`

`toMessageDto()` updated to accept an optional `profileMap` and populate `authorName`.

`listMessages`, `postMessage`, `getFeedMessages` all updated to:
- Add `user_id` to SELECT
- Call `fetchProfileMap` with deduplicated user IDs
- Pass profileMap to `toMessageDto`

`ChatMessageRow` now renders `msg.authorName` between `targetName` and timestamp when present:
```
[StationName] [AuthorName] 21:03 [badge]
body text
```

### Fix 4 (Stebbi): 24h timestamp

`ChatMessageRow` timestamp changed to `hour12: false`:
```ts
toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
```

### Fix 5 (Stebbi): Veðurpúls moved to top of station card

`WeatherPulsePanel` moved from bottom of `StationDetail` to right after the station header (before the metadata `<dl>`).

### Fix 6 (Stebbi): No scroll jump on send

`ScopedChatPanel` no longer calls `endRef.current?.scrollIntoView()` (which scrolled the whole page).
Now uses a `listRef` on the message container div and sets `listRef.current.scrollTop = listRef.current.scrollHeight` to scroll within the container only.

### Test fix: `makeChain` removed `then`/`catch` mock

The `then: vi.fn().mockReturnThis()` in `makeChain` caused `fetchProfileMap` to hang when `.in()` was the terminal chain method (never called resolve/reject). Removed `then` and `catch` from `makeChain` — plain objects without a `.then` method are resolved immediately by `await`, giving `data: undefined`, which `fetchProfileMap` handles via `if (!data) return new Map()`.

## Test Results

```
npm run type-check: no errors
npm run test:run: 88 test files, 2693 passed / 27 skipped / 8 todo
Targeted: 91 passed (3 files)
```

## Files Modified

- `lib/chat/types.ts` — `authorName` in `MessageDto` and `FeedMessageDto`
- `lib/chat/repository.server.ts` — `fetchProfileMap`, `toMessageDto` profileMap, `listMessages`/`postMessage`/`getFeedMessages` with user_id + profiles, `getFeedMessages` ascending: false
- `components/chat/ScopedChatPanel.tsx` — `ScopedChatTransport` export, `transport` prop, scroll fix
- `components/chat/ChatMessageRow.tsx` — `authorName` display, `hour12: false`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx` — `VEDURPULS_TRANSPORT` const, `transport` prop pass, `WeatherPulsePanel` moved to top of card
- `lib/__tests__/chat-repository.test.ts` — removed `then`/`catch` from `makeChain`, added ordering test
- `lib/__tests__/vedurpuls-feed.test.ts` — `authorName: null` added to `FEED_MESSAGE` fixture

## Pending

- Phase 4A commit (this is ready)
- Phase 4B: Almennur púls (requires SQL migration for new target_type)
- Localhost testing by Stebbi (checklist in Codex v265 handoff)

## Localhost Checks for Stebbi

Preconditions: `TESKEID_CHAT_ENABLED=true`, user with `elta-vedrid`, `weather-provider-vedurstofan`, `weather-pulse`. User should have a `display_name` in the `profiles` table to see author names.

1. Open `/auth-mvp/vedrid/elta-vedrid`
2. Select a station
3. Confirm Veðurpúls button appears near the TOP of the station card (not bottom)
4. Open Veðurpúls — send a message
5. Confirm your display_name appears next to the timestamp (e.g. `Stebbi 21:05`)
6. Confirm timestamp is 24h format (21:05, not 9:05 PM)
7. Send another message — confirm the message list scrolls within the panel, page does NOT jump
8. Open Safnpúls — confirm newest messages appear first
9. Confirm each message shows station name + author name + 24h timestamp
10. Test mobile width 360-390px — no overflow, input still 16px, no iOS zoom
11. Log in as user without `weather-pulse` — confirm Veðurpúls and Safnpúls are not visible
