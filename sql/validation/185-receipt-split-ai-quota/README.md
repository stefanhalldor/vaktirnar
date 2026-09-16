# SQL185 operator package

SQL185 adds the private receipt-AI daily quota ledger and admin-managed user
exemptions. It does not call an AI provider or modify existing split rows.

Stebbi runs every SQL step manually:

1. Run `preflight.sql`. Continue only when `operator_state=READY` and every
   boolean is `true`.
2. Run `../../185_receipt_split_ai_quota.sql` once. Expected result:
   `Success. No rows returned`.
3. Run `postflight.sql`. Accept only `operator_state=EXACT_INSTALLED` and every
   boolean `true`.

The two new tables are private, forced-RLS relations with no client policies.
Only service-role server code can call the four security-definer functions.
Reservation is serialized by Reykjavik date before a provider call: one daily
attempt for ordinary users, a bounded per-minute allowance for exempt users,
one live exempt reservation per user, and a global daily ceiling. A reservation
is never automatically refunded after provider work begins.

No destructive rollback is provided because usage/audit rows may exist after
activation. If runtime validation fails, keep the application code unreleased,
diagnose safely and prepare a separately reviewed forward correction.
