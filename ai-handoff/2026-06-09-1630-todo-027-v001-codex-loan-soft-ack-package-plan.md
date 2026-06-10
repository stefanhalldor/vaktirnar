# TODO #27 - Soft acknowledgement loan flow and next TODO package

Relevant TODOs:

- #27: simplify loan invitations so the item appears immediately for the recipient, then the recipient can choose `Þekki málið` / `Kannast ekki við þetta`.
- Existing #19: `Nýlegt` read-state is still fragile and should be treated as related risk.
- Existing #23 and #24: app code appears shipped, but status depends on whether `sql/44_loan_item_details_edit.sql` has been applied and verified in Supabase.
- Existing #25: moved to DONE on 2026-06-09 after Codex read-only verification.
- Existing #26, #12, #20: best candidates for a small one-action Claude Code package.

## Codex understanding

Stebbi wants the loan invitation to feel less like a blocking approval flow.

Desired product behavior:

- When Stebbi or another user invites someone into a loan, the item should appear in `Lánað og skilað` for the recipient immediately, as if it belongs in their loan list already.
- The item should also appear as new in `Nýlegt`.
- The `Nýlegt` row should be clickable.
- The recipient should then have two softer actions:
  - `Þekki málið` - equivalent to current accept/claim.
  - `Kannast ekki við þetta` - equivalent to current decline.
- The item should not be hidden behind a separate "accept invitation before it appears" mental model.

Codex agrees with the product direction, but this is not a tiny copy change. It changes the visibility model for loans and therefore touches auth, service-role RPCs, invitation status semantics, `Nýlegt`, and likely tests.

## Current implementation facts

These are based on read-only code review on 2026-06-09.

- `app/auth-mvp/lanad-og-skilad/page.tsx` calls `get_my_loans` and `get_my_pending_invitations` separately.
- Pending invitations are rendered above the loan list via `PendingInvitationCard`.
- `PendingInvitationCard` links to `/auth-mvp/lanad-og-skilad/claim/[invitation_id]`.
- `ClaimForm` calls the existing server actions:
  - `claimInvitation(invitationId)` -> `claim_loan_invitation`.
  - `declineInvitation(invitationId)` -> `decline_invitation`.
- `get_my_loans` only returns `loan_items` where `lender_user_id = actor` or `borrower_user_id = actor`.
- `get_my_pending_invitations` returns pending, unexpired invitations where `recipient_email_normalized` matches the authenticated user's email.
- `Nýlegt` currently uses only `get_my_loans` rows, not pending invitations.
- `RecentSection` rows are `<div>` elements, not links.
- `Nýlegt` read-state is cookie-based (`teskeid_recent_read_v2`), and Stebbi has already seen that the fix is not fully bulletproof.

## Recommended one-action package for Claude Code now

Codex recommends that Claude Code can take one small, safe package now, separate from proposed #27.

Scope for this one action:

1. Verify the released #23/#24 state.
   - Check whether app code for editing item name/note is present.
   - Confirm whether `sql/44_loan_item_details_edit.sql` has been applied in Supabase.
   - If SQL has not been applied, Claude Code must stop and ask Stebbi before any production SQL action.
   - Do not mark #23/#24 DONE unless the migration is actually applied and the feature is verified.

2. Implement #26 if still open.
   - Rename `Skiladagur (valfrjálst)` to `Skila fyrir (valfrjálst)` in both Icelandic and English messages.
   - Add a clear optional due-date clear action in both new and edit loan forms.
   - The clear action must set `due_at` to `null`/empty in submit payload.
   - Do not add a clear action to the required `loaned_at` field.
   - Verify no mobile horizontal overflow or input zoom regression at 360-460 px.

3. Implement #12 if still open and low-risk.
   - Improve the idea vote button copy while preserving current vote API behavior.
   - Keep vote count visible.
   - Add text to `messages/is.json` and `messages/en.json`, not hardcoded component text.

