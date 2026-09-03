# SQL159 unconfirmed Expense publication and finalization

SQL159 is the additive database contract behind the product lifecycle
`Drög fyrir mig → Drög með öðrum → Staðfest`. It keeps the mutable private
working draft outside the financial ledger, allows an author to publish one
strict server-normalized shared snapshot to an exact authenticated audience,
and creates canonical financial state only through explicit, confirmed,
idempotent finalization.

This bundle is an operator gate, not permission to run SQL. Codex wrote and
statically checked the files locally. No SQL in this package was run by Codex,
and Codex did not connect to Supabase.

## Safety contract

- Existing private drafts remain private. SQL159 performs no publication
  backfill and does not classify or rewrite existing active Expenses.
- Sharing, replacing a shared version and withdrawing a shared version do not
  write canonical Expense, payment, share, obligation, settlement, Event-link,
  activity or invitation state.
- Shared reads use only the sanitized publication relations. Raw private draft
  JSON, email addresses, display labels and private source data are not shared.
- Every draft deletion writes a private, PII-free draft-ID tombstone. A deleted
  client UUID can never be recreated at version 1 and capture a delayed share
  or human-confirmation request; current SQL102 functions remain unchanged.
- The author must be selected as a payer or participant and is always in the
  detail audience. Every additional viewer must be an exact selected,
  server-resolved authenticated payer or participant. A draft with only the
  selected author as party and viewer is valid.
- Audience UUIDs deliberately have no `auth.users` foreign key. The strict
  writer resolves them from authoritative sources and every reader revalidates
  the authenticated viewer and exact live source binding. A deleted recipient
  therefore becomes structurally absent without introducing a parent/child
  account-deletion lock reversal; its inert private UUID disappears at the
  next share, withdrawal, finalization or author lifecycle cleanup.
- Event projection is visibility-first. `participants_only` is structurally
  absent for a nonparticipant; `all_event` can expose only an attendee-safe
  static summary and never grants shared-detail or financial authority.
- Finalization alone may delegate to a frozen predecessor create writer. It
  validates exact draft/publication versions, a normalized shared fingerprint
  and literal human confirmation before creating one durable active result.
- All SQL159 relations are private, forced-RLS tables with no policies or
  browser/service table grants. The eight public entry RPCs are
  `SECURITY DEFINER`, owned by `postgres`, use an empty search path and grant
  `EXECUTE` only to `service_role` as non-owner.
- SQL102, SQL111, SQL157 and SQL158 remain unchanged. The complete 32-function
  effective predecessor contract is frozen for audit evidence. Its exact
  seven-function direct-create writer subset, source contracts and grants
  remain available until separately reviewed SQL161 hardening. SQL160 is the
  narrow JSONB operator-precedence forward-fix for the installed SQL159
  normalize function.

## Exact SQL159 service entry points

1. `expense_share_private_draft(uuid,uuid,uuid,bigint,bigint)`
2. `expense_unshare_private_draft(uuid,uuid,uuid,bigint,bigint)`
3. `expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)`
4. `expense_get_private_draft_publication_lifecycle(uuid,uuid)`
5. `expense_list_visible_shared_drafts(uuid)`
6. `expense_get_shared_draft_detail(uuid,uuid)`
7. `expense_list_group_shared_drafts(uuid,uuid)`
8. `teskeid_event_get_expense_pre_active_v1(uuid,uuid)`

The actor UUID in every RPC is server-authenticated input. It is never client
authority. Mutation payload authority is derived under the database boundary;
clients supply only IDs, expected versions, request IDs and literal intent.

## Manual SQL-first rollout

Use a fresh SQL Editor session with exact
`current_user = session_user = postgres` for each step. Save every result row,
the reviewed file hashes and the completion time as rollout evidence. Do not
blindly retry any query whose response is missing or ambiguous.

Keep writes through both the old direct-create paths and the new draft paths
quiescent from immediately before preflight until postflight is green. The
catalog gates and baseline digests are intentionally exact; concurrent writes
can make otherwise valid evidence ambiguous. For this closed beta, use a short
announced maintenance window rather than weakening a digest or expectation.
The single request count/digest covers both canonical receipt stores:
`expense_mutation_requests` and `teskeid_event_mutation_requests`.

The exact order is:

1. Run `preflight.sql` read-only. Stop unless every individual attestation and
   the final prerequisite boolean are true. Save the complete output.
2. If preflight proves every SQL159 target is absent, review and run
   `../../159_expense_unconfirmed_publication_and_finalization.sql` with a
   separate, explicit migration approval.
3. If the migration response is lost, times out at the client, or the network
   drops, do not rerun it. Open a fresh session and rerun only `preflight.sql`.
   Skip migration replay only when both `lost_response_safe = true` and
   `operator_state_ok = true`; `exact_installed` alone is evidence, not
   permission to continue. Any other result is a hard stop: run
   `diagnose-preflight.sql` read-only and request review.
