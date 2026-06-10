# TODO #36 / #37 / #38 / #39 / #40 - Loans polish and event package

Relevant TODO items:

- #36 Mannlegra orðalag á lánahlutverki
- #37 `Nýlegt` sýni öll ólesin events og breytingasamhengi
- #38 Event þegar lánaboði er hafnað
- #39 Lánveitandi geti eytt samþykktum hlut
- #40 Filterar í lánalista hafi sjálfstætt state

This is one coordinated handoff from Codex to Claude Code. Stebbi asked whether these can be handled as one package. Codex says yes, but only as a phased package with clear stop-points. #36 and #40 are small UI/text fixes; #38 and #39 touch server actions, Supabase RPCs, event payloads, and user data. Do not turn this into an unreviewed mega-change.

Codex did not run SQL, did not start localhost, did not deploy, did not commit, and did not inspect production data.

## Localhost Checks For Stebbi

These checks are part of acceptance. Use test users only and non-sensitive item/note text.

### 1. Role wording in new loan form (#36)

Open `/auth-mvp/lanad-og-skilad/ny`.

Expected:

- Icelandic shows `Ég er að lána` instead of `Ég er lánveitandinn`.
- Icelandic shows `Ég er að fá lánað` instead of `Ég er lántakandinn`.
- English keeps the same meaning with natural wording.
- Selecting either option still creates the correct lender/borrower role.
- Buttons fit on mobile 360-460 px without overlap or horizontal scroll.

### 2. Loan filters do not reset each other (#40)

Open `/auth-mvp/lanad-og-skilad` with at least one lent item and one borrowed item, and with both open/returned data if available.

Expected:

- Choose a lower role filter such as `Ég lánaði`.
- Change the upper status filter (`Enn í láni`, `Skilað`, `Allt`).
- The lower role filter stays selected.
- Then change the lower role filter.
- The upper status filter stays selected.
- If the combination has no results, an empty state appears, but neither filter jumps back to `Allt`.
- Mobile 360-460 px stays clean.

### 3. `Nýlegt` final sanity check (#37)

Open `/auth-mvp/heim`.

Expected:

- More than three unread events can be visible/accessed.
- `Allt lesið` clears all currently visible unread events.
- Refresh does not bring cleared events back.
- Loan update details show before/after content where relevant, including return date details.
- Own actor events do not appear as unread when they are intentionally written as already read.

### 4. Declined invitation event for sender (#38)

Setup:

- User A sends a loan invitation to User B.
- User B sees the invitation.

Action:

- User B declines / clicks `Kannast ekki við þetta`.
- User A opens `/auth-mvp/heim`.

Expected:

- User A receives an unread event saying the invitation was declined.
- The event identifies the item safely, without showing recipient email.
- User B does not keep an actionable unread invitation after declining.
- An unrelated User C cannot see the event or payload.

### 5. Lender deletes accepted item (#39)

Setup:

- User A and User B share an accepted loan.
- The lender is known.

Action:

- The lender deletes the accepted item.

Expected:

- Delete succeeds for the lender.
- The deleted item disappears from the normal loan list.
- The counterpart receives an unread event explaining the deletion.
- The deletion event is understandable even though the item no longer has an edit/detail page.
- Borrower/non-lender cannot delete the accepted item by direct call.
- Recipient email and unrelated personal data do not appear in event payload, UI, logs, or test output.

## Package Verdict

This can be one implementation package if Claude Code follows this order:

1. #36 text-only change.
2. #40 filter-state bugfix.
3. #37 final audit and any small missing test/update only.
4. #38 decline event.
5. #39 accepted-delete behavior and counterpart event.

Stop and hand back before implementation if #38 or #39 require broad SQL/auth changes beyond the narrow plan below.

## Current Code Pointers

Codex observed these likely touch points:

- #36:
  - `messages/is.json` has `teskeid.loans.creatorRoleLender = "Ég er lánveitandinn"` and `creatorRoleBorrowed = "Ég er lántakandinn"`.
  - `messages/en.json` has `I am the lender` / `I am the borrower`.
- #40:
  - `components/loans/LoanList.tsx` keeps independent state variables, but status buttons currently call `setRoleFilter(null)` when status changes.
  - The fix is likely to remove those resets and update tests.
- #37:
  - `recent_events` foundation, `initiallyRead`, detail lines, and helper tests appear to be in the current worktree. Treat #37 mostly as verification/final cleanup, not a rewrite.
- #38:
  - `lib/loans/actions.ts` currently has `declineInvitation()`, but it does not record a sender event.
  - `RecentEventType` currently includes invitation received but needs decline event support if not already added.
- #39:
  - Existing `delete_loan` behavior in SQL historically allowed creator-only deletion and blocked accepted invitations.
  - `lib/loans/actions.ts` records actor-side `loan_deleted` today, but accepted-loan counterpart notification needs explicit server-authorized data.

## Implementation Requirements

### #36 - Human role wording

Change only translations unless code structure forces otherwise.

Icelandic:

- `Ég er að lána`
- `Ég er að fá lánað`

English suggestion:

- `I am lending`
- `I am borrowing`

Keep underlying enum values unchanged:

- `lender`
- `borrower`

Add or update tests that assert the new visible text where practical.

### #40 - Independent filters

Fix `LoanList` so upper status filter and lower role filter do not reset each other.

Important:

- Do not auto-reset role filter just because the selected status has zero matching rows.
- Show an empty state instead.
- Keep counts understandable. If counts remain status-aware for role pills, that is fine, but selected state must not jump.
- Preserve search and sort behavior.

Expected code-level change:

