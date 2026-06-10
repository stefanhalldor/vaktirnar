# TODO #19 / #37 - Codex review of v035 Phase B post-implementation

Relevant TODO items: #19 recent read state and #37 all unread events + event detail history. This review covers Claude Code handoff `2026-06-10-1639-todo-019-037-v035-claude-phaseB-post-implementation.md`.

Codex reviewed with production glasses: Supabase/RPC auth, RLS exposure, event ownership, actor-read behavior, counterpart unread behavior, payload privacy, user-facing wording, and tests.

Codex did not run SQL, did not touch Supabase, did not start localhost, did not deploy, did not commit, and did not inspect production data.

## Verdict

Not quite final-approved yet.

The implementation direction looks right and the core actor/counterpart event behavior is present in code, but one acceptance test from v034 is missing: `recordRecentEvent` itself is not directly tested to prove `initiallyRead: true` writes a non-null `ack_at`.

This is a small fix, not a rewrite. Codex recommends Claude Code adds the helper-level test, re-runs the focused tests plus type-check, and then hands back a short v037.

## Findings

### Medium - v034 required helper-level `ack_at` tests, but v035 only tests the mocked call

Evidence:

- `lib/recent-events/helpers.server.ts:28-50` implements `recordRecentEvent()` and sets `ack_at: args.initiallyRead ? occurredAt : null`.
- `lib/__tests__/actions.test.ts:35` mocks `recordRecentEvent`, so action tests cannot prove what `recordRecentEvent()` writes into the Supabase upsert row.
- `lib/__tests__/actions.test.ts:1028-1035` verifies `updateLoan()` passes `initiallyRead: true`.
- `lib/__tests__/actions.test.ts:1094-1111` verifies `updateLoanItemDetails()` passes `initiallyRead: true` for actor and omits it for counterpart.
- `ai-handoff/2026-06-10-1535-todo-019-037-v034-codex-actor-read-events-addendum.md:100-105` explicitly required tests proving:
  - `recordRecentEvent` writes `ack_at` when `initiallyRead` is true
  - `recordRecentEvent` writes `ack_at: null` by default

Why this matters:

Stebbi specifically wanted to know that own edits are logged as read events. The current app-level tests prove the option is passed, but not that the helper turns the option into `ack_at`. Since unread `Nýlegt` intentionally filters on `ack_at IS NULL`, a helper regression would be easy to miss visually.

Required fix:

Add a direct unit test for `lib/recent-events/helpers.server.ts` with a mocked `getAdmin().from('recent_events').upsert(...)`.

Minimum cases:

- `recordRecentEvent({ ..., initiallyRead: true })` calls `upsert()` with:
  - `ack_at` non-null
  - `occurred_at` non-null
  - ideally `ack_at === occurred_at` using fake timers or captured row inspection
- `recordRecentEvent({ ... })` without `initiallyRead` calls `upsert()` with `ack_at: null`
- Keep the test local-only; do not hit Supabase.

### Low - reverse counterpart direction is covered by SQL review/manual testing, not by automated SQL execution

Evidence:

- `sql/48_update_loan_with_diff.sql:193-199` chooses `counterpart_user_id` by taking the other populated party, lender first then borrower.
- `lib/__tests__/actions.test.ts:1075-1111` tests that app code records an event for whatever `counterpart_user_id` the RPC returns.

This is acceptable for app-unit tests because the SQL function owns the direction logic, but it means the borrower-created reverse direction still needs localhost/manual verification with real RPC behavior before release.

Required before release:

- Stebbi should test borrower-created accepted loan direction on localhost:
  - User A creates loan as borrower.
  - User B accepts as lender.
  - User A edits item name or note through the allowed edit flow.
  - User B gets the unread `Nýlegt` event with before/after detail.

### Low residual risk - event writes remain best-effort and outside the RPC transaction

Evidence:

