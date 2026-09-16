# SQL187 operator runbook

1. Run `preflight.sql` alone. Continue only on `READY` with every boolean true.
2. Run `sql/187_receipt_split_read_v2_list_alias_hotfix.sql` once. Expected:
   `Success. No rows returned`.
3. Do not rerun the migration. Run `postflight.sql` read-only and accept only
   `EXACT_INSTALLED` with every boolean true.

The hotfix replaces only `public.receipt_split_read_v2(uuid,uuid)`. It renames
the split-table alias in the null-ID list branch from `s` to `split_row`, avoiding
the runtime collision with the PL/pgSQL record variable `s`. Detail behavior,
data, RLS, grants, membership and projections remain unchanged.
