# TODO #19 / #27 - Nýlegt event feed — post-implementation handoff

## Migration status

`sql/45_recent_read_state.sql` — **already applied** by Stebbi before this session.
`loan_recent_read_state` table is in production but is now unused by app code.
It was left in place. A cleanup migration can drop it later once Stebbi confirms.

`sql/46_recent_events.sql` — **written, not run**.
Stebbi must apply this before the new Nýlegt is live.

## Migration: sql/46_recent_events.sql

- Creates `public.recent_events` table (see file for full schema)
- Wrapped in `BEGIN; ... COMMIT;`
- Enables RLS; no public policies
- REVOKE ALL from PUBLIC, anon, authenticated
- GRANT SELECT, INSERT, UPDATE, DELETE to service_role only
- No existing rows modified
- No existing RLS weakened
- Rollback: `DROP TABLE IF EXISTS public.recent_events;`

## RLS / grants / auth preservation

- No anon or authenticated grants at any layer
- All reads/writes go through service_role server code
- Actor ownership verified server-side before any ack:
  `ackRecentEventsForUser(userId, eventIds)` issues `.eq('user_id', userId)` as a WHERE
  clause — foreign event IDs owned by another user are silently ignored by the DB
- `ackRecentEvents` server action uses `guardTeskeidSession()` (not loan-specific guard),
  appropriate for a cross-teskeid feed

## Event payloads — no email or secret leakage

All events use `payload: { itemName?: string }` only. No emails, no auth identifiers,
no raw RPC responses, no private notes. Item name is considered safe for the actor
who owns the loan. Counterpart targeting not implemented in phase 1.

## Events emitted in phase 1 (all actor-only, after successful mutation)

| Action | Event type | Key pattern |
|--------|-----------|-------------|
| createLoan | loan_created | loans:loan:{id}:created |
| updateLoan | loan_updated | loans:loan:{id}:updated |
| updateLoanItemDetails | loan_updated | loans:loan:{id}:updated |
| markReturned | loan_returned | loans:loan:{id}:returned |
| undoReturn | loan_return_undone | loans:loan:{id}:return-undone |
| deleteLoan | loan_deleted | loans:loan:{id}:deleted |

`loan_created` and `loan_deleted` use `updateOnConflict: false` (INSERT, ignore duplicate).
All others use `updateOnConflict: true` (UPSERT, reset ack_at on each state change).

`deleteLoan` prefetches item_name before the delete RPC so the event has a meaningful label.
`markReturned` and `undoReturn` fetch item_name after their RPC (item_name is immutable).

Event recording is best-effort: errors are caught and logged but never fail the mutation.

## Files changed

### New files
- `sql/46_recent_events.sql`
- `lib/recent-events/types.ts`
- `lib/recent-events/helpers.server.ts`

### Modified files
- `lib/loans/actions.ts` — import `recordRecentEvent`; add `fetchLoanItemName` helper;
  emit events in createLoan, updateLoan, updateLoanItemDetails, markReturned, undoReturn, deleteLoan
- `app/auth-mvp/heim/actions.ts` — replaced `markRecentLoansRead` with `ackRecentEvents`
  (uses `guardTeskeidSession`, validates event IDs as positive integers, delegates to
  `ackRecentEventsForUser`)
- `app/auth-mvp/heim/page.tsx` — removed `get_my_loans` RPC and loan-based Nýlegt;
  uses `getUnreadRecentEventsForUser`; pre-renders event labels server-side via `t()`
- `app/auth-mvp/heim/RecentSection.tsx` — simplified: receives `RecentEventDisplay[]`
  (pre-rendered label + href + id); calls `ackRecentEvents` on Lesið; no cookie/loan logic
- `messages/is.json` — added 5 event label keys; updated noRecent
- `messages/en.json` — same

### Updated tests
- `lib/__tests__/sql-migration.test.ts` — now tests migration 46
- `lib/__tests__/mark-recent-read-action.test.ts` — rewritten for `ackRecentEvents`
- `lib/__tests__/home-page.test.tsx` — complete rewrite: event-based mocks, new test suite

## Commands run

```
npx vitest run
# 34 files, 963 tests (933 passed, 22 skipped, 8 todo), all passed
```

## What was NOT changed (still in place)

- `loan_recent_read_state` table (migration 45) — in production, untouched
- `lib/loans/recent-read.ts` — cookie serialization, now unused by app, not deleted yet
- `lib/loans/recent-read.server.ts` — computeRecentReadKey, now unused by page, not deleted yet
- `lib/__tests__/recent-read.test.ts` — tests still pass, code still exists

These can be cleaned up in a later pass after Stebbi confirms migration 46 is stable.

## What remains for #27

- `loan_invitation_received` event for the recipient when an invitation is sent
- `loan_invitation_acknowledged` / `loan_invitation_declined` events
- These require matching authenticated user email to invitation recipient without
  leaking email to client — same table, same ack flow, just new event types

## Risks for Codex review

1. **Migration 46 must be applied** before Nýlegt shows anything. Until then, the page
   shows an empty done banner (graceful degradation).

2. **loan_recent_read_state is orphaned** in production. No app code writes or reads it
   anymore. Plan a cleanup migration (DROP TABLE) once migration 46 is confirmed stable.

3. **fetchLoanItemName adds a DB query** to markReturned and undoReturn. It's service-role
   so it's fast, but it's an extra round-trip. If performance becomes a concern, consider
   passing item_name as a parameter from the client action that calls markReturned.

4. **loan_deleted events persist after deletion** since there's no FK on entity_id.
   This is intentional (event log survives deletion) but means two events can coexist for
   the same loan (created + deleted). Acceptable for phase 1.

5. **No counterpart events** in phase 1. If Anna loans a book to Jón, only Anna sees events.
   Jón sees nothing in his Nýlegt. This is documented and expected — full #27 handles it.
