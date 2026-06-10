# TODO #19 / #27 / #37 - Phase 1 revised plan (v017)

## Based on

Codex review: `2026-06-10-0726-todo-019-027-037-v016-codex-phase1-plan-review.md`

## Responses to Codex findings

### Finding 1 (High — Phase B pre-read not authorized)

Agreed. App-level service-role pre-read before the mutation RPC is not safely scoped.

**Revised Phase B approach:**

Extend the existing `update_loan` SQL function to return before/after fields alongside its current status string. The RPC already performs per-loan authorization (checks `created_by` / `lender_user_id`). Returning old values after authorization is clean — the RPC has already proven the actor may mutate this row.

Current return type of `update_loan`: `TEXT` (status string).

New return type: table with columns `(status TEXT, before_item_name TEXT, before_note TEXT, before_loaned_at DATE, before_due_at DATE)`.

Only returned when status is `'ok'`. App code reads these fields and computes the diff. Nothing is read before authorization; no service-role bypass.

This requires a SQL migration (`sql/48`). See migration plan below.

### Finding 2 (High/Medium — 50-cap incomplete semantics)

Agreed. The 51-row fetch cannot give an exact count and leaves `Allt lesið` broken for overflow.

**Revised Phase A approach:**

Fetch all unread rows with no limit. Remove `.limit()` from `getUnreadRecentEventsForUser` when called from `heim/page.tsx`. The function signature keeps `limit` as optional parameter for future callers that want it, but `heim/page.tsx` passes no limit.

`handleMarkAll` in `RecentSection` already sends `rows.map(r => r.id)`. If we fetch all rows, this correctly acks everything. No new `ackAll` server action needed.

Performance: a personal tracker generates a few events per week. Even an inactive user who never acks for 6 months would accumulate ~100-300 rows. Fetching all is fine. If this becomes a concern later, we add `ackAll` at that point.

### Finding 3 (Medium — not a scroll container)

Agreed. `overflow-hidden` on the container prevents scroll. Rendering 20+ rows inline would dominate `/heim` on mobile.

**Revised Phase A UI:**

Add a scroll container for the event list rows when there are more than 5 visible rows:

```tsx
<div
  className={`flex flex-col divide-y divide-border bg-card border border-border rounded-xl overflow-hidden ${
    displayedRows.length > 5 ? 'max-h-72 overflow-y-auto' : ''
  }`}
>
```

`max-h-72` = 288px, fits ~6 rows at 48px each, with overflow showing there is more to scroll. Border radius is preserved because `overflow-hidden` is still present (scroll container clips correctly).

If the list is 5 rows or fewer, no scroll container — existing clean layout is preserved.

### Finding 4 (Medium — note payload privacy)

Agreed. Note content in payload is inconsistent with the privacy rule stated in the same plan.

**Revised payload for note changes:** Use semantic type only.

```ts
export type LoanFieldChangeType =
  | 'changed'
  | 'removed'
  | 'added'

export interface LoanFieldChange {
  field: 'item_name' | 'loaned_at' | 'due_at' | 'note'
  changeType: LoanFieldChangeType
  oldValue?: string | null   // present for item_name, loaned_at, due_at; absent for note
  newValue?: string | null   // present for item_name, loaned_at, due_at; absent for note
}
```

For `note`: only `{ field: 'note', changeType: 'added' | 'removed' | 'changed' }` — no content.
For `item_name`, `loaned_at`, `due_at`: old and new values included (these are not sensitive).

### Finding 5 (Medium — no client display contract)

Agreed. `RecentEventDisplay` only has `label`; the drawer renders only `drawerEvent.label`.

**Revised `RecentEventDisplay`:**

```ts
export interface RecentEventDisplay {
  id: number
  label: string
  href: string
  viewHref: string | null
  isDeleted: boolean
  detailLines?: string[]   // localized, server-computed; rendered in drawer below label
}
```

`detailLines` is computed server-side in `heim/page.tsx` from the payload. Only localized display strings reach the client — no raw payload, no field names, no old values exposed as structured data.

Example for due_at removed:
```
detailLines: ["Gjalddagi fjarlægður: 20. júní 2026"]
```

Example for item_name changed:
```
detailLines: ["Nafn breytt: Borvél → Barvél"]
```

Drawer renders each detail line as a small muted text row below the label.

### Finding 6 (Low/Medium — invitation wording)

Agreed. Corrected wording: "Recorded `loan_invitation_received` events are no longer hidden by the top-3 limit."

## Implementation plan

### Phase A — All unread events visible (no SQL migration)

**Files:**

