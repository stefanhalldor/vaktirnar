# SQL 140 — Event expense activity and global settlement labels

SQL 140 is an additive, DB-first migration. It adds two bounded service RPCs:

- attendee-safe Event expense rows plus the signed-in actor's own position;
- optional authorized Event labels for already-authorized global pay-all contexts.

It does not modify financial rows, memberships, invitations, Event links, RLS
policies, table grants, SQL 139 functions or historical data.

## Manual order

1. Keep the currently deployed app running.
2. Run `preflight.sql` and stop unless every boolean, including
   `prerequisites_ok`, is `true`.
3. Run `sql/140_event_expense_activity_and_global_settlement_labels.sql`
   exactly once.
4. Run `postflight.sql` and require every boolean, including
   `postconditions_ok`, to be `true`.
5. Only after green postflight, deploy the compatible app code.

Do not rerun the migration after a successful commit. A failed migration is
inside one transaction and rolls back. `recovery.sql` is a read-only inventory;
it does not undo a successful migration.

## Privacy and authorization contract

- Event activity requires both normal Event and Expenses access, plus Event
  ownership or an exact active accepted membership.
- The Event DTO contains no database IDs, email fields, payment instructions,
  shares, invitations or other participants' debt vectors.
- Payer labels that are invalid or email-shaped are returned as `null` and are
  localized generically by the app.
- Global pay-all Event labels require active Expense membership and Event
  ownership or an exact active accepted membership.
- Labels are display metadata only and never enter settlement calculations,
  requests or fingerprints.

## Localhost checks for Stebbi

After green postflight and before release, test with an Event owner and an
accepted attendee who both have Events and Expenses enabled:

1. Link active one-off expenses with one and multiple payers to an Event.
2. Confirm both users see the same title, optional description, total and payer
   rows, but only their own position.
3. Confirm an attendee who is not an Expense member sees a zero position.
4. Confirm cancelled expenses and Events without active linked expenses do not
   show the section.
5. Confirm each currency is separate and pending reported repayment state does
   not claim that the actor owes zero.
6. Open **Gera allt mitt upp** and confirm it includes all global actionable
   debt, not only the Event, with Event labels only where the actor has Event
   access.
7. Confirm an Expense participant outside the Event sees neither Event name nor
   an Event backlink.
8. At 360/390/460 px, confirm long titles, notes and payer names wrap without
   horizontal overflow and all controls remain at least 44 px high.

Never use real production payments merely to test this display migration.