- `lib/recent-events/helpers.server.ts:24-56` documents and implements best-effort event recording; failures are logged and suppressed.
- `lib/loans/actions.ts:340-356` and `lib/loans/actions.ts:639-666` mutate the loan through RPC first and then write recent events.

Impact:

If a loan edit succeeds but the event insert fails, the loan change remains saved and the event can be missing. That is existing architecture, not a new RLS/auth weakness in v035.

Codex does not treat this as a Phase B blocker, but it should stay visible. If Stebbi wants event delivery to be guaranteed, that should become a separate TODO for transactional/event-outbox design rather than silently expanding this phase.

## What Looks Good

- SQL #48 does not weaken RLS or grant broad client access. New RPCs are service-role only.
- Unauthorized users get no before-values from SQL #48.
- `updateLoan()` logs actor self-history as already read and records no event on no-op.
- `updateLoanItemDetails()` logs actor as already read and counterpart as unread, sharing one `eventKey`.
- `getUnreadRecentEventsForUser(user.id)` now fetches all unread events unless a hard limit is explicitly passed.
- User-facing wording uses `Skiladagur` / `Skiladegi` and `Return date`, not `due date` / `gjalddagi`.
- Note content appears only in the event payload/detail for relevant event rows; no email/secrets are added.

## Commands Codex Ran

```bash
npm run test:run -- lib/__tests__/event-diff.test.ts lib/__tests__/actions.test.ts lib/__tests__/home-page.test.tsx
npm run type-check
```

Results:

- Focused Vitest: exit 0, 3 files passed, 122 tests passed, 5 todo.
- Type-check: exit 0.

## Localhost Checks For Stebbi

These checks are still part of acceptance before release. Use test users only and non-sensitive note text.

### 1. Own edit logs as read, not unread

Setup:

- Open `/auth-mvp/heim`.
- Click `Allt lesið` so `Nýlegt` starts empty for the actor.
- Go to `/auth-mvp/lanad-og-skilad`.

Action:

- As the actor, edit an item name or note.
- Save.
- Return to `/auth-mvp/heim`.

Expected:

- The actor does not get a new unread `Nýlegt` item for their own edit.
- This proves product behavior, but not database storage. The missing helper test above should prove the stored row has `ack_at` set.

### 2. Counterpart gets unread edit event

Setup:

- Use two browser profiles or two test users.
- User A and User B share an accepted loan.
- User B clears `Nýlegt`.

Action:

- User A edits item name or note.
- User B opens `/auth-mvp/heim`.

Expected:

- User B sees an unread `Nýlegt` event.
- Opening the drawer shows before/after detail.
- User A does not see the same edit as unread.

### 3. Reverse borrower-created direction

Setup:

- User A creates a loan as borrower.
- User B accepts as lender.

Action:

- User A edits item name or note.

Expected:

- User B gets the unread counterpart event.
- This verifies the SQL `counterpart_user_id` direction that unit tests cannot prove without executing the RPC.

### 4. Return date and loan date wording

Action:

- Add, change, and remove return date where the UI allows it.
- Change loan date where the UI allows it.

Expected:

- Details use:
  - `Skiladegi bætt við`
  - `Skiladegi breytt`
  - `Skiladagur fjarlægður`
  - `Lánsdegi breytt`
- English locale uses `Return date`, not `Due date`.

### 5. No-op save

Action:

- Open edit, save without changing anything.

Expected:

- Save succeeds.
- No new unread event appears for actor or counterpart.

## Required Next Step For Claude Code

Claude Code should add the direct helper tests for `recordRecentEvent()` and `ack_at`, then re-run:

```bash
npm run test:run -- lib/__tests__/event-diff.test.ts lib/__tests__/actions.test.ts lib/__tests__/home-page.test.tsx <new-helper-test-file>
npm run type-check
```

After that, Claude Code should send a short v037 handoff that includes:

- files changed
- exact test results
- confirmation that actor `initiallyRead` writes `ack_at`
- confirmation that default/counterpart event writes `ack_at: null`
- updated localhost checks if anything changed
