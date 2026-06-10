# Codex review: TODO #27 soft acknowledgement fixes approval

Related TODO: #27

Reviewed handoff: `ai-handoff/2026-06-10-1810-todo-027-v022-claude-soft-ack-fixes-post-review.md`

Codex verdict: **approved for Stebbi-controlled rollout**, with the rollout order below treated as mandatory. Codex found no remaining blocker in the files reviewed.

## Findings

### No blocking findings

Refs:
- `sql/50_loan_soft_acknowledgement.sql:40`
- `sql/50_loan_soft_acknowledgement.sql:42`
- `sql/50_loan_soft_acknowledgement.sql:168`
- `sql/50_loan_soft_acknowledgement.sql:170`
- `lib/loans/actions.ts:568`
- `lib/loans/actions.ts:597`

Claude Code fixed the v021 blocker. `get_my_loans(uuid)` is now dropped before recreation, so the new `requires_acknowledgement` OUT column should not hit the PostgreSQL `CREATE OR REPLACE FUNCTION` return-shape restriction.

`claim_loan_invitation(uuid, uuid)` is also recreated with the expiry gate removed. That matches the product decision that the loan-list soft acknowledgement should remain actionable while the invitation DB status is still `pending`.

`claimInvitation` and `declineInvitation` now `await ackRecentEventByKey(...)`, and the helper remains best-effort/non-throwing.

### Residual risk: old email claim page and soft-ack list now intentionally differ

Refs:
- `app/auth-mvp/lanad-og-skilad/claim/[id]/page.tsx:52`
- `sql/50_loan_soft_acknowledgement.sql:159`
- `sql/50_loan_soft_acknowledgement.sql:193`

The old `/claim/[id]` page still treats `expires_at` as expired and hides `ClaimForm` after expiry. The new loan-list soft-ack path can still claim a `pending` invitation after `expires_at`.

Codex accepts this because Claude Code documents `expires_at` as email/send-link expiry only, while soft acknowledgement belongs in the logged-in loan list. Stebbi should know this is a product decision, not an accident.

### Residual risk: home badge remains old source-of-truth

Refs:
- `app/auth-mvp/heim/page.tsx:116`
- `sql/32_loan_functions.sql:319`

The home badge still uses `get_my_pending_invitations`, which excludes `expires_at <= now()`, while SQL 50 keeps pending recipient rows visible in `get_my_loans`.

Codex accepts this as a follow-up because the badge can undercount but does not block the user from seeing and handling the pending item in the loan list. This should stay visible as a follow-up TODO, not be forgotten.

## Answers To Claude Code Questions

1. Expired DB status rows: acceptable for this release. If old code already changed an invitation to `status='expired'`, Branch 2 hides it and the new claim RPC returns `not_claimable`. Codex would not reopen those rows automatically without a separate product/data decision from Stebbi.
2. SQL 49 dependency: SQL 50 can be applied independently from SQL 49. Applying SQL 49 first is fine, but SQL 50 does not depend on SQL 49 because it changes different RPCs.
3. PostgREST reload: Codex would try the Supabase dashboard/API schema reload first. Do not restart services unless the schema reload is unavailable or does not refresh the function shape. Stebbi should approve any production Supabase action explicitly before it is run.

## Required Rollout Order

1. Stebbi approves SQL execution explicitly.
2. Apply `sql/50_loan_soft_acknowledgement.sql` before deploying the app code that depends on it.
3. Reload PostgREST/Supabase schema cache.
4. Verify old app behavior is not broken by the extra returned column.
5. Deploy app code.
6. Run the localhost checks below before production release.

Do not deploy app code before SQL 50 is applied and schema cache has been refreshed.

## Supabase / Production Notes

SQL 50:

- changes `public.get_my_loans(uuid)`;
- changes `public.claim_loan_invitation(uuid, uuid)`;
- does not alter tables;
- does not migrate or delete data;
- does not change RLS policies;
- keeps both functions service-role only;
- uses `SET search_path = ''`;
- needs careful schema cache handling because the `get_my_loans` result shape changes.

Rollback path remains: redeploy prior app version first, then restore the previous function bodies. Because SQL 50 does not migrate data, rollback is mostly function-body restoration, not data recovery.

## Tests Run By Codex

```powershell
npm run test:run -- lib/__tests__/loans.test.ts lib/__tests__/loan-pages.test.tsx lib/__tests__/actions.test.ts lib/__tests__/home-page.test.tsx lib/__tests__/sql-migration.test.ts
# 5 passed test files
# 304 passed | 22 skipped | 5 todo

npm run type-check
# exit 0
```

## Localhost Checks For Stebbi

After SQL 50 is applied locally/staging and schema cache is reloaded:

1. User A creates a loan and invites User B.
2. User B opens `/auth-mvp/lanad-og-skilad`.
3. Confirm the pending item appears in the normal loan list with `Ný skráning frá [A]`.
4. Confirm the card has `Þekki málið` and `Kannast ekki við þetta`.
5. User B clicks `Þekki málið`.
6. Confirm the item becomes a normal accepted loan and the invitation event is no longer unread in Nýlegt after refresh.
7. Repeat with a fresh invitation and click `Kannast ekki við þetta`.
8. Confirm the item is no longer actionable for User B and the invitation event is no longer unread in Nýlegt.
9. Open `/auth-mvp/heim`, click `Skoða` on a `loan_invitation_received` event, and confirm it goes to `/auth-mvp/lanad-og-skilad?invitation=<id>` where the pending item is visible.
10. Test a pending invitation past `expires_at`: the loan-list soft-ack card should still allow `Þekki málið` and should not return an expired error.
11. Open the old email claim route for an expired invite and confirm Stebbi is comfortable that this route still says the invitation is expired.
12. Check mobile width around 360-460px and confirm acknowledgement buttons do not overflow.
13. Confirm `recentDone` copy appears correctly in Icelandic when there are no unread events.

