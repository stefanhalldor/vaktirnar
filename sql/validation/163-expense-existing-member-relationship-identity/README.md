# SQL163 existing-member Relationship identity

Additive, service-role-only identity management for an exact active one-off Expense. Preflight and postflight are read-only. Recovery revokes access first and drops functions only after app rollback and an explicit operator decision. Codex did not run this SQL.

Run preflight in a fresh postgres SQL Editor session. Continue only when
`prerequisites_ok` and `operator_state_ok` are true. A clean first install has
`clean_initial_state=true`. If a migration response was lost, do not rerun it:
only `exact_installed=true` together with `lost_response_safe=true` permits
skipping to schema-cache reload and postflight. Any partial/inconsistent state
is a hard stop for review. Migration, schema-cache reload and postflight each
require separate approval.

Recovery is not automatic rollback. First roll back every app instance and
prove it no longer calls SQL163, obtain separate recovery approval, then
uncomment the transaction-local confirmation line. Recovery verifies exact
hash/security/ACL state before revoking the two service-role grants. It never
changes user or financial data and never drops an object.

## Runtime read diagnostic

`diagnose-runtime-read.sql` is a separate read-only operator diagnostic, not a
migration. It executes no DDL, DML, grant, recovery or schema-cache action.
Replace its single `<REPLACE_WITH_EXACT_EXPENSE_UUID>` placeholder with the
exact confirmed Expense UUID, run the complete file in a fresh postgres SQL
Editor session, and return only the bounded JSON result row.

Continue only from an independently reviewed hash. The result row contains a
classification, validated SQLSTATE or `unknown`, bounded shape/count evidence
and a pseudonymous token. It never returns the Expense result, UUIDs, names,
emails, candidates, error message, details or hint. Any `STOP_*` classification
is a hard stop for review. Do not run relationship binding on the strength of
this diagnostic alone.

## Localhost checks for Stebbi

After a separately reviewed SQL gate, use disposable consenting data to bind one manual name-only member from the saved Expense `Uppgjör` view. Verify the same member, payer, shares, balances, repayments, Event relation and visibility remain unchanged. Do not test against production financial data casually.
