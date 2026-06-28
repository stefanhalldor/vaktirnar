# Codex handoff: Temporarily hide `Skoða` in `Ólesið`

Related TODOs: #019, #037

Requested by Stebbi: `Skoða` is still causing 404 / poor navigation from `Ólesið`, and Stebbi has only about 10 minutes now before a 5-day break. Stebbi asks for the safest possible handoff to Claude Code to temporarily hide the `Skoða` button from the UI.

Codex recommendation: **do the smallest reversible UI-only change**. Hide the `Skoða` link in the drawer. Do not change routes, SQL, event payloads, auth, RLS, data, or `viewHref` generation in this quick fix.

## Goal

Temporarily remove the visible `Skoða` action from `Ólesið` drawer so users cannot click into broken or confusing navigation.

Users should still be able to:

- see unread events;
- open the event drawer;
- read event labels/details;
- click `Lesið`;
- click `Allt lesið`;
- close the drawer.

## Implementation Plan

### 1. Hide the `Skoða` link render only

File:

- `app/auth-mvp/heim/RecentSection.tsx`

Current relevant area:

- `app/auth-mvp/heim/RecentSection.tsx:137`
- `app/auth-mvp/heim/RecentSection.tsx:138`
- `app/auth-mvp/heim/RecentSection.tsx:139`
- `app/auth-mvp/heim/RecentSection.tsx:145`

Remove or comment out the conditional link render:

```tsx
{drawerEvent.viewHref && (
  <Link href={drawerEvent.viewHref} ...>
    {labels.viewItem}
  </Link>
)}
```

Also remove the now-unused import:

```tsx
import Link from 'next/link'
```

Preferred resulting drawer button row:

- only the `Lesið` button remains;
- it can keep `flex-1`, because with one button that still gives a clear full-width action.

Do **not** remove `viewHref` from `RecentEventDisplay`.
Do **not** remove `viewHref` construction in `app/auth-mvp/heim/page.tsx`.
Do **not** remove `recentView` from messages.

Reason: keeping those contracts intact makes this a reversible UI switch. Later Claude Code can restore the button with better route/highlight behavior without rebuilding the data path.

### 2. Update tests to expect no visible `Skoða`

File:

- `lib/__tests__/home-page.test.tsx`

Update tests that currently expect `Skoða` links. The new intended behavior:

- opening drawer for `loan_created` shows no `Skoða` link;
- opening drawer for `loan_updated` shows no `Skoða` link;
- opening drawer for `loan_invitation_received` shows no `Skoða` link for now;
- opening drawer for accepted/declined invitation events shows no `Skoða` link for now;
- deleted events still show no `Skoða` link.

Keep tests for:

- drawer opens;
- `Lesið` button exists and works;
- `Allt lesið` works;
- event detail lines render.

Suggested test phrasing:

```ts
it('drawer temporarily hides "Skoða" link for all unread events', async () => {
  ...
  expect(screen.queryByRole('link', { name: 'Skoða' })).toBeNull()
})
```

If keeping multiple event-specific tests is faster than refactoring, update their expectations to `queryByRole(...).toBeNull()`.

### 3. Do not touch SQL or Supabase

No SQL migration.
No Supabase action.
No changes to RLS, grants, functions, policies, auth, secrets, deployment, billing, or production data.

This is a UI-only mitigation.

## Risk Assessment

This is not literally zero-risk, because any code change can have a typo. But this is the lowest-risk useful mitigation:

- very small React component change;
- no database writes;
- no permission changes;
- no route changes;
- no data model changes;
- immediately reversible by restoring the link render.

Worst plausible outcome:

- the drawer layout looks slightly awkward with only one action button, or a test needs updating.

Likelihood:

- low, if Claude Code only touches `RecentSection.tsx` and related tests.

Avoid:

- changing `/breyta/[id]`;
- changing `viewHref` generation again;
- adding `?loan=` routing/highlight now;
- editing SQL;
- renaming internal `recent_*` identifiers.

## Suggested Commands

```powershell
npm run test:run -- lib/__tests__/home-page.test.tsx
npm run type-check
```

If Claude Code touches any loan list code despite this plan, also run:

```powershell
npm run test:run -- lib/__tests__/loan-list.test.tsx lib/__tests__/loan-pages.test.tsx
```

## Localhost Checks For Stebbi

1. Open `/auth-mvp/heim` with at least one unread event.
2. Confirm section heading is `Ólesið`.
3. Click an unread event.
4. Confirm the drawer opens.
5. Confirm there is no `Skoða` button/link.
6. Confirm `Lesið` is still visible and works.
7. Confirm `Allt lesið` still works from the list.
8. Confirm event details, e.g. changed note/date details, are still readable.
9. Confirm mobile 360-460px has no overflow in the drawer.

## Handoff Back From Claude Code Should Include

1. Files changed.
2. Exact tests run and results.
3. Confirmation that no SQL/Supabase/auth/RLS changes were made.
4. Confirmation that `Skoða` is hidden for all `Ólesið` drawer events.
5. Any remaining known issue, especially that future `?loan=` highlight/navigation is deferred.

