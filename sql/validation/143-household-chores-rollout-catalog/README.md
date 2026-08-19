# SQL143: closed-rollout catalog support for Verkefnin

SQL143 is the small rollout/catalog step after the private SQL142 Household
Chores foundation. It adds the exact `heimilisverkin` feature key to the
existing private entitlement contract, installs fail-closed database guards
around that key, and updates the existing `fyrsta-vakt-krakkanna` idea row in
place to the new `Verkefnin` copy and generic `Annað` category. The internal
feature key remains `heimilisverkin`; it is a compatibility protocol identifier,
not the user-facing product name.

The migration is deliberately entitlement-neutral and application-neutral:

- it does not insert, update or delete any `feature_access` row;
- it does not decide which people are beta testers;
- it does not enable an app route, launcher card or environment flag;
- it does not change any SQL142 Household table, function, trigger or index;
- it preserves the legacy idea UUID, slug, status, source, counters and all
  vote, follower, submission and analytics references;
- it sends no email and introduces no email link.

Stebbi alone manages beta entitlements. A Household entitlement can only be
added later through the reviewed manual/admin path for one exact, current,
confirmed account. The database guards do not grant access themselves.

## Exact reviewed source

Run only the exact reviewed `sql/143_household_chores_rollout_catalog.sql`
with SHA-256
`FB44D2BCC359A402D8517141ACB94D58E10BBCDF5EBCC5A279A22072AFD2300B`
and byte length `72,915`. The matching implementation handoff and static test
must record the same source. If either value differs, stop and request a new
review before running anything.

## Manual operator order

Stebbi runs every SQL file himself in Supabase. Codex must not run these files.

1. First confirm the final SQL142 `postflight.sql` result is still available
   and every boolean, especially `postconditions_ok`, was `true`.
2. Open a fresh Supabase SQL editor session and run this folder's
   `preflight.sql`.
3. The reviewed pre-state has 16 `feature_access` ACL entries: eight owner
   rights and eight historical Supabase default rights for `service_role`.
   SQL52 intended only `SELECT`, `INSERT`, and `DELETE` for `service_role` but
   did not revoke those defaults first. SQL143 narrows this exact pre-state to
   the intended 11-entry ACL inside its transaction without changing any
   entitlement row.
4. Stop unless its single result row has every boolean, especially
   `server_version_ok`, `executor_ok`, `roles_ok`,
   `old_feature_constraint_exact_ok`, `feature_security_exact_ok`,
   `critical_functions_exact_ok`, `idea_schema_exact_ok`,
   `idea_references_exact_ok`, `legacy_idea_exact_ok`, `targets_clear`,
   `no_household_entitlements_ok`, `sql142_catalog_unchanged_ok` and
   `prerequisites_ok`, equal to `true`.
5. If any preflight value is false, run only `diagnose-preflight.sql` in a
   fresh editor session and share its one catalog/state-only row. Do not run
   the migration.
6. Run `sql/143_household_chores_rollout_catalog.sql` exactly once and
   unchanged. It is one explicit transaction.
7. After the migration reports success, open another fresh editor session and
   run `postflight.sql` before adding any Household entitlement.
8. Stop unless every postflight boolean, especially
   `feature_constraint_exact_ok`, `feature_security_exact_ok`,
   `guard_functions_exact_ok`, `insert_authority_ok`,
   `update_lock_free_ok`, `auth_email_lifecycle_ok`,
   `guard_triggers_exact_ok`, `auth_email_triggers_exact_ok`,
   `no_household_entitlements_ok`, `final_idea_copy_exact_ok`,
   `sql142_catalog_unchanged_ok` and `postconditions_ok`, is `true`.
9. Only after a separately reviewed app/release handoff and a fully green
   postflight may Stebbi decide whether to add or change beta entitlements.
   This validation bundle never authorizes that separate action.

If SQL143 returns any error, stop immediately. Do not rerun SQL143 and do not
continue to postflight or entitlement work. Open a fresh SQL editor session,
run only the read-only `recovery.sql`, and share both the original error and
its one recovery row. Although the migration is transactional, the recovery
result still requires review; it is not automatic permission to rerun.

Do not rerun SQL143 after a successful commit. Any later problem or contract
change needs a separately reviewed forward migration. None of the validation
files creates, alters, drops, inserts, updates or deletes anything: each uses
one read-only transaction and rolls it back.

## What the validation proves

- PostgreSQL is the exact reviewed server build and the executor/required
  roles are present.
- `feature_access` retains its exact three-column schema, defaults, primary
  key, canonical-email check, index, owner, RLS/no-policy posture and narrow
  table ACL.
- Preflight sees the exact old 18-key constraint; postflight sees the exact
  additive 19-key constraint including only `heimilisverkin` as the new key.
- The insert guard resolves canonical email server-side, requires one current
  confirmed auth account, follows SQL142's user-lock order and rejects a
  pending account-deletion marker.
- Updates involving the Household key fail immediately without advisory locks;
  changing such a row requires delete plus a fresh guarded insert.
- The reviewed account-email lifecycle guard prevents an existing Household
  entitlement from silently becoming stale or moving to another account when
  auth email changes.
- No Household entitlement exists before or immediately after SQL143.
- The exact legacy idea schema, update trigger and all four reference FKs,
  including analytics, remain in place; postflight sees the final copy under
  the unchanged legacy slug.
- Every exact SQL142 function-body hash normalizes CRLF to LF with
  `md5(replace(prosrc, E'\r\n', E'\n'))`; this preserves exact verification
  while avoiding platform newline drift.
- The SQL142 catalog seal is recomputed from current relations, columns,
  defaults, constraints, Household/shared indexes, sequence, function
  definitions and triggers. Validators do not trust the stored comment alone.

The catalog seal is a drift detector for the reviewed PostgreSQL 17.0.6
deparser contract, not a trust root against a postgres owner. A server upgrade
or intentional SQL142 change requires a fresh review.

No SQL, Supabase operation, entitlement mutation, environment change, commit,
push or deployment was performed by Codex while preparing this local bundle.

## Localhost checks for Stebbi

SQL143 alone has no user-visible application route or launcher. Immediately
after SQL143 and its postflight:

1. Start the existing localhost app in Stebbi's normal way and confirm the
   current home, menu, Tengsl and existing Teskeiðar still open normally.
2. Confirm `Verkefnin` has not appeared merely because SQL143 exists.
3. Do not add a real-family entitlement or call the new guards/RPCs manually
   as a smoke test. Wait for the separately reviewed application layer and its
   test-account checklist.
4. When that later app layer is ready, use test accounts first and verify that
   an unentitled account still receives no broad Household access.

SQL143 touches Supabase schema/catalog state and public idea copy when Stebbi
runs it. It does not touch production entitlements. Entitlement changes and
production app rollout remain distinct, separately authorized operations.
