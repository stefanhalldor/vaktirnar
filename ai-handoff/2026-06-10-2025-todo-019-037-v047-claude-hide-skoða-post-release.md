# TODO #019/#037 — Skoða hidden from Ólesið drawer, post-release

Related TODOs: #019, #037
Implemented from: `ai-handoff/2026-06-10-2021-todo-019-037-v046-codex-hide-olesid-view-button-handoff.md`

Deployed: commit `66255c5` on `main`.

## What was done

### 1. `Skoða` link hidden from drawer

`app/auth-mvp/heim/RecentSection.tsx`:
- Removed the `{drawerEvent.viewHref && <Link ...>}` block (was lines 138-145)
- Removed the now-unused `import Link from 'next/link'`

The `Lesið` button is the only action in the drawer. It keeps `flex-1` and
renders full-width.

Nothing else was touched:
- `viewHref` generation in `page.tsx` is unchanged
- `viewHref` field on `RecentEventDisplay` is unchanged
- `recentView` message key is unchanged
- All routes, SQL, RLS, auth, Supabase functions — unchanged

### 2. Tests updated

`lib/__tests__/home-page.test.tsx`:
- All five tests that previously asserted `Skoða` link existence/href now
  assert `queryByRole('link', { name: 'Skoða' }).toBeNull()`
- Test names updated to reflect temporary hide intent
- Deleted-event test was already `toBeNull()` — unchanged

## Answers to Codex questions

1. Files changed: `app/auth-mvp/heim/RecentSection.tsx`, `lib/__tests__/home-page.test.tsx`
2. Tests run: `npm run test:run -- lib/__tests__/home-page.test.tsx` — 53 passed; `npm run type-check` — exit 0
3. No SQL/Supabase/auth/RLS changes made.
4. `Skoða` is hidden for all drawer events (loan_created, loan_updated,
   loan_returned, loan_return_undone, loan_deleted, loan_invitation_received,
   loan_invitation_accepted, loan_invitation_declined).
5. `?loan=` highlight/navigation is deferred as a separate follow-up.

## How to restore Skoða later

In `RecentSection.tsx`, restore:
```tsx
import Link from 'next/link'
```
and inside the `<div className="flex gap-3">` block:
```tsx
{drawerEvent.viewHref && (
  <Link
    href={drawerEvent.viewHref}
    className="flex-1 inline-flex items-center justify-center h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  >
    {labels.viewItem}
  </Link>
)}
```

## Remaining open work

- `?loan=` highlight so clicking Skoða opens the loan list scrolled/highlighted
  to the relevant card — deferred, needs its own plan
- #40 filter state independence — separate TODO
- Phase B updateLoan counterpart event — awaiting Stebbi product decision
- #39 deleteLoan counterpart — awaiting Stebbi product decision
