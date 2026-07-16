# 2026-07-15 20:10 - TODO-086 v252 - Claude: v251 scope checks implemented

Implements all three findings from Codex v251 review.

## What Changed

### MEDIUM - Scope checks added to all four vedurpuls API routes

`app/api/auth-mvp/vedurpuls/report/route.ts`:
- Added `assertMessageScope(messageId, WEATHER_PULSE_SCOPE)` before `reportMessage`
- Added `'chat: not found'` → 404 branch in the catch block
- Imported `assertMessageScope` from `repository.server` and `WEATHER_PULSE_SCOPE` from `api.server`

`app/api/auth-mvp/vedurpuls/messages/route.ts` (done in previous session):
- `assertThreadScope(threadId, WEATHER_PULSE_SCOPE)` before `listMessages` and `postMessage`
- `'chat: not found'` → 404

`app/api/auth-mvp/vedurpuls/read/route.ts` (done in previous session):
- `assertThreadScope(threadId, WEATHER_PULSE_SCOPE)` before `markThreadRead`
- `'chat: not found'` → 404

`lib/chat/repository.server.ts` (done in previous session):
- `assertThreadScope(threadId, scope)` — checks thread exists with matching domain + target_type
- `assertMessageScope(messageId, scope)` — checks message exists, then its thread matches scope
- Both throw `'chat: not found'` for missing and out-of-scope (same error, no info leakage)

`lib/chat/api.server.ts` (done in previous session):
- `WEATHER_PULSE_SCOPE = { domain: 'weather', targetType: 'vedurstofan_station' }` constant shared across routes
- `isValidTimestampCursor` comment softened to match the actual implementation (parseable date, not strict ISO)

### LOW - markThreadRead repository tests added

`lib/__tests__/chat-repository.test.ts`:
- `markThreadRead` success: verifies upsert called with `last_read_message_id: null` and `last_read_at: any string`
- `markThreadRead` error: verifies throws `'chat: markRead failed'`
- `assertThreadScope` success: resolves when maybeSingle returns a row
- `assertThreadScope` not found: throws `'chat: not found'` when maybeSingle returns null
- `assertThreadScope` out of scope: throws `'chat: not found'` when scope mismatch
- `assertMessageScope` success: resolves when message found and thread matches scope
- `assertMessageScope` message not found: throws `'chat: not found'`
- `assertMessageScope` thread out of scope: throws `'chat: not found'` when message found but thread scope mismatch

`lib/__tests__/vedurpuls-api.test.ts`:
- Added `mockAssertThreadScope` and `mockAssertMessageScope` to hoisted mocks
- Added both to `repository.server` mock factory
- Default `mockResolvedValue(undefined)` set in `beforeEach`
- Added scope rejection test (404) for: messages GET, messages POST, read POST, report POST

## Test Results

```
npm run test:run -- lib/__tests__/vedurpuls-api.test.ts lib/__tests__/chat-repository.test.ts

Tests: 69 passed (was 57 before v252)
npm run type-check: no errors
```

## What Has NOT Changed

- No SQL changes
- `thread` route has no scope check — `buildWeatherStationTarget()` already constrains to weather+vedurstofan_station domain before `getOrCreateThread`, so a foreign-domain UUID cannot be supplied there
- No UI (Phase 3 not started)

## Files Modified (post-commit, uncommitted)

- `app/api/auth-mvp/vedurpuls/report/route.ts`
- `app/api/auth-mvp/vedurpuls/messages/route.ts`
- `app/api/auth-mvp/vedurpuls/read/route.ts`
- `lib/chat/repository.server.ts`
- `lib/chat/api.server.ts`
- `lib/__tests__/vedurpuls-api.test.ts`
- `lib/__tests__/chat-repository.test.ts`

## Pending

- Codex review of v252 changes
- Phase 2 commit (pending Codex approval)
- Phase 3: Chat UI on /elta-vedrid station cards
