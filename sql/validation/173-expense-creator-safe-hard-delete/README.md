# SQL173 — creator-only safe Expense hard delete

SQL173 installs the database capability for TODO #107. Installation never
deletes, cancels, redacts or otherwise mutates an existing Expense or other
application row.

The only destructive path is the runtime function
`public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)`. The
application server calls it only after an authenticated exact creator chooses
`Eyða kostnaði` and confirms the focused destructive UI.

## Product behavior

- Exact creator plus clean active Expense: permanent deletion is available.
- Participant or non-creator group owner/admin: capability is hidden and the
  mutation denies access.
- Open edit draft/revision: blocked; the user must use the existing discard
  lifecycle first.
- Any repayment history or settlement-batch item in the group: blocked.
- Stale group financial version: bounded conflict with zero mutation.
- Financial version at JavaScript `MAX_SAFE_INTEGER`: blocked before mutation;
  `MAX_SAFE_INTEGER - 1` may succeed once and return the exact safe successor.
- Unsafe legacy Event context or invalid one-off shape: blocked.

For a reusable group, runtime deletion removes only the exact Expense and its
Expense-scoped private history/backlinks. The group, its members and other
Expenses remain.

For a dedicated `one_off` group, runtime deletion first proves the group has
exactly one Expense and no blocked state, then removes that private container
and its group-scoped data atomically. This includes only Expense relationship
provenance whose source UUID is an exact member of that dedicated group.
Reusable groups, their members and their provenance are never deleted by this
branch.

The group financial version is incremented exactly once inside the successful
transaction. For `one_off`, that increment happens immediately before the
already-authorized container deletion.

## Retained state

The migration adds an immutable tombstone containing only the deleted Expense
UUID and deletion timestamp. It prevents delete/recreate ABA. The successful
hard-delete receipt remains for exact idempotent replay and contains only
`deleted`, `group_id` and `financial_version`. SQL173 inventories every
currently installed Expense mutation receipt shape and removes exact
target-linked receipts, including historical guest-name and draft-allocation
receipts. It never treats a free-text value as target identity, so unrelated
receipts remain. An unknown target-looking operation/key shape blocks before
any application row changes.

The internal hard-delete authorization is keyed by backend PID, transaction
ID and Expense ID. It has forced RLS, no application-role table grants and is
removed before a successful transaction completes. It only lets the reviewed
runtime RPC remove otherwise immutable Expense revision/name/collaborator
history for the exact Expense.

## ACL boundary

Only `service_role` receives EXECUTE on the capability, mutation and guarded
Expense-provenance RPCs. `PUBLIC`, `anon` and `authenticated` do not. The
provenance RPC and table-level INSERT/UPDATE trigger lock and revalidate the
exact live group, active registered member and matching private relationship
before an Expense source can exist. The trigger rejects changing an Expense
source into a Loans source while leaving genuine Loans writes unchanged. New
internal tables have forced RLS and exact owner-only table ACLs.
No existing RLS policy is weakened and no direct table DML is granted.

The migration and every operator gate freeze the exact 48-FK predecessor /
47-FK installed closure and the complete enabled non-internal trigger inventory
(35 predecessor / 39 installed), including definitions, actions, validation,
deferral, function identity, enabled state, timing/events and row shape. Drift
is a hard STOP rather than an inferred-safe state.

## Installation is non-destructive

The distinction is mandatory:

`SQL rollout = install capability`

`UI confirmation = user decides`

`runtime RPC = delete one exact eligible Expense`

The ACL hardening, migration, preflight, rehearsal, postflight, recovery and
diagnostics must never call the mutation RPC or delete an existing
Expense/application row. Static regression tests enforce that boundary.

## Operator sequence

No SQL in this bundle has been executed by Codex. Every Production SQL step
requires a later, separate authorization and Stebbi remains the sole manual
Production SQL operator.

