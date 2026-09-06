# SQL174 dashboard runtime diagnostic

This bundle contains one diagnostic-only SQL artifact for a dashboard response
whose valid envelope has `status = unavailable`. It does not install SQL174 and
does not repair or change any row, function, schema, privilege or configuration.

## Safety boundary

`diagnose-runtime-unavailable.sql` is one anonymous, read-only `DO` statement.
Before reading application rows it verifies the exact installed SQL172 target,
adapter, ACLs, dependencies, 29-helper lineage and 17-relation/31-column closure.
It does not call `expense_list_dashboard_presentations_v1`, create an object or
perform `INSERT`, `UPDATE`, `DELETE`, `MERGE` or any other application DML.

Runtime probes are limited to 101 rows per isolated domain. The final result is
always a controlled `P1741` exception unless the platform cancels or terminates
the query, or PostgreSQL raises uncaught `ASSERT_FAILURE`. Its JSON contains only
fixed classifications, booleans, capped counts,
a five-character SQLSTATE/category and an allowlisted P0001 token. It excludes
identifiers, names, labels, payloads, amounts, timestamps and raw error details.

## Manual run

1. Open only the exact reviewed `diagnose-runtime-unavailable.sql` artifact.
2. Replace the single `__STEBBI_PRIVATE_ACTOR_UUID__` placeholder locally with
   the UUID of the authenticated actor whose dashboard returned unavailable.
3. Run that one statement in the Supabase SQL Editor as `postgres`. Do not append
   a migration, recovery, dashboard RPC call, `DELETE` or other SQL.
4. A PostgreSQL error with SQLSTATE `P1741` is the expected diagnostic result.
   Return the complete JSON message exactly as shown. Any different SQLSTATE,
   timeout, cancellation, missing result or malformed JSON is `UNKNOWN / STOP`.
5. Do not run a repair from this result. Each non-green classification requires
   its own reviewed diagnosis and separately authorized correction.

## Classification contract

- `catalog_drift`: exact SQL172 installation or frozen lineage did not match.
- `actor_admission`: the actor input/account/beta/session gate did not match.
- `identity_binding_conflict`: the exact SQL172 conflict predicate matched or failed.
- `private_adapter_exception`: the SQL172 private adapter raised unexpectedly.
- `live_publication_normalizer_exception`: strict live-draft normalization raised.
- `settlement_helper_exception`: canonical settlement evaluation raised.
- `invalid_visible_bindings`, `invalid_visible_publications`, or
  `invalid_visible_private_edits`: the named fail-closed invariant has rows.
- `candidate_limit_exceeded`: more than 100 presentations were produced.
- `duplicate_presentation_keys`: projection keys were not unique.
- `projection_residual_exception`: a bounded pre-probe domain query or the full
  SQL172 projection failed outside a successfully isolated helper invocation.
  Use the fixed `stage` value to distinguish those locations.
- `unavailable_not_reproduced`: this bounded snapshot did not reproduce the
  unavailable branch. This is not permission to guess at or deploy a repair.

`p0001_token` is either one explicitly allowlisted fixed token,
`unrecognized_p0001`, or `null`; raw PostgreSQL messages are never published.

## Localhost checks for Stebbi

This artifact has no user-visible fix to test. Before any later repair, Stebbi can
open `/auth-mvp/utlagt-og-endurgreitt` while signed in as the same actor, refresh
once, and record whether the dashboard still shows unavailable/no rows. Do not
create, share, delete or alter a real Expense merely to exercise this diagnostic.
The SQL run itself must leave dashboard rows and every other application row
unchanged.
