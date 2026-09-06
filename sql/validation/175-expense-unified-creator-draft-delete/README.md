# SQL175 unified creator creation-draft deletion

## Purpose and product contract

SQL175 adds the creation-draft branch of TODO #107's unified creator-facing
`Eyða kostnaði` contract. It covers exact creator-owned `one_off` and reusable
group creation drafts, whether still private or currently shared. Edit drafts
and confirmed Expenses remain outside this branch; confirmed Expenses continue
to use the byte-frozen SQL173 contract.

The public capability and mutation are service-role-only:

- `expense_get_own_creation_draft_delete_capability_v1(uuid,uuid)`
- `expense_delete_own_creation_draft_v1(uuid,uuid,uuid,bigint,bigint)`

The mutation requires one exact authenticated actor, request ID, draft ID,
draft version and nullable publication version. It serializes with the
canonical Expense lock, uses an Event receipt/lock when the draft carries an
Event context, locks draft then publication then publication children, and
reuses SQL159's `expense_sql159_private_draft_delete_guard` for the durable
tombstone, publication retirement and child cleanup. Replays are strict and
the retained result contains IDs/state only, never title, note, payload,
participant identity, email or receipt content.

The additive readers avoid changing strict existing wire contracts:

- `expense_list_group_creation_drafts_v1` adds creator-private group drafts and
  gives shared authors the private editor target while participants retain the
  shared `/drog` target.
- `teskeid_event_get_expense_pre_active_v2` preserves the v1 row shape and
  changes only an exact shared author's target to their private editor.
- `expense_get_shared_draft_management_target_v1` gives the direct `/drog`
  route a separate exact-author mapping without changing SQL159's detail RPC.

## Safety boundary

`SQL rollout = install deletion capability`

`UI confirmation = creator decides to delete`

`runtime RPC = delete one exact eligible creation draft`

Running migration, preflight, rehearsal or postflight never invokes the delete
mutation and never inserts, updates or deletes an application row. The
rehearsal temporarily creates the exact functions in one transaction, validates
their catalog state, then rolls the entire installation back before returning
its result. Function bodies contain the future runtime mutation, but defining a
function does not execute it.

SQL175 changes no table, column, constraint, index, trigger, RLS policy, auth
configuration, secret, billing setting or existing SQL159/SQL173 function. It
adds seven versioned/internal functions and exact function grants. The five app
entry points grant `EXECUTE` only to `service_role`; the two helpers grant it
only to their `postgres` owner. Browser roles receive no direct access.

The SQL173 receipt classifiers remain byte-identical. A SQL175 receipt cannot
become relevant to a later SQL173 confirmed-Expense deletion: a deleted draft
is tombstoned and can never be finalized; a one-off draft result has null
`group_id`; a reusable-group draft ID is not in SQL173's one-off cleanup scope;
and the result has no Expense, member, invitation or group-array identifier.

No recovery artifact is included. Recovery drafting/execution was not
authorized for this phase and must be a separately reviewed installation-only
decision. Recovery must never delete application data.

## Manual rollout gates

Stebbi remains the sole Production SQL operator. Use a fresh Supabase SQL Editor
tab as `postgres` for one exact artifact at a time. Do not append diagnostic,
RPC or cleanup statements.

The state-conditioned result is intentional: target-exact flags are false when
the target functions are absent, and `targets_absent` is false after an exact
installation. Interpret the single preflight/postflight row using this table.

“All prerequisite exactness flags” below means `relation_contracts_exact`,
`relation_constraints_exact`, `private_relation_acls_exact`,
`predecessor_sources_exact`, `predecessor_contracts_exact`,
`predecessor_entry_acls_exact`, `delete_trigger_exact`,
`sql173_finalization_guard_exact` and `prerequisites_exact`.

| Gate branch | Flags that must be `true` | Flags that must be `false` | Next action |
| --- | --- | --- | --- |
| Preflight `PREDECESSOR_READY` | `executor_ok`; all prerequisite exactness flags; `targets_absent`; `operator_state_ok`; `prerequisites_ok` | all five target exactness flags (`target_overloads_exact`, `target_contracts_exact`, `target_sources_exact`, `target_acls_exact`, `target_dependencies_exact`); `targets_exact` | Run rehearsal, then migration only after a green rehearsal. |
| Preflight `EXACT_INSTALLED` | `executor_ok`; all prerequisite exactness flags; all five target exactness flags; `targets_exact`; `operator_state_ok` | `targets_absent`; `prerequisites_ok` | Skip rehearsal and migration; run only postflight. |
| Postflight `EXACT_INSTALLED` | `executor_ok`; all prerequisite exactness flags; all five target exactness flags; `targets_exact`; `postconditions_ok` | `targets_absent` | SQL175 installation is exactly verified. |

For a `PREDECESSOR_READY` branch:

1. Run `preflight.sql` and require the exact first row in the table.
2. Run `rehearse-migration.sql`. Continue only if it returns one row with every
   field `true`, including `candidate_catalog_verified`,
   `installation_rolled_back`, `predecessor_restored` and `rehearsal_pass`.
3. Run `../../175_expense_unified_creator_draft_delete.sql`. Expected result:
   `Success. No rows returned.`
4. Run `postflight.sql` and require the exact third row in the table.

`STOP` applies to any deviation from the expected branch, including
`DRIFT_STOP`, an unexpected true/false value, null/unknown flag,
malformed/missing row, PostgreSQL error or timeout. Never run recovery
automatically.

Do not call either deletion RPC from SQL Editor and do not issue a manual
`DELETE`. Destructive behavior may be exercised only through the reviewed app
action after a real creator explicitly confirms, using a deliberately safe
test case. Production rollout validation itself is non-destructive.

## Localhost checks for Stebbi

After SQL175 is separately installed in the environment used by localhost and
the matching app candidate is running:

1. Sign in as the exact creator of an existing safe private creation draft.
   Open its editor, choose `Eyða kostnaði`, cancel once, and confirm the draft
   remains unchanged.
2. Reopen it, confirm deletion intentionally, and expect a blocking destructive
   confirmation, a visible pending state, then navigation to a context route
   only when the server has separately proven that route readable; otherwise
   expect the Expense dashboard. Refresh and confirm only that chosen draft is
   gone.
3. For an existing safe shared creation draft, verify both `Hætta að deila`
   (keeps the private draft) and `Eyða kostnaði` (permanent deletion) are clearly
   distinct. Do not manufacture Production data just to cover this scenario.
4. As a participant/non-author, open the same kind of shared draft and confirm
   it stays on the read-only `/drog` route with no creator delete control.
5. If an existing creator-owned reusable-group draft belongs to a group that is
   now settling/inactive, use only the deletion-only fallback; editing must not
   be reopened. Confirm the delete result returns to the reusable group route.
6. Confirm narrow/mobile layout, keyboard focus, route loading and the error
   overlay remain usable; no stale-version, duplicate-save, privacy, unavailable
   RPC or server error should appear.

Deletion changes user data permanently. Use only an existing disposable/safe
draft that Stebbi intentionally wants removed. Do not test confirmed Expense
deletion, settlement/repayment state, direct SQL deletion, or Production RPC
calls as part of these localhost checks without separate explicit authority.
