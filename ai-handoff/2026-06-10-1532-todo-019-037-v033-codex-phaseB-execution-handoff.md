# TODO #19 / #37 - Final Phase B execution handoff for Claude Code

Relevant TODO items: #19 recent read state and #37 all unread events + event detail history. Adjacent future work: #27, #38, and #39.

This handoff is for Claude Code after Stebbi sends explicit confirmation that Phase B execution should begin.

## Based on

- SQL approval: `2026-06-10-1432-todo-019-037-v030-codex-phaseB-sql-approval.md`
- Localhost checklist addendum: `2026-06-10-1454-todo-019-037-v031-codex-localhost-checklist-addendum.md`
- Note-content decision: `2026-06-10-1500-todo-019-037-v032-claude-note-content-in-payload.md`
- Stebbi latest wording:
  - `Skiladegi breytt`
  - `Skiladegi bætt við`
  - `Nafni breytt`
  - `Lánsdegi breytt`

## Execution Gate

Claude Code may begin implementation only when Stebbi explicitly gives green light.

Do not run SQL unless Stebbi explicitly asks for that specific action. Codex approval means `sql/48_update_loan_with_diff.sql` is acceptable for Stebbi to apply, not that Claude Code should silently run it.

Before app code that calls the new RPCs is tested against Supabase or deployed:

1. Stebbi applies `sql/48_update_loan_with_diff.sql`.
2. Stebbi or Claude Code, with explicit permission and safe secret handling, runs the verification script from v029/v030.
3. Both new RPCs must return HTTP 200 and body status `unauthenticated`.
4. If verification fails, do not deploy app code. Reload Supabase/PostgREST schema cache and retry verification.

Service-role key must stay in environment variables only. Do not paste it into chat, files, screenshots, logs, handoff docs, or committed scripts. Ensure shell debug mode such as `set -x` is off.

## Implementation Scope

Use the approved `sql/48_update_loan_with_diff.sql` as the database contract.

Implement Phase B app code:

- `lib/loans/event-diff.ts`
  - Export `computeLoanChanges`.
  - Include note `oldValue` / `newValue` because Stebbi decided note before/after should be visible.
- `lib/recent-events/types.ts`
  - Add `LoanFieldChange`, `LoanFieldChangeType`, `changes?: LoanFieldChange[]`.
  - Add `detailLines?: string[]` to `RecentEventDisplay`.
- `lib/loans/actions.ts`
  - `updateLoan` calls `update_loan_with_diff`.
  - `updateLoanItemDetails` calls `update_loan_item_details_with_diff`.
  - Parse missing or malformed `data?.[0]` defensively as `save_failed`.
  - If `changes.length === 0`, return `{ ok: true }` and record no event.
  - For `updateLoanItemDetails`, record actor event and counterpart event when `counterpart_user_id` exists and differs from actor.
  - Generate one `eventKey` per mutation and reuse it for actor + counterpart events.
- `app/auth-mvp/heim/page.tsx`
  - Convert `event.payload.changes` into localized `detailLines`.
  - Keep raw event internals out of the client beyond the pre-rendered display object.
- `app/auth-mvp/heim/RecentSection.tsx`
  - Render drawer detail lines below the main label.
  - Use wrapping such as `break-words`; do not truncate detail lines.
- `messages/is.json` and `messages/en.json`
  - Add the required user-facing strings.

## Product Decisions

Note content is now shown in event details.

This supersedes earlier privacy guidance that hid note content. Stebbi decided authenticated actor/counterpart users should see note before/after because they already have access to the shared loan.

Guardrails still apply:

- No recipient email in payload, UI, or logs.
- No secrets/API keys in payload, UI, or logs.
- Note content may appear only in the relevant owner's `recent_events` row and drawer detail.
- Do not log full payloads containing note content.
- Use non-sensitive test notes in local/manual testing.

## Required Wording

Use `Return date`, not `Due date`, in user-facing English.

Use these Icelandic labels:

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

Internal field names such as `due_at` should stay unchanged in this phase.

## Required Tests

Add or update automated tests for:

- `computeLoanChanges`
  - identical fields -> `[]`
  - return date added / removed / changed
  - item name changed
  - loan date changed
  - note added / removed / changed with content
  - multiple fields changed
- `updateLoan`
  - uses `update_loan_with_diff`
  - records `changes`
  - no-op save records no event
  - status errors remain unchanged
