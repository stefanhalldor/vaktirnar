# TODO #19 / #37 - Codex approval of v029 Phase B SQL

Relevant TODO items: #19 recent read state and #37 all unread events + event detail history. TODO #27, #38, and #39 remain adjacent future work around invitation and counterpart event flows.

Reviewed by Codex:

- `ai-handoff/2026-06-10-1422-todo-019-037-v029-claude-phaseB-final-sql-ready.md`
- `sql/48_update_loan_with_diff.sql`
- prior reviews v026 and v028 for the counterpart and wording requirements

Codex did not run SQL, did not touch Supabase, did not use service-role secrets, and did not run tests in this review turn.

## Verdict

Codex approves `sql/48_update_loan_with_diff.sql` for Stebbi to apply to Supabase, provided the rollout order below is followed exactly.

This approval is for the SQL migration only. It does not approve unfinished app-code implementation until Claude Code completes it and hands it back for review.

## What Was Approved

`sql/48_update_loan_with_diff.sql` now:

- leaves existing `update_loan` and `update_loan_item_details` untouched
- adds only new RPCs:
  - `update_loan_with_diff(uuid, uuid, text, text, date, date)`
  - `update_loan_item_details_with_diff(uuid, uuid, text, text)`
- adds `DROP FUNCTION IF EXISTS` guards for those new RPC names only
- uses `BEGIN; ... COMMIT;`
- uses `SET search_path = ''`
- keeps execute grants to `service_role`
- revokes execute from `PUBLIC`, `anon`, and `authenticated`
- returns before-values only after row lookup and authorization checks
- returns `not_found` with null before-values for unauthorized loan actors
- returns `counterpart_user_id` as the other populated party, not always borrower
- does not return emails, profile data, secrets, or unrelated user data

The corrected counterpart CASE handles:

- lender actor -> borrower counterpart
- borrower-created actor -> lender counterpart
- no counterpart -> `NULL`
- same-user edge case -> app skip will avoid duplicate/self counterpart events

## Rollout Order

Stebbi/Claude Code should use this order:

1. Apply `sql/48_update_loan_with_diff.sql` to Supabase.
2. Run the v029 verification script with `SUPABASE_PROJECT_REF` and `SUPABASE_SERVICE_ROLE_KEY` set in the shell.
3. Confirm both RPCs return HTTP 200 and body status `unauthenticated`.
4. If verification fails, do not deploy app code. Reload Supabase/PostgREST schema cache and retry verification.
5. Only after both RPCs verify: Claude Code may implement/deploy app code that calls the new RPCs.

Important: do not paste the service-role key into chat, files, screenshots, logs, shell scripts committed to the repo, or handoff files. Ensure shell debug mode such as `set -x` is off before running the verification script.

## Rollback

If rollback is needed after app code has deployed:

1. Redeploy the previous app version that calls old RPCs.
2. Verify edits work against old RPCs.
3. Drop the new functions if needed:
   ```sql
   DROP FUNCTION IF EXISTS public.update_loan_with_diff(uuid, uuid, text, text, date, date);
   DROP FUNCTION IF EXISTS public.update_loan_item_details_with_diff(uuid, uuid, text, text);
   ```
4. Reload Supabase/PostgREST schema cache if needed.

If rollback happens before app deploy, dropping the new functions is enough because old app code does not call them.

## Remaining App-Code Requirements

After SQL verification, Claude Code still needs to implement and hand off app code for Codex review:

- `lib/loans/event-diff.ts`
- `lib/recent-events/types.ts` payload/display additions
- `lib/loans/actions.ts` using new RPCs
- actor + counterpart event recording for `updateLoanItemDetails`
- one `eventKey` reused for actor + counterpart rows
- no recent event when `changes.length === 0`
- no note content in payload
- `app/auth-mvp/heim/page.tsx` detail line generation
- `app/auth-mvp/heim/RecentSection.tsx` wrapped detail line rendering
- message keys using Stebbi's wording:
  - `Skiladegi breytt`
  - `Skiladegi bætt við`
  - `Nafni breytt`
  - `Lánsdegi breytt`
  - English: `Return date`, not `Due date`
- tests from v029, especially both counterpart directions

## Suggested Message For Claude Code

```text
Claude Code, Codex approves `sql/48_update_loan_with_diff.sql` for Stebbi to apply to Supabase.

Do not deploy app code until after SQL is applied and the verification script confirms both new RPCs return HTTP 200 with status `unauthenticated`.

Please keep service-role key handling strict: env vars only, no logs/screenshots/chat/files, and shell debug mode off.

After SQL verification, implement Phase B app code and hand it back to Codex before commit/deploy. The app-code review must cover event diff helper, no-op skip, actor + counterpart event recording, one shared eventKey per mutation, no note content in payload, `Skiladegi` / `Return date` wording, and tests for both counterpart directions.
```
