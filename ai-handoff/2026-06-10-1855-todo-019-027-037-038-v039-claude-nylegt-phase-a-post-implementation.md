# TODO #019/#027/#037/#038 — Nýlegt Phase A post-implementation handoff

Related TODOs: #019, #027, #037, #038
Reviewed plan: `ai-handoff/2026-06-10-1835-todo-019-027-037-038-039-v038-codex-nylegt-event-gap-review.md`

## What was done

All items from Codex Phase A scope are implemented. No SQL changes were made.

### 1. Pending acknowledgement rows sort to top/bottom

`components/loans/LoanList.tsx` — sort comparator now has a primary key before
date comparison:

- `requires_acknowledgement = true` rows float to the **top** when "Nýjast" is
  selected and to the **bottom** when "Elst" is selected.
- All other rows continue to sort by date then by ID as before.

### 2. New event types

`lib/recent-events/types.ts`:
- Added `loan_invitation_accepted`
- Added `loan_invitation_declined`

### 3. New helpers in `lib/loans/actions.ts`

Replaced `fetchLoanItemName` with two narrow helpers:

**`fetchLoanEventContext(admin, loanId)`**
Returns `{ itemName, lenderUserId, borrowerUserId }` from `loan_items`.
Used by `markReturned`, `undoReturn`, and `deleteLoan`.

**`fetchInvitationContext(admin, invitationId)`**
Queries `loan_invitations` for `invited_by` + `loan_id`, then `loan_items` for
`item_name`. Returns `{ itemName, creatorUserId }`. Used by `claimInvitation`
and `declineInvitation`.

### 4. `markReturned` — fixed + counterpart event

- Actor event now only emitted when RPC returns exactly `ok`. The previous
  behaviour emitted an event for `already_returned` too; that is fixed.
- Counterpart event (`loan_returned`, unread) emitted when there is a
  counterpart user. Same `eventKey` as the actor event so both rows are
  independent per `(user_id, event_key)`.

### 5. `undoReturn` — counterpart event

Same pattern as `markReturned`. Counterpart receives `loan_return_undone`
(unread) when actor returns `ok`.

### 6. `claimInvitation` — creator event

After ack and on `ok`, queries `fetchInvitationContext` and emits
`loan_invitation_accepted` for the invitation creator (`invited_by`).
Skipped when `creatorUserId` is null or equals actor.

### 7. `declineInvitation` — creator event

Same pattern. Emits `loan_invitation_declined` for the invitation creator.
This resolves TODO #38.

### 8. `app/auth-mvp/heim/page.tsx` — EVENT_TYPE_TO_KEY

Added:
```ts
loan_invitation_accepted: 'eventLoanInvitationAccepted',
loan_invitation_declined: 'eventLoanInvitationDeclined',
```

### 9. Messages

`messages/is.json`:
- `"eventLoanInvitationAccepted": "Lánaboð samþykkt: {itemName}"`
- `"eventLoanInvitationDeclined": "Lánaboði hafnað: {itemName}"`

`messages/en.json`:
- `"eventLoanInvitationAccepted": "Loan accepted: {itemName}"`
- `"eventLoanInvitationDeclined": "Loan declined: {itemName}"`

## Files changed

| File | Change |
|------|--------|
| `components/loans/LoanList.tsx` | Pending-ack sort to top/bottom |
| `lib/recent-events/types.ts` | Two new event types |
| `lib/loans/actions.ts` | fetchLoanEventContext, fetchInvitationContext, markReturned fix + counterpart, undoReturn counterpart, claimInvitation creator event, declineInvitation creator event |
| `app/auth-mvp/heim/page.tsx` | Two new EVENT_TYPE_TO_KEY entries |
| `messages/is.json` | Two new message keys |
| `messages/en.json` | Two new message keys |
| `lib/__tests__/actions.test.ts` | 10 new test cases (see below) |
| `lib/__tests__/home-page.test.tsx` | Two new translation keys in mock |

## Test results

```
npm run test:run
# 1047 passed | 22 skipped | 8 todo (37 test files)

npm run type-check
# exit 0
```

New test cases added:

- `markReturned — emits actor (initiallyRead) and counterpart events on ok`
- `markReturned — does not emit any events for already_returned`
- `markReturned — does not emit counterpart event when borrower_user_id is null (solo loan)`
- `undoReturn — emits actor and counterpart events on ok`
- `undoReturn — does not emit counterpart event when no counterpart`
- `claimInvitation — emits loan_invitation_accepted for the creator on ok`
- `claimInvitation — does not emit creator event when claim fails`
- `claimInvitation — does not emit creator event when creator equals actor`
- `declineInvitation — emits loan_invitation_declined for the creator on ok`
- `declineInvitation — does not emit creator event when decline fails`

## What is NOT done (out of scope)

- **Phase B (`updateLoan` counterpart):** Codex confirmed this should not be
  bundled. The `update_loan_with_diff` RPC is pre-acceptance only, so adding
  `counterpart_user_id` to it does not solve accepted-loan edit notifications.
  This needs a product decision from Stebbi first.

- **`deleteLoan` counterpart event (#39):** Out of scope. Requires product
  decision about whether lenders may delete accepted loans, and a solution for
  the 404 `viewHref` problem after deletion.

- **Home badge migration:** Badge still uses `get_my_pending_invitations`.
  Follow-up TODO.

- **`?invitation=` scroll/focus:** Follow-up TODO.

## Security notes

- `fetchInvitationContext` queries `loan_invitations.invited_by` (a user UUID)
  and `loan_items.item_name` only. Recipient email is never read or included in
  any event payload.
- Both new event types (`loan_invitation_accepted`, `loan_invitation_declined`)
  are emitted for the invitation creator only, never for third parties.
- All existing service-role-only guards, RLS policies, and grants are unchanged.

## Localhost checks for Stebbi

1. User A creates a loan and sends an invitation to User B.
2. User B opens the loan list. Pending item appears at the top (Nýjast sort) or
   bottom (Elst sort).
3. User B clicks `Þekki málið`.
4. User A opens `/auth-mvp/heim`. An unread event "Lánaboð samþykkt: [item]"
   appears in Nýlegt.
5. User B no longer sees the original `loan_invitation_received` event as unread.
6. Repeat with a fresh invitation. User B clicks `Kannast ekki við þetta`.
7. User A sees "Lánaboði hafnað: [item]" in Nýlegt.
8. User B no longer sees the invitation received event as unread.
9. With an accepted two-party loan, User A marks it returned.
10. User B sees "Skilað: [item]" as an unread event in Nýlegt.
11. Double-click or retry markReturned — confirm User B does NOT get a second
    unread event (already_returned path no longer emits).
12. User A undoes return. User B sees "Skilað afturkallað: [item]" in Nýlegt.
13. Confirm no event text or drawer detail includes any email address.
14. Confirm mobile 360-460px: new event labels render without overflow.
