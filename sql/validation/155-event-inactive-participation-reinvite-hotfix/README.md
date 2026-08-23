# SQL155 consent-safe Event reinvite after opt-out

SQL155 fixes the exact item-7 localhost state: the same actor has an inactive
`left` participation from an earlier `Hætta þátttöku`, while a later explicit
owner invitation created one active unbound email target on another guest row.
SQL153 treated the inactive history as a current actor binding and rejected
the new claim.

The migration also closes the underlying opt-out seams:

- both the legacy and V3 leave RPC close other pending invitations and active
  unbound targets for the actor's confirmed email under the Event row lock;
- a replayed V3 leave request returns before any later reinvite can be claimed;
- active actor bindings still block duplicates;
- pre-SQL155 inactive history can only be crossed by an anchored invitation
  that is newer than that history;
- future invite/leave ordering is serialized by the Event lock, not inferred
  only from timestamps.

## Manual sequence

Use separate fresh Supabase SQL Editor queries:

1. Run `preflight.sql`. Stop unless `prerequisites_ok=true`.
2. Run `../../155_event_inactive_participation_reinvite_hotfix.sql`.
3. Run `postflight.sql`. Stop unless `postconditions_ok=true`.
4. Run SQL156 preflight, migration and postflight in that exact order, as
   documented in
   `../156-event-same-row-left-reinvite-hotfix/README.md`. Stop unless both
   SQL156 booleans are green.
5. Continue with the localhost checks below.

Do not rerun SQL153 or SQL154. SQL155 has two committed phases. Phase 1
temporarily revokes both service-role leave RPCs before phase 2 drains old
writers and restores their exact grants. If SQL Editor reports an error after
the first `COMMIT`, do not test localhost: rerun the complete SQL155 file and
then require a green postflight. The file accepts its exact phase-1 bodies and
is safe to rerun. SQL156 is the required immediate companion: it closes the
same-row owner `Endurbjóða` gap and stamps future invitations after Event-lock
serialization before localhost verification begins.

## Impact

SQL155 replaces four existing function bodies and creates one owner-only
private cleanup helper. Installation does not update Event, auth, guest,
invitation, participation, RSVP, anchor, receipt or tombstone rows. It does not
change RLS, policies, tables, triggers, indexes, secrets, billing or deployment.

Normal leave calls after installation can cancel same-Event email
capabilities and mark their unbound projections revoked. The next authorized
read of this already-valid incident can claim the later invitation through the
canonical SQL153 flow. Codex wrote but did not run this migration.

## Localhost checks for Stebbi

Sign in as the same guest who first used `Hætta þátttöku` and was explicitly
invited again. Open `/auth-mvp/vidburdir`, then open the pending Event. It must
open directly at `/auth-mvp/vidburdir/{eventId}`, move from pending invitations
to Events you attend, and show the actor once as the current attendee. Refresh
once and confirm access remains.

As owner, confirm the old stopped-participation row remains historical and no
active duplicate appears. Then use a disposable localhost Event to verify:

1. invite a guest with the test account's confirmed email;
2. leave as that guest;
3. confirm the Event is inaccessible and no pending card remains;
4. explicitly invite the account again;
5. confirm the canonical Event opens;
6. retrying the old leave request must not claim or cancel that newer invite.

Do not edit rows manually, use another person's email, or run this against
production data as a casual test. No `event_v3_not_found`, hydration error or
PostgreSQL `42883` overlay should appear.
