# SQL29: production personal-space foundation catch-up

This package prepares the existing `sql/29_spaces.sql` foundation for its
first production apply. Production SQL115 preflight showed that
`public.spaces`, `public.space_members` and
`public.ensure_personal_space()` are absent, so SQL115 must not run yet.

Only Stebbi may use Supabase or run any SQL. Codex and Claude Code may review
and static-test these files but may never connect to the database, run the
preflight, apply SQL29 or run the postflight.

## Effect

SQL29 creates two empty default-deny tables and two narrowly granted functions.
It does not scan or backfill `auth.users`, create spaces in bulk, change feature
flags or touch existing user rows. A personal space and its owner membership
are created lazily only when an authenticated user calls
`ensure_personal_space()`.

The migration is one-time and fail-closed. It runs in one transaction with
short lock and statement timeouts. Any missing dependency or collision with a
target table, index or function aborts the transaction before object creation.
Do not rerun it after success; use the postflight to inspect the installed
state.

## Exact next steps

1. Stebbi selects the production Supabase project deliberately and runs only
   `sql/validation/29-spaces-foundation/preflight.sql` in SQL Editor.
2. Stebbi pastes the complete single result row into the Codex conversation.
3. Stop unless all of the following are true:
   - the database identity is the intended production target;
   - `is_read_replica = false`;
   - `prerequisites_ok = true` and `required_roles_ok = true`;
   - `execution_role_bypasses_rls = true`;
   - `authenticated_public_schema_usage = true`;
   - `missing_required_roles = []`;
   - all three `existing_target_*` arrays are `[]`;
   - `target_objects_absent = true`;
   - `transactions_older_than_five_minutes = 0`.
4. Codex reviews the pasted result. A clean preflight is not apply permission.
5. Only after a separate, explicit decision by Stebbi, Stebbi runs
   `sql/29_spaces.sql` once as one unit in the same production project.
6. Stebbi immediately runs
   `sql/validation/29-spaces-foundation/postflight.sql` and pastes the complete
   row back to Codex.
7. Stop unless every `*_ok` field, including
   `object_owner_bypasses_rls_ok`, is `true` and
   `personal_owner_violations = 0`. `space_rows` and `membership_rows` may be
   zero; SQL29 intentionally performs no backfill.
8. Only after green SQL29 postflight should Stebbi rerun the SQL115 preflight.
   SQL115 and SQL116 still require their own separate review and apply
   decisions.

No recovery SQL is included. Dropping this foundation after dependent data
exists would be destructive. If SQL29 succeeds but must be removed while still
empty, stop and prepare a separately reviewed, exact-target recovery plan.
