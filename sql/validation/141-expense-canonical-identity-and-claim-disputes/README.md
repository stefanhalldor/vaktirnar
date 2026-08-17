# SQL141: canonical Expense identity and claim disputes

SQL141 makes a server-confirmed Relationship or current accepted Event identity
canonical immediately. It adds a private `disputed` claim marker without
deleting identity or changing the financial ledger. A disputed group remains
visible but automated settlement/repayment writes fail closed until a later,
separate resolution feature exists.

The migration does **not** recreate SQL139 participant-source history. Manual
legacy repair uses current canonical Event eligibility confirmed by the owner.
It never matches by display name or email and performs no automatic backfill.
Private participant-source rows left by older Event-to-Expense flows may still
exist. Their presence is reported by preflight/postflight but is not a blocker:
SQL141 never treats them as identity proof and does not delete them. The Event
creation wrapper may use rows created for its own new Expense inside the same
transaction, then deletes only those new rows before commit.

## Two invariant layers

A dispute adds private recognition state only. It preserves two distinct kinds
of truth:

- Financial/ledger invariants: the Expense, canonical member identity, total,
  currency, payments, shares, obligations, repayments, incurred date, Event
  link and financial history are unchanged.
- Provenance/context invariants: creator, intended counterparty, canonical
  identity proof/history, Event context and audit history are unchanged and are
  never rewritten to make a dispute look like an identity correction.

No acknowledgement is needed for canonical balances. `resolved` remains a
reserved future state; SQL141 adds no resolution RPC or UI workflow.

## Manual order

1. Keep the current application deployed.
2. Run `preflight.sql` in a fresh Supabase SQL editor session.
3. Stop unless every required boolean, especially `prerequisites_ok`, is
   `true`. `historical_participant_sources_present` is informational and may be
   `true`; legacy private rows are ignored rather than treated as proof.
4. Run `sql/141_expense_canonical_identity_and_claim_disputes.sql` once.
5. Run `postflight.sql` in a fresh editor session.
6. Stop unless every required boolean, especially `postconditions_ok` and
   `historical_participant_sources_ignored_ok`, is `true`.
7. Only then deploy the matching application build.

Do not rerun the migration after a successful commit. `recovery.sql` is only a
read-only inventory; before commit, PostgreSQL transaction rollback is the
recovery mechanism. A post-commit rollback would require a separately reviewed
forward migration because reverting identity/dispute semantics could corrupt
product meaning.

No SQL was run by Codex while preparing this bundle.

## Privacy and authority

- Both new tables are private, postgres-owned, FORCE RLS and have no policies or
  client/service table grants.
- Public RPCs are service-role-only; browser input never supplies an authority
  user id.
- Event repair requires the Expense to remain linked to the exact Event and the
  selected user to be a current active accepted Event participant.
- Relationship binding derives `counterpart_user_id` from the server-side
  Relationship row.
- The dispute notification is a private in-app recent event. No email is sent
  and no email address is stored in the new payload.
- `resolved` is intentionally not implemented in this MVP.

## Localhost checks for Stebbi

After SQL141 postflight is green and the matching app is running locally:

1. Create an ordinary Expense using a confirmed person from Tengsl. The person
   should immediately appear as a Teskeiðarnotandi, without an acceptance step.
2. Create an Event-linked Expense using an accepted Event participant. The same
   immediate canonical identity behavior should apply.
3. Open the known legacy `Stebbishj (gestur)` Expense as its manager, choose the
   current accepted Event participant and confirm repair. Verify that amounts,
   shares and participants do not otherwise change.
4. Sign in as the claimed user, open the exact Expense link and choose “Ég
   kannast ekki við þetta”. Verify the identity remains shown, the amount remains
   in read-only balances, and the group moves to “Þarf yfirferð”.
5. Verify “Gera allt mitt upp” excludes that entire group and a direct repayment
   attempt fails safely. Existing payment/history rows must remain visible.
6. Verify the creator receives only the private in-app notification; no email is
   sent and no unrelated user sees it.
7. Check both IS and EN at 360/390/460 px, keyboard focus, close/back behavior,
   retry and double-submit.

Use test data only. Do not dispute or repair a real production claim merely to
exercise the flow.
