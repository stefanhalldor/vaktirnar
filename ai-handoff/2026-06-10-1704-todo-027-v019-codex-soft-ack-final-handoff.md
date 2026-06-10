# TODO #27 - Final handoff: soft acknowledgement loan flow

Relevant TODO item: #27 `Mýkra lánaboðsflæði`.

Context update from Stebbi on 2026-06-10: #19 is done. Treat server-side `recent_events` / unread `Nýlegt` as available foundation. Do not re-open #19 inside this work except if Claude Code finds a real regression while implementing #27.

This is a handoff from Codex to Claude Code. Stebbi asked for the handoff to finish #27 and to include Stebbi's localhost/user tests immediately.

## Localhost Checks For Stebbi

These checks are part of acceptance before release. Stebbi runs localhost/dev server. Use test users only and non-sensitive note text.

### 1. Pending invitation appears as a normal loan-list item

Setup:

- User A creates a loan and invites User B by email.
- User B has a Teskeið account with that email.
- User B opens `/auth-mvp/lanad-og-skilad`.

Expected:

- The invited item appears in the normal `Lánað og skilað` list, not only in a separate pending invitation section.
- The item clearly feels like it belongs in User B's list, but it still shows a soft status such as `Ný skráning frá {name}`.
- User B sees the actions `Þekki málið` and `Kannast ekki við þetta`.
- User B does not have to enter the old claim gate first.

### 2. `Þekki málið` accepts the invitation

Action:

- User B clicks `Þekki málið` on the pending item.

Expected:

- The existing `claim_loan_invitation` semantics are used.
- The item remains in User B's normal loan list as an accepted loan.
- `Þekki málið` / `Kannast ekki við þetta` disappear.
- Normal accepted-loan controls appear according to existing rules.
- `/auth-mvp/heim` no longer shows an actionable unread invitation event for that same invitation.

### 3. `Kannast ekki við þetta` declines the invitation

Action:

- User B clicks `Kannast ekki við þetta` on a pending item.

Expected:

- The existing `decline_invitation` semantics are used.
- The item disappears from User B's normal loan list.
- `/auth-mvp/heim` no longer shows an actionable unread invitation event for that same invitation.
- User B does not see the declined item again after refresh.

Note: creator/sender notification for decline is TODO #38 unless Stebbi explicitly approves including #38 in this implementation package.

### 4. `Nýlegt` entry for invitation

Setup:

- User A sends a new invitation to User B.
- User B opens `/auth-mvp/heim`.

Expected:

- User B sees an unread `Nýlegt` event for the invitation.
- Opening the drawer and clicking `Skoða` takes User B to `/auth-mvp/lanad-og-skilad`, ideally focused on or clearly near the pending item.
- It should not send User B primarily into the old `/claim/[id]` mental model unless Claude Code has a clear transitional reason.
- Marking it read removes it from unread `Nýlegt`, and refresh does not bring it back.

### 5. Security checks with third user

Setup:

- User A invites User B.
- User C is an unrelated authenticated user.

Expected:

- User C cannot see the pending item in `Lánað og skilað`.
- User C cannot see User B's invitation event in `Nýlegt`.
- User C cannot accept or decline User B's invitation by direct action/RPC route.
- No recipient email appears in UI, client payload, logs, or event payload.

### 6. Pending edit/return decision checks

Stebbi previously approved in v002 that a pending recipient may edit item name/note and mark returned before pressing `Þekki málið`. This is unusual and has production risk.

Expected if Claude Code implements that approval:

- User B can edit item name and note while the row is pending.
- User B can mark the item returned while the row is pending.
- Both actions still go through server-side authorization, not client-only UI.
- Those actions do not silently turn the invitation into accepted.
- Events do not leak data to unrelated users.

If Claude Code thinks this should be narrowed for safety, stop and hand back that concern before implementation.

### 7. Mobile layout

Check 360-460 px width:

