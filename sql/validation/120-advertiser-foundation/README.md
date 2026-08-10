# SQL120 — Advertiser foundation

SQL120 is an additive, one-time foundation for generic business profiles and
reviewed text ads in public Kviss. It creates no advertiser, creative or seed
data.

## Hard boundary

Codex and Claude Code must not connect to Supabase or run any SQL. Stebbi alone
selects the target and runs the files manually.

## Order

1. Confirm the exact Supabase project in the SQL editor.
2. Run `preflight.sql` and copy the complete single result row for review.
3. Continue only when `prerequisites_ok=true`, `target_objects_absent=true`,
   `transactions_older_than_five_minutes=0`, and the target identity is right.
4. Apply `../../120_advertiser_foundation.sql` in a separate action.
5. Run `postflight.sql` and copy its complete single result row. Every `*_ok`
   value must be `true`.
6. Keep `ADVERTISER_ENABLED` and `PUBLIC_QUIZ_ADS_ENABLED` off until the code,
   localhost flow and public payload have been accepted separately.

`feature_constraint_already_contains_auglysandi=true` is informational. SQL120
can safely retain an already-widened shared feature constraint as long as all
target relations, functions and triggers are absent and the rest of preflight
is green.

## Security contract

- All three tables use FORCE RLS with no browser policies.
- Browser roles receive no table, column or function access.
- `service_role` must retain BYPASSRLS, receives table `SELECT` only and exact
  RPC execution grants.
- Owner writes are re-authorized against current space ownership and the exact
  `auglysandi` entitlement inside the SQL functions.
- Admin review is callable only through the service-role RPC; the application
  route must keep its existing `requireAdmin` check.
- Approval binds the exact submitted snapshot to the current content revision.
- Reusing an idempotency key with another actor, scope, action or revision is a
  conflict rather than a silent success.
- Public resolution returns only an approved snapshot and requires a current
  entitled owner of the creative's space.
- Space deletion cascades its advertiser content. Deleting only the original
  creator leaves a surviving shared-space profile intact and nulls the creator
  reference; reviewer/audit actor references likewise become null. Audit rows
  allow only that exact FK-driven actor redaction, reject every other update,
  and can be removed by their parent cascade.

## Recovery

`recovery.sql` is destructive and intentionally was not run. It refuses to
continue if any advertiser row exists. It does not remove `auglysandi` from the
shared feature constraint. Use it only for a separately approved empty-beta
rollback after confirming the exact target and all three row counts.
