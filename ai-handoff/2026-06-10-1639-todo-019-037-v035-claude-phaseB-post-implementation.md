# TODO #19 / #37 - Phase B post-implementation handoff

Implements the full Phase B scope from:
- `ai-handoff/2026-06-10-1533-todo-019-037-v033-codex-phaseB-execution-handoff.md`
- `ai-handoff/2026-06-10-1535-todo-019-037-v034-codex-actor-read-events-addendum.md`

SQL `48_update_loan_with_diff.sql` was already applied by Stebbi before this session began (confirmed: `48: Success. No rows returned`).

## What was implemented

### 1. `computeLoanChanges` — pure diff function

New file: `lib/loans/event-diff.ts`

Returns a `LoanFieldChange[]` array describing what changed between two loan snapshots. Detects `changed`, `added`, `removed` for `item_name`, `loaned_at`, `due_at`, `note`. Skips `loaned_at` and `due_at` when not present in the `after` object (narrow edit via `updateLoanItemDetails`).

### 2. Type extensions — `lib/recent-events/types.ts`

Added:
- `LoanFieldChangeType` — `'changed' | 'added' | 'removed'`
- `LoanFieldChange` — `{ field, changeType, oldValue?, newValue? }`
- `changes?: LoanFieldChange[]` on `RecentEventPayload`
- `detailLines?: string[]` on `RecentEventDisplay`

### 3. `initiallyRead` on `recordRecentEvent`

`lib/recent-events/helpers.server.ts` extended with `initiallyRead?: boolean` on `RecordEventArgs`. When true, `ack_at` is set to `occurredAt` at insert time so the actor's own change does not appear as unread in Nýlegt.

### 4. `updateLoan` — diff events

