# SQL124 — late settlement-proposal review guard

SQL124 is a forward-only correction after SQL123. The inherited
`expense_repayments_review_guard` is a `BEFORE INSERT` trigger, so it sees
older reported repayments but not the new row. In a multi-party group, one
valid reservation can re-order the current simplified settlement. A second
otherwise-current reservation can therefore make the durable reported set
review-required only after that row is inserted.

SQL124 replaces only
`expense_propose_settlement_batch(uuid,uuid,uuid,uuid,text,jsonb,uuid,bigint,text,bigint,boolean,date,text,uuid)`.
The SQL123 body is preserved exactly except for one late guard. After all batch
items exist, and while every affected group is still locked, the guard checks
`expense_reported_repayments_need_review`. The proposal RPC is `VOLATILE`, so
this later SQL statement sees repayments written by its earlier statements.
A failure raises
`expense_repayment_review_required` before financial-version and activity
writes; the surrounding transaction rolls back the batch, obligations,
repayments, allocations and idempotency request together.

Keep every app/RPC caller paused while applying SQL124. The migration holds a
transaction-level `SHARE` lock on both batch tables before it attests the
known zero-row state. Run `preflight.sql` first against the explicitly selected project. Require
every `*_ok` value and `prerequisites_ok` to be true, with both row counts
equal to zero. Then run
`sql/124_expense_settlement_proposal_review_guard.sql` exactly once, followed
by this package's `postflight.sql`. Require every `*_ok` value and
`postconditions_ok` to be true. Finally rerun the canonical SQL123 postflight
and require every `*_ok` value to be true with both row counts still zero.
Do not rerun either migration blindly after an error.

The validation scripts are read-only. SQL124 is not read-only: it replaces one
production function and resets its owner and EXECUTE grants. It does not alter
tables, RLS, auth users, secrets, payment-profile data or existing financial
rows. SQL123 must not be rerun.

## Localhost checks for Stebbi

After SQL124 postflight and the separately approved app release, use only
consenting beta users and disposable UL data. Recheck the ordinary 30.000 /
5.000 two-user flow. For the multi-party regression, start from confirmed-only
balances A=-15, B=-10, C=+12 and D=+13, report A→D 5, and then attempt the
newly shown A→C 10 context. The second proposal must return a conflict and must
leave no new pending batch, repayment, activity row or financial-version
change. Do not build this fixture from real family debt.