- Remove `setRoleFilter(null)` from status button handlers unless Claude Code finds another intentional reset.
- Add regression tests in `lib/__tests__/loan-list.test.tsx`:
  - role stays selected when status changes
  - status stays selected when role changes
  - empty combination does not reset either filter

### #37 - Finalize `Nýlegt`

Do a focused audit of #37 rather than rebuilding it.

Confirm:

- `getUnreadRecentEventsForUser(user.id)` fetches all unread by default.
- UI can handle more than three unread events without page-breaking layout.
- `recordRecentEvent({ initiallyRead: true })` has direct helper tests proving `ack_at` is written.
- `loan_updated` detail lines show before/after values.
- Own actor events are read; counterpart events are unread.
- `loan_invitation_received` still works after #27 changes.

If all of that is already true, do not churn code. Mark it in Claude Code handoff as verified and ready for Codex review/DONE.

### #38 - Event when invitation is declined

Goal:

- When recipient declines an invitation, the sender/creator gets an unread `Nýlegt` event.

Recommended safe design:

- Add a new event type such as `loan_invitation_declined`.
- Do not include recipient email in payload.
- Payload should be minimal, e.g. `{ itemName }`.
- Event owner should be the invitation sender/creator only.
- Recipient's own received invitation event should be acked or no longer actionable after decline.

SQL/RPC caution:

- Current `decline_invitation` may not return enough safe context to record sender event.
- Prefer adding a new RPC variant that performs the same authorization and returns safe post-action context, for example:
  - `status`
  - `loan_id`
  - `item_name`
  - `sender_user_id` / `invited_by`
- Return context only after authorization succeeds.
- Keep function service-role only.
- Do not return `recipient_email_normalized`.
- Do not weaken wrong-email protection.

App behavior:

- `declineInvitation()` should record the sender event after successful decline.
- Event write can follow existing `recordRecentEvent` best-effort pattern unless Claude Code proposes a stronger transactional design.
- If best-effort remains, call that out as residual risk.

Tests:

- recipient decline records sender event
- wrong-email/unrelated user records no event
- payload has item name but no email
- recipient received-event is acked or no longer shown as actionable
- event label appears in `/heim`

### #39 - Lender can delete accepted item

Goal:

- A lender can delete an accepted loan item.
- The counterpart receives an event.

Recommended authorization rule:

- If invitation is accepted / both parties joined: only `loan_items.lender_user_id = actor` may delete.
- If not accepted: keep existing creator-only behavior unless Stebbi explicitly asks to change it.
- Do not allow a pure borrower to delete an accepted item.

Recommended SQL/RPC design:

- Prefer adding a new RPC variant or carefully replacing `delete_loan` only if the app change is synchronized.
- The RPC should lock the loan row, validate actor, capture safe context, delete, and return:
  - `status`
  - `item_name`
  - `counterpart_user_id`
  - maybe `was_accepted`
- Return context only after authorization succeeds.
- Do not return emails.
- Preserve service-role-only grants.
- Use a transaction for related function/grant changes.

Event behavior:

- Actor/lender may get a read event (`initiallyRead: true`) for history if consistent with current pattern.
- Counterpart gets unread `loan_deleted` event.
- `href` should be a safe list route such as `/auth-mvp/lanad-og-skilad`, not an edit/detail page for a deleted item.
- `/heim` drawer should not show a broken `Skoða` link for deleted items.

Tests:

- lender can delete accepted item
- borrower cannot delete accepted item by direct call
- unrelated user cannot delete
- counterpart receives unread event
- actor event, if created, is already read
- deleted event payload has item name and no email
- list no longer shows deleted item

## SQL / Supabase Rules

For #38 and #39, SQL is likely. Claude Code must:

- Put migrations in `sql/` with the next correct number.
- State whether each migration is schema/function-only or data-changing.
- Use `BEGIN; ... COMMIT;`.
- Use `SET search_path = ''` in new/replaced functions.
- Revoke from `PUBLIC`, `anon`, `authenticated`.
- Grant only to `service_role`.
- Include rollback/recovery notes.
- Not run SQL against Supabase unless Stebbi explicitly approves.

Flag explicitly if any change touches:

- RLS
- auth
- policies
- grants
- service-role functions
- production data
- user data

## TODO / DONE Handling

Do not move #36-#40 to DONE inside implementation unless:

- code is implemented
- tests pass
- Stebbi has had the listed localhost checks available
- Claude Code has handed back to Codex for review
- Codex/Stebbi agree the item is complete

If only part of the package lands, keep unfinished items in TODO and document exactly what remains.

## Required Commands

Run focused tests after each meaningful phase when practical.

Minimum expected commands before handoff back:

```bash
npm run test:run -- lib/__tests__/loan-list.test.tsx lib/__tests__/loans.test.ts lib/__tests__/actions.test.ts lib/__tests__/home-page.test.tsx lib/__tests__/loan-pages.test.tsx
npm run type-check
```

If SQL/static contract tests or shared event behavior are broadened, run:

```bash
npm run test:run
```

## Required Handoff Back From Claude Code

Claude Code should send a post-implementation handoff before commit/deploy.

Include:

- What was actually done per TODO number.
- Files read.
- Files changed.
- SQL migrations created, whether run or not, and Supabase/RLS/auth/grant impact.
- Exact commands and exit codes.
- Remaining risks.
- Any skipped items.
- Localhost checks for Stebbi, updated if behavior changed.
- Questions for Codex review.

## Copy/Paste Instruction For Claude Code

Claude Code, implement this package in phases and stop if #38/#39 require broader SQL/auth behavior than described. Do not run Supabase SQL, commit, push, deploy, or start/restart dev server unless Stebbi explicitly approves.
