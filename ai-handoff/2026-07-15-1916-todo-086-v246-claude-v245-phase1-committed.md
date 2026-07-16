# 2026-07-15 19:16 — TODO-086 v246 — Claude: Phase 1 committed

Addresses all findings from:
`ai-handoff/2026-07-15-1907-todo-086-v245-codex-v244-vedurpuls-phase1-fixes-review.md`

## What Was Done

### MEDIUM fix — `getOrCreateThread()` uses `.maybeSingle()` now

File: `lib/chat/repository.server.ts`

`byTarget()` was changed from `.single()` to `.maybeSingle()`:

- `.maybeSingle()` returns `{ data: null, error: null }` when no row exists — not found is not an error.
- Genuine DB errors now return a non-null error and are caught explicitly before proceeding to insert.
- Re-select after 23505 conflict also uses `.maybeSingle()` with explicit error check.

Before:
```ts
const { data: existing } = await byTarget()  // ignores error silently
```

After:
```ts
const { data: existing, error: selectError } = await byTarget()
if (selectError) throw new Error('chat: getOrCreateThread failed')
```

Same pattern on the re-select after 23505:
```ts
const { data: raceWinner, error: reSelectError } = await byTarget()
if (reSelectError) throw new Error('chat: getOrCreateThread failed')
```

### Tests updated for maybeSingle behavior

`lib/__tests__/chat-repository.test.ts` — `makeChain` now includes `maybeSingle` mock.

`getOrCreateThread` tests updated:
- Existing thread: `maybeSingleFn` returns row on first call (1 call total)
- First create: `maybeSingleFn` returns not-found null+null, `singleFn` (insert) returns row
- Race condition (23505): `maybeSingleFn` called twice (select + re-select), `singleFn` once (conflict)
- Message count preserved: `maybeSingleFn` returns thread with `message_count: 5`
- Genuine select error: `maybeSingleFn` returns non-null error code → throws
- Non-23505 insert error: `maybeSingleFn` not-found, `singleFn` returns non-23505 error → throws

## Commit

`d75085e` — `feat: Veðurpúls Phase 1 — chat core, SQL migrations, admin access (#86)`

13 files changed, 1174 insertions:
- `sql/78_teskeid_chat_core.sql` (new)
- `sql/79_feature_access_weather_pulse.sql` (new)
- `lib/chat/types.ts` (new)
- `lib/chat/repository.server.ts` (new)
- `lib/chat/access.server.ts` (new)
- `lib/chat/adapters/weather.server.ts` (new)
- `lib/__tests__/chat-repository.test.ts` (new)
- `lib/__tests__/chat-access.test.ts` (new)
- `lib/__tests__/sql-migration.test.ts` (modified — SQL78/79 tests)
- `lib/__tests__/feature-access-api.test.ts` (modified — weather-pulse tests)
- `lib/loans/guard.ts` (modified — weather-pulse gate + comment)
- `app/api/admin/feature-access/route.ts` (modified — weather-pulse in ALLOWED_FEATURES)
- `app/(admin)/admin/page.tsx` (modified — Veðurpúls admin section)

NOT included: `TODO.md`, `WORKFLOW.md`, `.claude/`, `.obsidian/`, handoff files.

## Test Results

```
Test Files  86 passed (86)
Tests  2614 passed | 27 skipped | 8 todo (2649)
```

## Typecheck

```
npm run type-check
(no errors)
```

## For Stebbi — SQL to Run

Phase 1 is committed to main. SQL migrations are not yet run.

### Preflight (run first, read-only)

```sql
select distinct feature_key
from public.feature_access
order by feature_key;
```

Expected values only: `umonnun`, `tengsl`, `facebook-oauth`, `vedrid`, `ferdalagid`, `elta-vedrid`, `weather-provider-vedurstofan`

If anything else appears: stop and review before SQL79.

### Run Order

1. `sql/78_teskeid_chat_core.sql`
2. `sql/79_feature_access_weather_pulse.sql`

### Verify After Running

```sql
select to_regclass('public.teskeid_chat_threads') as threads,
       to_regclass('public.teskeid_chat_messages') as messages,
       to_regclass('public.teskeid_chat_read_cursors') as read_cursors,
       to_regclass('public.teskeid_chat_message_reports') as reports;
```

Expected: all four are non-null.

```sql
select constraint_name, check_clause
from information_schema.check_constraints
where constraint_schema = 'public'
  and constraint_name = 'feature_access_feature_key_check';
```

Expected: `check_clause` contains `weather-pulse`.

## Vercel Env Vars (needed before Phase 2 testing)

```
TESKEID_CHAT_ENABLED=true
WEATHER_PULSE_ACCESS_REQUIRED=true
```

Keep `WEATHER_PULSE_ACCESS_REQUIRED=true` while Veðurpúls is per-user gated.
Do NOT add these until SQL is run and Phase 2 API is implemented.

## Phase 2 Next Steps

After Stebbi runs SQL78/79:

- Phase 2: Chat API routes (`/api/chat/...`) — thread get/create, message list, post, mark-read, report
- Phase 3: Chat UI components — message list, input, send button, unread badge
- Phase 4: Integration on `/elta-vedrid` station cards — WeatherPulseButton per station

## Commands NOT Run

- SQL not executed
- Not pushed (push requires Stebbi approval)
- No Supabase commands
- No dev server or build
