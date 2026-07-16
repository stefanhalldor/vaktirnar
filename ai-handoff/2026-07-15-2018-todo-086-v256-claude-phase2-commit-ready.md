# 2026-07-15 20:18 - TODO-086 v256 - Claude: Phase 2 commit-ready summary

Phase 2 is complete and approved by Codex (v253, v255). This handoff is for Codex to verify the exact commit scope before Stebbi gives commit permission.

## Proposed commit: "feat: Veðurpúls Phase 2 — API routes and chat core hardening (#86)"

### Files to stage (and only these)

**Modified tracked files:**
- `lib/chat/repository.server.ts`
- `lib/__tests__/chat-repository.test.ts`

**New untracked files:**
- `lib/chat/api.server.ts`
- `app/api/auth-mvp/vedurpuls/thread/route.ts`
- `app/api/auth-mvp/vedurpuls/messages/route.ts`
- `app/api/auth-mvp/vedurpuls/read/route.ts`
- `app/api/auth-mvp/vedurpuls/report/route.ts`
- `lib/__tests__/vedurpuls-api.test.ts`

**NOT staged:**
- `TODO.md`, `WORKFLOW.md` (unrelated modifications)
- `.claude/`, `.obsidian/` (local tool folders)
- `ai-handoff/` files (docs only, not part of feature)

### What Phase 2 adds (since Phase 1 commit d75085e)

**`lib/chat/api.server.ts`** (new)
- `isValidUuid()` — UUID regex validator for route inputs
- `isValidTimestampCursor()` — parseable-date validator for pagination cursor
- `chatAccessError()` — maps `ChatAccessResult` to HTTP response
- `WEATHER_PULSE_SCOPE` — `{ domain: 'weather', targetType: 'vedurstofan_station' }` shared constant

**`lib/chat/repository.server.ts`** (additions to Phase 1 file)
- `assertThreadScope(threadId, scope)` — checks thread exists with matching domain+targetType; throws `'chat: scope check failed'` on DB error, `'chat: not found'` on missing/mismatch
- `assertMessageScope(messageId, scope)` — checks message exists and its thread matches scope; same error classification
- `markThreadRead(threadId, userId)` — server-side mark-all-read, upserts `last_read_at = now()` with `last_read_message_id: null`

**`app/api/auth-mvp/vedurpuls/thread/route.ts`** (new)
- `POST { targetId }` — validates station via `buildWeatherStationTarget`, calls `getOrCreateThread`, returns `ThreadDto`

**`app/api/auth-mvp/vedurpuls/messages/route.ts`** (new)
- `GET ?threadId=&limit=&before=` — UUID + cursor validation, `assertThreadScope`, `listMessages`, returns `MessageDto[]`
- `POST { threadId, body, messageKind? }` — UUID + body length + messageKind validation (system/unknown → 400), `assertThreadScope`, `postMessage`

**`app/api/auth-mvp/vedurpuls/read/route.ts`** (new)
- `POST { threadId }` — UUID validation, `assertThreadScope`, `markThreadRead`, no client message ID

**`app/api/auth-mvp/vedurpuls/report/route.ts`** (new)
- `POST { messageId, reason, body? }` — UUID + reason trim/length + body length validation, `assertMessageScope`, `reportMessage`; duplicate reports → `{ ok: true, alreadyReported: true }`

**`lib/__tests__/vedurpuls-api.test.ts`** (new)
- 45 tests covering all four routes: auth enforcement (401/403/503), UUID validation (400), input validation (400), scope rejection (404), scope DB error (500), repository error (500), happy path

**`lib/__tests__/chat-repository.test.ts`** (additions)
- `markThreadRead`: success shape (null message id, timestamp), error throw
- `assertThreadScope`: success, not found, out of scope, DB error → scope check failed
- `assertMessageScope`: success, message not found, thread out of scope, message lookup error, thread lookup error

## Test results (most recent run)

```
npm run test:run -- lib/__tests__/vedurpuls-api.test.ts lib/__tests__/chat-repository.test.ts
Tests: 73 passed
npm run type-check: no errors
```

## What is NOT in this commit

- SQL78 / SQL79 — committed in Phase 1 (d75085e), already run by Stebbi
- `lib/chat/types.ts`, `lib/chat/access.server.ts`, `lib/chat/adapters/weather.server.ts`, `lib/loans/guard.ts` — all committed in Phase 1
- Phase 3 UI — not started

## Pending after commit

- Phase 3: Chat UI on `/auth-mvp/vedrid/elta-vedrid` station cards
  - `WeatherPulseButton` (unread badge, opens panel)
  - Message list (polling 15s while open)
  - Message input + optimistic send
  - Mark-read on open
