# TODO #19 / #27 - Codex execution plan

## Relevant TODO

- #19 Lesnir hlutir birtist ekki aftur sem `Nýlegt`
- #27 Mýkra lánaboðsflæði

## Recommendation

Take #19 now, and take only the #27 foundation that naturally belongs with it.

Codex does **not** recommend implementing full #27 in the same pass. Full #27
changes pending invitation visibility, `get_my_loans`, list actions, claim/decline
copy, and possibly SQL/RPC shape. That is a larger auth/Supabase change and
deserves its own implementation review after #19 is solid.

The useful overlap is this:

- #19 needs server-side read-state for `Nýlegt`.
- #27 will later rely on `Nýlegt` as a trustworthy entry point for pending
  invitation-derived rows.
- Therefore #19 should be implemented in a way that future #27 rows can use
  without another read-state rewrite.

## Current State

`Nýlegt` currently uses a browser cookie:

- `app/auth-mvp/heim/page.tsx` reads `RECENT_READ_COOKIE`.
- `app/auth-mvp/heim/RecentSection.tsx` writes `document.cookie`.
- `lib/loans/recent-read.ts` handles cookie serialization.
- `lib/loans/recent-read.server.ts` computes a per-loan read key.

This has already proven too fragile in Stebbi testing. Cookie state can be stale,
device-specific, affected by refresh/cache behavior, and does not give a strong
foundation for #27.

## Scope For Claude Code

### Phase A - Implement #19 fully

Implement server-side read-state for `Nýlegt`.

Expected high-level changes:

- Add a narrow Supabase table for read-state.
- Add server action to mark visible recent loans read.
- Make `/auth-mvp/heim` compute unread rows server-side.
- Remove browser-cookie write/read from `RecentSection`.
- Revalidate both home and loan list after loan mutations.
- Add targeted tests that catch the original regression.

### Phase B - #27 foundation only

Add only the small pieces that make sense now:

- Keep `computeRecentReadKey` future-compatible with `invitation_id` and
  `invitation_status`.
- Make `RecentSection` rows clickable to `/auth-mvp/lanad-og-skilad` if that is
  not already true.
- Document in the post-implementation handoff how #27 can later attach pending
  invitation rows to the same read-state.

Do **not** implement the full #27 soft-ack flow in this package.

## Migration

Next SQL migration appears to be:

`sql/45_recent_read_state.sql`

Claude Code must verify this before creating the file. `sql/44_loan_item_details_edit.sql`
already exists, so older plans that mentioned `sql/45_loan_soft_ack.sql` are now
out of date.

Recommended table:

```sql
CREATE TABLE IF NOT EXISTS public.loan_recent_read_state (
  user_id  uuid        NOT NULL,
  loan_id  uuid        NOT NULL REFERENCES public.loan_items(id) ON DELETE CASCADE,
  read_key text        NOT NULL CHECK (read_key ~ '^[0-9a-f]{32}$'),
  read_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, loan_id)
);

CREATE INDEX IF NOT EXISTS loan_recent_read_state_user_read_at_idx
  ON public.loan_recent_read_state (user_id, read_at DESC);

ALTER TABLE public.loan_recent_read_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.loan_recent_read_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_recent_read_state TO service_role;
```

Rollback:

```sql
DROP TABLE IF EXISTS public.loan_recent_read_state;
```

Important:

- SQL file may be created, but Claude Code must not run SQL unless Stebbi
  explicitly asks.
- No grants to `anon` or `authenticated`.
- No RLS policies are needed because only service-role server code should access
  this table.
- This table stores user/loan linkage, so treat it as user-data adjacent even
  though it stores only a hash key, not raw names/emails.

## Server-Side Read Logic

On `/auth-mvp/heim`:

1. Fetch loans as today.
2. Fetch `loan_recent_read_state` rows for `user.id` and the loan IDs returned by
   `get_my_loans`.
3. Build `Map<loan_id, read_key>`.
4. Sort loans using existing home sorting.
5. Compute current read key server-side for each loan.
6. Filter out rows where stored read key matches current key.
7. Slice after filtering, not before filtering.

Critical behavior:

- If first 3 sorted loans are read, the 4th unread loan should appear.
- A read loan should not reappear just because another loan was created.
- A read loan should reappear if meaningful content/state changes and the key
  changes.

If the read-state query fails:

- Do not crash `/heim`.
- Treat rows as unread.
- Log a generic error without leaking loan IDs, names, emails or user details.

## Mark-Read Server Action

Create a server action such as:

`app/auth-mvp/heim/actions.ts`

Suggested API:

```ts
export async function markRecentLoansRead(input: unknown): Promise<ActionResult>
```

Input should be a bounded list of loan IDs, ideally only visible recent rows:

```ts
{ loan_ids: string[] }
```

Server action requirements:

