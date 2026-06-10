# Codex review: Nýlegt Phase A fixes approval

Related TODOs: #019, #027, #037, #038

Reviewed handoff: `ai-handoff/2026-06-10-1905-todo-019-027-037-038-v041-claude-nylegt-phase-a-fixes-post-review.md`

Codex verdict: **approved for Stebbi localhost testing**. The v040 blocker is fixed, no SQL was added, and focused tests plus type-check pass.

## Findings

### No blocking findings

Refs:
- `lib/loans/actions.ts:58`
- `lib/loans/actions.ts:83`
- `lib/loans/actions.ts:624`
- `lib/loans/actions.ts:628`
- `lib/loans/actions.ts:663`
- `lib/loans/actions.ts:667`
- `lib/__tests__/home-page.test.tsx:735`
- `lib/__tests__/home-page.test.tsx:746`

Claude Code fixed the broken `Skoða` link risk from v040. `fetchInvitationContext` now returns `loanId`, and `loan_invitation_accepted` / `loan_invitation_declined` events are recorded as loan events with `entityId = loanId`.

The drawer tests now prove:

- accepted invitation event links to `/auth-mvp/lanad-og-skilad/breyta/{loanId}`;
- declined invitation event links to `/auth-mvp/lanad-og-skilad/breyta/{loanId}`;
- the original `loan_invitation_received` event still links to the loan list with `?invitation=...`.

### Residual note: #40 is still open

Refs:
- `components/loans/LoanList.tsx:87`
- `components/loans/LoanList.tsx:96`
- `components/loans/LoanList.tsx:105`

The independent-filter issue is still present because status-filter clicks still call `setRoleFilter(null)`. This was explicitly out of Phase A scope and should remain a separate #40 follow-up.

## What Looks Good

- No SQL changes were introduced in this Phase A follow-up.
- Invitation accepted/declined events no longer use invitation ids as loan edit route ids.
- Payload safety assertions now check that `recipient_email` and `recipient_email_normalized` are absent.
- The original recipient-side invitation event is still acked after accept/decline.
- `markReturned` no longer records events for the `already_returned` no-op case.

## Tests Run By Codex

```powershell
npm run test:run -- lib/__tests__/actions.test.ts lib/__tests__/home-page.test.tsx lib/__tests__/loan-list.test.tsx
# 3 passed test files
# 163 passed | 5 todo

npm run type-check
# exit 0
```

## Supabase / Production Notes

This Phase A event work is app-only. Codex saw no SQL migration in this pass.

Still, the wider release includes pending SQL 50 from TODO #27. If Stebbi is rolling both together, SQL 50 must still follow its approved rollout order:

1. Apply SQL 50.
2. Reload Supabase/PostgREST schema cache.
3. Deploy app code.
4. Run localhost/staging checks.

Do not mix that up with this Phase A approval; this approval only covers the app-side Nýlegt event fixes.

## Localhost Checks For Stebbi

1. User A creates a loan and sends an invitation to User B.
2. User B opens the loan list. Pending item appears at top for `Nýjast` and bottom for `Elst`.
3. User B clicks `Þekki málið`.
4. User A opens `/auth-mvp/heim` and sees `Lánaboð samþykkt: [item]`.
5. User A opens the event drawer and clicks `Skoða`; it should open the real loan edit page, not a 404.
6. User B no longer sees the original invitation received event as unread.
7. Repeat with a fresh invitation where User B clicks `Kannast ekki við þetta`.
8. User A sees `Lánaboði hafnað: [item]`.
9. User A clicks `Skoða`; it should open the real loan edit page.
10. With an accepted two-party loan, User A marks it returned.
11. User B sees one unread `Skilað: [item]` event.
12. Retry/double-click returned and confirm User B does not get a duplicate unread event.
13. User A undoes return.
14. User B sees one unread `Skilað afturkallað: [item]` event.
15. Confirm no event label, drawer detail, or visible UI includes an email address.
16. Confirm mobile 360-460px renders new event labels and drawer buttons without overflow.

