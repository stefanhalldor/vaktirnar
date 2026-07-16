# 2026-07-15 19:48 — TODO-086 v250 — Claude: Phase 2 API hardened

Addresses all findings from:
`ai-handoff/2026-07-15-1940-todo-086-v249-codex-v248-vedurpuls-phase2-review.md`

## Changes

### New: `lib/chat/api.server.ts`

Shared route helpers (removes duplication across 4 routes):
- `chatAccessError(result)` — maps ChatAccessResult to HTTP error response
- `isValidUuid(value)` — UUID regex check (`/^[0-9a-f]{8}-...-[0-9a-f]{12}$/i`)
- `isValidTimestampCursor(value)` — valid parseable date string

### New: `markThreadRead` in `lib/chat/repository.server.ts`

Server-side "mark entire thread as read" without needing a message ID from client.
Sets `last_read_at = now()`, `last_read_message_id = null`.
The `last_read_at` cursor drives unread count in `getThreadSummary()`.

### MEDIUM fix — try/catch on all repository calls

All four routes now wrap repository calls in try/catch and return controlled JSON:
- thread: 500 `{ error: 'thread unavailable' }`
- messages GET: 500 `{ error: 'messages unavailable' }`
- messages POST: 500 `{ error: 'message send failed' }`
- read: 500 `{ error: 'mark read failed' }`
- report: 500 `{ error: 'report failed' }` (was already there for duplicate handling)

### MEDIUM fix — UUID validation on all ID inputs

Using `isValidUuid()` from shared helper:
- thread route: `targetId` (station ID, string — no UUID)
- messages GET: `threadId` query param
- messages POST: `threadId` body field
- read route: `threadId` body field
- report route: `messageId` body field

Malformed UUIDs return 400 with `{ error: '... must be a valid UUID' }`.

### MEDIUM fix — `before` timestamp cursor validated

messages GET: if `before` param is present, validated with `isValidTimestampCursor()`.
Invalid value returns 400 `{ error: 'before must be a valid timestamp' }`.

### MEDIUM fix — `markRead` API simplified to `{ threadId }` only

read route now accepts `{ threadId }` only. No `lastReadMessageId` from client.
Cross-thread inconsistency concern resolved — server sets the cursor timestamp.
Repository call: `markThreadRead(threadId, user.id)`.

### LOW fix — `messageKind` explicit invalid value returns 400

Before: unknown kind silently downgraded to `'chat'`
After:
- Missing/null `messageKind`: defaults to `'chat'`
- Present but not in `['chat', 'field_report', 'measurement_report']` (including `'system'`): returns 400

### LOW: report reason trimmed before repository call

`reason.trim()` applied before length check and before passing to `reportMessage()`.

## Test Results

```
Test Files  87 passed (87)
Tests  2658 passed | 27 skipped | 8 todo (2693)
```

`lib/__tests__/vedurpuls-api.test.ts`: 40 tests (was 29):
- Added: UUID validation tests for all routes
- Added: `before` timestamp validation
- Added: repository failure → 500 for all routes
- Added: `system` kind → 400
- Added: unknown messageKind → 400
- Added: read accepts `{ threadId }` only (no message ID)
- Added: reason trimming test

## Typecheck

```
npm run type-check
(no errors)
```

## Files Changed

New:
- `lib/chat/api.server.ts`

Modified:
- `lib/chat/repository.server.ts` — added `markThreadRead`
- `app/api/auth-mvp/vedurpuls/thread/route.ts` — try/catch, shared helpers
- `app/api/auth-mvp/vedurpuls/messages/route.ts` — UUID/before validation, try/catch, messageKind fix
- `app/api/auth-mvp/vedurpuls/read/route.ts` — simplified to threadId only, markThreadRead
- `app/api/auth-mvp/vedurpuls/report/route.ts` — UUID validation, trim reason, shared helpers
- `lib/__tests__/vedurpuls-api.test.ts` — expanded to 40 tests

## LOW — Throttling

Noted but not implemented. Acceptable for a per-user-gated beta with a very small
trusted group. Should be added before wider testing. Will document in Phase 3 plan.

## Not Changed

- No UI changes
- No SQL changes
- Not committed (pending Codex review and Stebbi approval)

## For Codex Review

Please confirm the hardened Phase 2 is ready to commit before Phase 3 UI begins.
