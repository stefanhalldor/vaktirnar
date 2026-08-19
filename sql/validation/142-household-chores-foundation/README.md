# SQL142: private Household Chores foundation

SQL142 creates the private database foundation for `Heimilisverkahringir`.
It adds circles, typed `member | child` memberships, explicit in-app
invitations, participants, chore definitions, assignments, immutable activity
history and an append-only points ledger. It also adds bounded, service-only
RPCs with exact circle membership checks, stable request IDs and account-
deletion barriers.

The reviewed ABI contains exactly 66 Household functions, of which exactly 38
are executable by `service_role`. The full-member definition-detail read is
bounded to 100 participants and returns the participant/value versions needed
for stale-safe writes. It is denied as generic `not_found` to children and
non-members, and does not return auth IDs, email, Relationship metadata or
participant-value row IDs.

This migration is deliberately rollout-neutral:

- it does not add the `heimilisverkin` feature key or grant an entitlement;
- it does not expose a launcher card, route or user interface;
- it does not create a label/category model;
- it does not backfill people, Relationships, chores or points;
- it does not send email or create an email link.

The only shared baseline change is the exact addition of `heimilisverkin` to
the private `recent_events.source` contract and its bounded lookup index.
SQL143 and the application layer are a separate, later hard gate.

## Manual operator order

Stebbi runs every SQL file himself in Supabase. Codex must not run these files.

1. Open a fresh Supabase SQL editor session and run `preflight.sql`.
2. Stop unless the single result row has every boolean, especially
   `server_version_ok`, `baseline_columns_ok`, `recent_defaults_ok`,
   `baseline_parent_keys_ok`, `functions_ok`, `recent_conflict_key_ok`,
   `target_relations_clear`, `target_types_clear`, `target_functions_clear`,
   `target_triggers_clear` and `prerequisites_ok`, equal to `true`.
3. If preflight is false, run only `diagnose-preflight.sql` and share its one
   catalog-only row. Do not run the migration.
4. Run `sql/142_household_chores_foundation.sql` exactly once.
   If Supabase warns that the query creates tables without automatically
   enabling RLS, choose **Run without RLS**: the reviewed migration itself
   enables and forces RLS before commit, and it must be run unchanged.
5. Open another fresh editor session and run `postflight.sql`.
6. Stop unless every boolean, especially `postconditions_ok`, is `true`. If a
   committed migration returns a false postflight, run only the catalog-only
   `diagnose-postflight.sql` and share its single bounded row. Do not rerun
   SQL142.
7. Keep SQL143 and all matching application work blocked until the exact
   SQL142 postflight and independent review are green.

If SQL142 returns any error, stop immediately. Do not rerun SQL142 and do not
continue to postflight. Open a fresh SQL editor session, run only the read-only
`recovery.sql`, and share both the original error and the single recovery row.

Do not rerun SQL142 after a successful commit. The migration is one explicit
transaction, so a failed run rolls back before commit. `recovery.sql` is a
read-only, bounded inventory only; it never drops or changes anything. A
catalog/schema problem discovered after commit needs a separately reviewed
forward migration. A defect isolated to a read-only validator instead needs an
independently reviewed validator correction; it must not mutate the committed
catalog merely to satisfy an incorrect expectation.

No SQL, Supabase operation, entitlement change or production write was run by
Codex while preparing this bundle.

The reviewed source/static manifest is the intended-shape proof. SQL142 also
stores a transactional SHA-256 snapshot of the PostgreSQL-created relation
metadata, column defaults, constraints, Household and shared recent-event
indexes, identity sequence, function definitions and trigger definitions.
Postflight recomputes it as
`catalog_unchanged_since_sql142_ok`. This second layer detects catalog drift
after SQL142 created its objects; it is deliberately not described as a trust
root against a postgres owner. A PostgreSQL server upgrade changes the catalog
deparser contract and therefore requires a fresh review instead of silently
reusing the old snapshot.

## Privacy and authority

- All 17 Household tables are postgres-owned, have ENABLE + FORCE RLS, no RLS
  policies and no table access for PUBLIC, anon, authenticated or service_role.
- Only the bounded public RPC allowlist is executable by service_role. Every
  helper remains private and every function is SECURITY DEFINER with an empty
  search path.
- A Relationship is only server-side proof of the exact invited registered
  user. A Relationship, participant row, name or email never grants circle
  access.
- Every active exact `member | child` membership can self-assign only through
  its own mapped active participant and active participant-value row. `child`
  receives a separate server-built projection and can only complete or cancel
  an exact open assignment mapped to that child, regardless of whether the
  assignment was self-assigned or member-assigned. Cancellation writes no
  points. UI hiding is not the authority boundary.
- Dashboard `recent_assignments` contains only the latest completion event for
  assignments that are still completed. Cancelled or reopened work remains in
  bounded history, but cannot masquerade as currently completed work.
- Assignment detail is discriminated by the server-returned `viewer_type`.
  A full `member` receives the canonical participant ID and the existing full
  assignment projection. A `child` receives a separate safe DTO without circle,
  definition, participant or completion-sequence IDs; its version and action
  flags are available only for the exact mapped child's own open assignment.
  Dashboard and history rows use the immutable assignment-title snapshot. A
  full member can read active and archived participants plus their exact
  value/version state through the dedicated definition-detail RPC; a child
  cannot call it.
- The full-member membership projection contains active memberships only, so
  ended historical membership episodes cannot crowd out current version tokens.
  It marks the exact viewer row server-side without returning auth IDs. The
  membership-management read also derives `can_leave` and `can_delete_circle`
  from the current active full-member set: children can leave, a full member
  can leave only when another full member remains, and only the last full
  member can delete the circle.
- Invitations and activity stay in-app. No raw email, auth UUID or private
  Relationship metadata is returned in the consent or child projections.
  Profile-derived labels fall back to `Teskeiðarnotandi` before projection if
  they contain `@`, POSIX control characters or bidirectional control marks.
- Account-deletion preparation blocks every new Household reference until the
  exact deletion is consumed or explicitly aborted through the reviewed flow.

## Localhost checks for Stebbi

SQL142 has no user-visible application route, launcher card or entitlement, so
there is no new Household Chores screen to test on localhost at this stage.
After Stebbi has run SQL142 and its postflight is fully green:

1. Start the existing localhost app as usual and confirm the current home,
   menu, Tengsl and other Teskeiðar still open normally.
2. Confirm no `Heimilisverkin` card or route has appeared merely because SQL142
   exists.
3. Do not create feature-access rows or try Household RPCs manually as a UI
   smoke test. SQL143 and the matching guarded app implementation must be
   reviewed first.
4. Use test accounts/data only for the later SQL143/app acceptance flow. Do not
   alter real family memberships, chores or points until that separate handoff
   explicitly authorizes the test.
