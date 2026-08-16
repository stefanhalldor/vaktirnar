# SQL133 — Event attendance invitations and consent-linked guests

SQL133 adds explicit Event attendance consent, safe attendee projections and
separate Expense-consent handling for Event-derived members. It preserves the
exact SQL132 owner RPC signatures/results and does not backfill or email any
historical guest.

Nothing in this folder has been executed by Codex.

## Manual order for Stebbi

1. Keep production on the exact SQL132-compatible live SHA
   `1a8860529b3f0e641105adca5bbb604c6aff8eeb`. Do not deploy the SQL133 app
   build first.
2. Run `preflight.sql` in the intended production database. Stop unless it
   returns exactly one row and every boolean, especially `prerequisites_ok`, is
   `true`. Its SQL132 catalog baseline is exact: 32 structural constraints
   (constraint-trigger rows are checked in the separate 31-trigger contract),
   six non-constraint indexes and the latest SQL123 encrypted-snapshot trigger
   function body/configuration.
3. Run `../../133_event_guest_identity_linking.sql` once. This is the only
   write step. It is one forward-only, repeatable-read transaction.
4. Run `postflight.sql`. Stop unless it returns exactly one row, every named
   boolean is `true`, and `postconditions_ok = true`. The five SQL132 Event
   relations then have 34 structural constraints: 31 unchanged SQL132
   constraints, the exact SQL133 identity-shape replacement and two SQL133
   support uniques. The target trigger set is exactly 37: the 31 canonical
   baseline bindings plus six SQL133 bindings.
5. Only after the green postflight, stage/commit/push the matching app bundle
   and let the Git-connected production deployment complete. Then perform the
   localhost/production read checks below. Keep the full preflight and
   postflight rows.

Do not run the migration twice, do not use `recovery.sql` as rollback, and do
not continue after a warning or false gate. Recovery is read-only inventory.

## Security and data boundaries

- Pending attendance is an invitation, never automatic Event access.
- Acceptance requires the current authenticated account's exact confirmed
  canonical email. `access_only` additionally requires the guest's existing
  linked user to be that actor.
- Pending raw email is held only in a private FORCE-RLS/no-policy/no-grant
  table and scrubbed on every terminal state. Owner/client DTOs expose only the
  fixed masked label form.
- Attendee list/detail remains protected by the Events per-user entitlement.
  The invitation URL exposes only scoped preview/respond/leave management.
- Attendance membership grants no Expense, debt, repayment or settlement
  access. Event-derived Expense membership remains `user_id = NULL` until the
  separate canonical Expense invitation is accepted.
- Delivery uses at most three provider attempts and twelve durable request
  receipts per invitation. Completed request IDs replay permanently. An
  ambiguous reserved provider attempt can be retried with the same idempotency
  key for 24 hours; after that it fails closed and the owner must cancel and
  create a new invitation. Receipt saturation has the same recovery path.
- The migration creates no historical invitation, sends no email, changes no
  auth user/secret and runs no external provider call.

## Forward-only recovery

Never remove consent, receipt, roster, provenance or financial history to
recover. Use the existing external feature kill-switch only under separate
authority, run `recovery.sql` for a read-only inventory, and prepare a new
numbered additive migration.

## Localhost checks for Stebbi

Run these only after preflight, migration and postflight are green. Use test
accounts/emails and tiny synthetic expenses. Do not test real debts or account
deletion casually.

1. As an Events-enabled owner, create an Event with a known relationship, a
   manual email and a manual name. Expect pending invitations only for the
   relationship/manual-email rows; manual name requires an explicit email.
2. Save/reorder/remove the roster in two tabs. Expect revision conflicts to be
   friendly, retained guests to keep consent, and removed guests to lose Event
   access without gaining/losing any financial membership.
3. Open an invitation as the exact confirmed-email account without the Events
   flag. Expect a minimal preview and accept/decline; no roster or financial
   data. After accept, request Events access. The Event appears only once the
   flag is enabled. The same scoped URL must allow leaving later.
4. Resend once and simulate an uncertain provider response. Retry both the same
   request ID and a fresh request ID within 24 hours. While the delivery remains
   reserved, both must recover the same attempt and provider idempotency key; a
   genuine next attempt is allowed only after an explicit failed outcome and the
   cooldown. An ambiguous request older than 24 hours must fail closed with
   `key_expired` and require cancel/reinvite.
5. Create `Nýr útlagður kostnaður` from the Event. Expect the ordinary Ú&E
   flow. Event-linked guests remain one-off financial members and receive the
   normal separate Expense invitation; no email appears in owner DTOs.
6. Change a test recipient's email between prepare/reserve or before accept.
   Expect the stale invitation to fail closed and require cancel/reinvite.
7. Verify Icelandic and English at 360, 390 and 460 px: no horizontal overflow,
   no mobile zoom, visible pending feedback and canonical loading states.

If any result differs, stop rollout, retain the exact request IDs/results and
prepare a forward-fix handoff. Do not rerun SQL133 or edit production rows.
