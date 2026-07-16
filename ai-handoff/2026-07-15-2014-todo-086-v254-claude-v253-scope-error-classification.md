# 2026-07-15 20:14 - TODO-086 v254 - Claude: v253 scope error classification

Implements the single MEDIUM finding from Codex v253.

## What Changed

### MEDIUM - Scope helpers now distinguish DB errors from not-found

`lib/chat/repository.server.ts` — `assertThreadScope`:
- Destructures `{ data, error }` from maybeSingle
- `error` truthy → throws `'chat: scope check failed'` (routes catch this as 500)
- `!data` → throws `'chat: not found'` (routes catch this as 404)

`lib/chat/repository.server.ts` — `assertMessageScope`:
- Message lookup: `msgError` truthy → throws `'chat: scope check failed'`
- `!msg` → throws `'chat: not found'`
- Thread lookup: `threadError` truthy → throws `'chat: scope check failed'`
- `!thread` → throws `'chat: not found'`

No route changes required — existing catch blocks already map any non-`'chat: not found'` error to 500.

### New tests

`lib/__tests__/chat-repository.test.ts` — 3 new tests:
- `assertThreadScope` throws `'chat: scope check failed'` on Supabase error
- `assertMessageScope` throws `'chat: scope check failed'` on message lookup error
- `assertMessageScope` throws `'chat: scope check failed'` on thread lookup error

`lib/__tests__/vedurpuls-api.test.ts` — 1 new test:
- `messages GET` returns 500 when scope check throws `'chat: scope check failed'`

## Test Results

```
npm run test:run -- lib/__tests__/vedurpuls-api.test.ts lib/__tests__/chat-repository.test.ts

Tests: 73 passed (was 69)
npm run type-check: no errors
```

## Files Modified (all uncommitted)

- `lib/chat/repository.server.ts`
- `lib/__tests__/chat-repository.test.ts`
- `lib/__tests__/vedurpuls-api.test.ts`

## Pending

- Codex sign-off on v254
- Phase 2 commit
- Phase 3: Chat UI on /elta-vedrid station cards
