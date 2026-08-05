# SQL99 validation order

SQL99 is an additive repair for an already-applied SQL98 installation. It
replaces only `public.bookkeeping_assert_entry_payload(jsonb)`, reasserts that
the helper has no direct execute grants, and changes no tables or rows.

Stebbi alone runs these files in the intended Supabase project:

1. `preflight.sql` — read-only.
2. `../../99_bookkeeping_entry_json_fix.sql` — the only write/DDL step.
3. `postflight.sql` — read-only.

On the first preflight, require:

- `prerequisites_ok=true`
- `target_signature_ok=true`
- `target_configuration_ok=true`
- exactly one of `repair_needed` and `already_repaired` is `true`
- `unexpected_operator_form=false`
- all grant/overload/long-transaction counters are `0`

Normally `repair_needed=true` before the first SQL99 run. If
`already_repaired=true`, SQL99 is still idempotent, but stop and confirm why
the target was repaired before continuing.

After SQL99, postflight must report:

- `target_signature_ok=true`
- `target_configuration_ok=true`
- `operator_precedence_fix_ok=true`
- `entry_callers_ok=true`
- all grant/overload counters are `0`
- `bookkeeping_table_count=10`
- `bookkeeping_function_count=40`

Do not rerun SQL98. Do not run SQL95, SQL96, or SQL97 as part of this repair.
Stop on any SQL error and do not attempt partial statements. Because SQL99 is
one transaction, a failure before `COMMIT` leaves the previous function in
place. Neither validation file writes data or changes schema, grants, auth,
RLS, policies, feature access, or user records.

The 10/40 counts above describe the schema before SQL100. After SQL100, use
its dedicated postflight (11 tables / 18 RPCs / 41 functions) and do not rerun
SQL98 or SQL99.