4. Investigate #20 only if the cause is obvious and local.
   - First do read-only/code-level investigation of the bottom bar login link.
   - If the bug is a simple overlay, pointer-events, z-index, hydration, or link issue, fix it in the same package.
   - If it cannot be reproduced or is not obvious, leave #20 open with a short note and manual test instructions.

5. TODO/DONE cleanup.
   - Move #23/#24 to DONE only after SQL and app behavior are verified.
   - Keep #19 open or reopen clearly, because Stebbi reported `Nýlegt` still not working reliably.
   - #27 has been added to `TODO.md`; Claude Code should still produce Phase 0 before implementation.

Do not include #19 server-side read-state or proposed #27 implementation in this one-action package.

## Proposed #27 implementation direction

Codex recommends a conservative "soft acknowledgement" model.

Core rule:

- Do not mark an invitation as `accepted` at create/send time.
- Do not set `loan_items.lender_user_id` or `loan_items.borrower_user_id` for the recipient until the recipient chooses `Þekki málið`.
- Instead, return recipient-visible pending invitation rows as part of the displayed loan list.

Why this is safer:

- The database truth still says the recipient has not acknowledged the loan.
- Existing `claim_loan_invitation` can remain the authoritative transition into accepted state.
- Existing `decline_invitation` can remain the authoritative rejection path.
- Pending recipient visibility is derived from `loan_invitations.recipient_email_normalized = auth.users.email`, which already matches the current security boundary.
- It avoids writing a real participant user id before the recipient has acted.

Likely data/API shape:

- Add a new migration, probably `sql/45_loan_soft_acknowledgement.sql`.
- Either replace `get_my_loans` or introduce a new RPC such as `get_my_loans_with_pending`.
- The RPC should return normal participant loans plus pending invitation-derived rows for the authenticated actor's email.
- For pending invitation-derived rows:
  - `id`: loan id.
  - `item_name`: live `loan_items.item_name`, not `item_name_snapshot`.
  - `note`: live `loan_items.note`, if Stebbi wants note visible before acknowledgement.
  - `my_role`: `loan_invitations.recipient_role`.
  - `other_display_name`: creator/inviter display name.
  - `invitation_id`: pending invitation id.
  - `invitation_status`: `pending`.
  - Add a presentation field such as `requires_acknowledgement: true`.
  - Add a presentation field such as `can_acknowledge: true`.
  - `can_send_invitation`: false.
  - `is_creator`: false.

UI behavior:

- Remove or de-emphasize the separate pending invitation section on the loan list once pending rows are included in `LoanList`.
- In `LoanCard`, when `requires_acknowledgement` is true:
  - Show a softer status label, e.g. "Ný skráning frá {name}" or equivalent.
  - Show buttons:
    - `Þekki málið`.
    - `Kannast ekki við þetta`.
  - Hide return/undo controls until the recipient has chosen `Þekki málið`.
  - Hide edit/delete unless explicitly approved by Stebbi.
- Keep the old `/claim/[id]` route for email deep links during the transition, but update its copy to match the softer language.

`Nýlegt` behavior:

- Pending invitation-derived rows must be included in the recent rows.
- The read key must include invitation-specific state, for example `loan_id`, `invitation_id`, `invitation_status`, role, item name, due date, returned date, and overdue state.
- The row should be clickable.
- Preferred first implementation: link each row to `/auth-mvp/lanad-og-skilad?loan=<loan_id>` or `?invitation=<invitation_id>` and highlight/scroll the relevant card in the loan list.
- Avoid linking `Nýlegt` pending rows straight to `/claim/[id]`, because that preserves the old "invitation gate" mental model Stebbi wants to soften.

Important #19 dependency:

- Cookie-only read-state has already proven unreliable in Stebbi's testing.
- If #27 relies on `Nýlegt` as the primary way to notice pending loans, Codex strongly recommends doing the server-side #19 read-state plan before or together with #27.
- If Claude Code chooses not to do server-side read-state yet, the handoff must explicitly state the remaining reliability risk.

