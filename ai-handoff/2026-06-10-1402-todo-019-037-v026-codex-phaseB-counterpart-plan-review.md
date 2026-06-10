# TODO #19 / #37 - Codex review of v025 counterpart final plan

Relevant TODO items: #19 recent read state and #37 all unread events + event detail history. TODO #27, #38, and #39 are adjacent because `Nýlegt` is becoming the event surface for invitation and counterpart changes.

Reviewed by Codex:

- `ai-handoff/2026-06-10-1400-todo-019-037-v025-claude-phaseB-counterpart-final-plan.md`
- `sql/48_update_loan_with_diff.sql`
- `sql/32_loan_functions.sql`
- `sql/43_open_loans.sql`
- `sql/44_loan_item_details_edit.sql`
- `sql/46_recent_events.sql`
- `lib/recent-events/helpers.server.ts`
- `messages/en.json` via text search for due/return date wording

Codex did not run SQL, did not touch Supabase, and did not run tests in this review turn.

## Overall Verdict

Codex does not approve applying `sql/48_update_loan_with_diff.sql` yet.

v025 is close, but there is one important correctness bug in the counterpart logic: `counterpart_user_id` cannot always be `borrower_user_id`.

The plan also needs to incorporate Stebbi's latest wording decision: user-facing text should use `Skiladagur` and `Return date`, not `Gjalddagi` or `Due date`.

## Findings

### 1. High - `counterpart_user_id = borrower_user_id` is wrong for borrower-created loans

v025 says:

- `counterpart_user_id` is `v_loan.borrower_user_id`
- "the actor is always on the lender side"
- therefore borrower should receive the inbox event

This assumption is false.

The create flows allow the creator to be borrower:

- `sql/32_loan_functions.sql:120-137`
- `sql/43_open_loans.sql:100-117`

When `p_creator_role != 'lender'`, the inserted row has:

- `borrower_user_id = p_actor_id`
- `created_by = p_actor_id`

Current `update_loan_item_details` authorization allows:

- `created_by OR lender_user_id`
- `sql/44_loan_item_details_edit.sql:37-40`

So a borrower-created loan can be edited by the borrower because that user is `created_by`. In that case, v025 returns `counterpart_user_id = borrower_user_id`, which is the actor. App code then skips counterpart event because `counterpart_user_id === user.id`, and the actual lender receives no event.

That undercuts the whole #37 goal for one real direction of the loan flow.

Codex recommendation:

Return the other party, not always the borrower.

Suggested SQL shape inside `update_loan_item_details_with_diff` after authorization:

```sql
RETURN QUERY SELECT
  'ok'::text,
  v_loan.item_name,
  v_loan.note,
  CASE
    WHEN v_loan.lender_user_id IS NOT NULL
      AND v_loan.lender_user_id IS DISTINCT FROM p_actor_id
      THEN v_loan.lender_user_id
    WHEN v_loan.borrower_user_id IS NOT NULL
      AND v_loan.borrower_user_id IS DISTINCT FROM p_actor_id
      THEN v_loan.borrower_user_id
    ELSE NULL::uuid
  END;
```

Also update comments and v025 wording:

- Do not say actor is always lender side.
- Say counterpart is the other populated party on the loan, if any.

Add tests for both directions:

- lender actor -> borrower counterpart event
- borrower-created actor -> lender counterpart event
- no counterpart -> actor event only
- counterpart = actor edge case -> actor event only

### 2. Medium - User-facing wording must be `Skiladagur` / `Return date`

Stebbi clarified after v025:

> Notum ekki due date og gjalddagi... frekar "Return date" og "Skiladagur"

v025 still proposes:

- `eventDetailDueDateRemoved`
- `Gjalddagi fjarlægður`
- `Due date removed`
- etc.

Codex recommendation:

- User-facing Icelandic: `Skiladagur`
- User-facing English: `Return date`
- Prefer new key names like:
  - `eventDetailReturnDateRemoved`
  - `eventDetailReturnDateChanged`
  - `eventDetailReturnDateAdded`
- Keep internal DB/code field `due_at` unless there is a separate, much larger migration. This review is about user-facing wording, not renaming schema.

Suggested labels:

| Key | IS | EN |
|-----|----|----|
| `eventDetailReturnDateRemoved` | `Skiladagur fjarlægður: {date}` | `Return date removed: {date}` |
| `eventDetailReturnDateChanged` | `Skiladagur breytt: {oldDate} -> {newDate}` | `Return date changed: {oldDate} -> {newDate}` |
| `eventDetailReturnDateAdded` | `Skiladagur bætt við: {date}` | `Return date added: {date}` |

