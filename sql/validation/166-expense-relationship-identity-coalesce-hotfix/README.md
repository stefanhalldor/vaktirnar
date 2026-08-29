# SQL166 Expense Relationship identity COALESCE hotfix

SQL166 is a forward-only, body-only correction for
`public.expense_get_relationship_identity_management_v1(uuid,uuid)`. The
installed SQL163 predecessor defers an invalid call to
`pg_catalog.coalesce(jsonb,jsonb)` until runtime. SQL166 changes only that token
to the PostgreSQL special expression `COALESCE(`.

The migration does not edit historical SQL163, alter the Relationship binding
mutation function, change tables/RLS/data, reload schema cache, or repair any
Expense. Codex wrote these files locally and did not run them or connect to
Supabase.

## Exact source evidence

- discovery predecessor MD5: `3ac32ce091028d0c73476c88c7fa208f`;
- discovery corrected target MD5: `d97158cb09a138b962382747c6badbca`;
- unchanged mutation MD5: `257e4ad0dc53277b984272baadd8a3bf`;
- direct helper MD5: `b25f994a64dde4a3f94ec8bad8535b17`.

The migration derives the target from the installed exact predecessor and
requires exactly one `pg_catalog.coalesce(` occurrence. It verifies that
reversing the one-token change recreates the predecessor byte-for-byte.
Every gate checks both exact raw ACL rows and effective inherited privileges:
`service_role` must be able to execute both SQL163 functions while `anon` and
`authenticated` must not.

## Operator order

Every step requires its own explicit authority. Use a fresh postgres SQL Editor
session and do not run multiple files together.

1. Run `preflight.sql`. It is read-only and rolls back.
2. Continue only when `installation_state = 'PREDECESSOR_READY'` and every
   contract/ACL/dependency flag is true.
3. Obtain separate approval, then run
   `sql/166_expense_relationship_identity_coalesce_hotfix.sql` exactly once.
4. If the response is uncertain, do not rerun blindly. Run a fresh preflight:
   `EXACT_INSTALLED` is the lost-response-safe state.
5. With separate approval, run `postflight.sql` and require
   `postconditions_ok = true`.
6. Postflight proves catalog/source state only. Run the separately reviewed,
   privacy-safe SQL163 runtime diagnostic and require `OK_BOUNDED_RESULT`.
7. Restore the diagnostic's generic Expense UUID placeholder and rerun its
   complete static test before release packaging.

Any `STOP_PARTIAL_OR_PREDECESSOR_DRIFT`, false evidence flag, unexpected row,
or runtime `STOP_*` is a hard stop. Do not rerun SQL163/164/165, repair data,
bind a Relationship, reload schema cache, or run recovery to guess through a
failed gate.

SQL166 preserves the existing function signature. No schema-cache reload is
planned or authorized for this body-only change.

## Recovery boundary

`recovery.sql` is an emergency-only capability-disable action. It requires a
separate operator/app rollback decision and an uncommented transaction-local
confirmation setting. It proves the exact corrected target, unchanged mutation
function, ACL, helper and table/RLS boundaries before its first mutation.

Recovery revokes only `service_role` EXECUTE from the optional discovery
function. It leaves the corrected body installed but unavailable. It does not
restore the broken SQL163 predecessor, revoke the mutation function, change
RLS or table grants, or mutate any Expense/Relationship data.

The V106 page resilience boundary is expected to keep confirmed Expense detail
readable while this optional discovery capability is disabled. Recovery is
never an automatic postflight action.

## Localhost checks for Stebbi

Do not perform localhost Relationship-binding checks until independently
reviewed SQL166 preflight/migration/postflight and the runtime diagnostic are
green.

After those gates:

1. Sign in as the same authorized closed-beta owner/admin.
2. Open the confirmed one-off Expense that previously produced the SQL163
   overlay.
3. Confirm the full Expense detail renders without a console/runtime overlay.
4. If an eligible saved Relationship candidate exists, confirm the picker is
   shown only for the exact unbound manual participant.
5. If no eligible candidate exists, confirm the detail remains readable with
   no false picker or technical error.
6. Confirm amounts, shares, balances, repayments and settlement are unchanged.
7. Open an unrelated confirmed Expense and a private draft to check for broad
   regressions.
8. Only with consenting disposable data, bind one candidate once and verify
   the exact participant identity changes without financial/share mutation.

Do not test recovery casually, bind real people repeatedly, repair rows, or
change RLS/ACL. Those actions require separate explicit approval.