- Pending status text wraps cleanly.
- `Þekki málið` / `Kannast ekki við þetta` buttons do not overflow.
- `Nýlegt` drawer detail and `Skoða` action do not overlap.
- No horizontal scrolling or layout jump when accepting/declining.

## Product Goal

Move loan invitations from a formal "claim gate" feeling into a softer acknowledgement flow:

- A pending invitation should appear immediately in the recipient's normal `Lánað og skilað` list.
- It should also be reachable from unread `Nýlegt`.
- The recipient chooses:
  - `Þekki málið` = existing claim/accept transition
  - `Kannast ekki við þetta` = existing decline transition
- Email remains notification, not the gate.

## Non-Negotiable Safety Rules

- Do not mark an invitation `accepted` at creation/send time.
- Do not set `loan_items.lender_user_id` or `loan_items.borrower_user_id` for the recipient until `Þekki málið` succeeds.
- Do not weaken RLS, grants, service-role boundaries, session guards, or loan guards.
- Do not grant `anon` or `authenticated` direct access to `loan_items`, `loan_invitations`, or `recent_events`.
- Do not put recipient email in client payload, `recent_events.payload`, UI, screenshots, logs, or handoff snippets.
- Do not run SQL against Supabase unless Stebbi explicitly approves.
- Keep old email deep links working during transition.

## Current State Codex Observed

- `loan_invitation_received` event exists and is emitted when a registered recipient is emailed.
- `recordRecentEvent` supports `initiallyRead`; there is now a local test file for that helper in the worktree.
- `/auth-mvp/lanad-og-skilad/page.tsx` still calls both:
  - `get_my_loans`
  - `get_my_pending_invitations`
- Pending invitations still render via `PendingInvitationCard` above the normal `LoanList`.
- `LoanItem` has no `requires_acknowledgement` field yet.
- `get_my_loans` still returns only rows where the actor is lender or borrower.
- `get_my_pending_invitations` still filters out expired invitations.
- `/auth-mvp/heim` still uses `get_my_pending_invitations` for the badge count and maps `loan_invitation_received` drawer view to `/claim/[id]`.
- `claimInvitation()` and `declineInvitation()` already exist and revalidate `/auth-mvp/lanad-og-skilad` + `/auth-mvp/heim`.

## Recommended Implementation

### Phase 1 - SQL read-model migration

Create a new SQL migration after the current highest migration. At the time Codex reviewed the workspace, `sql/49_raise_invitation_rate_limits.sql` exists, so the next #27 migration is likely:

`sql/50_loan_soft_acknowledgement.sql`

Claude Code must confirm numbering before creating it.

Preferred SQL approach:

- Replace `public.get_my_loans(p_actor_id uuid)` with the same existing accepted/participant branch plus a `UNION ALL` branch for pending invitation-derived rows.
- Add a returned boolean column:
  - `requires_acknowledgement boolean`
- Existing participant rows return `false`.
- Pending invitation-derived rows return `true`.

Pending invitation-derived rows:

- Only for the authenticated actor whose normalized `auth.users.email` equals `loan_invitations.recipient_email_normalized`.
- Only `inv.status = 'pending'`.
- Do not require `inv.expires_at > now()` for loan-list visibility, because v002 says pending rows should not vanish from the list due to email expiry.
- Exclude rows where actor is already a direct lender/borrower.
- Use live `loan_items.item_name` and `loan_items.note` for app display.
- Keep `loan_invitations.item_name_snapshot` immutable for email idempotency.
- Return:
  - `id = loan_items.id`
  - `item_name`
  - `note`
  - `loaned_at`
  - `due_at`
  - `returned_at`
  - `my_role = inv.recipient_role`
  - `other_display_name = creator/inviter display name`
  - `invitation_id = inv.id`
  - `invitation_status = 'pending'`
  - `invitation_attempt_status = inv.attempt_status` or `NULL`, whichever best matches UI needs
  - `can_send_invitation = false`
  - `is_creator = false`
  - `requires_acknowledgement = true`

