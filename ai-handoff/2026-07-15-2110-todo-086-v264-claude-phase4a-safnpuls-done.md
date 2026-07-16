# 2026-07-15 21:10 - TODO-086 v264 - Claude: Phase 4A Safnpúls done

Implements the Phase 4A aggregated feed and extracts reusable Chat UI primitives.
No SQL migration needed — reads from existing teskeid_chat_* tables.

## What Changed

### New: `lib/chat/types.ts` — `FeedMessageDto`

Generic DTO for cross-thread feed messages. Includes `target` object with
`domain`, `targetType`, `targetId`, `targetName`, `provider`. No user data.

### New: `lib/chat/repository.server.ts` — `getFeedMessages(scope, opts?)`

Two-query approach:
1. Fetch threads matching `domain + targetTypes` — returns target metadata map
2. Fetch messages `IN(threadIds)` ordered by `created_at ASC`, with optional `before` cursor
Redacts body of deleted/hidden messages same as `toMessageDto`.
Throws `'chat: getFeedMessages failed'` on either query error.

### New: `app/api/auth-mvp/vedurpuls/feed/route.ts`

`GET /api/auth-mvp/vedurpuls/feed?limit=50&before=<timestamp>`
- `checkChatAccess` gate (401/403/503)
- `before` cursor validation (400)
- limit clamped 1–100
- Scope hardcoded to `WEATHER_PULSE_SCOPE` — no client-supplied scope accepted
- Returns `FeedMessageDto[]`

### New: `components/chat/ChatMessageRow.tsx`

Generic reusable message row for `teskeid_chat_messages`-backed surfaces:
- Handles `isDeleted`/`isHidden` redaction
- Kind badges for `field_report` / `measurement_report`
- Optimistic (60% opacity) and failed (40% opacity) states
- Optional `targetName` prop — shown as station label in feed view
- No weather-specific code

### New: `components/chat/ScopedChatPanel.tsx`

Generic per-thread panel (message list + input + send):
- Accepts `threadId` and `labels` — caller handles thread init
- Polls on `pollingIntervalMs` interval (default 15s)
- Preserves optimistic messages across poll refreshes
- Optimistic send with confirmed replace / failed revert
- Uses `ChatMessageRow` internally

### Modified: `VedurstofanStationExplorerClient.tsx`

- Removed local `PulseMessageRow` (replaced by `ChatMessageRow`)
- `WeatherPulsePanel` refactored: keeps thread init logic, delegates message/send/poll to `ScopedChatPanel`
- New `WeatherPulseFeed` component: polls `GET /feed` every 30s while open, shows all station messages with station name via `ChatMessageRow targetName`, auth errors → hides permanently, 5xx → silent retry
- `WeatherPulseFeed` rendered above summary strip in the page

### Modified: `messages/en.json` + `messages/is.json`

Two new keys under `teskeid.vedrid.eltaVedrid`:
- `feedTitle`: "Safnpúls"
- `feedEmpty`: empty state text

### Modified: `lib/__tests__/chat-repository.test.ts`

- Added `in` to `makeChain` helper (was missing, caused test failures in feed tests)
- Added `getFeedMessages` to imports
- 5 new `getFeedMessages` tests: happy path with target metadata, empty threads, deleted redaction, threads query error, messages query error

### New: `lib/__tests__/vedurpuls-feed.test.ts`

13 tests for `GET /api/auth-mvp/vedurpuls/feed`:
- Auth (401/403/503), cursor validation (400), limit clamping, scope passthrough
- Happy path: FeedMessageDto shape, empty array
- No user_id/email leakage in response
- Repository error → 500

## Test Results

```
npm run type-check: no errors
npm run test:run: 87 test files, 2692 passed / 27 skipped / 8 todo
Targeted: 90 passed (3 files)
```

## Architecture Boundary Maintained

- `ChatMessageRow` + `ScopedChatPanel` in `components/chat/` — generic, no weather names
- `WeatherPulsePanel` + `WeatherPulseFeed` in `VedurstofanStationExplorerClient` — weather wrappers
- No copy/paste of panel logic into second surface

## Files Modified/Created (uncommitted)

**New:**
- `app/api/auth-mvp/vedurpuls/feed/route.ts`
- `components/chat/ChatMessageRow.tsx`
- `components/chat/ScopedChatPanel.tsx`
- `lib/__tests__/vedurpuls-feed.test.ts`

**Modified:**
- `lib/chat/types.ts`
- `lib/chat/repository.server.ts`
- `lib/__tests__/chat-repository.test.ts`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
- `messages/en.json`
- `messages/is.json`

## Pending

- Codex review of Phase 4A
- Phase 4A commit
- Phase 4B: Almennur púls (requires SQL migration for new target_type)

## Localhost Checks for Stebbi

Preconditions: `TESKEID_CHAT_ENABLED=true`, user with `elta-vedrid`, `weather-provider-vedurstofan`, `weather-pulse`.

1. Open `/auth-mvp/vedrid/elta-vedrid`
2. Confirm "Safnpúls" control appears above the summary strip
3. Open Safnpúls — should show all messages from all stations in chronological order with station name on each
4. Select a station — confirm per-station Veðurpúls panel still works independently
5. Send a message from a station — close and reopen Safnpúls — message should appear there too
6. Confirm Safnpúls shows station name next to timestamp for each message
7. Test at mobile width 360–390px — no overflow, input still usable
