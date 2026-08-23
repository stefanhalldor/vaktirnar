# SQL153 — opt-out scoped Event participant access

SQL153 is the database-only Stage A package for Phase 3C-4. It does not switch
the application to the new ABI. Run each SQL file manually in a fresh Supabase
SQL Editor session, in this exact order:

1. `preflight.sql` (read-only). Stop unless `prerequisites_ok` is true and copy
   the complete result row.
2. `../../153_event_opt_out_scoped_participant_access.sql` (one transaction).
3. `postflight.sql` (read-only). Stop unless `postconditions_ok` and every
   required/gating boolean are true. Observation/recovery booleans are
   diagnostics and may become false after legitimate traffic.
4. Stop. Do not run `recovery.sql` as normal rollout work.

No SQL in this package was executed by Codex.

## Installed authority

Protected/FORCE-RLS relations, with no browser or service-role table grants:

- `teskeid_event_participation_rsvp_v3`: exact current identity-generation
  decision (`no_response | considering | attending | not_attending`), one
  shared decision/version clock with the SQL149 three-state mirror, and a
  current-recipient/private-owner-only optional note.
- `teskeid_event_participation_invitation_generations_v3`: one durable,
  generation-exact invitation anchor. Its composite FK proves the invitation
  belongs to the same Event guest; an invitation ID alone is never authority.
- `teskeid_event_participation_mutation_requests_v3`: bounded idempotency
  receipts for RSVP and leave. Account deletion may cascade receipts.
- `teskeid_event_sql153_install_baseline`: private recovery facts, including
  privacy-safe hashes and the exact sealed predecessor v2 RSVP source.
- `teskeid_event_sql153_write_observation_seq`: postgres-owned, CACHE 1,
  NO CYCLE, OWNED BY NONE, with no app-role privileges.

SQL153 also replaces only the exact existing
`teskeid_event_set_rsvp_v2(uuid,uuid,uuid,text,bigint,uuid)` body. Its ABI and
three-state result remain unchanged. It now observes v3 `considering`, makes a
real old `no_response` write invalidate that state, and rejects stale versions.

Six exact triggers complete the write seam: the v3 receipt mutation guard; a
BEFORE identity-generation RSVP token fence; an AFTER participation-to-v3
mirror; a deferred invitation anchor/no-op reconcile; and deferred integrity
checks on participation and v3 decision rows. The migration, preflight and
postflight also seal the fixed-point 76-function predecessor writer/authority
closure. Postflight proves the 75 unchanged predecessors plus the exact
successor `set_rsvp_v2` separately.

## Service-role-only RPC ABI

All UUID actor arguments are server-supplied and checked against auth/session.
Bigint versions are emitted as decimal strings in JSON.

- `teskeid_event_resolve_invitation_v3(actor uuid, invitation uuid) -> jsonb`
- `teskeid_event_list_scoped_participations_v3(actor uuid) -> jsonb`
- `teskeid_event_get_actor_view_v3(actor uuid, event uuid) -> jsonb`
- `teskeid_event_list_for_actor_v3(actor uuid) -> jsonb`
- `teskeid_event_list_person_source_events_v3(actor uuid, before_sort_at timestamptz, before_event_id uuid, limit integer) -> jsonb`
- `teskeid_event_get_person_source_roster_v3(actor uuid, event uuid) -> jsonb`
- `teskeid_event_set_rsvp_v3(actor uuid, event uuid, guest uuid, identity_generation bigint, state text, private_note text, expected_decision_version bigint, request_id uuid) -> jsonb`
- `teskeid_event_leave_participation_v3(actor uuid, event uuid, guest uuid, identity_generation bigint, expected_identity_version bigint, expected_access_version bigint, request_id uuid) -> jsonb`

Bounded errors use existing generic Event tokens: `teskeid_event_invalid_input`,
`teskeid_event_not_allowed`, `teskeid_event_not_found`,
`teskeid_event_unavailable`, `teskeid_event_fingerprint_mismatch`,
`teskeid_event_revision_conflict`, and
`teskeid_event_rsvp_version_conflict`. Notes, emails and identity details never
appear in errors, logs or mutation receipts.

