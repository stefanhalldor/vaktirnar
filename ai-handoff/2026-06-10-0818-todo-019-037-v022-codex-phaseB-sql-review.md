# TODO #19 / #37 - Codex review of v021 Phase A cleanup + Phase B SQL

Relevant TODO items: #19 recent read state and #37 all unread events + event detail history. TODO #27, #38, and #39 are adjacent because `Nýlegt` is becoming the event surface for invitation and counterpart changes.

Reviewed by Codex:

- `ai-handoff/2026-06-10-0815-todo-019-037-v021-claude-phaseA-cleanup-phaseB-sql-ready.md`
- `sql/48_update_loan_with_diff.sql`
- `sql/32_loan_functions.sql`
- `sql/44_loan_item_details_edit.sql`
- `lib/loans/actions.ts`
- `lib/recent-events/helpers.server.ts`
- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/heim/RecentSection.tsx`
- `lib/__tests__/home-page.test.tsx`
- `TODO.md`

Codex also ran:

- `npm run test:run -- lib/__tests__/home-page.test.tsx` -> 49 passed
- `npm run type-check` -> no errors

No SQL was run. No Supabase, production, deployment, GitHub, billing, auth, or user data was touched.

## Overall verdict

Phase A is approved.

`sql/48_update_loan_with_diff.sql` is a reasonable and much safer building block than changing the existing `update_loan` RPC. It leaves the old function untouched, keeps grants narrow, and returns before-values only after authorization.

But because Stebbi said "best solution, no shortcuts", Codex does not recommend applying `sql/48` as-is yet. The better product/technical decision is Option B from v021: include `update_loan_item_details_with_diff` in the same phase before Stebbi applies SQL.

Reason: #37 is about useful event history. The accepted/narrow edit path is likely the more important real user path than pre-acceptance `updateLoan`.

## Findings

### 1. High/Medium - Choose Option B; Phase A + only `update_loan_with_diff` is still partial

v021 asks Stebbi to choose:

- Option A: only `update_loan_with_diff`
- Option B: include `update_loan_item_details_with_diff` too

Given Stebbi's "best solution, no shortcuts" instruction, Codex recommends Option B.

Current `updateLoan` covers creator edits before invitation acceptance:

- `lib/loans/actions.ts:301-345`
- `sql/32_loan_functions.sql:181-230`

Current `updateLoanItemDetails` covers the accepted/narrow edit path and allows `created_by` or `lender_user_id`:

- `lib/loans/actions.ts:587-626`
- `sql/44_loan_item_details_edit.sql:13-66`

If Phase B only adds detail diffs to `updateLoan`, then the app can still miss detail history for item name/note edits on accepted loans. That is exactly the kind of user-visible edit history #37 is trying to make trustworthy.

Codex recommendation:

- Do not apply `sql/48_update_loan_with_diff.sql` yet.
- Claude Code should update the same unrun migration to include both:
  - `update_loan_with_diff(uuid, uuid, text, text, date, date)`
  - `update_loan_item_details_with_diff(uuid, uuid, text, text)`
- Keep the existing RPCs untouched for backward compatibility.
- App code should update both `updateLoan` and `updateLoanItemDetails` to use the new diff RPCs after SQL verification succeeds.

This keeps one SQL migration and one app deploy, without weakening the old stable contracts.

### 2. Medium - Verification command discards the response body it says to verify

v021 proposes:

- `curl -s -o /dev/null -w "%{http_code}" ...`
- expected body: `[{"status":"unauthenticated",...}]`

The command discards the body with `-o /dev/null`, so it only verifies HTTP status, not the returned status payload. For a rollout guard, Codex wants both:

- HTTP 200
- body contains `status = unauthenticated`

Codex recommendation:

- Use a verification command that prints/parses body and status.
- Use environment variables for `PROJECT_REF` and `SERVICE_ROLE_KEY`.
- Do not paste the real service-role key into handoff files, chats, screenshots, shell history, or logs.
- Stebbi should run this manually only when ready, or explicitly authorize Claude Code with a full permission explanation because it uses a service-role secret.

The verification call itself is non-mutating if it uses the nil actor UUID and a fake loan ID, because the function returns before row lookup. But the service-role key is still highly sensitive.

### 3. Medium - Phase B implementation should skip or avoid misleading no-op events

v021 moves diff logic into `lib/loans/event-diff.ts`, which Codex likes. But implementation should decide what happens when `changes.length === 0`.

Current actions record `loan_updated` events after every successful save:

- `lib/loans/actions.ts:332-341`
- `lib/loans/actions.ts:615-624`

If a user saves without changing any user-facing field, recording another unread `loan_updated` event makes `Nýlegt` less trustworthy. #37 is specifically about explaining what changed.

Codex recommendation:

- If `changes.length === 0`, do not record a `loan_updated` recent event.
- Still return `{ ok: true }` after the RPC succeeds.
- Add tests for "no changes -> no event recorded".

If Claude Code thinks preserving old "always record update" behavior is important, that should be a deliberate product decision from Stebbi, not an accidental side effect.

### 4. Medium/Low - Event recipient scope must be explicit for accepted/narrow edits

For pre-acceptance `updateLoan`, actor-only recent events are consistent with current behavior.

For accepted/narrow edits via `updateLoanItemDetails`, actor-only events may not be enough. If one party changes a shared accepted item, the other party may be the person who actually needs to see "what changed" in `Nýlegt`.

Codex recommendation:

- For this phase, at minimum document whether `updateLoanItemDetails` records diff events for:
  - actor only, or
  - actor and counterpart.
- If counterpart events are included, payload must remain conservative:
  - no recipient email
  - no note content
  - item name/date values only where product-approved
  - per-user `recent_events.user_id` ownership preserved

Codex does not want #38/#39 fully pulled into this phase by accident. But the accepted-edit recipient rule should be explicit before Claude Code claims #37 is complete.

### 5. Low - SQL 48 grants are acceptable, but final expanded migration should keep the same safety posture

Current SQL 48:

- creates a new function only
- does not alter or drop existing functions
- checks `auth.users`
- locks the row with `FOR UPDATE`
- checks creator authorization before returning before-values
- returns `not_found` for unauthorized actor
- grants execute only to `service_role`
- revokes from `PUBLIC`, `anon`, and `authenticated`

That is the right shape.

When adding `update_loan_item_details_with_diff`, Claude Code should mirror the safety posture from `sql/44_loan_item_details_edit.sql`:

- allow only `created_by` or `lender_user_id`
- return `not_found` for unauthorized actors
- do not expose borrower-only access unless Stebbi explicitly decides that
- return before item name/note only after authorization
- no note content in event payload
- service_role-only execute grant

## Phase A status

Approved.

Codex verified:

- no-limit helper path
- `/heim` fetches all unread rows
- scroll container structure
- ack-all IDs test added
- focused home-page tests pass
- type-check passes

## Phase B recommendation

Stebbi should choose Option B.

Claude Code should revise `sql/48_update_loan_with_diff.sql` before Stebbi applies it to Supabase:

1. Keep existing `update_loan` and `update_loan_item_details` untouched.
2. Add both new diff RPCs in the same migration.
3. Add app code for both actions in the same deploy after SQL verification.
4. Add no-op update behavior tests.
5. Fix the verification command so it checks body + HTTP status and handles service-role key safely.

Only after that should Codex re-review the final SQL and app plan for production rollout.

## Suggested message for Claude Code

```text
Claude Code, Codex reviewed v021.

Phase A is approved. Codex also ran `npm run test:run -- lib/__tests__/home-page.test.tsx` and `npm run type-check`; both passed.

For Phase B, Stebbi said "best solution, no shortcuts", so Codex recommends Option B. Please do not apply the current `sql/48_update_loan_with_diff.sql` yet. Instead, revise the same unrun migration to include both new backward-compatible RPCs:

- `update_loan_with_diff(uuid, uuid, text, text, date, date)`
- `update_loan_item_details_with_diff(uuid, uuid, text, text)`

Keep existing `update_loan` and `update_loan_item_details` unchanged.

Also please fix the PostgREST verification command so it verifies both HTTP 200 and response body `status = unauthenticated`; the current `curl -o /dev/null` discards the body. Use environment variables for the service-role key and do not paste real secrets into chat, files, screenshots, or shell history.

For app implementation, please handle `changes.length === 0` deliberately. Codex recommends no `loan_updated` recent event when no user-facing field changed. Add tests for that.

Finally, for accepted/narrow edits, explicitly document whether diff events are recorded for actor only or also for the counterpart. If counterpart events are included, keep payload conservative: no recipient email, no note content, and strict per-user `recent_events.user_id` ownership.
```
