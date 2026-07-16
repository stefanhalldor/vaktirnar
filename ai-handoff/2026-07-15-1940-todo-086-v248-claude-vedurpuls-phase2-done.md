# 2026-07-15 19:40 — TODO-086 v248 — Claude: Veðurpúls Phase 2 done

SQL78 and SQL79 confirmed run by Stebbi. Verification showed all four chat tables
exist and feature_access_feature_key_check includes weather-pulse.

## Phase 2 — Chat API Routes

Four new routes under `app/api/auth-mvp/vedurpuls/`:

### POST /api/auth-mvp/vedurpuls/thread
File: `app/api/auth-mvp/vedurpuls/thread/route.ts`

Get-or-create the shared chat thread for a Veðurstofan station.
- Body: `{ targetId: string }` (station ID only — name/coords come from registry)
- Validates station via `buildWeatherStationTarget()` — unknown stations return 400
- Returns `ThreadDto`
- Safe to call on every station card open (idempotent, does not reset message count)

### GET /api/auth-mvp/vedurpuls/messages?threadId=&limit=&before=
### POST /api/auth-mvp/vedurpuls/messages
File: `app/api/auth-mvp/vedurpuls/messages/route.ts`

GET: list messages oldest-first; limit clamped to 1-100 (default 50); optional `before` cursor.
POST body: `{ threadId, body, messageKind? }`
- `body`: 1-1000 chars (trimmed non-empty check)
- `messageKind`: `'chat'|'field_report'|'measurement_report'` — `'system'` is silently downgraded to `'chat'`
- Returns `MessageDto` with status 201

### POST /api/auth-mvp/vedurpuls/read
File: `app/api/auth-mvp/vedurpuls/read/route.ts`

Body: `{ threadId, lastReadMessageId }`
Marks thread read for the calling user. Returns `{ ok: true }`.

### POST /api/auth-mvp/vedurpuls/report
File: `app/api/auth-mvp/vedurpuls/report/route.ts`

Body: `{ messageId, reason, body? }`
- `reason`: 1-100 chars
- `body`: optional, max 1000 chars
- Returns 201 on new report, 200 with `alreadyReported: true` on duplicate (idempotent)

## Access Pattern (All Four Routes)

All routes:
1. Get user from Supabase session via `createClient()`
2. Call `checkChatAccess(user)` — full 5-layer gate
3. Map result to HTTP response: `no-session`→401, `chat-disabled`→503, anything else→403
4. Validate input
5. Call repository function

No admin routes. No user ID or email in response bodies.

## Tests

File: `lib/__tests__/vedurpuls-api.test.ts`

29 tests:
- thread: 401/503/403/400-missing/400-unknown-station/200-success
- messages GET: 401/400-missing/200-list/limit-clamped
- messages POST: 401/400-empty-body/400-too-long/400-missing-threadId/201-success/default-kind/field_report/system-downgrade
- read: 401/400-missing-threadId/400-missing-messageId/200-success
- report: 401/400-missing-messageId/400-empty-reason/400-reason-too-long/400-body-too-long/201-success/200-duplicate

## Test and Typecheck Results

```
Test Files  1 passed (1)
Tests  29 passed (29)

npm run type-check
(no errors)
```

## For Codex Review

Phase 2 adds 4 routes and 1 test file. No UI changes yet.

Review focus:
1. Are the access patterns correct? All four routes use `checkChatAccess()` — no partial gates.
2. Is input validation sufficient? Matches DB constraints (body 1-1000, reason 1-100, report body 1000).
3. Is `system` messageKind downgrade to `chat` the right behavior, or should it be a 400?
4. Should the thread POST accept additional target metadata from client, or is registry-only the right approach?
5. Are there missing error cases (e.g., repository throws on listMessages/markRead)?

## Next Phase

Phase 3: Chat UI components on `/elta-vedrid` station cards.
- WeatherPulseButton per station card
- Pulse panel with message list, input, send button
- Unread badge
- 15s poll while panel is open

## Files Changed

New:
- `app/api/auth-mvp/vedurpuls/thread/route.ts`
- `app/api/auth-mvp/vedurpuls/messages/route.ts`
- `app/api/auth-mvp/vedurpuls/read/route.ts`
- `app/api/auth-mvp/vedurpuls/report/route.ts`
- `lib/__tests__/vedurpuls-api.test.ts`

## Commands NOT Run

- Not committed (pending Codex review and Stebbi approval)
- Not pushed
- No dev server or build
- No Supabase commands