1. Run `harden-predecessor-acl.sql` by itself. Its transaction accepts only the
   exact observed legacy overgrant or the already-hardened state, then revokes
   only `TRUNCATE`, `REFERENCES`, `TRIGGER` and `MAINTAIN` from `service_role`
   on `relationship_sources`. It preserves `SELECT`, `INSERT`, `UPDATE` and
   `DELETE` and never changes an application row.
2. Run `preflight.sql` by itself. Continue only from `PREDECESSOR_READY`.
   `EXACT_INSTALLED` means no migration is needed. Any other state is STOP.
3. `rehearse-migration.sql` is deliberately read-only. It classifies the
   predecessor or installed state without invoking deletion or changing rows.
   Require the matching PASS state; drift is STOP.
4. Run `sql/173_expense_creator_safe_hard_delete.sql` alone under normal
   autocommit. Do not combine it with other SQL or wrap it in another
   transaction.
5. Run `postflight.sql` alone. Require every predicate and
   `postconditions_ok` to be true.

Production validation must remain catalog-only. Do not call the deletion RPC
from SQL Editor and do not use a real Expense as a rollback test.

## Recovery

`recovery.sql` is installation recovery, not product-data recovery. It never
deletes an Expense/application row and requires separate later authorization.

Recovery is admitted only if SQL173 is exact and both new internal tables are
empty. Any tombstone proves that the runtime delete feature has already been
used; recovery then stops before mutation because the predecessor finalization
FK cannot be restored safely. Recovery restores the three predecessor
immutable-trigger functions, the SQL159 finalization FK and removes only the
unused SQL173 catalog objects. Runtime deletion and recovery acquire the same
transaction-scoped advisory lock `(173, 107)`. Recovery checks runtime state,
validates the full installed catalog and then checks runtime state again while
holding that lock through commit.

## Accepted runtime-test waiver

Stebbi explicitly waived the disposable PostgreSQL Gate 4 as an accepted beta
business risk. Static tests freeze SQL structure, ACL intent, lock order, denial
branches, idempotency placement and non-destructive rollout, but they do not
execute the complete PL/pgSQL concurrency/rollback matrix. This residual risk
must remain visible in the final closeout.

The first destructive runtime proof is separately authorized only through the
normal authenticated product UI on localhost while it uses the Production
backend. Stebbi must deliberately choose a safe disposable Expense. Never call
the deletion RPC, issue a manual `DELETE`, or exercise destructive semantics
from Production SQL Editor. Rollout SQL remains installation/validation only
and must not delete an application row.

## Localhost checks for Stebbi

Do not perform these checks until SQL173 is exactly installed and postflight is
fully green. The checks use localhost against the Production backend under
Stebbi's explicit waiver, so the chosen Expense and its dedicated one-off
container must be genuinely disposable.

1. Sign in as the exact creator of a disposable active Expense with no edit or
   repayment history.
2. Open its normal detail page and confirm `Eyða kostnaði` appears.
3. Open the confirmation, verify focus moves to the destructive confirmation,
   press Escape/cancel and confirm nothing changes.
4. Confirm again and delete. Expect pending feedback followed by navigation to
   the Expense dashboard; reopening the deleted URL must resolve safely.
   Rapidly click confirmation twice and expect only one in-flight action.
5. For a disposable one-off Expense, confirm its dedicated container no longer
   appears. For an Expense in a reusable group, confirm the group, members and
   other Expenses remain unchanged.
6. As a participant and as a non-creator owner/admin, confirm the destructive
   control is hidden.
7. Confirm open edit drafts and any repayment/settlement history show the
   bounded explanation and produce no mutation.
8. Repeat at 360px/390px mobile widths and confirm no overflow, zoom, dead
   controls or missing focus/pending feedback.

If the response becomes uncertain, expect a focused warning that deletion may
already have completed. Do not click delete again; reload and verify state.

Do not manually call the RPC or run destructive SQL. Do not use a settled,
shared, legacy or otherwise valuable Production Expense merely to satisfy a
scenario. Stop on any uncertain eligibility, stale-version, privacy or server
error.