## State and compatibility rules

- An active, exact invitation-generation participation is opt-out access.
  The invitation-ID resolver is always current-generation-anchor-only.
  Canonical Event/list claim additionally permits an active unbound
  manual-email participation with the actor's exact current confirmed email
  only when that guest has no invitation history and no anchor. If an eligible
  current invitation exists, its exact anchor is mandatory; cancelled,
  revoked, left or mismatched invitation history never falls through to the
  anchorless path. Pending delivery, RSVP and email-delivery failure do not
  gate Event access.
- First open may bind only the exact current confirmed canonical email. After
  binding, user ID is the sole authority. Left/revoked generations cannot
  self-return through reads.
- `considering` is represented only in v3. The SQL149 mirror remains
  `no_response`, so SQL149–152 readers remain parse-safe during DB-first and
  rolling-app deployment.
- Every identity-generation change invalidates the old rolling-v2 RSVP token.
  Install also applies one deterministic token fence to existing generation>1
  rows.
- Explicit self-leave expires current pending invitations, turns an accepted
  invitation into `left`, deletes exact accepted membership, marks the current
  participation `left`, and clears its note. Guest/personRef/Expense history is
  preserved. RSVP `not_attending` is not leave.
- SQL147 pending feed is exact-sealed. Current `loadRecentEventInbox` filters
  recent Event rows through that live pending-ID feed, so expired/left entries
  disappear without mutating `recent_events`.
- SQL148 v1 and SQL149 v2 list/person-source surfaces remain byte-exact and are
  sealed because membership/access removal must close them. The v3
  person-source surface is the Stage B canonical successor.

The scoped launcher summary returns at most 100 bound rows per call. Claiming
is progressive and handles at most 100 exact unbound candidates per call under
sorted owner locks. `claim_has_more` means another bounded claim pass is
required; Stage B may repeat only while that flag is true.
`participating_has_more` means the 100-row bound summary overflowed and must be
completed through cursor-paged
`teskeid_event_list_person_source_events_v3`. The unified list preserves both
flags separately and also exposes `owned_has_more` only inside the entitled
owner branch. Stage B must never interpret any first summary page as the full
durable `/vidburdir` list.

Canonical lock order is SQL149 lineage advisory lock, `15001`, SQL153 advisory
lock, then (in the late blocking window) `auth.users` before Event source and
target tables. Scoped multi-claim precollects at most 100 candidates, locks all
distinct Event owners in sorted order, then email/actor/auth, and revalidates
exact Event-owner pairs before guest, invitation, participation, anchor and v3
rows. Leave pins auth before Event, then locks guest, the bounded actionable
invitation set, membership, participation, anchor and v3 decision.

## Recovery boundary

`recovery.sql` is intentionally destructive and fail-closed. It is allowed
only before Stage B and only when all of these remain exact under deterministic
auth/source/target locks:

- SQL153 catalog, bodies, ACLs, triggers and baseline match this package;
- SQL153 observation sequence is still unused;
- SQL149 bridge sequence equals the install-time `(last_value,is_called)` pair;
- v3 receipts are empty;
- legacy participation, v3 decision (private notes represented only by hashes)
  and invitation-anchor count/hash equal the install baseline.

An attempted, aborted or semantic-no-op legacy/v2/v3 sync can advance a
nontransactional observation sequence and permanently closes destructive
recovery. Use a forward fix after that. When recovery is provably allowed it
detaches SQL153 triggers, restores the exact sealed predecessor v2 RSVP body,
reverses only the deterministic generation>1 RSVP token fence without changing
timestamps, then drops SQL153 objects without `CASCADE`.

## Localhost checks for Stebbi

Stage A is DB-first only. Nothing new is intentionally visible on localhost,
and mutation testing is not safe until Stage B strict TypeScript/repository,
server-action and UI consumers are implemented and reviewed. After a manual
SQL153 run, only copy the complete preflight/migration/postflight results for
review. Do not test RSVP, private notes, invitation claims or leave from an old
localhost bundle: old UI does not implement the v3 generation/version ABI.