Email behavior:

- Sending email can remain as notification, not the gate.
- `loan_invitations.item_name_snapshot` should remain immutable for email idempotency.
- App display should use live `loan_items.item_name`; email history can remain snapshot-based.
- Email claim links may continue to route through `/claim/[id]`, but the page copy should use the softer action language.

## Security and data constraints

Claude Code must preserve these constraints:

- No direct `anon` or `authenticated` grants to `loan_items` or `loan_invitations`.
- New/changed RPCs should remain service-role only, with explicit `REVOKE` and `GRANT`.
- Recipient-visible pending rows must be returned only when authenticated actor email matches `loan_invitations.recipient_email_normalized`.
- Do not expose recipient email in client payloads.
- Do not leak invitation email, tokens, secrets, or service-role errors in logs/client responses.
- Do not weaken RLS.
- Do not mutate `loan_items` participant fields until the recipient chooses `Þekki málið`.
- Keep lock ordering consistent with existing invitation functions to avoid deadlocks.
- Treat expired/cancelled/declined invitations deliberately. Do not accidentally show declined or cancelled rows as active loans.

## Open product decisions for Stebbi

Claude Code should ask Stebbi or propose a default before implementation:

1. Should a pending acknowledgement expire?
   - Current invitations expire.
   - But if the item is supposed to feel like it is already in the list, sudden disappearance after expiry may feel wrong.

2. Before `Þekki málið`, may the recipient mark the item returned?
   - Codex recommendation: no. Show only `Þekki málið` / `Kannast ekki við þetta` until acknowledged.

3. Before `Þekki málið`, may the recipient edit note or item name?
   - Codex recommendation: no, unless Stebbi explicitly wants that. Keep edits for acknowledged participant rules.

4. After `Kannast ekki við þetta`, should the item disappear from the recipient list immediately?
   - Codex recommendation: yes, matching current decline semantics.

5. Should creator see a softer status when recipient has not acknowledged?
   - Codex recommendation: yes, but do not block creator's existing invite/resend/cancel logic unless intentionally changed.

6. Should existing pending invitations become visible in the loan list after deploy?
   - Codex recommendation: yes, because it is a derived read-model change, not a destructive migration.

## Required tests/checks for #27

Claude Code should include or update tests for:

- Recipient sees a pending invitation in the normal loan list.
- Recipient sees the same pending item in `Nýlegt`.
- `Nýlegt` pending row links to the correct loan list target.
- Recipient can click `Þekki málið`, which calls current claim semantics and turns the row into an accepted loan.
- Recipient can click `Kannast ekki við þetta`, which calls current decline semantics and removes/hides the row.
- Wrong-email user cannot see pending invitation-derived rows.
- Unrelated authenticated user cannot see pending rows or act on them.
- Creator still sees their created loan and current invitation status.
- Returned/edit/delete controls do not appear for pending recipient rows unless explicitly approved.
- Expired, cancelled, declined, and accepted statuses are handled intentionally.
- Type-check and relevant Vitest suites pass.

## Instruction for Claude Code

For #27, Claude Code should not implement immediately.

Claude Code should first produce a Phase 0 technical plan that answers:

- Which SQL migration(s) are needed?
- Whether to replace `get_my_loans` or add a new RPC.
- Exact returned type changes in `lib/loans/types.ts`.
- How `LoanList`, `LoanCard`, `RecentSection`, and `/claim/[id]` change.
- How `Nýlegt` clickable navigation/highlight works.
- Whether #19 server-side read-state is included or explicitly left as a risk.
- How existing pending invitations are treated on first deploy.
- Full auth/RLS/grants impact.
- Rollback/recovery plan.
- Test plan.

Then Stebbi should send Claude Code's Phase 0 plan back to Codex for review before implementation.
