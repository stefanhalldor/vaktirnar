# Codex handoff: `Ólesið` view-link 404 bugfix

Related TODOs: #019, #037

Requested by Stebbi: A counterpart received a `loan_updated` event after a note/comment changed. Clicking the item from `Nýlegt` led to a 404. Stebbi also wants the section renamed from `Nýlegt` to `Ólesið`.

Codex role: planning/review handoff for Claude Code. Claude Code should review this critically and then implement the scoped bugfix if the plan still looks right after reading the code.

## Root Cause

Refs:
- `app/auth-mvp/heim/page.tsx:133`
- `app/auth-mvp/heim/page.tsx:137`
- `app/auth-mvp/heim/page.tsx:139`
- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx:47`
- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx:49`

`/heim` currently builds `Skoða` links like this:

- `loan_invitation_received` -> `/auth-mvp/lanad-og-skilad?invitation={invitationId}`
- all other non-deleted events -> `/auth-mvp/lanad-og-skilad/breyta/{entityId}`

That is unsafe because `/breyta/[id]` is an edit route, not a read-only detail route. It calls `getLoanCardControls(item)` and returns `notFound()` when the current user cannot edit item details.

For example, when a lender changes a note and the borrower receives a `loan_updated` event, the borrower can see the loan/event but may not have edit access. Clicking `Skoða` therefore lands on 404.

Do **not** fix this by loosening edit-route permissions. The edit route should stay permission-gated.

## Required Fix

### 1. Make unread event `Skoða` links permission-safe

Change `/heim` event link construction so generic loan events do not point at `/breyta/[id]`.

Recommended behavior:

- `loan_invitation_received`: keep `/auth-mvp/lanad-og-skilad?invitation={invitationId}`
- `loan_deleted`: keep `viewHref = null`
- all other loan events with a loan `entity_id`: use the loan list, for example:
  - `/auth-mvp/lanad-og-skilad?loan={loanId}`
  - or `/auth-mvp/lanad-og-skilad?loan={loanId}&status=all` if Claude Code also wires this into `LoanList`

Codex preference: route all non-deleted loan events to the list for now. A read-only loan detail route can be a future feature, but it is not needed for this bugfix.

If Claude Code wants a more complete small fix, add optional `?loan=` handling in the loan list:

- make the linked loan visible even if returned, ideally by opening `Allt`/all status when `?loan=` is present;
- optionally add a subtle highlight ring to the matching card;
- keep this small and tested.

If that starts spreading across components, skip highlight for now and just remove the 404 by linking to the list.

### 2. Rename visible `Nýlegt` section to `Ólesið`

Change user-facing copy:

- `messages/is.json`: `teskeid.home.recent` from `Nýlegt` to `Ólesið`
- `messages/en.json`: `teskeid.home.recent` from `Recent` to `Unread`

Also consider aligning empty copy:

- Icelandic `noRecent`: prefer something like `Engin ólesin atriði.`
- English `noRecent`: prefer something like `No unread items.`

Do not rename internal identifiers like `recentEvents`, `RecentSection`, `recent_events`, or DB/table names in this bugfix. That would create unnecessary churn.

### 3. Update tests

Expected test changes:

- `lib/__tests__/home-page.test.tsx`
  - mock translation `recent` should be `Ólesið`
  - assertions currently expecting `Nýlegt` should expect `Ólesið`
  - add/regress test for `loan_updated` event:
    - event type `loan_updated`
    - `entity_id = loan-id`
    - drawer `Skoða` link must **not** be `/breyta/{loanId}`
    - expected href should be the chosen loan-list href
  - update existing accepted/declined invitation event link tests if the chosen convention changes from `/breyta/{loanId}` to list route
  - keep `loan_invitation_received` test pointing at `?invitation={invitationId}`
  - keep deleted event test showing no `Skoða`

If Claude Code implements `?loan=` handling/highlight:

- add focused tests in `lib/__tests__/loan-list.test.tsx` or the existing relevant page/list tests.

## Security / Auth Notes

- No SQL should be needed.
- Do not alter RLS, grants, service-role function permissions, or Supabase migrations.
- Do not loosen `/breyta/[id]` authorization to make the link work.
- The bug is a navigation mismatch: event read access does not imply edit access.
- Do not add recipient email or user emails to event payloads, URLs, logs, or UI.

## Suggested Files

Likely files:

- `app/auth-mvp/heim/page.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/home-page.test.tsx`

Possible only if implementing `?loan=` visibility/highlight:

- `app/auth-mvp/lanad-og-skilad/page.tsx`
- `components/loans/LoanList.tsx`
- `lib/__tests__/loan-list.test.tsx`
- `lib/__tests__/loan-pages.test.tsx`

## Suggested Commands

```powershell
npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/loan-list.test.tsx lib/__tests__/loan-pages.test.tsx
npm run type-check
```

If Claude Code touches only `/heim` and messages, `home-page.test.tsx` plus type-check may be enough, but broader focused tests are cheap and safer.

## Localhost Checks For Stebbi

1. User A and User B have an accepted shared loan.
2. User A changes a note/comment or item detail that creates a `loan_updated` event for User B.
3. User B opens `/auth-mvp/heim`.
4. Confirm the section header says `Ólesið`, not `Nýlegt`.
5. User B opens the unread event drawer and clicks `Skoða`.
6. Confirm User B does not land on 404.
7. Confirm the destination is the loan list or another valid non-edit-only destination where the loan context is understandable.
8. Repeat with `loan_returned` and `loan_return_undone` events if available.
9. Confirm `loan_invitation_received` still opens the pending acknowledgement flow/list context.
10. Confirm `loan_deleted` still has no misleading `Skoða` link.
11. Confirm no email address appears in event labels, drawer details, URLs, or visible UI.
12. Check mobile 360-460px: `Ólesið`, event labels, drawer, and `Skoða` button do not overflow.

## Questions For Claude Code To Answer In Handoff Back

1. Did Claude Code keep `/breyta/[id]` permissions unchanged?
2. Which final href convention did Claude Code choose for generic loan events: base list, `?loan=...`, or `?loan=...&status=all`?
3. If `?loan=` was added, does the list actually make the linked row visible/highlighted?
4. Which tests prove `loan_updated` no longer links to a 404-prone edit route?

