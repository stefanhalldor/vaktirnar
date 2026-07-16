# TODO-061/038 v004 - Codex handoff - verify current state and close if confirmed

Created: 2026-07-08 17:55
Timezone: Atlantic/Reykjavik
Author: Codex
Status: Next priority after closing #68. This looks possibly already implemented in code; Claude Code should verify before doing any new implementation.

## Why this is next

Stebbi could not reproduce TODO #68 on a real phone, so #68 was moved from `TODO.md` to `DONE.md` without code changes.

The next item in the priority table is now:

- `#61 Aðila-flæði birtist í sögu hlutar`
- with linked sub-item `#38 Event þegar lánaboði er hafnað`

There is already an older handoff/review loop:

- `ai-handoff/2026-06-28-2326-todo-061-038-v001-codex-party-events-handoff.md`
- `ai-handoff/2026-06-28-2348-todo-061-038-v002-claude-prerelease-handoff.md`
- `ai-handoff/2026-06-28-2353-todo-061-038-v003-codex-prerelease-review.md`

The important thing now is not to redo that work blindly. Current code appears to contain the v003 requested fix.

## Current code evidence from Codex scan

Codex searched current workspace for the #61/#38 event types.

Findings:

- `lib/loans/actions.ts` contains `loan_party_added`.
- `loan_party_added` event key appears to be stable:
  - `loans:loan:${loanId}:party-added:${row.invitation_id}`
- `loan_party_added` uses `updateOnConflict: false`, which was the v003 Codex minor finding.
- `claimInvitation` appears to emit `loan_invitation_accepted`.
- `declineInvitation` appears to emit `loan_invitation_declined`.
- `lib/recent-events/types.ts` includes:
  - `loan_invitation_accepted`
  - `loan_invitation_declined`
  - `loan_party_added`
- `lib/recent-events/display.ts` maps all three event types.
- `lib/__tests__/actions.test.ts` includes tests for:
  - `records loan_party_added event with loan scope after success`
  - `loan_party_added payload does not include recipient email`
  - `claimInvitation — creator receives loan_invitation_accepted`
  - `declineInvitation — creator receives loan_invitation_declined`
- `lib/__tests__/history-server.test.ts` includes tests for:
  - `loan_party_added`
  - `loan_invitation_accepted`
  - `loan_invitation_declined`

This strongly suggests #61/#38 may already be functionally done but not moved to DONE.

## Task for Claude Code

Do a focused verification/closeout pass, not a broad implementation.

1. Read the old v001-v003 handoffs.
2. Inspect the current code around:
   - `lib/loans/actions.ts`
   - `lib/recent-events/types.ts`
   - `lib/recent-events/display.ts`
   - `lib/loans/history.server.ts`
   - `lib/__tests__/actions.test.ts`
   - `lib/__tests__/history-server.test.ts`
   - `messages/is.json`
   - `messages/en.json`
3. Confirm whether v003's only finding is resolved:
   - `loan_party_added` has stable event key.
   - `loan_party_added` has `updateOnConflict: false`.
   - no timestamp fallback undermines idempotency.
4. Confirm payload privacy:
   - no raw recipient email in `loan_party_added`, accepted or declined payload shown to client.
   - no new logs that include raw recipient email/user IDs unnecessarily.
5. Confirm history visibility:
   - event rows are loan-scoped: `source='loans'`, `entity_type='loan'`, `entity_id=loanId`.
   - actor is stored via `actorUserId`, not inferred from `recent_events.user_id`.
6. Run verification commands.
7. If everything is confirmed, produce a closeout handoff recommending moving #61 and #38 to DONE.

## Do not do

- Do not add a second set of duplicate event types.
- Do not add SQL unless verification proves current history RPC cannot display these rows.
- Do not change RLS/grants/auth.
- Do not log or expose recipient emails.
- Do not touch unrelated loan flows (#39/#59/#63/etc.).
- Do not commit, push, deploy or run SQL without explicit Stebbi approval.

## Suggested commands

```bash
npm run type-check
npm run test:run -- lib/__tests__/actions.test.ts lib/__tests__/history-server.test.ts
```

If targeted tests pass and this is headed to DONE, also run the full suite if time is reasonable:

```bash
npm run test:run
```

Use `git diff --check` before handoff.

## Expected outcome if current code is valid

Claude Code should write a v005 closeout/review handoff saying:

- #61 is complete: party-added / invitation accepted / invitation declined events are loan-scoped and history-readable.
- #38 is complete as part of #61: sender receives decline event and history label exists.
- Tests/type-check pass.
- No SQL or production changes were required in this closeout pass unless already done earlier.
- TODO can move #61 and #38 to DONE after Stebbi's localhost confirmation.

## Localhost checks for Stebbi

Use localhost with test users/test emails only.

1. Log in as a user who can use `Lánað og skilað`.
2. Create a loan item without a counterparty.
3. Add a counterparty/invitation.
4. Open the loan detail page.
5. Expected:
   - `Saga hlutarins` shows `Aðila bætt við` or equivalent party-added event.
   - The event does not show the recipient email.
   - Actor line says who performed the action where actor data exists.
6. As the recipient/test user, accept the invitation with `Þekki málið`.
7. Expected:
   - history shows invitation accepted / `Þekkti málið` context.
   - sender gets the intended `Ólesið`/recent event if that is part of the flow.
8. Create another test invitation and reject it with `Kannast ekki við þetta`.
9. Expected:
   - sender gets an unread/recent decline event.
   - history shows the decline event for users who still have access.
   - recipient email is not visible in labels, payload-derived UI, or logs.
   - recipient does not keep an actionable unread invitation after rejecting.
10. Refresh the detail page.
11. Expected:
   - events do not duplicate.
   - event order remains stable.
12. Check mobile widths 360, 390 and 460 px.
13. Expected:
   - history labels wrap cleanly.
   - no horizontal overflow.
   - actor/timestamp metadata remains readable.

Do not test this casually on important production loans because event rows are persistent history.

## If verification fails

If any part is not actually done, Claude Code should not patch broadly from memory. Instead:

1. Record the exact missing piece.
2. Patch only that piece.
3. Add/adjust the narrow regression test.
4. Return a handoff with commands and localhost checks.
