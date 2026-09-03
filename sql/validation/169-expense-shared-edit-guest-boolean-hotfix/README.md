# SQL169 — shared TES-24 edit guest boolean hotfix

SQL169 is a closed-beta, function-only correction for
`public.expense_share_edit_revision_v1`.

The SQL168 predecessor derives `is_author` with nullable SQL equality. An
active unregistered guest therefore produces `NULL`, while
`expense_unconfirmed_publication_parties.is_author` is `NOT NULL`. The same
comparison can make the participant boolean nullable for a payer-only guest.

SQL169 changes exactly those two derived expressions to:

```sql
COALESCE(member.user_id = p_actor_id, false)
```

It does not link the guest to an account, grant the guest access, create an
invitation, or change an Expense, payment, share, repayment, draft, binding,
publication, settlement, RLS policy, table, index, trigger or grant boundary.

## Operator order

Run only after an approved independent focused rereview and separate operator
authorization:

1. `preflight.sql` — read-only; expect `PREDECESSOR_READY` before first install
   or `EXACT_INSTALLED` after a lost response/repeat check.
2. `sql/169_expense_shared_edit_guest_boolean_hotfix.sql` — transactional,
   function-only migration.
3. `postflight.sql` — read-only; every boolean must be `true`.

`recovery.sql` is not part of normal installation. It is a guarded mutation
that restores the exact SQL168 predecessor only when the exact SQL169 target
is installed. Restoring it reintroduces the guest defect, so use it only for a
separate, concrete rollback decision. Recovery deletes or rewrites no user or
financial data.

## Security and data effects

- Owner remains `postgres`.
- `service_role` keeps exact EXECUTE capability.
- PUBLIC, `anon` and `authenticated` remain denied.
- `SECURITY DEFINER` and empty `search_path` remain exact.
- No RLS policy or relation ACL is changed.
- No data repair or cleanup is performed.
- No raw UUID, payload, participant label or private data is emitted by the
  operator validation.

## Localhost checks for Stebbi

After SQL169 has separately passed review, preflight, migration and postflight:

1. Sign in as the confirmed Expense author/manager under the closed-beta flag.
2. Open a confirmed Expense containing an active unregistered guest.
3. Choose `Færa í drög` and then `Drög með öðrum`.
4. Expect one bound shared edit revision and navigation to the canonical
   `/breyta?step=split&draft=...` route.
5. Confirm the guest remains unregistered and receives no automatic access,
   invitation or collaborator capability.
6. Confirm the confirmed Expense remains the financial source of truth while
   the revision is open and cannot itself be settled under the TES-24 rule.
7. Also check `Drög fyrir mig`; it should open without a live publication.
8. Verify no stuck pending button, 404/500, raw SQLSTATE/relation text, or
   console overlay.
9. At 360, 390 and 460 px, verify the dialog and pending/error states have no
   horizontal overflow, overlap or zoom requirement.

Do not casually run recovery, alter legacy rows, or use production data for
experimentation. Those actions require separate explicit authorization.
