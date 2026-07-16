# 2026-07-15 21:41 - TODO-086 v268 - Claude: Phase 4A final done

Created: 2026-07-15 21:41
Timezone: Atlantic/Reykjavik

## Scope

This handoff covers all work done after reading Codex v267 review
(`2026-07-15-2132-todo-086-v267-codex-v266-phase4a-hardening-review`).

Three things were implemented:
1. Fix Codex v267 finding: per-thread panel now shows newest messages, not oldest
2. Stebbi request: "Sækja eldri" (load older) button in panel
3. Fix stale comments on feed ordering (Codex v267 low finding)

---

## What Changed

### 1. `listMessages` fetches newest first, returns oldest-first for display

`lib/chat/repository.server.ts` `listMessages`:

- Changed `order('created_at', { ascending: true })` to `ascending: false`
- Changed default limit from 50 to 10
- Added `.reverse()` on the result rows so the panel displays oldest-at-top within the window

This means a busy station thread with >10 messages now shows the current 10 newest, not the 10 oldest historical messages.

### 2. "Sækja eldri" (load older) pagination in `ScopedChatPanel`

`components/chat/ScopedChatPanel.tsx` — significant update:

**Transport type updated:**
```ts
export type ScopedChatTransport = {
  loadMessages(threadId: string, opts?: { before?: string }): Promise<MessageDto[]>
  markRead(threadId: string): Promise<void>
  sendMessage(threadId: string, body: string): Promise<MessageDto>
}
```

**New label:** `loadOlder: string` added to `ScopedChatPanelLabels`.

**New state/refs:**
- `hasMore: boolean` — whether a "load older" button is shown (true when last fetch returned >= 10)
- `loadingMore: boolean` — disables button while loading
- `hasLoadedOlderRef` — ref that tracks whether user has scrolled back; changes poll behavior
- `shouldScrollRef` — controls scroll-to-bottom (fires on initial load + send only, not on poll/load-older)

**Behavior:**
- On initial load: shows "Sækja eldri" button at top if >= 10 messages returned
- On click: fetches `transport.loadMessages(threadId, { before: messages[0].createdAt })`, prepends result
- After loading older: poll only appends genuinely new messages (doesn't wipe older pages)
- Scroll to bottom: only on initial load and after user sends a message — not on poll or load-older

**`VEDURPULS_TRANSPORT.loadMessages`** in `VedurstofanStationExplorerClient.tsx` updated to forward `before` cursor:
```ts
async loadMessages(threadId, opts) {
  const params = new URLSearchParams({ threadId, limit: '10' })
  if (opts?.before) params.set('before', opts.before)
  const res = await fetch(`/api/auth-mvp/vedurpuls/messages?${params}`)
  ...
}
```

### 3. Stale comments fixed

- `lib/chat/repository.server.ts` `listMessages` docstring: now says "newest first, reversed for display"
- `lib/chat/repository.server.ts` `getFeedMessages` docstring: now says "newest-first" and documents `before` cursor
- `app/api/auth-mvp/vedurpuls/feed/route.ts` comment: updated to match newest-first contract

### 4. i18n

`messages/en.json` and `messages/is.json` — new key under `teskeid.vedrid.eltaVedrid`:
- `pulseLoadOlder`: "Load older" / "Sækja eldri"

`WeatherPulsePanel` in `VedurstofanStationExplorerClient.tsx` passes `loadOlder: t('pulseLoadOlder')` in `panelLabels`.

### 5. Test

`lib/__tests__/chat-repository.test.ts` — new test in `listMessages`:
- Verifies that when DB returns `[newer, older]` (newest-first), `listMessages` reverses to `[older, newer]` for display

## Test Results

```
npm run type-check: no errors
npm run test:run: 88 test files, 2694 passed / 27 skipped / 8 todo
```

## Files Modified

- `lib/chat/repository.server.ts` — `listMessages` newest-first + reverse, comments updated
- `components/chat/ScopedChatPanel.tsx` — `ScopedChatTransport` opts, load-older logic, smart scroll
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx` — transport opts, `pulseLoadOlder` label
- `app/api/auth-mvp/vedurpuls/feed/route.ts` — comment fix
- `messages/en.json` — `pulseLoadOlder`
- `messages/is.json` — `pulseLoadOlder`
- `lib/__tests__/chat-repository.test.ts` — ordering test for `listMessages`

## Phase 4A is now commit-ready

All Codex v265 + v267 findings addressed:

| Finding | Status |
|---|---|
| `ScopedChatPanel` hardcoded Veðurpúls routes | Fixed v266 |
| Feed ordering oldest-first | Fixed v266 |
| Per-thread panel shows oldest 50, not newest | Fixed v268 |
| Stale oldest-first comments | Fixed v268 |

No SQL migration. No RLS change. No new Supabase tables.

## Localhost Checks for Stebbi

Preconditions: `TESKEID_CHAT_ENABLED=true`, user with `elta-vedrid`, `weather-provider-vedurstofan`, `weather-pulse`. User should have `display_name` in `profiles` to see author names.

1. Open `/auth-mvp/vedrid/elta-vedrid`
2. Select a station with known messages
3. Confirm Veðurpúls appears near the top of the station card
4. Open Veðurpúls — confirm newest 10 messages appear (not oldest)
5. If >10 messages exist: confirm "Sækja eldri" button appears at top of list
6. Click "Sækja eldri" — confirm older messages appear above current ones without scrolling to bottom
7. Send a message — confirm panel scrolls to bottom, page does NOT jump
8. Confirm author name shows next to 24h timestamp
9. Open Safnpúls — confirm newest messages appear first
10. Test mobile 360-390px — no overflow, input still usable
11. User without `weather-pulse` — Veðurpúls and Safnpúls hidden

## Pending

- Phase 4A commit (Stebbi to approve after localhost check)
- Phase 4B: Almennur púls (requires SQL migration for new target_type)