- `updateLoanItemDetails`
  - uses `update_loan_item_details_with_diff`
  - lender actor -> borrower counterpart event
  - borrower-created actor -> lender counterpart event
  - no counterpart -> actor event only
  - counterpart equals actor -> actor event only
  - one shared `eventKey` for actor + counterpart
  - no-op save records no event
- `/heim`
  - drawer renders `detailLines`
  - long detail lines wrap
  - `Return date` / `Skiladegi` wording is used

Run at minimum:

```bash
npm run test:run -- lib/__tests__/event-diff.test.ts lib/__tests__/actions.test.ts lib/__tests__/home-page.test.tsx
npm run type-check
```

If the change touches shared behavior beyond these tests, run the full suite:

```bash
npm run test:run
```

## Localhost checks for Stebbi

These checks are part of acceptance. They help Stebbi understand the change in the product before release.

Preconditions:

- Use test users only.
- Use non-sensitive test note content.
- SQL #48 must be applied and both new RPCs verified before testing flows that call them.
- Test on localhost; Stebbi runs the dev server.

### 1. All unread events in Nýlegt

Open `/auth-mvp/heim`.

Expected:

- More than three unread events are visible or accessible in `Nýlegt`.
- If there are more than five events, the list scrolls without pushing the whole page too far down.
- `Allt lesið` removes all currently visible unread events.
- Refreshing localhost does not bring those read events back.

### 2. Return date detail text

Create or edit a loan so the return date is added, changed, and removed.

Expected Icelandic wording:

- `Skiladegi bætt við: ...`
- `Skiladegi breytt: ... -> ...`
- `Skiladagur fjarlægður: ...`

Expected English wording:

- `Return date added: ...`
- `Return date changed: ... -> ...`
- `Return date removed: ...`

Do not accept `Gjalddagi` or `Due date` in user-facing text.

### 3. Other field detail text

Change item name and loan date.

Expected Icelandic wording:

- `Nafni breytt: ... -> ...`
- `Lánsdegi breytt: ... -> ...`

Expected:

- Detail lines appear in the `Nýlegt` drawer below the main event label.
- Long item names wrap cleanly on mobile width and do not overflow.

### 4. Note content before and after

Add, change, and remove a note.

Expected:

- Adding note shows `Athugasemd bætt við: ...`.
- Changing note shows `Athugasemd breytt: ... -> ...`.
- Removing note shows `Athugasemd fjarlægð: ...`.
- The note text appears only for the user who owns that event row.
- No email addresses, secrets, or unrelated user data appear.

### 5. No-op save

Open an existing loan and press save without changing any user-visible field.

Expected:

- Save succeeds.
- No new `loan_updated` event appears in `Nýlegt`.

### 6. Counterpart event, lender edits accepted loan

Use two test users or two browser profiles.

Setup:

- User A is lender.
- User B is borrower.
- The loan is accepted/shared.

Action:

- User A changes item name or note through the accepted/narrow edit flow.

Expected:

- User A gets actor event if self-history is implemented.
- User B gets an unread `Nýlegt` event about the change.
- User B sees the correct before/after detail.
- The event does not expose email addresses or unrelated data.

### 7. Counterpart event, borrower-created loan

Use the reverse direction.

Setup:

- User A created the loan as borrower.
- User B is lender/counterpart after acceptance.

Action:

- User A changes item name or note through the allowed edit flow.

Expected:

- User B gets the counterpart event.
- The event does not get skipped because `borrower_user_id` equals actor.
- This is the regression Codex caught in v026.

### 8. Mobile layout

On localhost, test around 360-460 px wide.

Expected:

- `Nýlegt` list, drawer, detail lines, and buttons do not overlap.
- No horizontal scroll.
- Long names and detail lines wrap cleanly.

## What Not To Test Casually

- Do not run production Supabase SQL from localhost experiments.
- Do not paste the service-role key into chat, screenshots, committed scripts, or logs.
- Do not test with real sensitive note content.
- Do not deploy app code until SQL #48 has been applied and both new RPCs pass verification.

## Handoff Back To Codex

After implementation, Claude Code should stop and hand back:

- Files changed
- Commands run and exit codes
- Whether SQL #48 was applied and verified, or only app code was written
- Test results
- Any skipped tests
- Screenshots or localhost notes if useful
- Remaining risks
- Confirmation that `Localhost checks for Stebbi` were updated if behavior changed
