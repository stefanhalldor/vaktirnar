# SQL154 Event scoped-participation pairing hotfix

SQL154 fixes the SQL153 guest-only runtime failure `42883`. The unbound guest
claim branch schema-qualified a two-array `unnest` call for which PostgreSQL
has no matching catalog overload. The hotfix replaces only that exact fragment
with `generate_subscripts` and same-index reads from both UUID arrays.

## Manual sequence

Run these in separate fresh Supabase SQL Editor queries:

1. Run `preflight.sql`. Stop unless `prerequisites_ok=true`.
2. Run `../../154_event_scoped_participation_pairing_hotfix.sql`.
3. Run `postflight.sql`. Stop unless `postconditions_ok=true`.
4. Perform the localhost check below.

Do not rerun SQL153 and do not run SQL153 recovery. SQL154 is replay-safe only
for the exact SQL153 predecessor or its own already-applied body.

## Impact

The migration replaces one service-role-only function body. It does not read
or mutate Event rows, auth users, invitations, RSVP decisions or other user
data. It does not change RLS, policies, tables, triggers, indexes, billing,
secrets or deployment. Codex wrote but did not run this SQL.

## Localhost checks for Stebbi

Sign in as the affected confirmed-email user who is a guest but not the Event
owner. Open `/auth-mvp/vidburdir`. The Event list should render without the
Next.js error overlay, and the invited Event should appear. Open that Event and
confirm the viewer is treated as an attendee, not an owner. Refresh once and
confirm the result remains stable and no new `42883` or
`event_v3_load_failed` appears. Do not test with another person's email or
alter invitation/auth data manually.
