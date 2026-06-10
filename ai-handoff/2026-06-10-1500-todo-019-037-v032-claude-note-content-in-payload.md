# TODO #19 / #37 - Phase B plan update: note content in payload

## Based on

- Codex SQL approval: `2026-06-10-1432-todo-019-037-v030-codex-phaseB-sql-approval.md`
- Codex localhost checklist: `2026-06-10-1454-todo-019-037-v031-codex-localhost-checklist-addendum.md`
- Stebbi decision: "Ég sé ekki þörfina á note privacy því notandinn er innskráður. Sýnum note fyrir og note eftir."

---

## Decision

Show note content (before and after) in event detail. The actor and counterpart are both authenticated users who already have access to the shared loan, including its note field. There is no reason to hide the content from them in `Nýlegt`.

This simplifies the implementation — note is now treated the same as item_name.

---

## Changes to v029/v025 plan

### `LoanFieldChange` (was: no note content)

```ts
export interface LoanFieldChange {
  field: 'item_name' | 'loaned_at' | 'due_at' | 'note'
  changeType: LoanFieldChangeType
  oldValue?: string | null   // all fields including note
  newValue?: string | null   // all fields including note
}
```

Previously `oldValue`/`newValue` were excluded for `note`. Now included.

### `computeLoanChanges` note handling

- `note` null -> non-null: `{ field: 'note', changeType: 'added', newValue: after.note }`
- `note` non-null -> null: `{ field: 'note', changeType: 'removed', oldValue: before.note }`
- `note` changed: `{ field: 'note', changeType: 'changed', oldValue: before.note, newValue: after.note }`

### i18n keys (updated)

| Key | IS | EN |
|-----|----|----|
| `eventDetailReturnDateRemoved` | `Skiladagur fjarlægður: {date}` | `Return date removed: {date}` |
| `eventDetailReturnDateChanged` | `Skiladegi breytt: {oldDate} -> {newDate}` | `Return date changed: {oldDate} -> {newDate}` |
| `eventDetailReturnDateAdded` | `Skiladegi bætt við: {date}` | `Return date added: {date}` |
| `eventDetailItemNameChanged` | `Nafni breytt: {oldName} -> {newName}` | `Name changed: {oldName} -> {newName}` |
| `eventDetailLoanedAtChanged` | `Lánsdegi breytt: {oldDate} -> {newDate}` | `Loan date changed: {oldDate} -> {newDate}` |
| `eventDetailNoteAdded` | `Athugasemd bætt við: {content}` | `Note added: {content}` |
| `eventDetailNoteRemoved` | `Athugasemd fjarlægð: {content}` | `Note removed: {content}` |
| `eventDetailNoteChanged` | `Athugasemd breytt: {oldContent} -> {newContent}` | `Note changed: {oldContent} -> {newContent}` |

### Localhost checklist item 4 (v031) updated

Old expected: "note content is not shown in Nýlegt."
New expected: note content is shown. Adding, changing, and removing a note shows the old/new content in the drawer detail lines.

---

## SQL is unchanged

`sql/48_update_loan_with_diff.sql` already returns `before_note text` from both RPCs. Note content was always captured in the SQL — the old plan just chose not to use it in the payload. No SQL change needed.

---

## Ready to implement

SQL v048 is approved (v030). Once Stebbi applies SQL to Supabase and the verification script confirms both RPCs return `status=unauthenticated`, Claude Code will implement Phase B app code.

Please confirm when SQL is applied and verified.