4. After either a confirmed migration commit or an exact installed-state
   preflight, obtain separate explicit approval and reload the PostgREST schema
   cache. SQL159 intentionally does not reload it itself.
5. Run `postflight.sql` read-only. Stop unless every attestation and the final
   postcondition boolean are true. Save the complete output and its completion
   time.
6. End the write-quiescent window only after postflight is green. App work,
   localhost use and release remain separate gates with separate approval.

The migration, schema-cache reload and every production/Supabase action are
independent irreversible-action gates. Approval for one does not approve the
next.

## Diagnostic use

`diagnose-exact-draft-lineage.sql` is a separate operator-edited investigation
for exact D1, D2 and confirmed E identifiers. It starts an explicit read-only
transaction and always rolls back. Its result contains only labels, bounded
timestamps/versions, booleans and pseudonymous fingerprints/digests; it never
returns raw UUIDs, draft payloads or user-entered/private fields. It performs
no cleanup or repair.

`diagnose-preflight.sql` is only for a preflight or postflight mismatch. It is
100% read-only and does not repair, install or change expectations. Retain its
safe object/signature/owner/grantee/boolean/count/hash output for review. It
must not be modified to expose function bodies, raw draft/snapshot JSON,
titles, notes, email addresses, display names or private labels.

Fresh-state evidence includes exact relation and index-name collision counts.
For a claimed fresh install, any nonzero target count is a hard stop. After a
lost response, only the complete exact-installed gate described above can
classify those targets as a prior committed install. The diagnostic may show
only the safe target name and PostgreSQL relation kind so an operator can
identify any other collision without reading row data or function source.

Do not use diagnostic output as permission to continue. Any mismatch in
executor, predecessor writer, schema, source hash, owner, RLS, trigger, ACL,
baseline or protected digest is a hard stop until reviewed.

## Compatibility window

The compatibility window begins when SQL159 commits and ends only after a
later reviewed SQL161 transaction revokes the frozen predecessor direct-create
writer set.

- Before app cutover, the old app can legitimately create active Expenses
  directly.
- After app cutover and before SQL161, a stale client or old deployment can
  still legitimately use those writers.
- Such active rows do not need a synthetic draft, shared snapshot or SQL159
  finalization result and must not be treated as corruption.
- The valid one-way invariant is `SQL159 finalization result → exact canonical
  active IDs`; the reverse implication is intentionally false.

Record the SQL159 migration hash and green postflight time, then record the
future app release SHA/deployment/READY time. SQL161 must independently verify
the exact unchanged predecessor writer set immediately before it changes any
grant.

## Revoke-only recovery

`recovery.sql` is an emergency capability-off switch, not normal rollout work
and not a schema rollback. Prefer leaving the additive SQL159 objects installed
while fixing or rolling the app back if the new RPCs are not being called.

Before considering recovery:

1. Roll every app instance back to code that does not call the eight SQL159
   entry RPCs and prove that rollback is live.
2. Stop new SQL159 calls and keep the write-quiescent window in place.
3. Preserve preflight/postflight/diagnostic evidence.
4. Obtain a separate explicit approval for the recovery transaction.

Recovery fails closed unless the executor, all eight targets, their exact
owner/source/security/ACL contracts and all seven frozen predecessor writers
match the reviewed install. It then removes only the direct `service_role`
`EXECUTE` grants from the eight SQL159 entry RPCs and proves the resulting
owner-only ACL. It retains all SQL159 tables, rows, snapshots, audiences,
finalization results, draft-ID tombstones, baseline evidence, triggers and
internal helpers. It
also leaves all predecessor writers and their `service_role` access unchanged.

Recovery does not perform data cleanup, object removal, schema-cache reload or
app rollback. An unexpected dependency, catalog drift or ACL drift aborts the
whole transaction. Do not weaken the gates or broaden the action to force it
through. A schema-cache reload after recovery, if operationally required, is a
new separately approved step.

## Localhost checks for Stebbi

Gate 1 changes only the local SQL/validation contract, so there is no safe
user-visible localhost check before separately approved SQL execution and app
implementation. Do not point localhost at production merely to exercise these
RPCs.

After later SQL and app gates are separately approved, the canonical manual
checks are: private drafts remain author-only; explicit sharing exposes only a
stable safe snapshot to exact selected authenticated participants; private
changes stay private until `Deila breytingum`; withdrawal removes shared
visibility; Event/group visibility follows the structural matrix; stale or
double finalization never creates more than one active Expense; and only an
explicit checked `Þetta er rétt skipting` can finalize. Use consenting
disposable accounts and data only. Finalization creates real financial state
and may later lead to invitation delivery, so it must not be casually tested
against production or real recipients.
