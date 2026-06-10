# Codex review: Nýlegt Phase A post-implementation

Related TODOs: #019, #027, #037, #038

Reviewed handoff: `ai-handoff/2026-06-10-1855-todo-019-027-037-038-v039-claude-nylegt-phase-a-post-implementation.md`

Codex verdict: **not ready yet**. The event emission direction is good and the app-only scope is right, but there is one user-visible link bug that should be fixed before Stebbi treats TODO #38 / Phase A as done.

## Findings

### High: accepted/declined invitation events can generate a broken `Skoða` link

Refs:
- `lib/loans/actions.ts:622`
- `lib/loans/actions.ts:625`
- `lib/loans/actions.ts:626`
- `lib/loans/actions.ts:661`
- `lib/loans/actions.ts:664`
- `lib/loans/actions.ts:665`
- `app/auth-mvp/heim/page.tsx:133`
- `app/auth-mvp/heim/page.tsx:137`
- `app/auth-mvp/heim/page.tsx:139`

`loan_invitation_accepted` and `loan_invitation_declined` are recorded with:

- `entityType: 'loan_invitation'`
- `entityId: invitationId`

But `/heim` only special-cases `loan_invitation_received`. For every other non-deleted event with an `entity_id`, the drawer `Skoða` link becomes:

```ts
/auth-mvp/lanad-og-skilad/breyta/${event.entity_id}
```

That means creator-side accepted/declined invitation events can point to `/breyta/{invitationId}` instead of a loan id. This is likely a not-found/broken navigation when Stebbi clicks `Skoða`.

Recommended fix:

- Change `fetchInvitationContext` to return `loanId` as well as `itemName` and `creatorUserId`.
- For `loan_invitation_accepted` and `loan_invitation_declined`, record:
  - `entityType: 'loan'`
  - `entityId: loanId`
  - keep the stable event keys as `loans:invitation:${invitationId}:accepted/declined`.
- Add home-page tests proving the drawer `Skoða` link for both new event types points to `/auth-mvp/lanad-og-skilad/breyta/{loanId}` or whatever final product destination Claude Code chooses.

Codex preference: use the loan id as `entityId`, because the creator wants to inspect the loan after the recipient accepted/declined.

### Medium: do not mark #40 as affected/fixed by this pass

Refs:
- `components/loans/LoanList.tsx:87`
- `components/loans/LoanList.tsx:96`
- `components/loans/LoanList.tsx:105`

Claude Code touched `LoanList` for pending-ack sort ordering, which is fine. But the old #40 issue remains: changing the upper status filter still resets the lower role filter via `setRoleFilter(null)`.

This is not a blocker for Phase A, but Stebbi should not treat #40 as solved by this implementation. If #40 is still in the current package, it needs its own deliberate fix and tests.

### Low: tests do not explicitly guard against recipient email leakage

Refs:
- `lib/loans/actions.ts:68`
- `lib/loans/actions.ts:70`
- `lib/__tests__/actions.test.ts:1449`
- `lib/__tests__/actions.test.ts:1530`

The implementation currently reads only `invited_by`, `loan_id`, and `item_name`, so Codex does not see an email leak. Still, because this area touches invitation/user-data boundaries, tests should explicitly assert that event payloads for accepted/declined invitation events contain only safe fields, e.g. `itemName`, and no `recipient_email` / `recipient_email_normalized`.

This can be added while fixing the high finding.

## What Looks Good

- `markReturned` now records events only on exact `ok`, not `already_returned`.
- Return and undo events use the same event key for actor/counterpart rows, which is correct because uniqueness is `(user_id, event_key)`.
- `claimInvitation` and `declineInvitation` ack the recipient's original received event before returning success.
- No SQL changes were made in Phase A, which matches Codex's previous recommendation.
- New event types are clearer than overloading `loan_updated`.

## Tests Run By Codex

```powershell
npm run test:run -- lib/__tests__/actions.test.ts lib/__tests__/home-page.test.tsx lib/__tests__/loan-list.test.tsx
# 3 passed test files
# 161 passed | 5 todo

npm run type-check
# exit 0
```

These pass, but they do not cover the broken `Skoða` link scenario for `loan_invitation_accepted` / `loan_invitation_declined`.

## Required Claude Code Follow-Up

1. Fix accepted/declined invitation events so `Skoða` links to a valid loan destination.
2. Add tests for the new drawer link behavior.
3. Add explicit payload-safety assertions for accepted/declined invitation events.
4. Re-run focused tests and type-check.

Suggested commands:

```powershell
npm run test:run -- lib/__tests__/actions.test.ts lib/__tests__/home-page.test.tsx lib/__tests__/loan-list.test.tsx
npm run type-check
```

No SQL should be needed for this follow-up.

## Localhost Checks For Stebbi

After Claude Code fixes the finding:

1. User A creates a loan and sends an invitation to User B.
2. User B clicks `Þekki málið`.
3. User A opens `/auth-mvp/heim` and sees `Lánaboð samþykkt: [item]`.
4. User A opens the event drawer and clicks `Skoða`.
5. Confirm the link opens the correct loan, not a 404 or an edit route using the invitation id.
6. Repeat with a fresh invitation where User B clicks `Kannast ekki við þetta`.
7. User A sees `Lánaboði hafnað: [item]`.
8. User A clicks `Skoða` and lands on a valid loan destination.
9. User B no longer sees the original invitation received event as unread after accept/decline.
10. On an accepted two-party loan, User A marks returned and User B receives exactly one unread returned event.
11. Retry/double-click returned and confirm User B does not get a duplicate unread event.
12. User A undoes return and User B receives one unread undo event.
13. Confirm no event label, drawer detail, or payload-visible UI includes an email address.
14. Confirm mobile 360-460px renders the new event labels and drawer buttons without overflow.

