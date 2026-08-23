# SQL151 Event viewer relationship GREATEST hotfix

SQL151 fixes the second runtime-only SQL149 projection defect found by the
Phase 3C-3 localhost gate. PostgreSQL `GREATEST` is a conditional expression,
not a callable `pg_catalog.greatest` function.

## Scope

- Replaces exactly `teskeid_event_private_viewer_relationship_v2`.
- Changes one token: `pg_catalog.greatest(` to `GREATEST(`.
- Preserves signature, postgres owner, `SECURITY DEFINER`, `STABLE`, empty
  `search_path` and owner-only/private ACL.
- Re-attests the applied SQL150 actor-view body and six unchanged projection,
  text and email helpers.
- Shares SQL150's advisory lineage lock so SQL150 recovery/replay cannot race
  SQL151's predecessor or successor checks.
- Changes no data, table, RLS, policy, index, trigger, auth row or Expense row.

## Manual sequence

Run each file separately in a fresh SQL Editor query:

1. `preflight.sql` — read-only. Require every boolean and
   `prerequisites_ok=true`. Before first application, expect
   `predecessor_exact_ok=true` and `already_applied=false`.
2. `sql/151_event_viewer_relationship_greatest_hotfix.sql` — one
   transactional function-body replacement.
3. `postflight.sql` — read-only. Require every boolean and
   `postconditions_ok=true`.
4. Refresh the localhost Event detail that previously logged
   `pg_catalog.greatest(integer, integer)`.

Do not run `recovery.sql` after a green migration/postflight. Recovery is only
for an explicitly reviewed restoration of the exact SQL149 predecessor and
would deliberately reintroduce the runtime defect. Prefer a forward fix.

After SQL151, the old SQL149 exact body-hash attestation for this function is
superseded by SQL151 postflight. SQL150 remains exact and is re-attested.

Codex wrote and validated this package locally but did not execute SQL.
