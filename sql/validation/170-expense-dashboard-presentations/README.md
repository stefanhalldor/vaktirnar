# SQL170 dashboard presentations operator guide

SQL170 adds one service-role-only, read-only dashboard projection. It changes
no Expense, payment, repayment, draft, relationship or lifecycle data.

Source identity has deliberately separate exact values. The canonical inner
function body with LF, excluding the dollar-quote boundary line feeds, has MD5
`cfaacddc089a3b7231ffbf48fb39bfac`. The delimiter-contained LF `prosrc` has
raw MD5 `dbf8086df87d9574e29a914c7201257b`; the same source transported with
CRLF has raw MD5 `49614f4549dc300db1b098023be53d71`. Target installed-catalog
checks explicitly replace CRLF with LF and then require exact MD5
`dbf8086df87d9574e29a914c7201257b`. They do not trim, alter standalone CR,
collapse whitespace or perform any broader source normalization.

Run order, only after a separately approved operator gate:

1. Run `preflight.sql` read-only. Continue only from `ABSENT_READY`, or treat
   `EXACT_INSTALLED` as a lost-response-safe completed installation.
2. If preflight returns `STOP`, stop the operator lot. Run
   `diagnose-predecessor-drift.sql` only under separate read-only diagnostic
   authority, return its complete result for review, and obtain separate local
   correction authority before changing any validator or runtime artifact.
3. Only after a reviewed `ABSENT_READY` result, Stebbi runs
   `../../170_expense_dashboard_presentations.sql` once under separate
   migration authority.
4. Refresh the Supabase/PostgREST schema cache if the new RPC is not yet
   discoverable.
5. Run `postflight.sql` read-only and require `postconditions_ok = true`.
6. Perform the documented localhost checks.

Do not run preflight, diagnostic and migration as one operator step. The
required STOP sequence is: preflight STOP, diagnostic, review, correction
authority, corrected preflight review, and only then a separately authorized
migration.

The predecessor validator checks function language canonically through
`pg_proc.prolang`. PostgreSQL does not require a separate `pg_depend` row for
the pinned `sql` language; non-pinned helper languages retain the exact
dependency check. The relation ACL contract preserves authenticated profile
insert/select/update plus `service_role:INSERT` and `service_role:SELECT` on
`profiles`. Service-role INSERT is required by the two active admin profile
bootstrap/upsert paths used before weather-preference writes; service-role
SELECT covers direct server-side profile lookups and conflict-target reads.
Anonymous, unneeded authenticated and other excess service-role table
privileges remain rejected.

The design-only ACL hardening artifact is `harden-predecessor-acl.sql`. It is
not part of the normal migration sequence and must not be run without separate
operator review and SQL execution authority. It accepts only the exact recorded
broad predecessor ACL or the exact target state, revokes only known excess
privileges, and proves the exact target again before commit. The
`relationships` DELETE privilege is intentionally retained as an explicit
product capability: a Tengsl owner must be able to delete the relationship
record itself. The UI/server action for that capability is tracked separately
and is not part of SQL170.

`recovery.sql` first revokes the SQL170 service capability in its own committed
transaction. It then removes only the exact expected SQL170 function. Drift
stays disabled and stops for manual review. Recovery does not change user data
and does not restore the fragmented dashboard reads.

In the local implementation phase these files are written and statically
tested only. None of them is run against Supabase or any PostgreSQL database.
