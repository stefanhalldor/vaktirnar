# SQL186 operator runbook

1. Run `preflight.sql` alone. Continue only when the single row is `READY` and
   every boolean is `true`.
2. Run `sql/186_receipt_split_participant_controls.sql` once. Expected result:
   `Success. No rows returned`.
3. Do not rerun the migration. Run `postflight.sql` read-only and accept only
   `EXACT_INSTALLED` with every boolean `true`.

SQL186 adds one private forced-RLS table for per-member `Ekki mitt` state, one
bearer-token preview function that returns only the bill title, one idempotent
member dismissal function and a revised v2 read projection with dates and the
current member's dismissed item IDs. Only `service_role` may execute the public
functions. A private claim trigger clears a stale dismissal when that same member
takes a quantity. There are no client policies and no existing data rows are changed.
