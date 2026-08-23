# SQL156 same-row left-participant reinvite hotfix

SQL156 closes the owner-side `Endurbjóða` backend gap for a name-only guest
whose canonical participation was later claimed by a Teskeið user and then
changed to `left` by `Hætta þátttöku`. The legacy guest row correctly remains
name-only, so it has no `linked_user_id`; the durable same-row participation is
the identity authority.

The public invite function may now derive an access-only recipient from that
same participation row only when all three facts are current and exact:

- `access_state = 'left'`
- `recipient_user_id IS NOT NULL`
- `identity_claimed_at IS NOT NULL`

It locks the exact user's auth-email snapshot before the Event lock, rechecks
the same participation after the Event lock, and the private creator validates
the current confirmed canonical email again. A revoked row, identity tombstone,
different guest/user binding, changed probe or caller-supplied email fails
closed. Existing linked-user and unbound email/name invite flows remain in
place.

The creator also captures `clock_timestamp()` after Event-lock serialization
and explicitly uses it for `created_at`, `updated_at` and the 30-day expiry.
That makes SQL155's fresh-invitation comparison follow actual Event-lock order,
not the transaction start time. Existing timestamp defaults and the
`expires_at > created_at` constraint are prerequisites and remain unchanged.

## Manual sequence

Run these as separate fresh Supabase SQL Editor queries, after SQL155:

1. Run `preflight.sql`. Stop unless `prerequisites_ok=true`.
2. Run `../../156_event_same_row_left_reinvite_hotfix.sql`.
3. Run `postflight.sql`. Stop unless `postconditions_ok=true`.
4. Perform the localhost checks below.

SQL156 is replay-safe only for the exact SQL133 predecessor bodies plus the
installed SQL155 claim/list, cleanup-helper and both leave bodies with their
fail-closed ACLs, or for its own exact already-applied bodies. Do not rerun
SQL153, SQL154 or SQL155 while applying SQL156.

## Impact and recovery

The migration replaces exactly two function bodies. Installation does not
mutate Event, guest, invitation, participation, RSVP, anchor, auth or receipt
rows. It does not change RLS, policies, tables, constraints, defaults, triggers,
indexes, secrets, billing or deployment. Function ownership, security-definer
shape, fixed empty search path and narrow ACLs are reasserted.

Recovery is fail-closed: stop if preflight or postflight is false and keep the
transaction error output. Because both exact predecessor sources are preserved
in SQL133 and guarded by hashes, a separately reviewed function-only recovery
migration can restore them without data rollback. Codex wrote but did not run
SQL156.

## Localhost checks for Stebbi

Use an Event where the owner originally added a guest by name, that guest was
later claimed by a real Teskeið user, and the same user then selected
`Hætta þátttöku`.

1. As the owner, open `/auth-mvp/vidburdir/{eventId}` and find the person under
   `Hætt þátttöku`.
2. Select `Endurbjóða`. No email field should be required. The action should
   complete without a generic conflict or unavailable error.
3. Refresh as the owner. The same person must appear once in the active guest
   roster, not as a duplicate and not under `Hætt þátttöku`.
4. Sign in as that exact guest. Open `/auth-mvp/vidburdir`, then the canonical
   `/auth-mvp/vidburdir/{eventId}` route. The Event must be accessible and the
   user must appear as the current attendee.
5. Refresh once. Access must remain stable and there must be no
   `event_v3_not_found`, hydration error or `42883` overlay.

Regression checks: a normal linked-user invitation and a new name/email
invitation should still work. A revoked participant must not regain an
`Endurbjóða` path. Do not edit database rows manually, substitute another
person's email or run the check against production data casually.
