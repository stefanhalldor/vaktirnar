# TODO #019/#027/#037/#038 — Phase A fixes post Codex v040 review

Related TODOs: #019, #027, #037, #038
Reviewed: `ai-handoff/2026-06-10-1900-todo-019-027-037-038-v040-codex-nylegt-phase-a-post-review.md`

Codex found one high and one low finding. Both are fixed.

## What was fixed

### High: accepted/declined invitation events now use loan entityId

Codex finding: `loan_invitation_accepted` and `loan_invitation_declined` were
recorded with `entityType: 'loan_invitation'` and `entityId: invitationId`.
The home page builds `Skoða` links as `/breyta/${entityId}` for all non-deleted,
non-`loan_invitation_received` events, so those links resolved to
`/breyta/{invitationId}` — a 404.

Fix:

- `InvitationContext` type now includes `loanId: string | null`
- `fetchInvitationContext` returns `loanId` from `loan_invitations.loan_id`
- Both `claimInvitation` and `declineInvitation` now record:
  - `entityType: 'loan'`
  - `entityId: loanId`
  - Event key unchanged: `loans:invitation:${invitationId}:accepted/declined`

The `Skoða` link for both new event types now resolves to
`/auth-mvp/lanad-og-skilad/breyta/{loanId}`, which is the valid edit page for
the loan the invitation was for.

### Low: payload safety assertions added

Both invitation creator event tests now explicitly assert that the emitted
payload does not contain `recipient_email` or `recipient_email_normalized`.

## Files changed in this pass

| File | Change |
|------|--------|
| `lib/loans/actions.ts` | `InvitationContext.loanId` field; `fetchInvitationContext` returns `loanId`; `claimInvitation` + `declineInvitation` use `entityType: 'loan'` + `entityId: loanId` |
| `lib/__tests__/actions.test.ts` | Updated `claimInvitation` and `declineInvitation` tests: assert `entityType`, `entityId`, and payload safety |
| `lib/__tests__/home-page.test.tsx` | Two new drawer `Skoða` link tests for `loan_invitation_accepted` and `loan_invitation_declined` |

## Test results

```
npm run test:run -- lib/__tests__/actions.test.ts lib/__tests__/home-page.test.tsx lib/__tests__/loan-list.test.tsx
# 3 passed test files
# 163 passed | 5 todo

npm run type-check
# exit 0
```

## What is NOT done (confirmed out of scope)

- **#40 filter state independence:** Codex confirmed the `setRoleFilter(null)`
  reset on status-filter change is still present in `LoanList.tsx`. This is
  a known issue and needs its own deliberate fix. It was not introduced by this
  pass and is not part of Phase A scope.

- **Phase B (`updateLoan` counterpart):** Awaiting product decision from Stebbi
  on whether full edits are allowed after the other party accepts.

- **#39 (`deleteLoan` counterpart):** Out of scope. Awaiting product decision on
  delete permissions and 404 destination for deleted-item events.

## Full Phase A summary (both passes combined)

Everything implemented is app-only — no SQL changes in either pass.

Changes across `lib/loans/actions.ts`:
- Replaced `fetchLoanItemName` with `fetchLoanEventContext` (returns
  `itemName`, `lenderUserId`, `borrowerUserId`)
- Added `fetchInvitationContext` (returns `itemName`, `loanId`,
  `creatorUserId`)
- `markReturned`: events only on `ok` (not `already_returned`); counterpart
  gets `loan_returned` unread with same eventKey
- `undoReturn`: counterpart gets `loan_return_undone` unread
- `claimInvitation`: creator gets `loan_invitation_accepted` with `entityId =
  loanId`
- `declineInvitation`: creator gets `loan_invitation_declined` with `entityId =
  loanId`

Other files:
- `lib/recent-events/types.ts`: two new event types
- `app/auth-mvp/heim/page.tsx`: two new `EVENT_TYPE_TO_KEY` entries
- `messages/is.json` / `en.json`: two new message keys
- `components/loans/LoanList.tsx`: pending-ack rows sort to top (Nýjast) /
  bottom (Elst)

## Localhost checks for Stebbi

1. User A creates a loan and sends an invitation to User B.
2. User B opens the loan list. Pending item is at the top (Nýjast) or bottom
   (Elst).
3. User B clicks `Þekki málið`.
4. User A opens `/auth-mvp/heim`. Unread event "Lánaboð samþykkt: [item]"
   appears in Nýlegt.
5. User A opens the drawer and clicks `Skoða`. Confirm it opens
   `/auth-mvp/lanad-og-skilad/breyta/{loanId}`, not a 404.
6. User B no longer sees the original received event as unread.
7. Repeat with a fresh invitation. User B clicks `Kannast ekki við þetta`.
8. User A sees "Lánaboði hafnað: [item]" in Nýlegt. `Skoða` opens the correct
   loan.
9. With an accepted two-party loan, User A marks it returned.
10. User B sees "Skilað: [item]" as an unread event in Nýlegt.
11. Retry returned (double-click). User B gets no duplicate unread event.
12. User A undoes return. User B sees "Skilað afturkallað: [item]".
13. Confirm no event label, drawer copy, or payload-visible UI contains an
    email address.
14. Mobile 360-460px: new event labels and drawer `Skoða` button render without
    overflow.
