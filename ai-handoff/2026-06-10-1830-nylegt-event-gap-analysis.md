# Nýlegt event gap analysis

Date: 2026-06-10
Reported: Stebbi notað that events are rarely appearing in Nýlegt.

## Root cause

There are two compounding reasons events rarely appear:

### Reason 1: Own events are immediately read (initiallyRead: true)

All actions performed by the actor emit an event with `initiallyRead: true`, which sets `ack_at = occurred_at` at insert time. Since `getUnreadRecentEventsForUser` only fetches rows where `ack_at IS NULL`, the actor never sees their own events in Nýlegt.

This is intentional by design — Stebbi explicitly requested it after seeing own events appear as unread. However, this means the only way Nýlegt has anything to show is if events come from someone else's actions against a shared loan.

### Reason 2: Most actions do NOT emit a counterpart event

When User A acts on a shared loan, User B (the counterpart) only receives an event in a small number of cases. The current coverage:

| Action | Actor event | Counterpart event |
|--------|-------------|-------------------|
| `createLoan` | `loan_created` (initiallyRead) | None |
| `updateLoan` (dates + name) | `loan_updated` (initiallyRead) | **None** |
| `updateLoanItemDetails` (name + note only) | `loan_updated` (initiallyRead) | `loan_updated` (unread) ✓ |
| `markReturned` | `loan_returned` (initiallyRead) | **None** |
| `undoReturn` | `loan_return_undone` (initiallyRead) | **None** |
| `deleteLoan` | `loan_deleted` (initiallyRead) | **None** |
| `sendInvitationEmail` / `createLoan` with invite | `loan_invitation_received` for recipient (unread) ✓ | — |
| `claimInvitation` (Þekki málið) | None | **Creator gets nothing** |
| `declineInvitation` (Kannast ekki við þetta) | None | **Creator gets nothing** (#38) |

Only `updateLoanItemDetails` and `performInvitationSend` currently emit counterpart events.

In practice, the loan flow for a two-party loan looks like:
1. A creates loan → A's own `loan_created` is immediately read → B gets `loan_invitation_received` only if A sends the invitation ✓
2. B claims (Þekki málið) → no event for A
3. Either party marks returned → only the actor's own `loan_returned` is immediately read
4. Either party edits item name/note → counterpart gets `loan_updated` ✓
5. A edits dates via `updateLoan` → only A's own event, B gets nothing

So in a typical two-party loan lifecycle, User B sees exactly one event (the invitation), and User A sees zero events unless B edits item details.

## What should be added

Listed from highest to lowest impact:

### High impact

**A: `markReturned` — counterpart gets `loan_returned`**
When User A marks the loan returned, User B should see it in Nýlegt.

Complexity: medium. The `mark_returned` RPC returns only a string (`'ok'`). The app would need the counterpart user ID. Two options:
- Option 1: Add a follow-up query to `loan_items` for `lender_user_id`/`borrower_user_id` after success (app-only change, same pattern as `fetchLoanItemName`).
- Option 2: Update the `mark_returned` RPC to return the counterpart user ID.

Option 1 is safe and requires no SQL change.

**B: `claimInvitation` — creator gets `loan_invitation_accepted` (new event type)**
When User B clicks `Þekki málið`, User A (the creator/sender) currently gets no notification. This is the most natural Nýlegt event: "Jón samþykkti lánið fyrir Borvél."

Complexity: medium. Requires:
- New event type: `loan_invitation_accepted` (or reuse a generic type)
- App query for creator user ID from `loan_invitations.invited_by` after successful claim
- New message keys in `is.json` / `en.json`
- New entry in `EVENT_TYPE_TO_KEY`
- SQL: none needed

### Medium impact

**C: `undoReturn` — counterpart gets `loan_return_undone`**
Same pattern as `markReturned`. Same app-only fix approach.

**D: `updateLoan` (full edit) — counterpart gets `loan_updated`**
When A edits dates or name via the full edit form, B doesn't see it. `updateLoanItemDetails` already handles the narrow edit + counterpart.

Complexity: medium. The `update_loan_with_diff` RPC returns `status`, `before_item_name`, `before_loaned_at`, `before_due_at` but NOT `counterpart_user_id`. Options:
- Option 1: Update `update_loan_with_diff` SQL to also return `counterpart_user_id` (small SQL change).
- Option 2: Add a follow-up query to `loan_items`.

Option 1 is cleaner and consistent with how `update_loan_item_details_with_diff` works.

### Lower impact / out of scope

**E: `deleteLoan` — counterpart event** (if both parties are joined)
Currently creator-only. After deletion, the counterpart's loan_item row also disappears. Notifying them before the item vanishes would be useful but requires care (the item ID is gone, so the event href points to a missing page).

**F: `declineInvitation` — creator gets declined notification**
This is TODO #38. Out of scope here.

**G: `createLoan` — no visible event for anyone**
A creates a loan (no invitation). A's own `loan_created` is immediately read, nobody else is on the loan yet. Nothing appears in Nýlegt. This is arguably correct.

## Proposed implementation approach

### Phase A (app-only, no SQL): items A + B + C

These can be done in a single pass with only `lib/loans/actions.ts`, messages, types, and tests changed.

For A (markReturned counterpart) and C (undoReturn counterpart):
- Extend `fetchLoanItemName` (or add a new helper) to also return `lender_user_id` and `borrower_user_id`
- After a successful return/undo, identify the counterpart and emit the event

For B (claimInvitation creator event):
- After successful `claimInvitation`, query `loan_invitations` for `invited_by` and emit `loan_invitation_accepted` for that user
- New event type + message key needed

### Phase B (requires SQL): item D

- Update `update_loan_with_diff` to return `counterpart_user_id` (same as `update_loan_item_details_with_diff`)
- Update `updateLoan` in `actions.ts` to emit counterpart event when there are changes

## Questions for Codex

1. Should `loan_invitation_accepted` be a distinct event type, or is it acceptable to reuse `loan_updated` with a clear payload? A distinct type is cleaner for future translation and UI differentiation.

2. For `markReturned` counterpart: the actor's event uses a timestamp-based key (`returned:${timestamp}`). Should the counterpart use the same key (shared, one upsert row) or a different key (two rows, one per user)? Two separate rows allow independent ack per user, which seems correct.

3. Is phase B (SQL for `updateLoan` counterpart) in scope for the same release as phase A, or should it be a follow-up TODO?

4. Should `deleteLoan` emit a counterpart event? The item disappears, so the `viewHref` would point to a 404. This needs product decision from Stebbi.

## Files that would change in phase A

- `lib/loans/actions.ts` — `markReturned`, `undoReturn`, `claimInvitation`
- `lib/recent-events/types.ts` — add `loan_invitation_accepted`
- `app/auth-mvp/heim/page.tsx` — add to `EVENT_TYPE_TO_KEY`
- `messages/is.json` + `messages/en.json` — add `eventLoanInvitationAccepted`
- `lib/__tests__/actions.test.ts` — new tests for counterpart events
- `lib/__tests__/home-page.test.tsx` — new event type render test

## Files that would change in phase B (SQL)

- `sql/51_update_loan_with_diff_counterpart.sql` — new migration
- `lib/loans/actions.ts` — `updateLoan` counterpart emit
- Tests for the new behavior
