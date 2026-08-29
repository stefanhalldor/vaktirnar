# SQL165 Expense share reconciliation

SQL165 replaces only the exact current `expense_update_expense(...)` function
body. Same-member `(expense_id, member_id)` rows are updated in place; new
members are inserted; only obsolete shares with no collaborator or invitation
reference are deleted. Referenced removal fails with the bounded
`expense_share_has_durable_reference` reason before financial mutation.

## Operator sequence

Run nothing without a separate production/Supabase approval.

1. Run `preflight.sql` in one fresh SQL Editor session.
2. Continue only for `PREDECESSOR_READY`.
3. `EXACT_INSTALLED` is lost-response-safe: do not rerun the migration.
4. `STOP_PARTIAL_OR_PREDECESSOR_DRIFT` means stop and rereview.
5. If separately approved, run the entire
   `sql/165_expense_share_in_place_reconciliation.sql` exactly once.
6. Reload the schema cache through the approved operator mechanism.
7. Run `postflight.sql` and require `postconditions_ok = true`.

`recovery.sql` also requires separate irreversible/operator approval. It first
proves the complete exact SQL165 function, ACL, wrapper/call, inbound FK and
public-schema state. Its first mutation revokes only the exact `service_role`
execution capability, after which it restores the exact predecessor source and
re-grants only `service_role`. A complete predecessor/ACL/dependency/FK/schema
postcondition must pass before commit. It does not delete, repair or rewrite
user data, but it deliberately restores the old save defect.

## Exact security and dependency evidence

Function ACLs are compared as the exact raw catalog tuple set `(grantee OID,
grantor OID, privilege type, is_grantable)`. The only accepted rows are owner
`postgres` execution granted by `postgres` and `service_role` execution granted
by `postgres`, both without grant option. PUBLIC OID `0`, missing service-role
execution, effective anon/authenticated execution, custom grantees, wrong
grantors and extra tuples are all STOP.

The SQL141 wrapper is frozen by its complete function metadata, exact ACL,
source hash and exactly one schema-qualified call to the exact base signature.
PL/pgSQL body calls are source-level evidence rather than a reliable
`pg_depend` function-call edge, so the output names this evidence
`wrapper_base_call_exact` rather than claiming a catalog dependency alias.

Both SQL113 inbound foreign keys must be the only inbound FKs to
`expense_shares` and must retain exact relations, ordered columns, validation,
`ON DELETE RESTRICT`, `ON UPDATE NO ACTION`, `MATCH SIMPLE`, non-deferrable and
initially-immediate behavior. Any drift is STOP.

No SQL in this bundle was run by Codex. Codex did not connect to Supabase.

## Concurrency evidence

The function retains group → Expense locking and additionally locks current
share parent-key rows in deterministic member order before checking both
status-neutral reference classes. This blocks a competing FK insert across the
check/delete window. The repository has no disposable PostgreSQL concurrency
harness, so this lock behavior is statically reviewed rather than DB-executed;
that residual gap requires focused prerelease rereview.

## Localhost checks for Stebbi

Only after independent review and separately approved installation: edit an
authorized Expense, retain the same participants, change allocation amounts,
and save once. Expect success and the exact new allocation after reload with no
console error. Verify payer, total, participants, settlement and canonical
draft routing. Test referenced participant removal only with disposable data;
expect the dedicated natural message and no state change. Never remove a real
family participant casually or run recovery as a UI test.
