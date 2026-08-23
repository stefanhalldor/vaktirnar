# SQL152 Event people `is_self` boolean hotfix

SQL152 fixes the strict actor-view/person-source parser failure exposed after
SQL150 and SQL151 made the deeper SQL149 projection reachable.

## Scope

- Replaces exactly `teskeid_event_private_people_projection_v2`.
- Changes one nullable equality to
  `COALESCE(guest_position.recipient_user_id = p_actor_id, false)`.
- Uses unqualified `COALESCE` because it is PostgreSQL conditional-expression
  syntax, not a callable `pg_catalog` routine.
- Preserves signature, postgres owner, `SECURITY DEFINER`, `STABLE`, empty
  `search_path` and private owner-only ACL.
- Re-attests the applied SQL150 actor view, SQL151 private relationship
  projection, public canonical roster caller and exact person/organizer
  helpers.
- Shares both SQL149's recovery lock and the SQL150/SQL151 lineage lock.
- Changes no data, table, RLS, policy, index, trigger, auth or Expense state.

## Manual sequence

Run each file separately in a fresh SQL Editor query:

1. `preflight.sql` — read-only. Require every boolean and
   `prerequisites_ok=true`. Before first application, expect
   `predecessor_exact_ok=true` and `already_applied=false`.
2. `sql/152_event_people_is_self_boolean_hotfix.sql` — one transactional
   function-body replacement.
3. `postflight.sql` — read-only. Require every boolean and
   `postconditions_ok=true`.
4. Refresh the localhost Event detail that reported invalid `is_self` types.

Do not run `recovery.sql` after a green migration/postflight. Recovery restores
the exact SQL149 predecessor and deliberately reintroduces the parser defect.
Prefer a forward fix.

After SQL152, its postflight is the controlling successor attestation for the
people projection. The older SQL149, SQL150 and SQL151 postflights still expect
the predecessor people-body hash and must not be expected to remain all-green
if rerun. SQL150's actor-view target body and SQL151's viewer-relationship
target body remain exact and are re-attested by SQL152.

Codex wrote and validated this package locally but did not execute SQL.
