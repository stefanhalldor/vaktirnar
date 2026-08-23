# SQL149 — Event participant identity and display

This package introduces the additive Event v2 participant authority, safe
shared person labels, opt-out RSVP state, first-read identity claim and strict
legacy Expense projections. It does not replace or edit SQL132–SQL148.

## Operator order

Run each file separately in the Supabase SQL editor and copy the complete
result row back to Codex.

1. Run `preflight.sql`. Every boolean, including `prerequisites_ok`, must be
   `true`. Review the count columns even when the booleans are green.
2. Run `../../149_event_participant_identity_display.sql` once. A successful
   run returns one advisory-lock row and no error.
3. Run `postflight.sql`. `postconditions_ok` and every required/gating boolean
   must be `true`. `bridge_observation_unused`,
   `baseline_projection_applicable` and `source_projection_exact_ok` are
   diagnostics and may legitimately become `false` after compatible traffic.
   Copy the entire row, including every boolean and count column.
4. Stop. Do not run recovery and do not start Phase 3C-3 until Codex has
   reviewed the complete results.

If only `functions_security_exact_ok` is false, stop and run the read-only
`diagnostic-function-security.sql`. Return its complete result without changing
grants or rerunning the migration.

Preflight, postflight and the function-security diagnostic are read-only. The
first two expose only booleans and counts. The diagnostic exposes only function
catalog metadata. None returns recipient emails, profile names, private
aliases, tags, custom labels or notes.

The migration changes schema and backfills one protected label and
participation row for every Event guest. It adds four FORCE-RLS/no-policy
tables, a private nontransactional bridge-observation sequence, private
compatibility helpers, deferred Event v1 bridge triggers, and the two
explicitly approved narrow `auth.users` lifecycle hooks: confirmed-email
change expires stale pending identity capabilities, while account deletion
burns pending capabilities and preserves an inactive identity tombstone. It
also canonicalizes v2 text projections with NFC/ECMAScript edge trimming and
formats every v2 timestamp as an exact UTC RFC3339 string, independent of the
SQL editor session time zone. It adds service-role-only v2 RPCs. It does not write Expense data, create
Expense locks, weaken RLS or broaden feature entitlements.

## Recovery boundary

`recovery.sql` is not a normal rollback. It first locks Auth, every v1 Event
source and every SQL149 target in the canonical order, then requires the exact
installed SQL149 catalog and protected SQL132–SQL148 baseline. Recovery is
safe only before any v2 receipt, identity claim, label repair or RSVP change
and before *any* post-install v1 bridge invocation. The private sequence is
advanced as the first bridge action, including for an aborted or semantic
no-op sync, so versions or timestamps are never treated as proof that the
boundary is still open. Once the sequence has been called, recovery aborts
with `sql149_recovery_forward_fix_only`; only a forward fix is allowed.

## Localhost checks for Stebbi

There is no new browser surface at the SQL149 gate. Do not mutation-test the
new identity, RSVP or repair flows on localhost after SQL149 alone. Wait until
Codex has reviewed the postflight and Phase 3C-3 has atomically switched all
full Event readers to the v2 authority. Existing deployed v1 Event and Expense
flows should remain untouched during this manual database gate.
