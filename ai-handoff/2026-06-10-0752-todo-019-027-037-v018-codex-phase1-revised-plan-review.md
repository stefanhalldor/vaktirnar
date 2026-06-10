# TODO #19 / #27 / #37 - Codex review of Claude Code v017 revised plan

Relevant TODO items: #19 recent read state, #27 loan invitation/received flow, #37 show all unread events and event detail history.

Reviewed by Codex:

- `ai-handoff/2026-06-10-0740-todo-019-027-037-v017-claude-phase1-revised-plan.md`
- `lib/recent-events/helpers.server.ts`
- `lib/loans/actions.ts`
- `sql/32_loan_functions.sql`

## Overall verdict

Codex does not approve Phase B as written.

Phase A is close and can proceed after two concrete corrections:

1. `getUnreadRecentEventsForUser` must truly support "no limit"; omitting the argument currently still means `limit = 3`.
2. The scroll container should avoid conflicting `overflow-hidden` / `overflow-y-auto` on the same element.

Phase B has a production-risky RPC contract change. Claude Code should revise it before Stebbi gives green light for SQL.

## Findings

### 1. High - `update_loan` return type change is not rollout-safe

v017 proposes changing `update_loan` from `RETURNS text` to a table return:

- v017:17-23
- v017:151-181
- v017:189-191

Current SQL is:

- `sql/32_loan_functions.sql:181-230`
- specifically `RETURNS text` at `sql/32_loan_functions.sql:189`

Current app code assumes the RPC result is a string:

- `lib/loans/actions.ts:310-330`
- specifically `const result = data as string` at `lib/loans/actions.ts:324`

The risk: if SQL is deployed first and `update_loan` starts returning a row/object/array instead of a string, current app code will not safely "ignore extra columns". It will likely compare a non-string value to `'ok'`, fail `result !== 'ok'`, and return `save_failed`. That can break loan edits in production.

There is also a Postgres migration detail: changing a function return type from `text` to `table(...)` usually cannot be done with plain `CREATE OR REPLACE FUNCTION`; it requires dropping and recreating the function, or creating a new function name. That makes the deploy sequence more sensitive and can interact with PostgREST/Supabase schema cache and grants.

Codex recommendation:

- Prefer a new RPC, for example `update_loan_with_diff`, while leaving existing `update_loan` untouched until the app is fully migrated.
- If Claude Code insists on replacing `update_loan`, the plan needs an exact two-step rollout plan and code that handles both old string responses and new row responses. Even then, SQL-first deployment can still break old app versions, so the new-RPC path is safer.
- The migration must explicitly include `DROP FUNCTION`/`CREATE FUNCTION`, grants, and schema-cache/reload expectations if needed.

### 2. High/Medium - v017 overstates authorization coverage

v017 says the existing RPC checks `created_by` / `lender_user_id`:

- v017:15

But current `update_loan` only allows the creator:

- `sql/32_loan_functions.sql:205-211`
- `v_loan.created_by IS DISTINCT FROM p_actor_id` returns `not_found`
- accepted invitations return `not_editable`

This matters because #27 and #37 are increasingly about received invitations, accepted/counterparty flows, and events that should be visible to the other person. Phase B as written only improves the old full-edit path, not necessarily the accepted loan item-details path.

The plan acknowledges `updateLoanItemDetails` is deferred:

- v017:149
- current action is `lib/loans/actions.ts:587-626`

Codex recommendation:

- Claude Code should be explicit that Phase B only covers `updateLoan`, not accepted/narrow edits through `updateLoanItemDetails`.
- If Stebbi expects event detail history for the normal accepted-loan edit path, `update_loan_item_details` should not be deferred too far. Otherwise #37 may look done in tests while missing the most relevant user flow.

### 3. Medium - Phase A "no limit" wording does not match current helper

v017 says:

- "Fetch all unread rows with no limit" at v017:31
- `heim/page.tsx` passes no limit at v017:31
- file table says to "Remove `limit` parameter from call in `getUnreadRecentEventsForUser`" at v017:123

Current helper still defaults to 3 and always calls `.limit(limit)`:

- `lib/recent-events/helpers.server.ts:62-74`

So `getUnreadRecentEventsForUser(user.id)` still returns 3 rows today.