| File | Change |
|------|--------|
| `lib/recent-events/helpers.server.ts` | Remove `limit` parameter from call in `getUnreadRecentEventsForUser`; keep optional param signature |
| `app/auth-mvp/heim/page.tsx` | Call `getUnreadRecentEventsForUser(user.id)` with no limit |
| `app/auth-mvp/heim/RecentSection.tsx` | Add scroll container (`max-h-72 overflow-y-auto`) for > 5 rows |
| `lib/__tests__/home-page.test.tsx` | Add: 4+ rows all rendered; > 5 rows scroll container present; `Allt lesið` sends all IDs |

No SQL. No migration. No auth change.

### Phase B — Diff payloads in loan_updated events

**Requires SQL migration: `sql/48_update_loan_returns_diff.sql`**

The migration alters `update_loan` to return before/after columns alongside status. It uses a `RETURNING` clause on the UPDATE or a pre-mutation SELECT that is part of the same transaction. The RPC already holds a row lock after its `FOR UPDATE` / authorization check.

**Files:**

| File | Change |
|------|--------|
| `sql/48_update_loan_returns_diff.sql` | Extend `update_loan` return type |
| `lib/recent-events/types.ts` | Add `LoanFieldChange`, `LoanFieldChangeType` to `RecentEventPayload` |
| `lib/loans/actions.ts` | Read before/after from RPC result; compute `changes` array; pass to `recordRecentEvent` |
| `app/auth-mvp/heim/page.tsx` | Compute `detailLines` from payload; pass to `RecentEventDisplay` |
| `app/auth-mvp/heim/RecentSection.tsx` | Render `detailLines` in drawer |
| `messages/is.json` + `messages/en.json` | New keys for diff labels (e.g., `eventDetailDueDateRemoved`, `eventDetailDueDateChanged`, etc.) |
| `lib/__tests__/actions.test.ts` | Tests for diff computation |
| `lib/__tests__/home-page.test.tsx` | Tests for `detailLines` rendering |

`updateLoanItemDetails` also calls a separate RPC (`update_loan_item_details`). That RPC would need a similar extension in a follow-up migration, or we use the same pre-read pattern for item_name/note only (these are less sensitive than dates). Defer this to a follow-up.

**`update_loan` return contract after migration:**

When `status = 'ok'`:
```sql
(status, before_item_name, before_note, before_loaned_at, before_due_at)
```

When `status != 'ok'` (not_found, not_editable, etc.):
```sql
(status, NULL, NULL, NULL, NULL)
```

App code reads `before_*` only when `status = 'ok'` and computes diff against submitted values.

## Migration plan for sql/48

File: `sql/48_update_loan_returns_diff.sql`

```sql
BEGIN;

-- Drop and recreate update_loan with additional return columns.
-- Wrapped in BEGIN/COMMIT for safe rollout.
-- Rollback: restore original function signature (see sql/update_loan_original.sql).

-- ... (full SQL written at implementation time by Claude Code)

COMMIT;
```

Rollback: restore previous function definition. No data is deleted; it is a function signature change only. App code is deployed simultaneously and reads the new columns. If rollback is needed: redeploy previous app version and restore SQL function.

## Risk assessment

### Phase A

Low. Read-only query change. No auth impact. No schema change. UI change is additive (scroll wrapper). `Allt lesið` already works correctly if all rows are fetched.

### Phase B

Medium. Requires SQL migration to extend `update_loan`. The migration only changes a function signature — no table structure, no RLS, no grants. App code must be deployed alongside or after the migration (old app code calling the new function gets extra columns it ignores, which is safe). New app code calling the old function gets fewer columns than expected — diff computation falls back to no changes (safe).

## Tests summary

### Phase A
- 4 unread rows: all 4 rendered
- 6 unread rows: scroll container class present on list
- 5 or fewer rows: no scroll container
- `Allt lesið` called with all row IDs

### Phase B
- `updateLoan` with `due_at` set to null: `changes` contains `{ field: 'due_at', changeType: 'removed', oldValue: '2026-06-20', newValue: null }`
- `updateLoan` with item_name changed: `changes` contains item_name entry
- Note added: `changes` contains `{ field: 'note', changeType: 'added' }` — no content
- `detailLines` in `RecentEventDisplay` contains localized string for due_at removed
- No email, no note content, no foreign user data in payload or rendered output
- Unauthorized `loanId` returns `not_found` from RPC; no before/after values recorded

## Recommendation

Claude Code recommends:

1. Stebbi approves this revised plan.
2. Codex reviews v017.
3. If approved: implement Phase A first (no migration, immediate improvement).
4. Then implement Phase B with `sql/48` migration.
