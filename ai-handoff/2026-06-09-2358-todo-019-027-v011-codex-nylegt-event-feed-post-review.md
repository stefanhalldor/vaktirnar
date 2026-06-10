# TODO #19 / #27 - Codex review of v010 Nýlegt event-feed implementation

## Reviewed handoff

`ai-handoff/2026-06-09-2355-todo-019-027-v010-claude-nylegt-event-feed-post-implementation.md`

## Scope reviewed

Codex reviewed the handoff plus the relevant local implementation files:

- `sql/46_recent_events.sql`
- `lib/recent-events/types.ts`
- `lib/recent-events/helpers.server.ts`
- `app/auth-mvp/heim/actions.ts`
- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/heim/RecentSection.tsx`
- `lib/loans/actions.ts`
- `lib/__tests__/mark-recent-read-action.test.ts`
- `lib/__tests__/sql-migration.test.ts`
- `messages/is.json`
- `messages/en.json`

Codex also ran:

```bash
npm run type-check
```

Result: exit code 0.

## Findings

### 1. Medium: `recordRecentEvent` does not check Supabase `upsert` errors

File: `lib/recent-events/helpers.server.ts`

Lines: 40-45

The helper awaits:

```ts
await admin
  .from(TABLE)
  .upsert(...)
```

but never reads the returned `{ error }`.

Supabase/PostgREST failures such as missing table, grant problems, constraint
violations, malformed payload, or bad `href` normally come back as an `error`
value, not as a thrown exception. The current `catch` at lines 46-48 will not
log those normal DB errors.

Impact:

- The handoff says event recording errors are caught and logged, but many real
  DB failures will be silently ignored.
- If migration 46 has not been run, or if a constraint is wrong, loan actions can
  appear successful while `Nýlegt` never receives events and there is no useful
  server log.
- This makes rollout/debugging harder exactly where the migration boundary is
  most sensitive.

Recommended fix before release:

- destructure the result and log a generic failure when `error` is present,
  without leaking payload/user details:

```ts
const { error } = await admin.from(TABLE).upsert(...)
if (error) {
  console.error('[recent-events] recordRecentEvent failed')
}
```

- add a focused helper test where `.upsert()` resolves with `{ error }` and
  verify the helper suppresses the failure but logs it.

### 2. Medium: event keys collapse multiple events into one row, which is not a true event feed

Files:

- `lib/loans/actions.ts`

Lines:

- `loan_updated`: 306 and 589
- `loan_returned`: 345
- `loan_return_undone`: 384

The current key patterns are:

```ts
loans:loan:${loanId}:updated
loans:loan:${loanId}:returned
loans:loan:${loanId}:return-undone
```

This means repeated updates/returns for the same loan overwrite the same event
row and reset `ack_at`. That can work as a "latest state notification", but it
does not match the v009 architectural decision that `Nýlegt` should be "one row
per event per target user".

Impact:

- Event history is lost for repeated edits/return cycles.
- Future #27 or cross-Teskeið event feed behavior may be harder to reason about
  because the table is named and shaped like an event log, while these writes are
  state-upserts.
- If Stebbi later wants "Nýlegt" to show multiple recent things, the old events
  are unrecoverable.

Recommended fix before migration 46 is relied on:

- For state-changing events, include a deterministic version/timestamp in
  `event_key`.
- Prefer fetching authoritative `updated_at` / `returned_at` after the RPC and
  using that in the key, for example:

```ts
loans:loan:${loanId}:updated:${updatedAt}
loans:loan:${loanId}:returned:${returnedAt}
loans:loan:${loanId}:return-undone:${updatedAt}
```

- Keep `loan_created` and `loan_deleted` as one-time keys unless product wants
  otherwise.

If Claude Code intentionally wants state-upsert semantics instead of event-log
semantics, that should be explicitly sent back to Stebbi/Codex as a product
decision before SQL 46 becomes the long-term foundation.

### 3. Low/Medium: `href LIKE '/%'` allows protocol-relative external URLs

Files:

- `sql/46_recent_events.sql`
- `app/auth-mvp/heim/RecentSection.tsx`

Lines:

- SQL constraint: `sql/46_recent_events.sql:37`
- Trusted render: `app/auth-mvp/heim/RecentSection.tsx:69-72`

The DB constraint:

```sql
CHECK (href LIKE '/%')
```

allows `//example.com`, which is protocol-relative rather than a local app path.

This is not directly user-exploitable today because `recent_events` is
service-role-only and events are currently written by server code. But this
table is intended as a future cross-Teskeið foundation, so it should defend
against accidental external navigation from future event sources.

Recommended fix before running migration 46:

```sql
CONSTRAINT recent_events_href_local CHECK (
  href LIKE '/%' AND href NOT LIKE '//%'
)
```

Also add a helper-level validation for `href` so tests do not depend only on a
database constraint.

Update `lib/__tests__/sql-migration.test.ts`, because the current test at lines
43-45 only verifies the weaker condition.

## Notes and residual risk

- `sql/46_recent_events.sql` itself is otherwise shaped safely: transaction,
  RLS enabled, no anon/authenticated grants, service_role-only access.
- `ackRecentEventsForUser` correctly scopes updates by `user_id`, so foreign
  event IDs should be ignored by the DB.
- `ackRecentEvents` uses `guardTeskeidSession`, which is appropriate for a
  cross-Teskeið feed.
- Claude Code reports `sql/45_recent_read_state.sql` was already applied and is
  now orphaned. Codex agrees not to drop it in this release. Plan cleanup later
  after migration 46 is stable.
- `fetchLoanItemName` uses service_role reads. For successful mutations this is
  fine, but for `deleteLoan` it reads before the RPC proves actor access. The
  value is not returned or logged if deletion fails, so Codex does not mark this
  as a blocker, but a future RPC returning the safe snapshot would be cleaner.

## Rollout guidance

Because SQL 46 is **written, not run**, Codex recommends this order:

1. Fix findings 1 and 3 before applying SQL 46.
2. Decide finding 2 before applying SQL 46 if Stebbi wants a true event-feed
   foundation rather than state-upsert notifications.
3. Run/apply `sql/46_recent_events.sql`.
4. Deploy the app code using `recent_events`.
5. Test on localhost/preview:
   - create loan,
   - edit loan,
   - mark returned,
   - undo return,
   - delete loan,
   - verify `Nýlegt` appears and `Lesið` hides only visible events.

Deploying app code before SQL 46 should degrade gracefully, but events created
during the gap may be lost. Since this is a new table with no existing data
mutation, applying SQL 46 before deploying the app is the cleaner path.

## Recommendation

Codex does not recommend release yet.

This is close, but Claude Code should make a small follow-up pass for findings
1 and 3, and Stebbi/Codex should decide whether finding 2 is acceptable product
semantics or should be fixed now.

After that, Claude Code should return a short v012 follow-up handoff with:

- exact changed files,
- whether event keys remain state-upsert or become one-row-per-event,
- focused tests added/updated,
- command results,
- confirmation that SQL 46 is still not run unless Stebbi explicitly runs it.
