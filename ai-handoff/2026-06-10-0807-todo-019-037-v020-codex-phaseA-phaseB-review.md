# TODO #19 / #37 - Codex review of v019 Phase A done + Phase B revised

Relevant TODO items: #19 recent read state and #37 all unread events + event detail history. TODO #27 is adjacent because invitation/received flows rely on the same `Nýlegt` event surface.

Reviewed by Codex:

- `ai-handoff/2026-06-10-0758-todo-019-037-v019-claude-phaseA-done-phaseB-revised.md`
- `lib/recent-events/helpers.server.ts`
- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/heim/RecentSection.tsx`
- `lib/__tests__/home-page.test.tsx`
- `lib/loans/types.ts`
- `sql/44_loan_item_details_edit.sql`

Codex did not rerun tests locally. Claude Code reports `npx vitest run` passing with `960 passed | 22 skipped | 8 todo` and `npx tsc --noEmit` with no errors.

## Overall verdict

Phase A is approved with minor follow-up cleanup.

Phase B is much safer than v017 because it leaves the existing `update_loan` RPC untouched and introduces a new `update_loan_with_diff` RPC. Codex approves the direction, but not production rollout yet. Before Stebbi applies SQL to Supabase, Claude Code should create the actual `sql/48_update_loan_with_diff.sql` file and address the findings below.

## Findings

### 1. Medium/High - New RPC rollout still needs Supabase/PostgREST availability verification

v019 correctly avoids changing `update_loan` and proposes deploying SQL first:

- v019:56-61
- v019:149-161

That removes the biggest backward-compatibility risk from v017. However, v019 also says:

- "No PostgREST schema cache flush required ... New function appears in schema cache after deploy" at v019:155

That is too confident for a new Supabase RPC. The old function is unaffected, but the new app version will call `update_loan_with_diff`. If the app deploys before PostgREST/Supabase schema cache sees the new function, edits can fail with a missing RPC/function error and the app will likely return `save_failed`.

Codex recommendation:

- Keep deploy order as SQL first, app second.
- Add an explicit verification step after SQL and before app deploy: confirm `update_loan_with_diff` is visible through the same API path the app uses.
- The verification call must be non-mutating, for example a call with a fake actor/loan UUID that returns `unauthenticated` or `not_found`, not a call against real user data.
- If Supabase returns a schema-cache/function-not-found error, wait/reload schema cache before deploying app code.

This is not a reason to reject the new-RPC approach. It is a rollout guard that should be in the Phase B handoff before production.

### 2. Medium - Phase B excludes the accepted/narrow edit flow that may matter most for #37

v019 explicitly says Phase B covers only `updateLoan` and defers `updateLoanItemDetails`:

- v019:242-246

Current `updateLoanItemDetails` is the RPC path for item name/note edits after acceptance, and it allows `created_by` or `lender_user_id`:

- `lib/loans/actions.ts:587-626`
- `sql/44_loan_item_details_edit.sql:13-66`

That means Phase B will add diff detail for creator pre-acceptance edits, but not for the accepted/narrow edit path. If Stebbi's main scenario is "notandi breytti hlut sem hinn aðilinn þarf að sjá í atburðasögu", then deferring B2 may leave the most user-visible edit path without detail.

Codex recommendation:

- Stebbi should decide before Phase B implementation:
  - Option A: Do Phase B narrowly now, then immediately do B2 for `update_loan_item_details`.
  - Option B: Include `update_loan_item_details_with_diff` in the same SQL/app phase.
- Codex leans toward including B2 soon, because #37 is about event history clarity, not only pre-acceptance edits.

### 3. Medium/Low - Phase A behavior is right, but mark-all IDs are not directly asserted

Phase A implementation looks correct:

- `getUnreadRecentEventsForUser(userId, limit?: number)` only calls `.limit()` when a number is provided: `lib/recent-events/helpers.server.ts:63-75`
- `/heim` now calls it without a limit: `app/auth-mvp/heim/page.tsx:90-92`
- `RecentSection` now uses separate outer/inner containers without conflicting overflow: `app/auth-mvp/heim/RecentSection.tsx:92-107`

However, v018 asked for a test that `Allt lesið` sends all fetched IDs. The current ack test only checks the optimistic done banner:

- `lib/__tests__/home-page.test.tsx:539-549`

Codex could not find an assertion like `expect(mockAckRecentEvents).toHaveBeenCalledWith({ event_ids: [...] })`.

Codex recommendation:

- Add or update a test with 4+ recent rows, click `Allt lesið`, and assert `ackRecentEvents` receives every row ID.
- Rename or update the now-misleading test title at `lib/__tests__/home-page.test.tsx:453`: `shows at most 3 events (server limits to 3)`. The behavior is no longer "at most 3".

This is not a blocker for Phase A if Claude Code's reported full tests passed, but it is worth cleaning up before commit.

### 4. Low/Medium - Phase B test plan says unit-test a non-exported helper

v019 says:

- `computeLoanChanges` is a pure helper in `lib/loans/actions.ts`, not exported at v019:188
- unit tests for `computeLoanChanges` at v019:250

Those two statements conflict unless tests only exercise the helper indirectly through `updateLoan`, or Claude Code uses an awkward test-only export pattern.

Codex recommendation:

- Either test `computeLoanChanges` indirectly through `updateLoan` action tests, or
- move the diff helper into a tiny exported module, for example `lib/loans/event-diff.ts`, and unit-test it there.

Codex leans toward a tiny exported pure helper if the diff logic grows beyond a few comparisons. If it stays very small, action-level tests are enough.

### 5. Low - Detail line UI should wrap safely

Phase B plans to render localized `detailLines` below the drawer label:

- v019:212-240

Item names can be up to 200 characters. A line like "Nafn breytt: very-long-old-name -> very-long-new-name" can get long on mobile.

Codex recommendation:

- Render detail lines with normal wrapping and `break-words`.
- Do not put detail lines inside a single-line/truncated element.
- Keep raw note content out of both payload and rendered detail lines, as v019 already does.

## Phase A approval

Codex approves Phase A as implemented, subject to the small test cleanup above.

Important: Codex did not apply SQL, did not run Supabase commands, and did not start a dev server.

## Phase B approval conditions

Codex approves the revised Phase B direction, not execution yet.

Before Stebbi gives Claude Code green light to implement/apply Phase B:

1. Claude Code should create the real `sql/48_update_loan_with_diff.sql` file for review.
2. The handoff should include a Supabase/PostgREST RPC availability verification step after SQL and before app deploy.
3. Stebbi should decide whether `updateLoanItemDetails` diff support is included now or becomes immediate B2.
4. Claude Code should clarify the `computeLoanChanges` test strategy.
5. Codex should review the final SQL file before Stebbi applies it to Supabase.

## Suggested message for Claude Code

```text
Claude Code, Codex reviewed v019.

Phase A is approved with minor cleanup: please add/adjust a test so clicking `Allt lesið` with 4+ rows asserts `ackRecentEvents` receives every fetched event ID, and rename the old misleading "shows at most 3 events" test title.

For Phase B, Codex approves the direction of adding a new `update_loan_with_diff` RPC instead of changing `update_loan`. Before implementation/production, please create the actual `sql/48_update_loan_with_diff.sql` migration file and include a Supabase/PostgREST availability verification step after SQL is applied and before app code calls the new RPC. If the new RPC is not visible in schema cache yet, do not deploy the app code.

Please also ask Stebbi to decide whether `updateLoanItemDetails` diff support should be included in the same phase or handled as immediate B2, because accepted/narrow edits may be the most relevant #37 user flow.

Finally, clarify whether `computeLoanChanges` will be tested indirectly through `updateLoan` or moved to a small exported pure helper module for direct unit tests.
```
