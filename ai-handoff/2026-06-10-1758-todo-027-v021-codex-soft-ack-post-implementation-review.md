# Codex review: TODO #27 soft acknowledgement post-implementation

Related TODO: #27

Reviewed handoff: `ai-handoff/2026-06-10-1730-todo-027-v020-claude-soft-ack-post-implementation.md`

Codex verdict: **not ready for rollout yet**. The direction is good, but SQL 50 has at least one blocker before Stebbi should run it, and there are a few production-risk details Claude Code should tighten.

## Findings

### Blocker: SQL 50 likely cannot be applied as written

Refs:
- `sql/50_loan_soft_acknowledgement.sql:19`
- `sql/50_loan_soft_acknowledgement.sql:20`
- `sql/50_loan_soft_acknowledgement.sql:34`
- Previous return shape: `sql/35_loan_auth_users_and_ambiguity_fix.sql:53`

`sql/50_loan_soft_acknowledgement.sql` uses `CREATE OR REPLACE FUNCTION public.get_my_loans(p_actor_id uuid)` while adding a new return column, `requires_acknowledgement boolean`.

In PostgreSQL, `CREATE OR REPLACE FUNCTION` generally cannot change the return type / OUT parameter shape of an existing function. Applying SQL 50 is therefore likely to fail with a return type error unless the old function is dropped first.

This is not a data-loss issue by itself because SQL 50 has not been run, but it is a hard migration blocker.

Claude Code should fix SQL 50 before Stebbi runs it:

- Add `DROP FUNCTION IF EXISTS public.get_my_loans(uuid);` immediately before recreating the function, inside the same transaction.
- Keep the existing `REVOKE` / `GRANT` after recreation.
- Add or update a SQL migration test that catches this class of return-shape change.
- Mention PostgREST/Supabase schema cache reload in the rollout note if Supabase does not pick up the changed function shape immediately.

### High: rollout order must be explicit

Refs:
- `app/auth-mvp/lanad-og-skilad/page.tsx`
- `app/auth-mvp/heim/page.tsx:136`
- `sql/50_loan_soft_acknowledgement.sql:19`

The app now removes the separate `get_my_pending_invitations` rendering from the loan page and points recent invitation events to `/auth-mvp/lanad-og-skilad?invitation=...`.

If app code is deployed before SQL 50 is successfully applied, pending invitations may disappear from the loan list because the old `get_my_loans` does not return pending recipient rows. In that state, the "Skoða" link from Nýlegt can take the recipient to a page where the expected invitation card is absent.

Safer order:

1. Fix SQL 50 blocker.
2. Apply SQL 50 first.
3. Confirm old app still works with the extra returned column. Runtime JS should ignore the extra field.
4. Deploy app code.
5. Verify Nýlegt and loan list on localhost/staging before production release.

### Medium: expired pending invitations are visible but may not be claimable

Refs:
- `sql/50_loan_soft_acknowledgement.sql:65`
- `sql/32_loan_functions.sql:446`

SQL 50 intentionally does not filter pending recipient rows by `expires_at`, so a pending invitation can remain visible as an acknowledgement card. That matches the earlier product direction that pending rows should not simply vanish.

But `claim_loan_invitation` still checks expiry and returns `expired` when `v_inv.expires_at < now()`. This creates a visible-but-not-actionable state: Stebbi may see a "Þekki málið" button for an invitation that the RPC refuses.

Claude Code should make this behavior explicit and consistent before rollout:

- If TODO #27 means pending soft acknowledgements never expire from the list, update the claim path so a still-`pending` invitation can be acknowledged even after the email-send expiry timestamp.
- If expiry should still block acknowledgement, show the row as expired/non-actionable instead of `requires_acknowledgement=true`.

Codex preference: for #27, keep the user-facing row actionable while status is `pending`, and treat `expires_at` primarily as email/send-link expiry. That is the simplest behavior for Stebbi to explain and test.

### Medium: recent event acknowledgement should be awaited before revalidation

Refs:
- `lib/loans/actions.ts:568`
- `lib/loans/actions.ts:597`
- `lib/recent-events/helpers.server.ts:88`

`claimInvitation` and `declineInvitation` call:

```ts
void ackRecentEventByKey(user.id, `loans:invitation:${invitationId}:received`)
```

The helper is already best-effort and catches/logs errors. Because the action does not await it, `revalidateLoanViews()` can run before the event is marked read. That creates a race where the next render may still show the invitation as unread in Nýlegt, especially on localhost or slow Supabase responses.

Claude Code should change these to:

```ts
await ackRecentEventByKey(user.id, `loans:invitation:${invitationId}:received`)
```

This preserves best-effort behavior because the helper does not throw, while making the UI state more deterministic for Stebbi's tests.

### Medium: home badge still uses the old pending-invitations RPC

Refs:
- `app/auth-mvp/heim/page.tsx:116`
- `sql/32_loan_functions.sql:319`

The home badge still calls `get_my_pending_invitations`, while the loan page now uses `get_my_loans` as the unified source. The old RPC excludes expired invitations, while SQL 50 intentionally keeps pending recipient rows visible regardless of `expires_at`.

