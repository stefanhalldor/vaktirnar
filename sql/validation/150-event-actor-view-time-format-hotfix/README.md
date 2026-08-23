# SQL150 Event actor-view time-format hotfix

This package fixes one SQL149 runtime defect without editing SQL149.

`teskeid_event_get_actor_view_v2` passed a `time without time zone` directly
to `to_char`. PostgreSQL has no matching overload, so Event detail failed the
first time the PL/pgSQL statement was planned. SQL150 converts the value to a
fixed-date timestamp before formatting it as `HH24:MI:SS`.

## Scope

- Replaces exactly one existing function body.
- Preserves its signature, owner, language, volatility, `SECURITY DEFINER`,
  empty `search_path` and service-role-only execute ACL.
- Changes no table, data, RLS, trigger, index, auth row or Expense state.
- Requires the exact SQL149 predecessor or exact SQL150 replay state.
- Re-attests the five direct SQL149 helper bodies used by the function.

## Manual sequence

Run each file separately in a fresh Supabase SQL Editor query:

1. `preflight.sql` — read-only. Require every boolean and
   `prerequisites_ok` to be `true`. Before first application,
   `predecessor_exact_ok=true` and `already_applied=false` are expected.
2. `sql/150_event_actor_view_time_format_hotfix.sql` — transactional catalog
   write. It replaces one function body and either commits fully or rolls back.
3. `postflight.sql` — read-only. Require every boolean and
   `postconditions_ok` to be `true`.
4. Reopen the localhost Event detail that previously returned
   `event_v2_load_failed` and continue the Phase 3C-3 localhost checklist.

If preflight reports `predecessor_exact_ok=false` or
`direct_dependencies_exact_ok=false`, stop before the migration and run
`diagnostic.sql`. It returns only catalog function names and MD5 hashes, never
Event/auth/user data. Send the result back for exact drift review; do not relax
or overwrite an unknown live function body.

All catalog body hashes normalize SQL Editor CRLF line endings to LF before
comparison, matching SQL149's applied/postflight attestation. Raw `prosrc`
text is never returned.

Do not run `recovery.sql` after a green migration/postflight. Recovery exists
only for a reviewed decision to restore the exact broken SQL149 predecessor
before the hotfix is accepted. It deliberately reintroduces the runtime defect
and is not a normal rollback after application use; prefer a forward fix.

After SQL150 is applied, the old SQL149 postflight's exact body-hash check for
this function will intentionally be false. That does not mean SQL149 tables or
data drifted: SQL150's postflight is the controlling successor attestation for
`teskeid_event_get_actor_view_v2`. All five unchanged direct SQL149 helper
bodies are re-attested by SQL150.

## Data, auth, RLS and production impact

The migration does not read participant payloads or mutate application data.
It reads only PostgreSQL catalogs and evaluates a constant time-format
expression. It does not change auth, grants beyond restoring the existing
service-role-only function ACL, RLS, policies, billing, deployment or secrets.

Codex prepared this package locally but did not execute any SQL.
