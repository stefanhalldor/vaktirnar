# SQL176 finalization-receipt classifier correction

## Purpose

SQL159 writes and replays `expense_finalize_private_draft_v1` receipts with
exactly six result keys: `contract_version`, `draft_id`, `expense_id`,
`group_id`, `invitation_ids` and `state`. SQL173 accidentally required an
additional top-level `confirmed` key that no canonical writer emits. That made
an otherwise safe confirmed Expense report `unsafe_context`.

SQL176 replaces only that exact expected-key tuple inside
`expense_hard_delete_receipt_shape_known(text,jsonb)`. The six-key canonical
shape becomes known. The former seven-key shape and every other extra, missing,
malformed or unknown shape still fail closed. SQL173 settlement, repayment,
edit, Event, one-off, creator, version, dispute, invitation, receipt cleanup,
ACL and deletion-order invariants remain byte-identical.

Installation is application-data-nondestructive. It changes one function body
and does not call the delete RPC or insert, update, delete, redact or rewrite an
Expense, draft, receipt or any other application row.

## SQL175 lineage

SQL175 is already installed and its seven target functions remain byte-exact.
Its historical migration/validation artifacts intentionally pin the SQL173
predecessor classifier hash. They must not be edited after release and must not
be reused as current-state postflight after SQL176. SQL176 preflight accepts the
exact SQL175-installed state plus either the SQL173 predecessor classifier or
the SQL176 target classifier; SQL176 postflight owns the new current-state hash.

## Later operator sequence

No SQL execution is authorized by this candidate. After a separate repository
release and explicit operator authorization, Stebbi remains the only Production
SQL operator:

1. Run `preflight.sql`. `PREDECESSOR_READY` with every exactness/operator flag
   true permits the rollback-only rehearsal. `EXACT_INSTALLED` permits only
   postflight. Any other state is STOP.
2. Run `rehearse-migration.sql`; require one row with `executor_ok`,
   `candidate_catalog_verified`, `installation_rolled_back`,
   `predecessor_restored` and `rehearsal_pass` all true.
3. Run `../../176_expense_finalize_receipt_classifier_fix.sql`. Expected:
   `Success. No rows returned.`
4. Run `postflight.sql`. Require `EXACT_INSTALLED` and every boolean true.

Never call a delete RPC or issue `DELETE` from SQL Editor. A later product
acceptance must still use the authenticated UI and a separately chosen safe
Expense.

## Localhost checks for Stebbi

No localhost action is needed for candidate review. After a separately
authorized SQL176 Production installation, reload the existing confirmed
Expense that produced `unsafe_context`. Its delete capability should be
available if all other safety flags remain unchanged. First open and cancel the
confirmation to prove the non-destructive UI path. Do not confirm permanent
deletion without separate explicit destructive-acceptance authorization.