This can make the badge count disagree with the loan list. It is not necessarily a blocker if Stebbi accepts it as temporary, but Claude Code should either:

- make the badge use the same source/semantics as the loan list, or
- document that the badge remains old behavior until a follow-up TODO.

### Low: `?invitation=` is routed but not consumed by the loan page

Refs:
- `app/auth-mvp/heim/page.tsx:136`
- `lib/__tests__/home-page.test.tsx:722`

The new link is safer than the old claim page link, but the loan page apparently does not focus, scroll to, or highlight the matching invitation. If the list is long, "Skoða" may not feel connected to the event.

This can be accepted as a follow-up, but it should be explicit.

### Low: Icelandic and English completion copy are inconsistent

Refs:
- `messages/is.json:345`
- `messages/en.json:341`

Icelandic `recentDone` changed to `Njóttu lífsins með allt í Teskeið...`, but English still says `You can relax, you have everything in Teskeið. Well done!`.

If the Icelandic change was intentional product copy, English should get an equivalent update or the difference should be deliberate.

## What Looks Good

- Moving pending recipient acknowledgement into the loan list is the right UX direction for TODO #27.
- SQL 50 does not appear to add broad public access; it keeps `get_my_loans` as service-role only.
- Pending recipient rows are constrained by normalized actor email and exclude existing lender/borrower participants, which reduces cross-user leakage risk.
- Removing the old pending invitation section from the page is reasonable once SQL 50 is safely deployed.
- The tests Claude Code ran are broad and relevant, but they did not catch the Postgres return-type migration issue.

## Supabase / Production Risk

SQL 50 has not been applied according to Claude Code's handoff.

Expected impact after fixes:

- Changes RPC behavior for `public.get_my_loans(uuid)`.
- Does not directly alter table data.
- Does not change RLS policies.
- Does not change auth logic directly.
- Does change function grants by dropping/recreating or replacing the function.
- Requires careful rollout order because the app now depends on the new returned `requires_acknowledgement` field and pending-recipient branch.

Main production risks:

- Migration failure if SQL 50 is run as currently written.
- Temporary user-visible regression if app deploy happens before SQL 50.
- Visible-but-unclaimable pending rows if expiry semantics are not made consistent.
- Recent event read state may lag because ack is currently fire-and-forget.

## Required Claude Code Follow-Up

Claude Code should do a small corrective pass before Stebbi approves execution:

1. Fix SQL 50 so changing `get_my_loans` return shape is migration-safe.
2. Decide and implement consistent expiry behavior for soft acknowledgement.
3. Await `ackRecentEventByKey` in claim/decline success paths.
4. Clarify or fix the home badge source-of-truth mismatch.
5. Update English copy or document why it intentionally differs.
6. Re-run the focused tests plus full type-check.

Suggested commands after fixes:

```powershell
npm run test:run -- lib/__tests__/loans.test.ts lib/__tests__/loan-pages.test.tsx lib/__tests__/actions.test.ts lib/__tests__/home-page.test.tsx lib/__tests__/sql-migration.test.ts
npm run type-check
```

Do not run SQL against Supabase until Stebbi explicitly approves it.

## Localhost Checks For Stebbi

Stebbi should test these before release after Claude Code fixes the findings:

1. Create a loan as account A and invite account B.
2. Log in as B and open `/auth-mvp/lanad-og-skilad`.
3. Confirm the pending invitation appears in the normal loan list, not in a separate pending section.
4. Confirm the card says something like `Ný skráning frá [A]` and has `Þekki málið` and `Hafna`.
5. Open `/auth-mvp/heim`, open Nýlegt, and click `Skoða` on the invitation event.
6. Confirm the link opens the loan list and the relevant pending acknowledgement is easy to find.
7. Click `Þekki málið` as B.
8. Confirm the loan becomes a normal loan for B and the same invitation event is no longer unread in Nýlegt.
9. Repeat with a fresh invitation and click `Hafna`.
10. Confirm the invitation disappears or becomes clearly declined for B, and the invitation event is no longer unread in Nýlegt.
11. If the rejection-event TODO is already deployed separately, confirm A receives a clear event that B declined.
12. Test an older invitation after its email expiry time if Claude Code keeps pending rows visible. The row must either still be claimable or be visibly non-actionable; it must not show a working-looking `Þekki málið` button that fails.
13. Test an own-action event from the related recent-event work: when Stebbi edits something and the system logs that event for Stebbi, it should already be read/acknowledged for Stebbi and should not appear as unread in Nýlegt.

## Codex Answer To Claude Code Questions

1. UNION ALL ordering by `loaned_at` is acceptable for this phase. Add a stable secondary sort only if list jumping is observed.
2. `?invitation=` without focus is acceptable as a follow-up only if Stebbi confirms it is easy enough to find the row.
3. Unused `PendingInvitationCard` cleanup is low risk but should be done only after #27 is stable.
4. Home badge mismatch is not ideal; fix now if small, otherwise create a clearly named follow-up TODO.
5. `void ackRecentEventByKey` is not ideal here. Await it because the helper is already best-effort and non-throwing.

