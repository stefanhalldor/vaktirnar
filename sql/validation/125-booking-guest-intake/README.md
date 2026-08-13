# SQL125 - Booking guest intake

SQL125 is an additive, transactional and forward-only Bookings MVP foundation.
It creates private provider-service, request, membership, capability-session,
message and immutable-event storage plus narrowly granted service-role RPCs.
It also extends the existing `feature_access` union with `bokanir`.

No SQL in this package was run while it was authored.

## Manual production order

1. Confirm the intended Supabase project/database. Do not infer this from a
   previously open SQL Editor tab.
2. Run `preflight.sql` exactly as-is. It is read-only and returns one row.
3. Stop unless `prerequisites_ok=true`, `target_objects_absent=true`, all
   collision arrays are empty, and the project/role fields are expected.
4. Preserve and share the complete preflight row for review.
5. Only after separate approval, run `sql/125_booking_guest_intake.sql` once.
   The migration is transactional. Do not rerun it after an ambiguous error.
6. Run `postflight.sql` exactly as-is. It is read-only and returns one row.
7. Stop the app rollout unless every `*_ok` field is true. Row counts are
   informational but must be explained if non-zero on first apply.
8. Preserve and share the complete postflight row before enabling Bookings.

The expected privileged owner is exactly `postgres`. The six private tables
must have RLS and FORCE RLS, zero policies, no unexpected direct or
column-level ACL entries, and no effective table privileges for
`anon`/`authenticated`/`service_role`. All 20 `booking_*` functions must be
`SECURITY DEFINER`, have empty fixed `search_path`, be owned by `postgres`, and
deny effective browser EXECUTE. Exactly the 14 bounded external RPCs are
executable by `service_role`; internal helpers and unexpected direct grantees
are not.

## Recovery and retention

Any error before `COMMIT` rolls back all SQL125 schema, function, owner and ACL
changes. Preserve the exact error and rerun the read-only preflight; do not
blindly rerun the migration.

After `COMMIT`, recovery is forward-only. Do not drop booking tables, delete
feature-access rows, narrow the shared feature-key constraint, rewrite request
snapshots, or delete events. Turn off the app-side Bookings rollout, run
`recovery.sql` read-only to inventory installed artifacts and retained row
counts, then prepare a separately reviewed next-numbered corrective migration.

Provider/account deletion intentionally removes live provider authorization
through the existing space/profile cascade, while the nullable request FK
triplet is set to NULL. Immutable provider/service/timezone/discount snapshots
and `service_id_snapshot` preserve booking history. Auth-user FKs redact with
`SET NULL`; membership email access rows and booking history remain governed by
the booking access state. Events reject update/delete except exact FK identity
redaction needed by deletion lifecycle.

Capability exchange retains at most 16 live sessions per booking. It cleans
expired/revoked unreferenced authorization rows before new insert and retains
referenced rows as audit identity, but only live current-version sessions count
toward the cap. This supports independent browsers without letting old history
exhaust future link access. Claim revokes all guest sessions and increments
access version atomically.

## Localhost checks for Stebbi

These checks apply only after SQL125 has been separately approved and applied
to the local development database and the matching app code is present:

1. Open the published Kvissbador booking page as a logged-out guest, submit a
   future local date/time, and confirm the returned direct link opens in two
   separate browser sessions.
2. Retry the same submit/request ID and confirm it returns the same booking;
   change one field with the same ID and confirm a conflict without duplicates.
3. Pause/rename the provider after a simulated lost response, retry the exact
   request, and confirm replay recovers the same booking while a genuinely new
   intake is denied.
4. Claim from one browser with a verified account, attach multiple emails, and
   confirm both old guest cookies/link stop immediately. Confirm the offered
   discount is the create-time snapshot, not the provider's later setting.
5. As an owner, add a second owner and revoke that other owner. Confirm this
   succeeds; confirm removing the final remaining owner is denied. Self-revoke
   is intentionally unavailable in this MVP so lost-response retries cannot
   strand the acting user outside the booking.
6. Send guest chat from two browser sessions and confirm both share the same
   ten-per-minute limit while messages retain the posting session internally.
7. Verify ordinary members and providers do not receive the linked-email list;
   only the active customer owner can manage/view it.

Do not test account deletion, production auth records, feature flags or retained
booking history casually. Those affect authorization and user data and require
separate explicit approval and a disposable fixture or reviewed test account.
