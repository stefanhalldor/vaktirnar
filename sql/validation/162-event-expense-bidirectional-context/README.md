# SQL162 bidirectional Event/Expense context

SQL162 adds bounded server-only discovery in both directions and one atomic
private/shared draft Event-relation mutation. It preserves SQL157's
confirmed-Expense management authority and SQL159/160 finalization/financial
truth. It narrowly replaces SQL157 management/attach V2 so only their Event
context branch uses canonical current SQL153 attendance instead of legacy
membership; all Expense manager, state, revision, replay and lock checks stay.

It also narrowly replaces `expense_save_private_draft(...)`: ordinary autosave
is unchanged, but a new one-off draft must first be saved without an Event and
an existing canonical Event relation can change only through
`expense_set_private_draft_event_relation_v1(...)`.

The corrected bundle also freezes full direct-helper properties and exact
owner/service-role EXECUTE ACLs, stores an internal durable replay receipt, and
persists the `all_event` → `participants_only` removal fail-close in the same
draft/publication transaction. The generic-save tuple helper is evaluated only
for `one_off` drafts. An accepted attendee exact Event source is adapted from
a new bounded strict V3 source with the established safe SQL149 wire shape;
no broad Event payload or new Expense authority is added.

No SQL in this bundle was run by Codex and Codex did not connect to Supabase.

## Manual rollout — deferred release gate

This bundle deliberately creates an SQL-first compatibility window. An older
app client that still changes Event relation through generic save receives a
safe conflict. Do not run SQL162 until the matching app tree has passed local
and prerelease gates and a short closed-beta write-quiescent window is active.

In a fresh Supabase SQL Editor session with
`current_user = session_user = postgres`:

1. Run `preflight.sql` (100% read-only).
2. Classify the output using exactly one of the two mutually exclusive states
   below. Do not require every returned boolean to be true.
3. Only from the normal initial state, run
   `../../162_event_expense_bidirectional_context_contract.sql` exactly
   once under separate explicit approval.
4. If its response is lost, do not rerun it. Open a fresh session and run only
   `preflight.sql`, then use the lost-response state below.
5. Reload PostgREST schema cache under separate approval because SQL162 adds
   RPC signatures.
6. Run `postflight.sql` (100% read-only). Require every catalog attestation and
   `postconditions_ok = true`.
7. Manually compare the complete `protected_relation_evidence` and
   `protected_baseline_token` against the saved preflight output. The SQL emits
   `baseline_matches_preflight = NULL` and `manual_gate_ready = NULL` on
   purpose: the postflight cannot truthfully compare against output from an
   earlier SQL Editor statement. Any mismatch is a stop condition.
8. Release only the matching exact app tree/SHA under separate authority.

### Normal initial installation

The migration may begin only when the preflight output has all of this exact
state:

- `executor_ok = true`
- `server_version_ok = true`
- `roles_exact = true`
- `relation_security_exact = true`
- `relation_security_count = 22`
- `frozen_predecessors_exact = true`
- `replacement_predecessors_exact = true`
- `predecessor_save_exact = true`
- `installed_save_exact = false`
- `save_acl_exact = true`
- `direct_dependencies_exact = true`
- `predecessors_exist = true`
- `targets_absent = true`
- `exact_installed = false`
- `legacy_subset_current = true`
- `current_graph_integrity_exact = true`
- `attendance_authority_compatible = true`
- `lost_response_safe = false`
- `operator_state_ok = true`
- `prerequisites_ok = true`

Save the complete output, execution time, `protected_relation_evidence` and
`protected_baseline_token` before running the migration. Any other combination
is a stop condition and should be inspected with `diagnose-preflight.sql`.

### Lost response / exact installed

Do not rerun the migration. Open a fresh SQL Editor session and run only
`preflight.sql`. Classify the migration as already committed and safe only when
the output has all of this exact state:

- the executor, version, roles, current graph integrity, legacy-subset and
  frozen stable predecessor attestations are true;
- `relation_security_exact = true` and `relation_security_count = 22`;
- `targets_absent = false`;
- `exact_installed = true`;
- `predecessor_save_exact = false`;
- `replacement_predecessors_exact = false`;
- `installed_save_exact = true`;
- `save_acl_exact = true`;
- `lost_response_safe = true`;
- `operator_state_ok = true`;
- `prerequisites_ok = false`.

The last false value is expected because this is not a clean initial state.
Only after an explicit review of the complete output may the operator continue
to schema-cache reload and postflight. If any exact-installed, security,
catalog, graph or protected baseline evidence differs, stop and diagnose; do
not rerun or recover automatically.

Use `diagnose-preflight.sql` only after a mismatch. It is read-only and returns
safe catalog, count and digest evidence without names, emails, Event titles or
draft payloads.

`recovery.sql` is a separately approved function-only capability rollback. It
restores the exact SQL102 generic-save body and exact predecessor SQL157
management/attach V2 bodies, then revokes/drops additive SQL162 entry points;
it does not undo legitimate Event-relation choices already committed.
Recovery can therefore restore old stale-client risk and is not routine.

## Localhost checks for Stebbi

Only after Stebbi has separately completed a green SQL162 manual gate:

1. Create a new private draft with an Event. Confirm the draft is first durable
   without Event and then binds the Event once, without sharing or confirming.
2. Simulate a supported relation-bind conflict. Confirm the same no-Event draft
   remains recoverable and retry does not duplicate it.
3. Test private/shared `none → A`, `A → B` and `A → none`; hard refresh must
   show structural absence on the old Event.
4. Remove A from a live `all_event` draft. Confirm the same publication stays
   shared, visibility becomes `participants_only`, and only exact participants
   retain access.
5. Confirm an incompatible Event guest or unshared-change move rejects
   atomically without participant, payer, split or financial mutation.
6. Confirm Event → existing Expense and general new Expense → Event lists show
   only authoritative bounded candidates; a stale selection fails safely.
7. With a current SQL153 participant who has no legacy attendance membership,
   test all four directions. Event access alone must never expose or attach an
   Expense unless that actor also has exact Expense manage authority.
8. Repeat with a non-`attending` RSVP display state while current access stays
   active; Event context remains available because response state is not
   access authority.
9. Verify pending/error/navigation behavior at 360, 390 and 460 px.

Use only disposable data and consenting closed-beta accounts. Do not alter
production auth, permissions or financial records to manufacture a state.
