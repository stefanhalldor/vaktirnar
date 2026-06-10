# TODO #27 - Post-implementation handoff: soft acknowledgement loan flow

Handoff from Claude Code to Codex for review before commit/deploy.

## Plan Actually Followed

All 7 phases from the Codex handoff `2026-06-10-1704-todo-027-v019-codex-soft-ack-final-handoff.md` were implemented.

### Phase 1 - SQL migration (written, not applied)
`sql/50_loan_soft_acknowledgement.sql` — replaces `get_my_loans` with a UNION ALL that includes Branch 2 for pending recipient rows matched by email.

### Phase 2 - Types and control logic
`lib/loans/types.ts` — already updated in prior session (requires_acknowledgement, canAcknowledge, canDeclineAcknowledgement). Confirmed in place.

### Phase 3 - Loan list page
`app/auth-mvp/lanad-og-skilad/page.tsx` — removed `get_my_pending_invitations` call and `PendingInvitationCard` section. Now a single `get_my_loans` call drives the page.

### Phase 4 - Loan card UI
`components/loans/LoanCard.tsx` — added acknowledge/decline handlers and buttons. Header subtext shows `Ný skráning frá {name}` for `requires_acknowledgement` rows.

### Phase 5 - Nýlegt integration
`lib/loans/actions.ts` — `claimInvitation` and `declineInvitation` now call `ackRecentEventByKey` on success to ack the received event.
`app/auth-mvp/heim/page.tsx` — `viewHref` for `loan_invitation_received` now points to `/auth-mvp/lanad-og-skilad?invitation={invitationId}` instead of `/claim/{invitationId}`.

### Phase 6 - Claim page copy
`components/loans/ClaimForm.tsx` — buttons updated to use `acknowledge` / `declineAcknowledgement` keys.

### Phase 7 - Messages
`messages/is.json` and `messages/en.json` — added `acknowledge`, `declineAcknowledgement`, `newEntryFrom`.

### Bonus - Copy change (Stebbi approved inline)
`messages/is.json` — `recentDone` changed from "Þú getur slakað á..." to "Njóttu lífsins með allt í Teskeið..."

## Files Read

- `ai-handoff/2026-06-10-1704-todo-027-v019-codex-soft-ack-final-handoff.md`
- `lib/loans/actions.ts`
- `lib/loans/types.ts`
- `lib/recent-events/helpers.server.ts`
- `sql/50_loan_soft_acknowledgement.sql`
- `app/auth-mvp/lanad-og-skilad/page.tsx`
- `app/auth-mvp/heim/page.tsx`
- `components/loans/LoanCard.tsx`
- `components/loans/ClaimForm.tsx`
- `app/auth-mvp/lanad-og-skilad/claim/[id]/page.tsx`
- `messages/is.json`, `messages/en.json`
- All affected test files

## Files Changed

| File | Change |
|------|--------|
| `sql/50_loan_soft_acknowledgement.sql` | Written (not applied) |
| `lib/loans/types.ts` | `requires_acknowledgement`, `canAcknowledge`, `canDeclineAcknowledgement` (prior session) |
| `lib/recent-events/helpers.server.ts` | Added `ackRecentEventByKey` (prior session) |
| `lib/loans/actions.ts` | Import `ackRecentEventByKey`; call in `claimInvitation` + `declineInvitation` on success |
| `app/auth-mvp/lanad-og-skilad/page.tsx` | Removed `get_my_pending_invitations` + `PendingInvitationCard` |
| `app/auth-mvp/heim/page.tsx` | `viewHref` for invitation -> `?invitation=` |
| `components/loans/LoanCard.tsx` | Acknowledge/decline buttons + `newEntryFrom` header |
| `components/loans/ClaimForm.tsx` | Button copy -> `acknowledge` / `declineAcknowledgement` |
| `messages/is.json` | Added 3 keys + `recentDone` copy change |
| `messages/en.json` | Added 3 keys |
| `lib/__tests__/loans.test.ts` | Updated `ControlItem` type, `BASE`, new describe blocks for pending recipient controls |
| `lib/__tests__/loan-pages.test.tsx` | Added `requires_acknowledgement` to `ITEM_BASE`, added "no PendingInvitationCard" test |
| `lib/__tests__/actions.test.ts` | Added `ackRecentEventByKey` to mock, added claim/decline ack tests |
| `lib/__tests__/home-page.test.tsx` | Updated viewHref test + copy change |
| `lib/__tests__/sql-migration.test.ts` | Added sql/50 static checks |
| `lib/__tests__/loan-list.test.tsx` | Added `requires_acknowledgement: false` to fixture |
| `lib/__tests__/recent-read.test.ts` | Added `requires_acknowledgement: false` to fixture |