- Use `guardLoanAccess()` or the established loan/session guard.
- Validate UUIDs and cap count, e.g. max 3 or max 10.
- Fetch `get_my_loans` for the actor.
- Ignore or reject loan IDs the actor cannot see.
- Compute `read_key` server-side. Do not accept client-sent keys.
- Upsert `(user_id, loan_id, read_key, read_at)`.
- `revalidatePath('/auth-mvp/heim')`.
- Return a generic success/failure shape consistent with existing server actions.

## RecentSection Changes

`RecentSection` should no longer read or write `document.cookie`.

Expected flow:

- Receives `rows`.
- `Lesið` calls the server action with visible loan IDs.
- On success, show the existing done banner and call `router.refresh()`.
- On failure, keep rows visible or show a small generic error.
- Avoid stale local state hiding new props. If local done state remains, bind it
  to a batch key derived from current rows.

Small #27 foundation:

- Make recent rows clickable to `/auth-mvp/lanad-og-skilad`.
- Do not implement anchor/highlight unless it is trivial. Plain link is enough
  for this package.

## Revalidation

Today many loan actions revalidate only:

`/auth-mvp/lanad-og-skilad`

#19 needs `/auth-mvp/heim` to revalidate too.

Add a small helper in `lib/loans/actions.ts`:

```ts
const LOANS_PATH = '/auth-mvp/lanad-og-skilad'
const HOME_PATH = '/auth-mvp/heim'

function revalidateLoanViews() {
  revalidatePath(LOANS_PATH)
  revalidatePath(HOME_PATH)
}
```

Use it in mutations that can affect home/recent state:

- create loan
- edit loan
- mark returned / undo returned
- delete loan
- add/cancel/send invitation if it affects badges or recent state
- update item details
- claim/decline invitation where relevant

Do not broaden behavior beyond revalidation.

## Tests Required

### Migration/static tests

Add a small test that reads `sql/45_recent_read_state.sql` and verifies:

- table name `loan_recent_read_state`;
- RLS enabled;
- no grants to `anon` or `authenticated`;
- service_role gets narrow access;
- `read_key` has 32-hex check;
- `loan_id` FK cascades on loan delete.

### Helper tests

Test:

- `computeRecentReadKey` is deterministic.
- Key changes when meaningful loan fields change.
- Key does not store raw item names or display names.
- Read filtering happens before `.slice(0, 3)`.
- A read older visible row does not reappear after a new row is added.

### Server action tests

Test:

- invalid input rejected safely;
- too many IDs capped/rejected;
- action fetches actor-visible loans;
- inaccessible loan IDs are not written;
- server computes key, client cannot spoof it;
- home path is revalidated.

### Home page tests

Test:

- matching read-state hides row from `Nýlegt`;
- stale read key makes row unread again;
- first 3 sorted rows read means 4th unread row appears;
- read-state query failure degrades to unread without crashing.

### RecentSection tests

Test:

- clicking `Lesið` calls server action;
- success shows done state;
- failure does not permanently hide rows;
- component does not write `document.cookie`;
- rows link to `/auth-mvp/lanad-og-skilad`.

### Revalidation tests

Update existing action tests to confirm relevant loan mutations revalidate both:

- `/auth-mvp/lanad-og-skilad`
- `/auth-mvp/heim`

## Manual Localhost Checks For Stebbi

After Claude implementation and migration is applied in the right environment:

1. Open `/auth-mvp/heim`.
2. Confirm `Nýlegt` shows recent loans.
3. Click `Lesið`.
4. Hard refresh `/auth-mvp/heim`: read rows should not come back.
5. Create a new loan in `Lánað og skilað`.
6. Return to `/auth-mvp/heim`: new loan appears, old read rows do not.
7. Mark a loan returned or edit item details: it may become unread again if its
   read key changes.
8. Confirm recent row click goes to `Lánað og skilað`.

## Stop Conditions

Claude Code should stop and hand off before implementation continues if:

- migration numbering is unclear;
- direct service-role table access does not match repo patterns and an RPC would
  be safer;
- any solution requires grants to `anon` or `authenticated`;
- raw loan names, display names, emails or secrets would be stored in read-state;
- full #27 starts leaking into this package;
- tests require broad unrelated refactors.

## Explicit Non-Goals

- Do not implement full #27 soft acknowledgement in this package.
- Do not modify `get_my_loans` to union pending invitations yet.
- Do not remove `get_my_pending_invitations` yet.
- Do not alter invitation expiry semantics yet.
- Do not run SQL without Stebbi's explicit approval.

## Post-Implementation Handoff Required

Claude Code should create:

`ai-handoff/YYYY-MM-DD-HHMM-todo-019-027-v006-claude-recent-read-state-post-implementation.md`

Include:

- exact migration file created;
- whether SQL was only written or also run;
- data/RLS/auth/grants impact;
- files inspected;
- files changed;
- commands run and exit codes;
- tests added/updated;
- whether #27 was kept to foundation-only scope;
- any remaining risks before Codex review.
