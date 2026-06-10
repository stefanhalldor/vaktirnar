# TODO #19 / #37 - Codex review of v027 counterpart fixed plan

Relevant TODO items: #19 recent read state and #37 all unread events + event detail history. TODO #27, #38, and #39 are adjacent because `Nýlegt` is becoming the event surface for invitation and counterpart changes.

Reviewed by Codex:

- `ai-handoff/2026-06-10-1410-todo-019-037-v027-claude-phaseB-counterpart-fixed.md`
- `sql/48_update_loan_with_diff.sql`
- `sql/32_loan_functions.sql`
- `sql/43_open_loans.sql`
- `sql/44_loan_item_details_edit.sql`
- `sql/46_recent_events.sql`
- latest wording from Stebbi: `Skiladegi breytt`, `Skiladegi bætt við`, `Nafni breytt`, `Lánsdegi breytt`

Codex did not run SQL, did not touch Supabase, and did not run tests in this review turn.

## Overall Verdict

v027 fixes the main counterpart bug from v026.

The SQL direction is now basically approvable, but Codex still wants two small corrections before Stebbi applies `sql/48` to Supabase:

1. Fix the Icelandic user-facing detail labels to match Stebbi's exact wording.
2. Make `sql/48` robust if an earlier draft of the new `update_loan_item_details_with_diff` function was accidentally applied in any environment.

After those two changes, Codex expects to approve SQL application, assuming no new app-code implementation surprises appear.

## Findings

### 1. Medium - Icelandic detail labels need Stebbi's latest wording

Stebbi clarified the exact wording after v027:

- `Skiladegi breytt`
- `Skiladegi bætt við`
- `Nafni breytt`
- `Lánsdegi breytt`

v027 still proposes:

- `Skiladagur breytt`
- `Skiladagur bætt við`
- `Nafn breytt`
- `Lánsdagur breytt`

Codex recommendation:

Use Stebbi's wording in the message values:

| Key | IS | EN |
|-----|----|----|
| `eventDetailReturnDateRemoved` | `Skiladagur fjarlægður: {date}` | `Return date removed: {date}` |
| `eventDetailReturnDateChanged` | `Skiladegi breytt: {oldDate} -> {newDate}` | `Return date changed: {oldDate} -> {newDate}` |
| `eventDetailReturnDateAdded` | `Skiladegi bætt við: {date}` | `Return date added: {date}` |
| `eventDetailItemNameChanged` | `Nafni breytt: {oldName} -> {newName}` | `Name changed: {oldName} -> {newName}` |
| `eventDetailLoanedAtChanged` | `Lánsdegi breytt: {oldDate} -> {newDate}` | `Loan date changed: {oldDate} -> {newDate}` |
| `eventDetailNoteAdded` | `Athugasemd bætt við` | `Note added` |
| `eventDetailNoteRemoved` | `Athugasemd fjarlægð` | `Note removed` |
| `eventDetailNoteChanged` | `Athugasemd breytt` | `Note changed` |

Codex is leaving `Skiladagur fjarlægður` as-is unless Stebbi wants `Skiladegi fjarlægt`; the exact examples Stebbi gave were changed/added/item-name/loan-date.

Internal `due_at` should stay as code/schema field for this phase.

### 2. Medium/Low - Add a guard for older draft return type in `sql/48`

`sql/48_update_loan_with_diff.sql` uses `CREATE OR REPLACE FUNCTION` for `update_loan_item_details_with_diff`.

That is fine if the function has never been applied. But earlier drafts of `sql/48` returned only:

```sql
(status text, before_item_name text, before_note text)
```

v027 now returns:

```sql
(status text, before_item_name text, before_note text, counterpart_user_id uuid)
```

Postgres generally cannot `CREATE OR REPLACE` a function when the return type changes. Production should not have any draft of `sql/48` applied, but to avoid surprises in staging/dev or if a draft was accidentally run, Codex recommends explicitly dropping only the new diff functions before recreating them.

Because these are new RPCs and old app code does not call them, this is safe before app deploy.

Recommended at the top of the transaction, before the `CREATE OR REPLACE FUNCTION` statements:

```sql
DROP FUNCTION IF EXISTS public.update_loan_with_diff(uuid, uuid, text, text, date, date);
DROP FUNCTION IF EXISTS public.update_loan_item_details_with_diff(uuid, uuid, text, text);
```

Then `CREATE FUNCTION` or `CREATE OR REPLACE FUNCTION` is fine. This does not touch the old production RPCs:

- `update_loan`
- `update_loan_item_details`

### 3. Low - Counterpart CASE is now correct

Codex approves the v027 CASE logic:

```sql
CASE
  WHEN v_loan.lender_user_id IS NOT NULL
       AND v_loan.lender_user_id IS DISTINCT FROM p_actor_id
    THEN v_loan.lender_user_id
  WHEN v_loan.borrower_user_id IS NOT NULL
       AND v_loan.borrower_user_id IS DISTINCT FROM p_actor_id
    THEN v_loan.borrower_user_id
  ELSE NULL::uuid
END
```

This handles:

- lender actor -> borrower counterpart
- borrower-created actor -> lender counterpart
- single-party/no counterpart -> null
- weird same-user edge case -> app skip protects it

The app tests listed in v027 should still be implemented.

### 4. Low - Verification script is acceptable

Codex approves the v027 verification shape:

- HTTP code checked
- body checked for `"status": "unauthenticated"`
- non-zero exit on failure
- service-role key warning included

Reminder: Stebbi or Claude Code must not paste the service-role key into chat, files, screenshots, logs, or committed shell scripts.

## Approval Status

Codex does not yet give the final "apply SQL" approval.

Required before final approval:

1. Update the Icelandic message labels per finding 1.
2. Add `DROP FUNCTION IF EXISTS` for the two new diff RPCs before recreating them, or explicitly document that no environment has ever run any earlier draft of `sql/48`.

Codex prefers the `DROP FUNCTION IF EXISTS` guard because it is simple, local to new functions, and protects against draft history.

## Suggested Message For Claude Code

```text
Claude Code, Codex reviewed v027.

The counterpart CASE logic is now correct and the verification script is acceptable.

Before Stebbi applies SQL, please make two final changes:

1. Update Icelandic detail labels to Stebbi's exact wording:
   - `Skiladegi breytt: {oldDate} -> {newDate}`
   - `Skiladegi bætt við: {date}`
   - `Nafni breytt: {oldName} -> {newName}`
   - `Lánsdegi breytt: {oldDate} -> {newDate}`
   Keep `Return date` in English. Internal `due_at` stays unchanged.

2. In `sql/48_update_loan_with_diff.sql`, add explicit `DROP FUNCTION IF EXISTS` for the two new diff RPCs before recreating them:
   - `public.update_loan_with_diff(uuid, uuid, text, text, date, date)`
   - `public.update_loan_item_details_with_diff(uuid, uuid, text, text)`

This protects against any environment where an earlier draft of the new function was accidentally applied with a different return type. It does not touch the old production RPCs.

After that, send a final handoff v029. Codex expects the SQL to be approvable after those changes unless something new appears.
```
