# SQL167 private-recent `NULLIF` runtime hotfix

SQL167 is a forward-only, body-only correction for
`public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)`.
The effective SQL141 predecessor contains the deferred runtime form
`pg_catalog.nullif(`. PostgreSQL treats `NULLIF` as a conditional expression,
not a schema-callable function. SQL167 changes only that token to `NULLIF(`.

This capability is currently behind a closed beta flag with very few approved
users. That limits runtime exposure, but it does not weaken transaction, ACL,
privacy or migration checks.

Codex wrote these files locally. Codex did not run SQL167, connect to Supabase,
retry Relationship binding, mutate production data, reload schema cache,
commit, push or deploy.

## Exact source evidence

- helper predecessor MD5: `46a55ef53d35e1385cce6b9689705856`;
- corrected helper target MD5: `d87efae16a77f09eb82ca8ec2a1fca35`;
- unchanged direct caller `expense_apply_identity_binding` MD5:
  `819b2e024aac1e00c7e14145b0d6b373`;
- unchanged direct caller `expense_dispute_claim` MD5:
  `7e6426c8e43efa3bb7d725bf6b1c807c`;
- unchanged SQL163 Relationship mutation MD5:
  `257e4ad0dc53277b984272baadd8a3bf`;
- unchanged SQL166 discovery target MD5:
  `d97158cb09a138b962382747c6badbca`.

The effective latest-function manifest distinguishes frozen history from the
latest installed body. SQL149 and SQL163 retain historical invalid tokens that
were corrected by SQL151 and SQL166. SQL141 likewise remains immutable while
SQL167 provides the exact latest helper target. Raw historical files are not
required to become token-free. Any other unresolved special-expression token
in a latest effective body is a separate STOP, not extra SQL167 scope.

## Transaction evidence

The failed binding call runs inside one PostgreSQL transaction. The SQL163
wrapper begins its idempotency request before calling
`expense_apply_identity_binding` and finishes the request only after that call
returns. The helper call occurs after the member update, identity-proof insert
and financial-version update. No caller/helper exception handler swallows the
runtime error. The uncaught error therefore rolls the complete function call
back. This is source/transaction evidence, not a live production-state claim.

`diagnose-binding-state.sql` supplies the separate bounded live-state gate.
It intentionally does not claim exact activity or request-row uniqueness,
because those rows cannot be tied to the attempted member safely without
broader private output.

## Operator order

Use a fresh postgres SQL Editor session for each file. Do not run several files
together.

1. Run the complete `preflight.sql`. It is read-only and rolls back.
2. Continue only when every evidence flag is true and
   `installation_state = 'PREDECESSOR_READY'`.
3. Obtain separate explicit approval, then run
   `sql/167_expense_private_recent_nullif_hotfix.sql` exactly once.
4. If the response is uncertain, do not rerun blindly. Run fresh preflight;
   `EXACT_INSTALLED` is the lost-response-safe state.
5. Run complete `postflight.sql` and require `postconditions_ok = true`.
6. Postflight proves the exact installed source/catalog/RLS/grant contract. It
   does not claim that unrelated concurrent user data remained globally
   identical. Static review proves SQL167 contains no data DML.
7. Prepare `diagnose-binding-state.sql` for the pre-bind gate:
   - replace the Expense, member and Relationship placeholders with the exact
     operator values;
   - replace the expected-version placeholder with an empty string;
   - run the complete file and require `READY_NO_PARTIAL_BINDING`;
   - record the returned `financial_version` and evidence token.
8. Refresh the Expense, then attempt the intended Relationship binding once.
   Do not double-click or retry on an uncertain response.
9. Prepare a fresh diagnostic copy with the same three exact identifiers and
   the recorded pre-bind financial version. Require `BOUND_EXACTLY_ONCE`.
10. Restore all four generic placeholders in the repository artifact, verify
    that no live UUID remains, and rerun its focused static test before release.

Any STOP state, false evidence flag, unexpected row or SQL error is a hard
stop. Do not repair data, rerun SQL163/164/165/166, reload schema cache or use
recovery to guess through a failed gate.

## Recovery boundary

No automatic SQL167 recovery is available. `recovery.sql` is deliberately a
read-only guard that reports whether the exact target/caller boundary is
present and always rolls back. It performs no revoke, grant, function rewrite,
DDL or DML.

The helper is private and shared by a broad transitive mutation graph.
Restoring the known-broken SQL141 predecessor is forbidden. Revoking all
transitive callers or replacing the helper with a fail-stub could disable
unrelated Expense and Event writes. Any such containment requires a separate
architecture review and explicit Stebbi approval.

## Diagnostic privacy and scope

The binding-state diagnostic derives the actor and target account from the
exact Relationship and Expense authority graph. It returns only a bounded
classification, booleans, counts, financial version and a one-way evidence
token. It never returns identifiers, names, contact fields, titles, content or
raw errors.

Pre-bind `READY_NO_PARTIAL_BINDING` proves the same member remains an active
unregistered guest, no exact proof or duplicate represented member exists, and
the current version is captured. Post-bind `BOUND_EXACTLY_ONCE` proves the same
durable member now represents the intended target, exactly one proof exists,
the version advanced by one, no duplicate member exists and no invitation for
that member remains pending.

## Localhost checks for Stebbi

Do not retry binding until SQL167 has passed independent review, manual
preflight, separately approved one-time migration, green postflight and the
pre-bind diagnostic.

After those gates:

1. Sign in as the same approved closed-beta owner/admin.
2. Open the confirmed one-off Expense and choose `Uppgjör`.
3. Confirm the page loads without a console overlay or Relationship-management
   read error.
4. Confirm the exact unregistered guest still shows
   `Tengja við Teskeiðarnotanda`.
5. After `READY_NO_PARTIAL_BINDING`, select the one intended consenting test
   Relationship exactly once.
6. Expect the save to succeed, the page to refresh and the picker to disappear
   for that now-linked member.
7. Reopen the Expense and confirm amounts, payer, shares, payments, balances,
   repayments, settlement and visibility are unchanged.
8. Run the post-bind diagnostic and require `BOUND_EXACTLY_ONCE`.
9. Open one unrelated confirmed Expense and confirm it still loads normally.

This final binding test writes user data. Use only an unambiguous pair whose
participants consent. If the response is uncertain or any `42883`/server error
appears, stop and report the safe classification; do not retry blindly.
