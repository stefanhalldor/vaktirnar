# SQL147 — in-app Event invitation authority

SQL147 makes the durable Event invitation visible and actionable before any
email-delivery attempt. Email remains best-effort and is not an authorization
or discoverability prerequisite.

Order for Stebbi:

1. Run `preflight.sql` read-only. Every boolean and `prerequisites_ok` must be
   `true`. Aggregate diagnostic counts may be any non-negative value.
2. Run `sql/147_event_in_app_invitation_authority.sql` once.
3. Run `postflight.sql` read-only. Every boolean and `postconditions_ok` must
   be `true`.

The migration changes four existing SECURITY DEFINER function bodies only.
It does not update invitation rows, RLS, grants, auth users, feature flags,
recent-event rows, or email configuration. Existing pending attempt-0
invitations become eligible on the recipient's next dashboard/home read.

## Localhost checks for Stebbi

After green postflight, use two different confirmed Teskeið accounts whose
emails match the organizer and guest records exactly after canonicalization.

1. As organizer, add the recipient email to an Event and save the guest list.
2. As recipient, open `/auth-mvp/heim`: Viðburðir should have an unread badge
   and the invitation should appear in Ólesið.
3. Open `/auth-mvp/vidburdir`: the Event should appear under pending
   invitations even if no email was delivered.
4. Open the invitation and accept it: it should move from pending to attending
   and the unread item should be acknowledged when opened through Ólesið.
5. Repeat with decline and confirm no Event data from any unrelated invitation
   is visible.

Do not test with an email you do not control. SQL147 intentionally keeps exact
confirmed-email matching, guest-kind checks and current active-guest checks.
