# SQL 144 — guest identity

Run these in the Supabase SQL editor, one file at a time:

1. `preflight.sql` — read-only; every value must be `true`.
2. `../../144_household_chore_guest_identity.sql` — applies the migration.
3. `postflight.sql` — read-only; every value must be `true`.

Stop if preflight or postflight returns `false` or the migration raises an
exception. Do not retry with edited SQL; copy the complete result back to
Codex first.

SQL 144 does not link existing rows automatically. It adds explicit rename and
consent-invitation operations. A guest becomes a member only after the invited
Teskeið user accepts inside the app.
