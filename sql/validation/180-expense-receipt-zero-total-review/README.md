# SQL180 operator package

SQL180 preserves exact zero-total receipt item lines for human review. Such a
line remains nonclaimable and financially inert unless the receipt owner enters
a positive amount during review. Negative item totals remain invalid. Existing
positive items, adjustments, claims, allocation and rounding keep their SQL179
behavior.

Operator order:

1. Run `preflight.sql` by itself. Continue only on `PREDECESSOR_READY` with
   `operator_state_ok = true`. On `EXACT_INSTALLED`, skip apply and use
   `postflight.sql`. Stop on every other result or error.
2. Run `../../180_expense_receipt_zero_total_review.sql` by itself once.
3. Run `postflight.sql` by itself and require `EXACT_INSTALLED` with
   `postconditions_ok = true`.

`rehearse-migration.sql` contains the exact apply transaction with a final
`ROLLBACK`; it is review evidence and is not part of the normal Production
operator sequence. `recovery.sql` restores the exact SQL179 constraint and
function bodies only after an explicit rollback decision. Its inline guard
requires the complete sealed SQL180 catalog and stops if any preserved
zero-total item exists, because such rows cannot be represented by SQL179
without data loss.

Preflight, apply, postflight and recovery use the same complete lineage model:
all 16 SQL179 functions, all five receipt relations with exact columns, RLS,
policies and dynamic owner-default ACLs, absence of non-internal triggers, the
private storage bucket, constraints, indexes and the version-bound catalog
seal. Function ACL checks require `service_role` and compare grantor, grantee,
privilege and grant option exactly. SQL180 changes only six function bodies,
the item-total check constraint and the catalog seal marker.

Stebbi runs all SQL manually. Codex never runs these files.
