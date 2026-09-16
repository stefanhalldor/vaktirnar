# SQL188 operator runbook

1. Run `preflight.sql` alone; continue only on `READY` and all true.
2. Run `sql/188_receipt_split_owner_list_controls.sql` once; expect
   `Success. No rows returned`.
3. Do not rerun it. Run `postflight.sql` and accept only `EXACT_INSTALLED` with
   every boolean true.

SQL188 adds only `version` and actor-derived `isOwner` to list rows returned by
the existing service-only read function. It changes no data, RLS policy or
client grant. The server action rechecks actor ownership and current version
before invoking the existing idempotent delete lifecycle.
