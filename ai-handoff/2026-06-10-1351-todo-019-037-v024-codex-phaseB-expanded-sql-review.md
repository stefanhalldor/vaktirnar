# TODO #19 / #37 - Codex review of v023 expanded Phase B SQL plan

Relevant TODO items: #19 recent read state and #37 all unread events + event detail history. TODO #27, #38, and #39 are adjacent because `Nýlegt` is becoming the event surface for invitation and counterpart changes.

Reviewed by Codex:

- `ai-handoff/2026-06-10-0825-todo-019-037-v023-claude-phaseB-expanded-sql-plan.md`
- `sql/48_update_loan_with_diff.sql`
- `sql/46_recent_events.sql`
- `sql/44_loan_item_details_edit.sql`
- `sql/30_loan_items.sql`
- `lib/recent-events/helpers.server.ts`
- `lib/loans/actions.ts`

Codex did not run SQL. Codex did not run tests in this review turn because v023 is mainly SQL/plan review and no app implementation has been added yet.

## Overall Verdict

`sql/48_update_loan_with_diff.sql` is much better than the earlier plan:

- It keeps existing RPCs unchanged.
- It adds new RPC names.
- It keeps service-role-only execution.
- It returns before-values only after authorization.
- It mirrors the current auth checks in `update_loan` and `update_loan_item_details`.

However, Codex does not approve Phase B rollout yet.

For Stebbi's "best solution, no shortcuts" requirement, the biggest remaining issue is not the SQL mechanics. It is product/event scope: v023 still records accepted/narrow edit events for the actor only. That means the other person in an accepted loan can still miss the event that something changed.

Codex recommends one more revision before Stebbi applies SQL.

## Findings

### 1. High/Medium - Actor-only events are probably still a shortcut for accepted/narrow edits

v023 says:

- "This phase: actor only" at v023:108-119
- `updateLoanItemDetails` will use the new diff RPC, but the event is still recorded only for `user.id`

This is safer than adding broad counterpart events without thought. But for #37, it is likely not the best product behavior.

In an accepted/shared loan, if one side changes item name or note, the other side is usually the one who needs an unread `Nýlegt` event saying what changed. If only the actor gets the event, `Nýlegt` becomes more like a self-audit log than a useful inbox.

Current schema supports identifying both sides:

- `loan_items.lender_user_id`
- `loan_items.borrower_user_id`
- `loan_items.created_by`

Current `update_loan_item_details` already allows `created_by OR lender_user_id`, and borrower-only actors get `not_found`.

Codex recommendation:

- For `updateLoan`, actor-only is acceptable because it is pre-acceptance and counterpart identity may not be settled.
- For `updateLoanItemDetails`, include counterpart event support in this phase unless Stebbi explicitly says not to.
- Prefer returning `counterpart_user_id uuid` from `update_loan_item_details_with_diff` after authorization, rather than doing a separate service-role app query after the mutation.
- Only record a counterpart event when `counterpart_user_id IS NOT NULL` and differs from actor.
- Keep the existing actor event if Stebbi wants self-history, but the counterpart event is the important inbox behavior.

Payload safety rules for counterpart event:

- no recipient email
- no note content
- item name old/new may be included only if Stebbi accepts that shared loan item names are visible to both parties
- per-user `recent_events.user_id` ownership must remain strict
- event keys must be safe for two users; `recent_events` uniqueness is `(user_id, event_key)`, so the same event key can be reused for actor/counterpart rows

### 2. Medium - Verification script still does not verify HTTP status or fail hard

v023 says the verification checks both HTTP 200 and body:

- v023:54-91

But the script only does:

```bash
response=$(curl -s ...)
echo "$response" | grep -q '"unauthenticated"' && echo "OK" || echo "FAIL - not visible yet"
```

It does not capture HTTP status. It also prints `FAIL` but does not return non-zero from `verify_rpc`, so a human or script could continue accidentally.

Codex recommendation:

- Capture body and HTTP code separately.
- Require `http_code = 200`.
- Parse body enough to confirm `status` is exactly `unauthenticated`.
- Return non-zero on failure.
- Keep service-role key only in env vars; do not paste it into chat, files, screenshots, or shell history.
- Mention that `set -x`/shell debug logging must be off before running.

This is especially important because this check uses the service-role key.