`lib/loans/actions.ts` — `updateLoan` now calls `update_loan_with_diff` RPC (was `update_loan`). The RPC returns a TABLE row with `(status, before_item_name, before_note, before_loaned_at, before_due_at)`. If `computeLoanChanges` finds at least one change, a `loan_updated` event is recorded with `initiallyRead: true` (actor's own edit). No event on no-op save.

### 5. `updateLoanItemDetails` — diff + counterpart events

`lib/loans/actions.ts` — `updateLoanItemDetails` now calls `update_loan_item_details_with_diff` RPC (was `update_loan_item_details`). The RPC returns a TABLE row with `(status, before_item_name, before_note, counterpart_user_id)`.

On a real change:
- Actor event: `recordRecentEvent` with `initiallyRead: true` — does not show as unread
- Counterpart event: `recordRecentEvent` without `initiallyRead` — shows as unread for the other party
- Both events share the same `eventKey` (`loans:loan:${loanId}:updated:${timestamp}`)
- No counterpart event when `counterpart_user_id` is null or equals `user.id`
- No event at all on no-op save

### 6. Localized detail lines — `app/auth-mvp/heim/page.tsx`

Added `formatDateStr` and `buildDetailLines` module-level helpers. When mapping `recentEvents`, each event now includes `detailLines` — a string array of localized change descriptions computed server-side.

`EVENT_TYPE_TO_KEY` map includes `loan_updated: 'eventLoanUpdated'`.

`displayLocale` is now declared before the `recentEvents` map block (bug fix: it was declared after the map, causing a TDZ ReferenceError that silently set `eventsError = true`).

### 7. Drawer renders detail lines — `app/auth-mvp/heim/RecentSection.tsx`

Drawer body shows the event label plus `detailLines` as secondary `<p>` elements below it.

### 8. Translation keys — `messages/is.json` + `messages/en.json`

Eight new keys under `teskeid.home`:

| Key | Icelandic | English |
|-----|-----------|---------|
| `eventDetailItemNameChanged` | `Nafni breytt: {oldName} -> {newName}` | `Name changed: {oldName} -> {newName}` |
| `eventDetailLoanedAtChanged` | `Lánsdegi breytt: {oldDate} -> {newDate}` | `Loan date changed: {oldDate} -> {newDate}` |
| `eventDetailReturnDateAdded` | `Skiladegi bætt við: {date}` | `Return date added: {date}` |
| `eventDetailReturnDateRemoved` | `Skiladagur fjarlægður: {date}` | `Return date removed: {date}` |
| `eventDetailReturnDateChanged` | `Skiladegi breytt: {oldDate} -> {newDate}` | `Return date changed: {oldDate} -> {newDate}` |
| `eventDetailNoteAdded` | `Athugasemd bætt við: {content}` | `Note added: {content}` |
| `eventDetailNoteRemoved` | `Athugasemd fjarlægð: {content}` | `Note removed: {content}` |
| `eventDetailNoteChanged` | `Athugasemd breytt: {oldContent} -> {newContent}` | `Note changed: {oldContent} -> {newContent}` |

Note content is shown in full — Stebbi explicitly decided authenticated users may see note before/after.

## Files changed

- `lib/loans/event-diff.ts` — NEW
- `lib/recent-events/types.ts`
- `lib/recent-events/helpers.server.ts`
- `lib/loans/actions.ts`
- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/heim/RecentSection.tsx`
- `messages/is.json`
- `messages/en.json`

## Files added (tests)

- `lib/__tests__/event-diff.test.ts` — NEW, 11 tests for `computeLoanChanges`
- `lib/__tests__/actions.test.ts` — new describe blocks: `updateLoan — diff events` (7 tests), `updateLoanItemDetails — diff + counterpart events` (9 tests); existing `updateLoanItemDetails orchestration` tests updated to array mock format matching new RPC return shape
- `lib/__tests__/home-page.test.tsx` — 8 new translation keys in mock; 1 new test: `drawer renders detailLines for loan_updated event with changes payload`

## SQL applied

`sql/48_update_loan_with_diff.sql` was applied before this session. Contains:

- `update_loan_with_diff(p_actor_id, p_loan_id, p_item_name, p_note, p_loaned_at, p_due_at)` — returns TABLE `(status, before_item_name, before_note, before_loaned_at, before_due_at)`
- `update_loan_item_details_with_diff(p_actor_id, p_loan_id, p_item_name, p_note)` — returns TABLE `(status, before_item_name, before_note, counterpart_user_id)`; counterpart is the other populated party determined by CASE (lender first, then borrower), excluding actor

Both RPCs are service_role-only. DROP IF EXISTS guards are included.

## Commands run

```
npx vitest run
# 36 files, 990 passed, 22 skipped, 8 todo — all passed

npx tsc --noEmit
# exit 0
```

## Localhost checklist for Stebbi

### 1. Own edit does not create unread Nýlegt item

- Open `/auth-mvp/heim`, mark all events read with `Allt lesið`
- Edit a loan field (item name, note, return date, or loan date)
- Return to `/auth-mvp/heim`
- Expected: no new unread item appears for the actor

### 2. Drawer shows detail lines for loan_updated

- Edit a loan, then log in as the counterpart user (or wait for the counterpart event to appear on a shared test loan)
- Open Nýlegt, click the `Breytt: <item>` row
- Expected: drawer shows label plus one or more detail lines, e.g. `Nafni breytt: Gamla nafn -> Nýtt nafn`

### 3. Counterpart gets unread Nýlegt item

- Use two browser profiles sharing an accepted loan
- User A edits item name or note
- User B opens `/auth-mvp/heim`
- Expected: User B sees an unread `Breytt: <item>` row in Nýlegt

### 4. No-op save creates no event

- Open an edit form, change nothing, save
- Return to `/auth-mvp/heim`
- Expected: no new unread item for actor or counterpart

### 5. Return date wording

- Add a return date to a loan, save
- Check counterpart Nýlegt drawer
- Expected detail line: `Skiladegi bætt við: <date>`
- Change return date, save — expected: `Skiladegi breytt: <old> -> <new>`
- Remove return date, save — expected: `Skiladagur fjarlægður: <date>`

## Notes

- `updateLoan` (full edit form) records events with `initiallyRead: true` for the actor. No counterpart event is recorded by `updateLoan` — `update_loan_with_diff` does not return a `counterpart_user_id`. If counterpart events for full-form edits are later needed, a new RPC variant or a second lookup would be required.
- `updateLoanItemDetails` (narrow item/note edit) records both actor (read) and counterpart (unread) events via `update_loan_item_details_with_diff`.
- Event keys include an ISO timestamp suffix so each save produces a distinct row rather than overwriting previous events.
- The `loan_invitation_received` event (from v013) is unaffected; it has no `changes` payload, so `detailLines` will be empty and the drawer shows only the label.