Security:

- Keep function `SET search_path = ''`.
- Keep `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`.
- Keep `GRANT EXECUTE ... TO service_role`.
- Preserve the column-level `auth.users` grant assumptions from migration 35; do not broaden to `SELECT *` from `auth.users`.
- Do not expose `recipient_email_normalized`.

Rollback:

- Redeploy previous app version first if app code expects old return shape.
- Then replace `get_my_loans` with prior function body.
- No table data should be migrated or destroyed in this phase.

### Phase 2 - Types and control logic

Update `lib/loans/types.ts`:

- Add `requires_acknowledgement: boolean` to `LoanItem`.
- Add control booleans to `LoanCardControls`, for example:
  - `canAcknowledge`
  - `canDeclineAcknowledgement`
- Update `getLoanCardControls()` to take `requires_acknowledgement`.

Codex recommendation:

- Keep `canDelete = false` for pending recipient rows.
- Hide creator invite/send/cancel controls for pending recipient rows.
- Show `Þekki málið` / `Kannast ekki við þetta` only when `requires_acknowledgement === true` and `invitation_id` exists.
- For pending edit/return behavior, follow Stebbi's v002 decision only if SQL/RPC authorization supports it safely. Otherwise stop and hand back a risk note.

Important risk:

Existing post-acceptance narrow edit SQL `update_loan_item_details_with_diff` allows `created_by OR lender_user_id`; a recipient who is only matched by email and not yet `lender_user_id`/`borrower_user_id` may not be authorized to edit. Do not "fix" that with client-only assumptions. If pending-recipient editing is still desired, Claude Code must propose a safe server-side RPC change and get Stebbi/Codex review before broadening authorization.

Existing `mark_returned` requires both parties joined. If pending-recipient mark-returned is still desired, the same warning applies: do not weaken it silently.

### Phase 3 - Loan list page

Update `/auth-mvp/lanad-og-skilad/page.tsx`:

- Stop rendering `PendingInvitationCard` as the primary pending invitation UI once pending rows are included in `get_my_loans`.
- Prefer one `get_my_loans` call for list display.
- Decide whether `get_my_pending_invitations` is still needed only for badge compatibility during transition. If not, remove the page dependency cleanly.
- Keep error handling graceful.

### Phase 4 - Loan card UI

Update `components/loans/LoanCard.tsx`:

- Import and call `claimInvitation` / `declineInvitation`.
- Add two pending actions:
  - `Þekki málið`
  - `Kannast ekki við þetta`
- These actions must be disabled while pending.
- Show friendly errors using existing error style.
- On success, rely on server action revalidation.
- Header/subtext should use softer copy:
  - `Ný skráning frá {name}`
- Remove or avoid old `awaitingAcceptance` wording for recipient-facing pending rows.
- Keep old creator-facing pending status where appropriate.

Do not put explanatory instruction text in the UI beyond the natural labels/status needed to use the card.

### Phase 5 - `Nýlegt` integration

Update `/auth-mvp/heim/page.tsx` / `RecentSection` behavior for invitation received events:

- `loan_invitation_received` should remain unread until the recipient either marks it read or acts on the invitation.
- After successful `Þekki málið` or `Kannast ekki við þetta`, the old actionable invitation event should not remain as an unread actionable item.
- The drawer `Skoða` target should prefer `/auth-mvp/lanad-og-skilad` with a query/anchor that can focus the relevant pending row, for example:
  - `/auth-mvp/lanad-og-skilad?invitation=<id>`
  - or `/auth-mvp/lanad-og-skilad?loan=<id>`
- Do not link primarily to `/claim/[id]` for new product behavior unless kept as a transitional fallback.

Implementation options for acking the received event after action:

- Add a server-side helper to ack by `user_id + event_key`, or
- Add a targeted recent-event ack call inside `claimInvitation` and `declineInvitation`.

Guardrails:

- Ack only the recipient's own event row.
- Do not ack creator/sender events.
- Do not expose event ids or keys to users who do not own them.

