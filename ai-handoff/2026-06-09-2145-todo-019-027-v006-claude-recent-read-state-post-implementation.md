# TODO #19 / #27 - Post-Implementation Handoff

## Migration file created

`sql/45_recent_read_state.sql`

SQL was **only written**, not run. Stebbi must apply it to the Supabase project before
the Nylegt read-state feature is live in production.

## SQL / auth / grants impact

- New table: `public.loan_recent_read_state`
  - Columns: `user_id uuid`, `loan_id uuid` (FK -> `public.loan_items(id) ON DELETE CASCADE`),
    `read_key text CHECK (^[0-9a-f]{32}$)`, `read_at timestamptz`
  - Primary key: `(user_id, loan_id)`
  - Index: `(user_id, read_at DESC)` for efficient per-user queries
- RLS enabled; no policies needed (service_role bypasses RLS)
- REVOKE ALL from `PUBLIC, anon, authenticated`
- GRANT SELECT, INSERT, UPDATE, DELETE to `service_role` only
- No grants to `anon` or `authenticated` (verified by static test)

## Files inspected

- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/heim/RecentSection.tsx`
- `lib/loans/actions.ts`
- `lib/loans/recent-read.ts`
- `lib/loans/recent-read.server.ts`
- `lib/loans/sort.ts`
- `lib/__tests__/home-page.test.tsx`
- `lib/__tests__/recent-read.test.ts`
- `lib/__tests__/actions.test.ts`
- `sql/45_recent_read_state.sql`

## Files changed

### New files

- `sql/45_recent_read_state.sql` - migration (not run)
- `app/auth-mvp/heim/actions.ts` - `markRecentLoansRead` server action
- `lib/__tests__/sql-migration.test.ts` - static SQL checks
- `lib/__tests__/mark-recent-read-action.test.ts` - action unit tests

### Modified files

- `app/auth-mvp/heim/page.tsx`
  - Removed cookie imports (`cookies`, `RECENT_READ_COOKIE`, `parseRecentReadCookie`)
  - Added DB read-state fetch from `loan_recent_read_state` inside admin block
  - Added `recentRows` computation (filter-before-slice using `readStateMap`)
  - `rowBatch` key is now derived from unread loan IDs (stable per-render key)
  - Removed `initialRead` from `<RecentSection>` props

- `app/auth-mvp/heim/RecentSection.tsx`
  - Removed all cookie imports and `document.cookie` writes
  - Added `useRouter` + `useTransition` + `Link` imports
  - `handleMarkRead` calls `markRecentLoansRead` server action, then `router.refresh()`
  - Optimistic done state: `setMarkedRead(true)` fires before transition; reverts on failure
  - Each row is now a `<Link href="/auth-mvp/lanad-og-skilad">` (#27 foundation)
  - Removed `initialRead` prop

- `lib/loans/actions.ts`
  - Added `const HOME_PATH = '/auth-mvp/heim'`
  - Added `function revalidateLoanViews()` replacing all single-path `revalidatePath` calls
  - All loan mutations now revalidate both `/auth-mvp/lanad-og-skilad` and `/auth-mvp/heim`

- `lib/__tests__/home-page.test.tsx`
  - Removed `next/headers` mock and `mockCookiesGet`
  - Added `mockAdminFrom`/`mockAdminIn` to admin mock chain
  - Added `markRecentLoansRead` server action mock
  - Added `next/navigation` mock (useRouter for RecentSection)
  - Replaced `setupCookieV2` with `setupReadState` (DB-based)
  - Removed "Lesið cookie write (v2)" describe block
  - Added graceful degradation test (read-state DB query failure)

- `lib/__tests__/recent-read.test.ts`
  - Added: key does not store raw `item_name` or `other_display_name`
  - Added: filter-before-slice behavioural tests
  - Added: read older loan does not reappear after new loan added

- `lib/__tests__/actions.test.ts`
  - Added "revalidation" describe block verifying both paths are revalidated by
    `createLoan` and `updateLoanItemDetails`

## Commands run and exit codes

```
npx vitest run lib/__tests__/recent-read.test.ts lib/__tests__/sql-migration.test.ts lib/__tests__/mark-recent-read-action.test.ts
# 3 files, 46 tests, all passed

npx vitest run lib/__tests__/home-page.test.tsx lib/__tests__/actions.test.ts
# 2 files, 93 tests (88 passed, 5 todo), all passed

npx vitest run
# 34 files, 977 tests (947 passed, 22 skipped, 8 todo), all passed
```

No SQL was run.

## #27 foundation scope

- Recent rows are now `<Link href="/auth-mvp/lanad-og-skilad">` (plain link, no anchor/highlight)
- `computeRecentReadKey` signature is unchanged and already accepts `invitation_id` and
  `invitation_status` fields from the `LoanItem` type
- `loan_recent_read_state` table is keyed `(user_id, loan_id)` which future #27
  invitation-derived rows can use unchanged when `get_my_loans` is extended to union them
- Full #27 soft-ack flow was NOT implemented

## Remaining risks before Codex review

1. **Migration must be applied.** Until `sql/45_recent_read_state.sql` runs in production,
   the page will silently fall back to treating all rows as unread (the `catch` block in
   page.tsx handles `relation does not exist`). No crash, but no persistence.

2. **Cookie not removed.** `lib/loans/recent-read.ts` (cookie serialization) and
   `lib/loans/recent-read.server.ts` still exist. `recent-read.ts` is now unreferenced
   by any page code but is still imported by the old cookie tests. These can be cleaned
   up in a later pass once the migration is confirmed stable.

3. **`revalidateLoanViews` covers only the actions in `lib/loans/actions.ts`.**
   If there are other server actions outside that file that mutate loans (e.g. in
   loan page routes), those may still only revalidate `/lanad-og-skilad`. Check
   `/auth-mvp/lanad-og-skilad/*/route.ts` or similar if Nylegt is stale after
   operations not routed through `lib/loans/actions.ts`.

4. **`rowBatch` key is now unread-loan-ID based.** If DB returns same unread set
   between requests, `key` will be identical and React will not remount RecentSection,
   which is correct. This is intentional.
