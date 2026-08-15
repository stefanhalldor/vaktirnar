# SQL129 — booking contact email owns signed-in requests

Run `preflight.sql` read-only and require `prerequisites_ok=true`. Apply
`sql/129_booking_contact_email_owner.sql` once, then run `postflight.sql`
read-only and require every `*_ok` flag to be true.

The migration adds one service-role-only wrapper RPC. It does not rewrite
existing bookings, change RLS, grant browser access or modify auth users. New
signed-in requests use the canonical contact email as their initial customer
owner. Anonymous guest/link requests remain unchanged.

## Localhost checks for Stebbi

After SQL129 is applied to the intended localhost database, sign in as test
user A and submit a booking with test user B's confirmed email. User A should
see a success message without an inaccessible detail link. User B should be
able to open the booking after signing in; user A should not. Repeat with user
A's own email and confirm the direct-open flow remains. Do not use real
customer contact data.