### Phase 6 - Claim page copy

Keep `/auth-mvp/lanad-og-skilad/claim/[id]` for email deep links and old links.

Update copy/buttons to match:

- `Þekki málið`
- `Kannast ekki við þetta`

The claim page can remain a fallback path, but it should no longer be the mental center of the flow.

### Phase 7 - Messages

Add/update messages in `messages/is.json` and `messages/en.json`.

Required Icelandic:

- `Þekki málið`
- `Kannast ekki við þetta`
- `Ný skráning frá {name}`

Suggested English:

- `I know about this`
- `I don't recognise this`
- `New entry from {name}`

Use existing tone and message nesting. Do not hardcode translatable text in components.

## Out Of Scope Unless Stebbi Explicitly Expands

- TODO #38: creator/sender event when recipient declines.
- TODO #39: lender can delete accepted item and counterpart receives event.
- Replacing `/auth-mvp/*` canonical routes with prettier routes.
- Reworking email templates beyond button/copy consistency needed for #27.
- Broad event history UI for read events.

If Claude Code believes #38 should be included because `Kannast ekki við þetta` is being touched, stop and ask Stebbi with a clear scope/risk note.

## Required Automated Tests

Add or update tests for:

- SQL migration text:
  - `get_my_loans` returns `requires_acknowledgement`.
  - pending branch matches actor email to `recipient_email_normalized`.
  - pending branch does not expose recipient email.
  - function remains service-role only.
  - no direct grants to `anon`/`authenticated`.
- Types/control logic:
  - pending recipient row has `canAcknowledge`.
  - pending recipient row hides delete and creator invite controls.
  - pending recipient edit/return controls match the final approved decision.
- Loan page:
  - pending invitation appears in `LoanList`.
  - old `PendingInvitationCard` section is gone or no longer primary.
  - load errors still render safely.
- Loan card:
  - renders `Þekki málið`.
  - renders `Kannast ekki við þetta`.
  - clicking `Þekki málið` calls `claimInvitation(invitation_id)`.
  - clicking `Kannast ekki við þetta` calls `declineInvitation(invitation_id)`.
  - buttons disable while action is pending.
  - success path does not show stale errors.
- Home / `Nýlegt`:
  - `loan_invitation_received` view target points to the loan list/focus target, not primarily claim gate.
  - after claim/decline action, unread received event is acked or otherwise no longer actionable.
- Security:
  - unrelated user cannot see pending invitation-derived row.
  - wrong email cannot claim/decline.
  - no recipient email appears in payload/rendered output.

Run at minimum:

```bash
npm run test:run -- lib/__tests__/loans.test.ts lib/__tests__/loan-pages.test.tsx lib/__tests__/loan-list.test.tsx lib/__tests__/actions.test.ts lib/__tests__/home-page.test.tsx lib/__tests__/mark-recent-read-action.test.ts lib/__tests__/record-recent-event.test.ts
npm run type-check
```

If SQL helpers or shared behavior are touched broadly, run full:

```bash
npm run test:run
```

## Required Handoff Back From Claude Code

Claude Code should stop after implementation and send Stebbi a new handoff for Codex review before commit/deploy.

That handoff must include:

- Plan actually followed.
- Files read.
- Files changed.
- SQL migration filename and full risk summary.
- Whether SQL was only written or also applied. Do not apply unless Stebbi explicitly approves.
- Effects on Supabase, RLS, auth, grants, functions, production data, and user data.
- Exact commands run and exit codes.
- What was not done.
- Remaining risks.
- Localhost checks for Stebbi, updated with any behavior change.
- Specific questions for Codex review.

## Copy/Paste Instruction For Claude Code

Claude Code, please implement TODO #27 using this handoff as the source of truth. Treat #19 as completed foundation. Do not run Supabase SQL, deploy, commit, push, or start/restart dev server unless Stebbi explicitly approves. Keep the implementation small, server-authorized, and reviewable.
