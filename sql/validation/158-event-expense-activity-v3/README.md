# SQL158 Event expense activity V3

SQL158 is a function-only, SQL-first extension of the released SQL157 Event
expense visibility contract. It adds
`teskeid_event_get_expense_activity_v3(p_actor_id uuid, p_event_id uuid)` and
does not replace or change V1/V2 functions, tables, rows, RLS, policies,
triggers, indexes or table grants.

V3 preserves SQL157's visibility-first row set, 100-row bound, invalid-state
gate, attendee-safe summary and actor-position logic. Only after a row is
visible and valid does it test the actor's exact active
`expense_group_members` membership for the same `group_id`. The result is
strictly `detail_target: null | {"expense_id":"<uuid>"}`. SQL never returns a
raw href. A dispute continues to hide a `participants_only` row, but it does
not independently revoke canonical Expense-detail access for an already
visible `all_event` row. Removed or inactive membership yields a null target.

## Manual SQL-first rollout

Use a fresh exact `current_user = session_user = postgres` SQL Editor session
for each step. Keep the output as rollout evidence and do not retry a failed
apply blindly.

1. Run `preflight.sql`. Stop unless `prerequisites_ok = true` and
   `v3_collision = false`. Save the full row.
2. If `v3_absent = true`, review and run
   `../../158_event_expense_activity_v3.sql` with separate migration approval.
   If instead `v3_exact_installed = true`, treat it as a possible successful
   apply whose client response was lost: do not rerun the migration and skip
   directly to schema-cache reload and postflight. Any other target state is a
   hard stop.
3. With separate explicit approval, reload the PostgREST schema cache. SQL158
   intentionally does not issue `NOTIFY pgrst`.
4. Run `postflight.sql`. Stop unless every attestation and
   `postconditions_ok = true`.
5. Only then use the separately approved V3 app on localhost.

The preflight and postflight are 100% read-only catalog checks. They pin exact
V2/V3 argument names and order, source hashes, volatility, security-definer
shape, empty search path, owner, overload count and ACL. `service_role` is the
only explicit non-owner EXECUTE grantee; PUBLIC, anon and authenticated have no
privilege. `postgres` remains the owner.

## Recovery

`recovery.sql` is not normal rollout work. Roll the application back from V3
to V2 first and confirm the rollback is live before considering it. Then, with
separate approval, the recovery transaction verifies the exact V2 predecessor
and exact installed V3 body/security/ACL before revoking and dropping only the
V3 entry point. It uses no `CASCADE`, changes no data and leaves SQL157/V2
untouched. An unexpected dependency or catalog drift aborts and rolls back the
transaction. Reloading the PostgREST schema cache after recovery is a separate
explicitly approved operator step.

Leaving an unused additive V3 function installed is safer than running recovery
while any app instance can still call it.

## Localhost checks for Stebbi

Codex does not start or manage the dev server. After the separately approved
SQL158 rollout and cache reload, Stebbi can use the existing localhost server:

1. As an exact active Expense member, open the Event and select the full-width
   cost row. It must open the exact canonical Expense detail, and Back must
   return to the Event with normal loading feedback.
2. As an Event owner or attendee who is not an Expense member, view an
   `all_event` cost. The attendee-safe row must remain static with no href,
   focus target or chevron; the direct Expense URL remains unavailable.
3. Change the same link to `participants_only`. The nonparticipant must see no
   row, count, amount, currency or existence clue.
4. If an exact member without general Expenses entitlement is available, the
   exact row must still open because object membership, not per-user feature
   entitlement, controls detail access.
5. With disposable test state only, remove membership and refresh. The link
   must disappear and a stale saved href must no longer open the detail.
6. Check 360/390/460 px widths and keyboard navigation: no nested interactive
   controls, overflow, mobile zoom or dead navigation state.

Do not casually change real financial rows, membership or visibility in a
production-backed localhost environment. Duplicate-looking rows and malformed
wire targets are covered by focused automated tests rather than disposable
production data.

No SQL in this package was run by Codex.
