# SQL126 — required booking contact phone

Run `preflight.sql` read-only and require `prerequisites_ok=true`. Apply
`sql/126_booking_required_contact_phone.sql` once, then run `postflight.sql`
read-only and require every `*_ok` flag to be true.

The migration preserves historical rows with a null phone. It rejects only
new inserts without a bounded non-empty phone. It does not change RLS, table
grants, auth data or existing booking content.

## Localhost checks for Stebbi

After SQL126 is applied to the intended local/Supabase environment, submit a
booking with and without a phone. A non-empty phone succeeds; an empty phone
is rejected before and inside the database. Do not use real customer contact
data for this check.
