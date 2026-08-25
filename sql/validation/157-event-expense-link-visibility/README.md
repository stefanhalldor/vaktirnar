# SQL157 Event expense link visibility

SQL157 stores a fail-closed visibility policy on the canonical
`teskeid_event_expense_links` row. It adds V2 RPCs without changing any V1
read/attach signature or response. Existing rows and omitted visibility are
`participants_only`.

## Gated rollout order

Keep Event/Expense writes quiescent from preflight through postflight. The
baseline digests are deliberately exact; any covered link, receipt or
linked-group protected-data write must make postflight fail rather than be
misclassified as migration-authored data. Other Event/Expense writes are why
full write quiescence is still mandatory.

1. From an exact `current_user = session_user = postgres` session, run
   `preflight.sql` read-only. Require `executor_ok`, every attestation and
   `prerequisites_ok = true`; save all counts, hashes and digests.
2. Run `../../157_event_expense_link_visibility.sql` with separate migration
   approval.
3. With separate explicit approval, reload the PostgREST schema cache. SQL157
   intentionally does not issue `NOTIFY pgrst` itself.
4. Run `postflight.sql` read-only. Require every attestation and
   `postconditions_ok = true`. It must match baseline link, receipt and
   protected-data digests, and every pre-existing link must still be revision
   1 and `participants_only`.
5. For the closed friends-and-family beta, prepare the exact disposable fixture
   described in `closed-beta-smoke.sql`, replace only its five input values and
   run it in a fresh postgres session. Require the
   `sql157_closed_beta_smoke_ok` notice and the final `ROLLBACK`.
6. Only after SQL, cache reload, postflight and the closed-beta smoke pass may
   the V2 app be deployed to the existing limited beta. The app intentionally
   has no V1 read fallback.

## Closed-beta behavioral probe gate

The catalog/digest scripts do not prove row-level privacy, authority replay or
runtime DTO behavior. The deliberately small `closed-beta-smoke.sql` gate uses
one disposable Event/Expense pair and two consenting test accounts on a local
or staging database. It must never be improvised against production or real
user data.

The shipped input UUIDs and acknowledgement fail closed. After the operator
replaces them with the exact disposable fixture values, the script:

- requires `current_user = session_user = postgres` before changing role;
- proves both actors have the beta entitlements and active Event attendance;
- proves the manager is not the Event owner but has exact Expense management
  authority, while the viewer has no active Expense membership;
- invokes the RPCs as `service_role`;
- proves `participants_only` hides the entire row from the Event-only viewer;
- proves `all_event` exposes exactly title, total and currency with no actor
  position;
- proves the exact participant retains an actor-only position;
- proves Event visibility does not grant Expense management or visibility-write
  authority;
- proves a valid lost-response replay is byte-stable and a stale revision fails;
- contains no `COMMIT` and ends in `ROLLBACK`, including its mutation receipts
  and temporary visibility changes.

This is the proportionate gate for the existing closed friends-and-family beta.
Static tests are still not a substitute for running it against an installed
SQL157 schema. Keep the complete output as release evidence.

## Deferred broad-release concurrency matrix

The closed-beta smoke is intentionally not a multi-session race harness. Before
the feature flag or access is broadened beyond the current limited beta, build,
review and run a disposable concurrency/malformed-state matrix. Do not treat a
successful closed-beta smoke as evidence for the deferred cases below.

That later matrix must use unrelated actors and exact known Event/Expense
memberships and prove at least:

- an Event-only viewer sees an `all_event` attendee-safe summary but no
  canonical Expense detail, identifiers, payer/share/allocation or settlement
  authority;
- an Event-only viewer sees no row, count, amount, currency or existence signal
  for `participants_only`;
- an exact undisputed active Expense member sees `participants_only`, while a
  disputed/removed/unrelated actor does not;
- actor positions are actor-only, bounded and absent for an Event-only viewer;
- missing, malformed or concurrently changing visible financial state returns
  the full safe V2 `unavailable` shape with no V1 fallback;
- create/attach/relink defaults to `participants_only`, both modes require the
  same current exact operation-specific authority, and Event ownership is not
  an extra requirement or a bypass;
- fresh/relinked V2 attach returns deterministic `link_revision = "1"`; a new
  request against an already-linked Expense conflicts, including two
  concurrent attach attempts, while the same request replays exactly;
- stale set-visibility revisions conflict, and a lost-response replay succeeds
  only while current exact Expense/Event/link authority still exists;
- revoked current authority rejects create/attach/set replay before returning a
  stored receipt; expected roster/financial/link versions are checked after a
  valid replay gate so the operation's own successful change does not break its
  retry;
- hidden rows cannot affect visible status, the 100-row bound,
  reconciliation, pending state or actor-position aggregates;
- one database statement/snapshot materializes visibility, attendee-safe
  summary fields and actor-position inputs, so a concurrent visibility or
  financial mutation cannot mix authorization from one snapshot with values
  from another.

Until that matrix exists and passes, multi-session and malformed-state coverage
is explicitly incomplete and broad rollout remains blocked. This accepted
closed-beta exception does not weaken any SQL157 privacy, RLS, grant, auth,
revision or server-authority contract.

## Compatibility and recovery

All three existing create entry points (owner, attendee and the top-level Event
wrapper) remain callable. Their old result JSON is byte-compatible, including
replayed receipts: it intentionally does not gain a visibility or revision
field. `event_visibility` is validated and included in the request fingerprint;
absent means `participants_only`. Every replay re-proves current exact Expense,
Event and link authority before returning the stored bytes. The top-level Event
wrapper preserves the visibility payload while retaining its existing organizer
mapping behavior. V2 attach/set receipts alone carry visibility and
decimal-string link revisions.

`recovery.sql` is not normal rollout work. It performs destructive rollback
only when the stored counts and link/receipt/protected-data digests still match,
all links are private revision 1, no V2 mutation receipt exists, and the exact
installed catalog is intact. It must never be used for destructive rollback
after V2 app deployment or traffic, because read-only V2 traffic cannot be
proven absent from SQL receipts.

For a provably unused exact install, recovery reconstructs the three pinned
pre-SQL157 create bodies and attempts to remove only SQL157-owned schema
objects. Destructive `DROP` statements never use `CASCADE`; an unexpected
external dependency aborts and rolls back the entire recovery transaction
before either branch commits. Treat that outcome as not recovered: do not
retry with `DROP ... CASCADE`; use a separately reviewed revoke-only forward
action. When the exact unused-install gate is closed, recovery preserves the
visibility column, decisions, revisions, receipts and protected data, and uses
`REVOKE ... CASCADE` only to remove PUBLIC plus every actual non-owner direct
grantee and their dependent privilege chains from all seven SQL157-modified or
newly added entry points and the visibility-unaware V1 Event activity reader.
That is the forward fail-closed branch; follow it with a reviewed forward fix.
Recovery also intentionally does not reload the PostgREST schema cache.

The link table, baseline and application tables remain forced-RLS/private with
owner-only table grants. Exact service-role function grants are attested.
SQL153 V3 scope is used only by the V2 Event-read projection; mutation
authority remains operation-specific.

No SQL in this package was executed by Codex.