## SQL Migration — Risk Summary

**File:** `sql/50_loan_soft_acknowledgement.sql`
**Status:** Written, NOT applied. Stebbi applies to Supabase after Codex review approves.

**What it does:**
- Replaces `public.get_my_loans(p_actor_id uuid)` via `CREATE OR REPLACE FUNCTION`
- Adds one new return column: `requires_acknowledgement boolean`
- Branch 1 (existing): rows where actor is lender or borrower. Returns `requires_acknowledgement = false`. Logic unchanged.
- Branch 2 (new): rows where `loan_invitations.recipient_email_normalized = lower(trim(actor email))` AND `status = 'pending'` AND actor is not yet lender/borrower. Returns `requires_acknowledgement = true`.

**Schema changes:** None. No new tables, no column additions, no data migration.

**Security maintained:**
- `SET search_path = ''` preserved
- `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` preserved
- `GRANT EXECUTE TO service_role` only
- `recipient_email_normalized` not exposed in SELECT column list
- Branch 2 only returns rows for the calling actor's email

**Rollback:** Redeploy prior app version first (it doesn't know `requires_acknowledgement`), then run prior `get_my_loans` function body. No data loss.

**No other SQL files touched.** `sql/49_raise_invitation_rate_limits.sql` was a separate migration from the prior session; Stebbi applies both in order: 49 first, then 50.

## Effects on Supabase / RLS / Auth / Grants / Production Data

- No RLS changes
- No new tables or columns
- No user data migration
- No new grants beyond what exists
- `recent_events` table already exists and `ackRecentEventByKey` already existed in the helper (added in prior session)
- Only `get_my_loans` RPC body changes; all callers already pass `p_actor_id` and handle the result as `LoanItem[]`

## Commands Run and Exit Codes

```
npm run test:run -- lib/__tests__/loans.test.ts lib/__tests__/loan-pages.test.tsx lib/__tests__/actions.test.ts lib/__tests__/home-page.test.tsx lib/__tests__/sql-migration.test.ts
# exit 0 — 299 passed, 22 skipped, 5 todo

npm run test:run
# exit 0 — 1032 passed, 22 skipped, 8 todo (37 test files)

npm run type-check
# exit 0 — no errors
```

## What Was NOT Done

- `#38` (creator event when recipient declines) — out of scope per handoff
- SQL not applied to Supabase — Stebbi applies after review
- No commit or push — waiting for Codex review
- `/auth-mvp/lanad-og-skilad?invitation=<id>` query param is not yet consumed by the loan list page to scroll/focus the relevant card. The URL is correct and the page loads with the pending card in the list, but no auto-scroll or highlight was implemented. This is a possible follow-up (TODO #40 or similar).
- Email deep links (`/claim/[id]`) still work unchanged for existing emails in flight.

## Remaining Risks

1. **SQL/50 not applied yet.** Until applied, the app code that reads `requires_acknowledgement` from `get_my_loans` will receive `undefined` (TypeScript says `boolean`, runtime gets `undefined`). The `getLoanCardControls` function uses `requires_acknowledgement` to derive `canAcknowledge`. With `undefined`, `isPendingRecipient = undefined` (falsy), so all existing rows continue to behave as before — no breakage, but the new feature is inactive until sql/50 is applied.

2. **`?invitation=` query param is unhandled.** The loan list page ignores unknown query params. The Nýlegt `Skoða` link navigates to the page with the pending card visible in the list, but does not scroll/focus it. This is acceptable for the first release of the feature.

3. **Pending recipient card in the list before sql/50 is applied.** Until sql/50 is applied, `get_my_loans` does not return Branch 2 rows, so a pending recipient sees no card in the list. The `Nýlegt` event (from sql/46 + prior session) already exists for the recipient. The flow is:
   - Before sql/50: invitation visible only in old `/claim/[id]` page
   - After sql/50: invitation appears in the loan list natively

4. **`PendingInvitationCard` component still exists in the codebase.** It is no longer used by the loan list page but is still imported in tests (via mock). If Codex wants to remove it cleanly, that is a follow-up task.

## Localhost Checks for Stebbi

All checks from `v019` still apply. In addition:

**Pre-condition:** Apply `sql/50` in Supabase first.

### Check A — Pending item appears in loan list (not only in old pending section)
- User A invites User B
- User B opens `/auth-mvp/lanad-og-skilad`
- Expected: item appears in normal loan list with "Ný skráning frá {name}" subtext and `Þekki málið` / `Kannast ekki við þetta` buttons

### Check B — No separate "Lánaboð" header section
- The old "Lánaboð" section with `PendingInvitationCard` no longer appears
- The pending item is in the main `LoanList`

### Check C — Þekki málið accepts
- User B clicks `Þekki málið`
- Item remains in list, changes to accepted state, buttons disappear
- Nýlegt no longer shows an unread invitation event for the same invitation after refresh

### Check D — Kannast ekki við þetta declines
- User B clicks `Kannast ekki við þetta`
- Item disappears from list
- Nýlegt no longer shows an unread invitation event for that invitation after refresh

### Check E — Nýlegt Skoða link
- User B sees unread invitation event in Nýlegt drawer
- Clicking `Skoða` navigates to `/auth-mvp/lanad-og-skilad?invitation=<id>` (not `/claim/[id]`)
- Pending item is visible in the list

### Check F — recentDone copy
- With no unread events, Nýlegt shows "Njóttu lífsins með allt í Teskeið..."

### Check G — Old claim page still works
- Navigating to `/auth-mvp/lanad-og-skilad/claim/<id>` still shows the claim UI with updated button copy (`Þekki málið` / `Kannast ekki við þetta`)

### Check H — Mobile layout (360-460 px)
- Pending card buttons do not overflow
- `Þekki málið` / `Kannast ekki við þetta` are readable and tappable

## Questions for Codex Review

1. **sql/50 UNION ALL ordering:** Branch 2 rows are included in the `ORDER BY loaned_at DESC` that already exists at the end. Pending recipient rows sort by their `loan_items.loaned_at`. Is this the desired sort position (mixed in chronologically with accepted loans)?

2. **`?invitation=` focus/scroll:** Is auto-scrolling to the relevant pending card in scope for this release, or should it be a follow-up?

3. **`PendingInvitationCard` cleanup:** The component is now unused by the page. Should it be deleted in this PR, or in a follow-up cleanup PR?

4. **Badge on home page:** The Teskeiðar badge count (`pendingCount`) still comes from `get_my_pending_invitations` on the home page, not from `get_my_loans`. After sql/50 the loan list is the source of truth, but the badge has not been migrated. Is this acceptable for now?

5. **`void ackRecentEventByKey(...)` pattern:** Best-effort ack is called with `void` to avoid blocking the action return. If the ack fails silently, the event remains unread but the loan action succeeded. This matches the existing best-effort pattern for `recordRecentEvent`. Is this acceptable?
