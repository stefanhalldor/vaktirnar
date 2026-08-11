# SQL123 — bilateral settlement batches

SQL123 adds an atomic, peer-confirmed settlement batch for `Gera allt upp`.
One proposal may contain an external payment and the two opposing ledger legs
that represent one visible debt offset. The browser receives no direct table
writes; only the service-role server actions may call the proposal and
transition RPCs.

Stebbi alone runs Supabase SQL. Run `preflight.sql` first against the explicitly
selected project and require `prerequisites_ok = true`,
`migration_slot_clear = true`, every `sql107_*_ok = true`,
`encrypted_snapshot_trigger_ok = true`, no missing role and no old transaction.
The three `existing_sql123_*` counters must all be zero. Then run
`sql/123_expense_settlement_batch.sql` once, followed by `postflight.sql`.
Every available `*_ok` result must be true. A non-empty mismatch array or any
partial SQL123 artifact requires read-only inspection and the recovery process;
do not retry a failed apply blindly.

The `preflight.sql` and `postflight.sql` validation scripts are read-only. The
separate `sql/123_expense_settlement_batch.sql` migration is not read-only: it
adds production schema, functions, triggers, RLS and grants. Applying the
migration does not itself create settlement batches, alter auth users, decrypt
payment data or rewrite existing financial rows.

## Localhost checks for Stebbi

Only after SQL123 has been deliberately applied, use two consenting beta test
users and disposable UL entries. Verify the 30.000/5.000 example from both
sides, lower cash with full offset, rejection/cancellation, one peer
confirmation and idempotent refresh. These actions write financial history;
do not use real family or production obligations as casual test fixtures.
