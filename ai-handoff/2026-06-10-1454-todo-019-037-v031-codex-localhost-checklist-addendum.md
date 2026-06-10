# TODO #19 / #37 - Codex localhost checklist addendum

Relevant TODO items: #19 recent read state and #37 all unread events + event detail history. This addendum follows `2026-06-10-1432-todo-019-037-v030-codex-phaseB-sql-approval.md`.

Stebbi requested that handoff/review documents include what Stebbi should test on localhost before release, ideally from v001 onward. Codex updated `ai-handoff/README.md` so future handoff/review files include a "Localhost checks for Stebbi" section unless clearly irrelevant.

This addendum does not replace v030. It adds the missing localhost checklist for the current #19/#37 Phase B work.

## Localhost checks for Stebbi

After SQL #48 has been applied and verified, and after Claude Code implements the Phase B app code locally, Stebbi should test these flows on localhost before release.

### 1. All unread events in `Nýlegt`

Open `/auth-mvp/heim`.

Expected:

- More than three unread events are visible or accessible in `Nýlegt`.
- If there are more than five events, the list scrolls without pushing the whole page too far down.
- `Allt lesið` removes all currently visible unread events.
- Refreshing localhost does not bring those read events back.

### 2. Return-date detail text

Create or edit a loan so the return date changes.

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

### 4. Note privacy

Add, change, and remove a note.

Expected:

- `Nýlegt` says only that the note was added, changed, or removed.
- The note content itself is not shown in `Nýlegt`.
- No note content appears in visible client UI for the event detail.

### 5. No-op save

Open an existing loan and press save without changing any user-visible field.

Expected:

- The save succeeds.
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

- User A sees the change event if actor self-history is implemented.
- User B gets an unread `Nýlegt` event about the change.
- User B cannot see note content in the event payload/UI.
- The event does not expose email addresses.

### 7. Counterpart event, borrower-created loan

Use the reverse direction.

Setup:

- User A created the loan as borrower.
- User B is lender/counterpart after acceptance.

Action:

- User A changes item name or note through the allowed edit flow.

Expected:

- User B gets the counterpart event.
- The event does not get skipped because `borrower_user_id` equals the actor.
- This is the regression that v026 caught.

### 8. Mobile layout

On localhost, test around 360-460 px wide.

Expected:

- `Nýlegt` list, drawer, detail lines, and buttons do not overlap.
- No horizontal scroll.
- Long names and detail lines wrap cleanly.

## What not to test casually

- Do not run production Supabase SQL from localhost experiments.
- Do not paste the service-role key into chat, screenshots, committed scripts, or logs.
- Do not test with real sensitive user data.
- Do not deploy app code until SQL #48 has been applied and both new RPCs have passed the verification script.