### 3. Medium - Rollback plan needs app/SQL ordering, not only DROP FUNCTION

v023 rollback is:

```sql
DROP FUNCTION IF EXISTS public.update_loan_with_diff(...);
DROP FUNCTION IF EXISTS public.update_loan_item_details_with_diff(...);
```

That is correct as SQL rollback for the migration itself. But once app code starts calling the new RPCs, dropping the functions first will make edits fail.

Codex recommendation:

- Document rollback order:
  1. redeploy previous app version that calls old RPCs
  2. verify edits use old RPCs again
  3. then drop new functions if needed
  4. reload/verify PostgREST schema cache if Supabase API still exposes stale metadata

Because existing old RPCs remain untouched, rollback can be safe, but only with this ordering.

### 4. Medium/Low - Loaned-at detail should show the actual before/after dates

v023 i18n table includes specific old/new values for due date and item name, but `eventDetailLoanedAtChanged` is only:

- IS: `Lánsdagur breytt`
- EN: `Loan date changed`

#37 explicitly asks for "hvað breyttist" and examples include previous values. If `loaned_at` changes, the detail line should be as concrete as due date:

- `Lánsdagur breytt: {oldDate} -> {newDate}`
- `Loan date changed: {oldDate} -> {newDate}`

Use the same localized date formatter as due date detail lines.

### 5. Low - SQL safety posture is good; preserve it in the next revision

The current SQL file has the right basic safety shape:

- `BEGIN` / `COMMIT`
- new functions only
- old functions untouched
- `SET search_path = ''`
- row lock with `FOR UPDATE`
- authorization before returning before-values
- unauthorized actors get `not_found`
- `service_role` execute grant only
- no direct anon/authenticated execute

When revising for counterpart support, keep those properties.

For `update_loan_item_details_with_diff`, return only what the app needs:

- `status`
- `before_item_name`
- `before_note`
- `counterpart_user_id`

Do not return emails or unrelated user/profile data.

### 6. Low - No-op update handling is approved

Codex approves v023 Part 3:

- if `changes.length === 0`, no `loan_updated` event is recorded
- action still returns `{ ok: true }`

Add tests for both `updateLoan` and `updateLoanItemDetails`.

## SQL Approval Status

Codex approves the current `sql/48` as a safe intermediate draft, but does not recommend applying it to Supabase yet.

Reason: if the best solution includes counterpart events for accepted/narrow edits, the SQL should be revised before it is applied, likely by adding `counterpart_user_id` to `update_loan_item_details_with_diff`.

## Recommended Next Step

Claude Code should produce v025 with:

1. Revised `sql/48_update_loan_with_diff.sql` including counterpart support for `update_loan_item_details_with_diff`.
2. Updated app implementation plan for recording counterpart recent event rows safely.
3. Fixed PostgREST verification script that checks HTTP status and exits non-zero on failure.
4. Rollback ordering for app + SQL.
5. Updated i18n key for `loaned_at` old/new detail.

Then Codex can do a final SQL/app-plan review before Stebbi applies anything to Supabase.

## Suggested Message For Claude Code

```text
Claude Code, Codex reviewed v023.

The expanded SQL shape is much better and the new RPC approach is safe in principle. But because Stebbi asked for the best solution with no shortcuts, Codex does not recommend applying `sql/48` yet.

Please revise v023 into v025 with counterpart support for accepted/narrow edits. Specifically, update `update_loan_item_details_with_diff` to return `counterpart_user_id` after authorization. App code should record a counterpart `recent_events` row when `counterpart_user_id` exists and differs from actor. Keep note content out of payload, do not include emails, and keep per-user `recent_events.user_id` ownership strict.

Actor-only is acceptable for pre-acceptance `updateLoan`, but actor-only for accepted `updateLoanItemDetails` leaves the other party blind to changes, which undercuts #37.

Also fix the PostgREST verification script: it currently checks only body text, not HTTP status, and it does not fail hard. It should require HTTP 200, verify `status = unauthenticated`, and return non-zero on failure. Keep service-role key only in env vars and do not log it.

Please also document rollback order: redeploy old app first, then drop new RPCs if needed.

Finally, update `eventDetailLoanedAtChanged` to include old and new dates, not just "Lánsdagur breytt".
```
