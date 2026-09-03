# SQL168 — confirmed Expense edit revisions

SQL168 adds the clean-only TES-24 lifecycle without moving draft proposals into
canonical financial tables. The last confirmed allocation stays authoritative
until a successful reconfirmation. Only the exact Expense with an open private
or shared edit revision is excluded from new settlement; other eligible
confirmed Expenses in the group remain actionable.

## Operator order

1. Run `preflight.sql` read-only. Continue only from `ABSENT_READY`. An
   `EXACT_INSTALLED` result means skip the migration and run postflight.
   Existing pre-SQL168 edit drafts do not block installation: they remain
   inert, unbound and owner-only until the owner removes them through the
   dedicated legacy action. SQL168 never guesses, backfills or deletes them
   during installation. The validator preserves predecessor-
   specific security metadata: SQL164 private-draft saving uses
   `pg_catalog, public`, while the other pinned functions use an empty search
   path; private drafts and unconfirmed publications use forced RLS, while
   repayments use ordinary RLS. Direct function ACLs are also pinned per
   function: private-draft saving and the public participant-update wrapper
   allow `service_role`, while the internal begin/finish request helpers remain
   owner-only. Candidate detection ignores the three required predecessor
   signatures that SQL168 replaces in place and treats only genuinely new
   SQL168 functions, the binding relation or lifecycle triggers
   as partial-install evidence. The result exposes only bounded artifact and
   legacy-draft counts; it does not return UUIDs, payloads or user content.
2. Run `sql/168_expense_confirmed_edit_revision_lifecycle.sql` once.
   If it raises `expense_sql168_postcondition_failed`, the transaction rolls
   back. Copy the complete bounded JSON `DETAIL` (counts and fixed booleans)
   for review and stop; do not rerun, repair or reinterpret the failing gate.
3. Run `postflight.sql` read-only. Every boolean, including
   `postconditions_ok`, must be true.
4. Do not run recovery as routine rollback. It revokes only the new
   service-role capabilities and deliberately performs no data cleanup.

The migration, preflight, postflight, recovery and diagnostic were written
locally only. Codex did not run any SQL or connect to Supabase.

## Safety contract

- Opening and closing a revision advances only the group's monotonic
  `financial_version` eligibility/CAS token. It creates no Expense revision,
  activity, payment, share or repayment movement.
- Existing `reported` or `confirmed` repayment history in the same group and
  currency makes `Færa í drög` unavailable. Rejected/cancelled history and a
  different currency do not block it.
- Reconfirmation deletes the pending draft inside the same transaction before
  calling the canonical SQL165-backed update wrapper. Any failure rolls both
  operations back.
- While a binding is open, every legacy canonical Expense update is rejected
  by the database trigger. Draft, Expense, group and actor deletion cannot
  cascade the identity away: binding foreign keys are restrictive, and only
  discard/reconfirm explicitly delete the binding before the draft.
- An unchanged reconfirmation closes the lifecycle without a synthetic
  financial update.
- The eligible projection is server-authoritative. Group-row locking,
  financial-version CAS and confirmation-time review protect stale or
  concurrent settlement clients.
- Recovery never deletes pending revisions or user/financial data.
- Generic draft saving cannot create an edit draft and can update one only
  after proving its exact binding. Generic deletion rejects every edit draft.
  Bound revisions use discard/reconfirm; unbound legacy rows use only the
  dedicated owner/version/no-binding discard capability.
- The SQL168 target has no global Expense-only draft index. The binding
  relation's `UNIQUE (expense_id)` is the active-revision authority, while the
  SQL164 actor+Expense predecessor index remains untouched.
- Preflight, migration and postflight freeze the complete direct draft-writer
  signature, normalized source hash and EXECUTE/owner/security manifest.
  Preflight pins predecessor and installed hashes separately for writers that
  SQL168 replaces, while unchanged SQL159/162 writers use the same hash in
  both states. Any unlisted, missing or body-drifted writer, unexpected
  grantee or weakened security contract is `STOP_WRITER_DRIFT`.

## Localhost checks for Stebbi

Use controlled closed-beta fixtures only; do not use a real production debt.

1. Open a confirmed Expense, choose `Færa í drög`, then `Drög fyrir mig`.
   Confirm the old allocation remains visible and settlement actions are gone.
2. In a group with two otherwise eligible Expenses A and B, move A to drafts.
   Confirm A has no settlement action while B can still be settled.
3. Keep a settlement tab open before creating the revision, then submit its
   stale action. Expect a short translated refusal and no repayment row.
4. Save draft changes, leave and resume. Confirm one logical Expense and one
   exact edit route, with no duplicate row.
5. Share, then unshare. Confirm unshare removes draft access for others but
   settlement remains locked.
6. Discard. Confirm the old confirmed allocation becomes actionable unchanged.
7. Reopen, change allocation and reconfirm. Confirm settlement becomes
   actionable only after success and retained share identities/history remain.
8. Try `Færa í drög` on same-currency `reported`/`confirmed` history. Confirm
   it is unavailable. Rejected/cancelled or another currency must not block.
9. A settled/cancelled Expense remains outside TES-24 MVP.
10. For an old unbound edit draft, confirm the form is not shown. The owner
   sees the older-version explanation, the reassurance that financial data is
   unchanged, a confirmation-backed removal action and a back link. A second
   stale tab must return safely to the confirmed Expense without 404/500.
11. Test 360, 390 and 460 px plus desktop: no zoom, horizontal overflow,
   overlap or dead navigation state.

No SQLSTATE, raw database error, UUID, draft payload or Next.js console overlay
may be shown to the user.