Because project files are mostly ASCII in code, Claude Code can use `->` instead of the arrow glyph in newly added message values unless existing locale style clearly prefers the glyph.

### 3. Medium - Verification script is improved, but body check should be stricter

v025 now checks HTTP status and exits non-zero. Good.

It still checks body with:

```bash
grep -q '"unauthenticated"'
```

Codex recommends tightening this slightly to avoid false positives from unexpected error text:

```bash
printf '%s' "$response_body" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"unauthenticated"'
```

This keeps the script lightweight without requiring `jq`.

Also keep the v025 warning:

- service-role key only in env vars
- no `set -x`
- no screenshots/logs/chat with the key

### 4. Medium/Low - SQL comments overstate "Authorization before any data access"

v025 says:

- "Authorization before any data access"

The functions do check `auth.users` before row lookup, but they still `SELECT * INTO v_loan ... FOR UPDATE` before verifying the actor owns/can edit that specific row. This matches the existing RPC style and does not return before-values until after authorization, so Codex is not calling it a functional security bug.

But the comment is inaccurate and should be changed to avoid false confidence.

Better wording:

- "Authorization before returning before-values"
- "Unauthorized actors receive `not_found` and no before-values"

### 5. Low - Generate one event key for actor + counterpart rows

v025 says actor and counterpart events use the same payload and different `userId`, but does not specify event key handling.

Because `recent_events` uniqueness is `(user_id, event_key)`, the same `eventKey` can safely be reused for actor and counterpart rows.

Codex recommendation:

- Generate one `eventKey` once per mutation.
- Use that same `eventKey` for actor and counterpart events.
- Do not call `new Date().toISOString()` separately for the two event keys.

This makes the paired events easier to reason about and avoids weird near-duplicate timestamps.

### 6. Low - Parse missing RPC rows defensively

When app code parses `data[0]`, handle empty or malformed responses as `save_failed`.

This is not expected if SQL and PostgREST are healthy, but it protects the app if the RPC contract is not what the client expects.

## What Codex Approves

Codex approves these parts of v025:

- old RPCs stay untouched
- new RPC names
- service-role-only execute grants
- before-values returned only on `ok`
- no note content in payload
- no email/profile data returned from SQL
- no-op update skips recent event
- app records counterpart event best-effort through `recordRecentEvent`
- rollback order is now basically correct
- `eventDetailLoanedAtChanged` includes old/new values

## Required Changes Before SQL

Claude Code should produce v027 or directly update the plan/SQL with:

1. Fix `counterpart_user_id` to return the other party, not always borrower.
2. Add tests for lender actor and borrower-created actor directions.
3. Update event detail wording to `Skiladagur` / `Return date`.
4. Tighten verification body check to `"status": "unauthenticated"`.
5. Adjust comments that claim authorization happens before any data access.
6. Reuse one `eventKey` for actor + counterpart rows.

After those changes, Codex expects the plan to be approvable unless new implementation details introduce fresh risk.

## Suggested Message For Claude Code

```text
Claude Code, Codex reviewed v025 and does not approve applying SQL yet.

Main blocker: `counterpart_user_id = borrower_user_id` is wrong for borrower-created loans. The create flows can set `borrower_user_id = created_by`, and current `update_loan_item_details` allows `created_by OR lender_user_id`. So a borrower-created actor can edit; with the current SQL, counterpart becomes the actor and the real lender gets no event.

Please change `update_loan_item_details_with_diff` so `counterpart_user_id` is the other populated party on the loan:

CASE
  WHEN lender_user_id is not null and lender_user_id is distinct from actor THEN lender_user_id
  WHEN borrower_user_id is not null and borrower_user_id is distinct from actor THEN borrower_user_id
  ELSE NULL
END

Also update comments: do not say actor is always lender side.

Stebbi also clarified wording: user-facing text should use `Skiladagur` and `Return date`, not `Gjalddagi` / `Due date`. Internal `due_at` can stay as code/schema field. Please rename the new event detail labels/keys accordingly, for example `eventDetailReturnDateRemoved/Changed/Added`.

Minor cleanup: tighten the verification grep to check `"status": "unauthenticated"`, change comments that say authorization happens before any data access, and generate one eventKey per mutation to reuse for actor + counterpart rows.
```
