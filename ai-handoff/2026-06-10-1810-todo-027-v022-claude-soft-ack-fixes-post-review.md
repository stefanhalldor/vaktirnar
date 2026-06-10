# TODO #27 - Post-review fixes handoff

Reviewed: `ai-handoff/2026-06-10-1758-todo-027-v021-codex-soft-ack-post-implementation-review.md`

All required follow-up items from Codex v021 are addressed. Requesting final Codex approval before Stebbi applies SQL and releases.

## What Was Fixed

### Blocker (was): SQL 50 return-type migration safety

`sql/50_loan_soft_acknowledgement.sql` rewritten:

- `get_my_loans`: replaced `CREATE OR REPLACE FUNCTION` with `DROP FUNCTION IF EXISTS public.get_my_loans(uuid)` followed by `CREATE FUNCTION`. This avoids the Postgres restriction on changing OUT column shape via `CREATE OR REPLACE FUNCTION`.
- `claim_loan_invitation`: also added to sql/50 via `DROP FUNCTION IF EXISTS` + `CREATE FUNCTION`. The expiry check (`expires_at < now()`) is removed (see below).
- Added mandatory rollout order and PostgREST/Supabase schema cache reload note in the file header.

### Medium: `claim_loan_invitation` expiry semantics

Old behavior: if `expires_at < now()`, the function transitioned the DB row to `status='expired'` and returned `'expired'`.

New behavior: `expires_at` is treated as email/send-link expiry only. The function claims any invitation whose DB `status = 'pending'`, regardless of `expires_at`. An invitation with DB `status = 'expired'` (set by the old code path on prior runs) still returns `'not_claimable'`, but Branch 2 of `get_my_loans` only returns rows where `inv.status = 'pending'`, so no expired-status row will show an acknowledgement button.

### Medium: `void ackRecentEventByKey` → `await ackRecentEventByKey`

Both occurrences in `lib/loans/actions.ts` (`claimInvitation` and `declineInvitation`) now `await` the best-effort helper. The helper does not throw, so this only improves determinism without changing error behavior. `revalidateLoanViews()` now runs after the ack write completes, reducing the chance of a stale Nýlegt state on next render.

### Low: English copy

`messages/en.json` `recentDone` updated from "You can relax, you have everything in Teskeið. Well done!" to "Enjoy life with everything in Teskeið..." to match the tone of the updated Icelandic.

### Home badge (documented, not changed)

The home page badge still uses `get_my_pending_invitations`. This diverges from `get_my_loans` Branch 2 only in the expiry filter: `get_my_pending_invitations` hides email-expired pending rows, while Branch 2 keeps them visible. In practice the difference is minor (a pending invitation past its email send window still appears in the loan list but not in the badge count).

This is documented as a follow-up TODO rather than changed now. The badge does not mislead the user — it can show 0 while a pending-but-email-expired row is still visible in the list. The pending card still has the acknowledgement buttons, so the user is not blocked.

## Files Changed in This Pass

| File | Change |
|------|--------|
| `sql/50_loan_soft_acknowledgement.sql` | Rewritten: DROP+CREATE for get_my_loans, added DROP+CREATE for claim_loan_invitation without expiry check, rollout header |
| `lib/loans/actions.ts` | `void` -> `await` for ackRecentEventByKey in claimInvitation and declineInvitation |
| `messages/en.json` | `recentDone` copy updated |
| `lib/__tests__/sql-migration.test.ts` | Tests for DROP+CREATE pattern and claim_loan_invitation expiry removal |

## SQL Migration — Updated Risk Summary

**File:** `sql/50_loan_soft_acknowledgement.sql`
**Status:** Written, NOT applied. Stebbi applies after Codex approves.

**What it changes:**
1. `public.get_my_loans(uuid)` — DROP + recreate with new `requires_acknowledgement` column and Branch 2 UNION ALL
2. `public.claim_loan_invitation(uuid, uuid)` — DROP + recreate without `expires_at` expiry check

**Schema/data/RLS:** no changes
**Security:** both functions stay service_role only; `SET search_path = ''` preserved; no new grants

**Rollout order:**
1. Apply sql/49 (rate limit raise) if not already applied
2. Apply sql/50 (this file)
3. Reload PostgREST/Supabase schema cache (Settings -> API -> Reload schema)
4. Confirm old app still works (extra column is ignored at runtime)
5. Deploy app code
6. Verify on localhost/staging

**Rollback:** redeploy prior app version, then restore prior function bodies from sql/32_loan_functions.sql. No data is migrated or destroyed.

## Test Results

```
npm run test:run
# 1037 passed | 22 skipped | 8 todo (37 test files)

npm run type-check
# exit 0, no errors
```

## What Is Still Not Done

- `?invitation=` scroll/focus on loan list — follow-up TODO
- Home badge migration to `get_my_loans` — follow-up TODO
- `PendingInvitationCard` component cleanup — follow-up TODO after #27 is stable
- #38 (creator decline event) — explicitly out of scope

## Questions for Codex

1. **claim_loan_invitation rollback path after expiry removal:** If a user had an invitation that old code already set to DB `status='expired'`, the new function returns `'not_claimable'` for that row. That row is also invisible in Branch 2 (only `pending` rows appear). Is this acceptable, or should we additionally handle DB-expired rows by showing them as non-actionable in the UI?

2. **sql/49 dependency:** sql/50 does not depend on sql/49 (rate limits). Applying sql/49 first is preferred for correctness but sql/50 can be applied independently. Confirm this is acceptable.

3. **Rollout step 3 (PostgREST reload):** In Supabase, does schema cache reload require a service restart or is there a softer path? Codex/Stebbi should confirm before running step 3 in production.

## Localhost Checks for Stebbi (same as v020 + one addition)

After applying sql/49 + sql/50 and reloading schema cache:

1. User A invites User B. User B opens `/auth-mvp/lanad-og-skilad`. Pending item appears in normal list with "Ný skráning frá [A]" and `Þekki málið` / `Kannast ekki við þetta` buttons. No separate "Lánaboð" section.
2. User B clicks `Þekki málið`. Item becomes a normal accepted loan, buttons disappear. Nýlegt no longer shows the invitation event as unread after refresh.
3. Repeat with a fresh invitation. User B clicks `Kannast ekki við þetta`. Item disappears from list. Nýlegt no longer shows the invitation event as unread.
4. Nýlegt `Skoða` for invitation event links to `/auth-mvp/lanad-og-skilad?invitation=<id>`. Pending item is visible in the list.
5. **New:** Create an invitation, wait for email expiry (or test with an old invitation past its `expires_at`). The pending card must still show `Þekki málið` and clicking it must succeed (not return "expired" error). This validates the claim_loan_invitation expiry fix.
6. `recentDone` banner reads "Njóttu lífsins með allt í Teskeið..." when no unread events remain.
7. Mobile 360-460px: buttons do not overflow.