Codex recommendation:

```ts
export async function getUnreadRecentEventsForUser(
  userId: string,
  limit?: number,
): Promise<RecentEventRow[]> {
  const query = admin
    .from(TABLE)
    .select(...)
    .eq('user_id', userId)
    .is('ack_at', null)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })

  if (typeof limit === 'number') query.limit(limit)
}
```

Claude Code should implement the real conditional limit, not only remove the second argument from the caller.

### 4. Medium - Scroll container class has conflicting overflow behavior

v017 proposes:

- v017:45-53

The same element always has `overflow-hidden`, and sometimes also has `overflow-y-auto`. With Tailwind, both classes can exist and final CSS precedence depends on generated rule order, not the order in the template string. That can make scrolling brittle.

Codex recommendation:

- Use an outer wrapper for border/radius clipping and an inner list for scroll, or
- use `overflow-x-hidden overflow-y-auto` on the scroll element when needed, without a competing generic `overflow-hidden`.

This is not a blocker if manually verified, but it is an easy fix before implementation.

### 5. Medium - SQL rollback/recovery plan is too vague

v017 says rollback is "restore original function signature" and references `sql/update_loan_original.sql`:

- v017:169-181

That file does not appear to be part of the current plan, and the migration body is left for implementation time.

For a Supabase RPC contract change, Codex wants more precision before approval:

- exact SQL body
- exact function signature
- whether grants need to be restored
- whether dependent API clients/PostgREST schema cache need attention
- how old app + new SQL behaves
- how new app + old SQL behaves
- exact rollback SQL or pointer to the previous canonical function body

Codex recommendation:

- Do not approve SQL #48 until the exact SQL is written and reviewed.
- If using a new RPC name, rollback becomes much safer because existing `update_loan` remains intact.

### 6. Low/Medium - Payload privacy wording should stay conservative

v017 says item name and dates are "not sensitive":

- v017:78

For a personal tracker, item names and dates can still be personal. The current event is for the same acting user, so the proposed payload is probably acceptable if RLS/event ownership remains correct. But Claude Code should avoid treating item names as generally non-sensitive, especially if #38/#39 later create counterpart events.

Codex recommendation:

- Keep note content out of payload, as v017 now does.
- Keep event rows strictly scoped to the owning user.
- If a future event is sent to the counterpart, make an explicit payload decision per event type.

## What Codex would approve now

Codex approves Phase A in principle if Claude Code fixes:

- `getUnreadRecentEventsForUser(userId, limit?: number)` so no argument means no `.limit()`.
- Scroll container overflow structure.
- Tests for 4+ rows rendered, 6+ row scroll behavior, and `Allt lesið` sending all fetched IDs.

Codex does not approve Phase B yet.

The safer Phase B shape is:

1. Add a new RPC such as `update_loan_with_diff`.
2. Keep old `update_loan` untouched for backward compatibility.
3. Update `lib/loans/actions.ts` to call the new RPC only where diff payloads are needed.
4. Add tests for old/new response parsing if any compatibility adapter remains.
5. Write exact SQL #48 before implementation review, including grants and rollback.
6. Decide whether `update_loan_item_details` belongs in the same phase or the next immediate phase, because it likely covers important accepted-loan edit flows.

## Suggested message for Claude Code

```text
Claude Code, Codex reviewed v017 and does not approve Phase B as written.

Phase A can proceed after fixing the helper so no argument truly means no `.limit()`, and after making the scroll container avoid conflicting `overflow-hidden` / `overflow-y-auto`.

For Phase B, please revise the plan around RPC compatibility. Changing `update_loan` from `RETURNS text` to `RETURNS table(...)` is not safely backward-compatible with current `lib/loans/actions.ts`, which casts RPC data to string and compares it to `'ok'`. SQL-first deployment could make current app versions return `save_failed` for normal loan edits.

Codex recommends adding a new RPC such as `update_loan_with_diff` and leaving existing `update_loan` intact. Please provide exact SQL #48, including function signature, grants, rollback, deploy ordering, and how this affects PostgREST/Supabase schema cache if relevant.

Also please clarify whether Phase B covers only `updateLoan`, or whether `updateLoanItemDetails` must be included soon so accepted/narrow edit flows also get useful event details.
```
