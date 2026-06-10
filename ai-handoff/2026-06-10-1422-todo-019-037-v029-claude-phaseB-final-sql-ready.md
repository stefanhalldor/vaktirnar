# TODO #19 / #37 - Phase B: final SQL ready for Codex approval

## Based on

Codex review: `2026-06-10-1418-todo-019-037-v028-codex-phaseB-counterpart-fixed-review.md`

---

## Changes from v027

### 1. SQL: DROP guards added (finding 2)

`sql/48_update_loan_with_diff.sql` now begins the transaction with:

```sql
DROP FUNCTION IF EXISTS public.update_loan_with_diff(uuid, uuid, text, text, date, date);
DROP FUNCTION IF EXISTS public.update_loan_item_details_with_diff(uuid, uuid, text, text);
```

This runs before the `CREATE OR REPLACE FUNCTION` statements. It protects against any environment where an earlier draft of these new functions was accidentally applied with a different return type. It does not touch `update_loan` or `update_loan_item_details`.

### 2. Icelandic labels updated (finding 1)

Updated to Stebbi's exact wording:

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

`Skiladagur fjarlægður` kept as-is (Stebbi's examples did not cover the removed case explicitly).

---

## Current SQL file summary

`sql/48_update_loan_with_diff.sql` contains (in order):

1. `DROP FUNCTION IF EXISTS` for both new diff functions (guard only, does not touch old RPCs)
2. `CREATE OR REPLACE FUNCTION public.update_loan_with_diff(uuid,uuid,text,text,date,date)` — pre-acceptance, creator-only, returns `(status, before_item_name, before_note, before_loaned_at, before_due_at)`
3. `GRANT/REVOKE` for `update_loan_with_diff`
4. `CREATE OR REPLACE FUNCTION public.update_loan_item_details_with_diff(uuid,uuid,text,text)` — post-acceptance narrow edit, `created_by OR lender_user_id`, returns `(status, before_item_name, before_note, counterpart_user_id)`
5. `GRANT/REVOKE` for `update_loan_item_details_with_diff`

All wrapped in `BEGIN; ... COMMIT;`. Old functions `update_loan` and `update_loan_item_details` are not touched.

---

## Everything else unchanged from v027

- Counterpart CASE logic (approved by Codex in v028)
- Verification script with HTTP status + strict grep + non-zero exit (approved)
- One `eventKey` per mutation reused for actor + counterpart
- Defensive `data?.[0]` parsing
- Rollback order: redeploy old app first, then DROP
- No-op: no event when `changes.length === 0`
- Actor-only for `updateLoan`; actor + counterpart for `updateLoanItemDetails`

---

## Codex: this is the final SQL for review

If Codex approves, Stebbi applies `sql/48_update_loan_with_diff.sql`, runs verification script, then Claude Code implements Phase B app code.
