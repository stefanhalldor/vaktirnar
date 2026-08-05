# SQL98 validation order

Stebbi alone runs these files in the intended Supabase project:

1. `preflight.sql` — read-only. Stop unless `prerequisites_ok=true`, all
   `missing_*`/`existing_*` arrays are empty (except on a deliberate idempotent
   rerun), `idea_slug_conflict_target_ok=true`, `idea_seed_compatible=true`,
   and there are no long-running transactions.
2. `../../98_bookkeeping_vat_workbook.sql` — schema/data migration. This is
   the only write step.
3. `postflight.sql` — read-only. Every `*_ok` value must be true; every
   violation/grant/unexpected/private-helper counter must be zero; expected
   and actual table, RPC, and function counts must match exactly.

SQL95 is **not** a schema prerequisite for SQL98 and remains behind its own
disposable-validation and production-approval gate. Do not apply SQL95 merely
to unblock bookkeeping. In the current target environment SQL96 and SQL97 are
already applied; the bookkeeping rollout order is therefore exactly the three
SQL98 steps above.

The current SQL95, the feature-key block in SQL96, and SQL98 preserve the live
feature-key constraint and widen it only for their own key. This does **not**
make SQL96 safe to rerun as a whole after SQL97, because SQL97 supersedes
several SQL96 RPC bodies. Do not rerun SQL96. Never run stale copies of SQL95
or SQL96 that hard-replace the allowlist after SQL98. Require
`feature_constraint_contains_agent_key=true` and
`feature_constraint_contains_expense_key=true` in the intended production
preflight, but do not treat either key as proof that SQL95 itself was applied.

Neither validation file inserts, updates, deletes, alters, creates, grants,
revokes, executes a mutation RPC, or starts a transaction.

The current SQL98 source includes the parenthesized `special_cases` JSONB
validator fix. An environment that applied the earlier SQL98 source must use
SQL99 and its dedicated validation files; never rerun SQL98 to repair it.

The SQL98 postflight counts describe the schema before later migrations.
After SQL100, use the SQL100 postflight and do not rerun SQL98.
