# SQL131 — owner-private expense events MVP

This package validates the additive SQL131 event marker and participant mapping.
It does not apply SQL and it is not a rollback package.

## Frozen privacy and finance contract

- One event is one existing expense group plus `expense_event_contexts`.
- `expense_event_participants` maps every non-owner expense member in contiguous
  order. Its optional `linked_user_id` is owner-private identity metadata only.
- Every non-owner canonical `expense_group_members.user_id` remains `NULL`, even
  when the owner selected a known Teskeið user.
- Selection creates no expense invitation, event access, notification, email,
  activity audience or recent-event recipient for that user.
- Only canonical active expense membership authorizes financial reads. The event
  marker and participant mapping never do.
- Event list/detail projections are owner-only and expose no linked UUID, email,
  relationship nickname, note or label.

## Exact manual run order

1. Confirm the intended database and privileged database user.
2. Run `preflight.sql` as read-only and require `prerequisites_ok = true`.
3. Save its baseline row counts.
4. Run `../../131_expense_events_mvp.sql` once.
5. Run `postflight.sql` immediately; require `postconditions_ok = true` and
   compare its baseline counts with preflight.
6. Start the already configured localhost separately and perform the v233 event
   checks only with test events and test expenses.

In short: preflight → SQL131 migration → postflight → localhost.

Do not run the migration twice. Its fail-closed target-slot guard intentionally
rejects a rerun. Do not run any step against a different database after taking
the preflight baseline.

## Forward-only recovery

`recovery.sql` is a read-only inventory. It never removes or rewrites events,
participants, expense groups, members, expenses, activity, receipts or ledger
history. It requires the committed SQL131 schema and fails explicitly with
`expense_event_recovery_schema_missing` if either private event table is absent.
If application behavior is unsafe, turn off `EVENTS_ENABLED` outside SQL under
separate authority, run the inventory, and ship a new additive fix. Do not delete
an auth user while account-cleanup invariants are failing.

## Execution status

No SQL in this package was run by Codex. Database-backed verification remains
pending Stebbi: preflight → SQL131 migration → postflight, in that order.
