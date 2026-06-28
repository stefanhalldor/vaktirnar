# TODO #019/#037 — Ólesið viewHref 404 fix + section rename post-release

Related TODOs: #019, #037
Implemented from: `ai-handoff/2026-06-10-1938-todo-019-037-v043-codex-olesid-viewhref-bugfix-handoff.md`

Deployed: commit `304a05a` on `main`.

## What was done

### 1. viewHref 404 bugfix

`app/auth-mvp/heim/page.tsx` — event `Skoða` link logic changed:

**Before:**
```ts
viewHref = isInvitation
  ? `/auth-mvp/lanad-og-skilad?invitation=${event.entity_id}`
  : `/auth-mvp/lanad-og-skilad/breyta/${event.entity_id}`
```

**After:**
```ts
viewHref = isInvitation
  ? `/auth-mvp/lanad-og-skilad?invitation=${event.entity_id}`
  : '/auth-mvp/lanad-og-skilad'
```

All non-deleted, non-`loan_invitation_received` events now link to the
loan list. The `/breyta/[id]` edit route is permission-gated and returns
`notFound()` for users without edit access — that gate is unchanged.

### 2. Section rename

- `messages/is.json`: `"recent"` from `"Nýlegt"` to `"Ólesið"`
- `messages/is.json`: `"noRecent"` from `"Engin atburðir enn."` to `"Engin ólesin atriði."`
- `messages/en.json`: `"recent"` from `"Recent"` to `"Unread"`
- `messages/en.json`: `"noRecent"` from `"Nothing recent yet."` to `"No unread items."`

No internal identifiers renamed (`recentEvents`, `RecentSection`, `recent_events`,
DB table — all unchanged per Codex guidance).

### 3. Tests updated

`lib/__tests__/home-page.test.tsx`:
- Mock translation `recent` updated to `'Ólesið'`
- Mock translation `noRecent` updated to `'Engin ólesin atriði.'`
- All describe/it strings using `Nýlegt` updated to `Ólesið`
- `loan_invitation_accepted` and `loan_invitation_declined` Skoða link
  assertions updated from `/breyta/{loanId}` to `/auth-mvp/lanad-og-skilad`
- Added `not.toContain('/breyta/')` guard on both
- New regression test: `loan_updated` event Skoða link must not contain
  `/breyta/` and must resolve to `/auth-mvp/lanad-og-skilad`

## Answers to Codex questions

1. `/breyta/[id]` permissions unchanged. The fix is in the link builder, not the route.
2. Chosen convention for generic loan events: `/auth-mvp/lanad-og-skilad` (base list, no `?loan=` param).
3. No `?loan=` handling was added. The list does not scroll or highlight a specific row. This is the minimal safe fix.
4. Tests proving `loan_updated` no longer links to a 404-prone route: the new `'drawer "Skoða" link for loan_updated does not point to edit route'` test in `home-page.test.tsx`.

## What is still open

- `?loan=` highlighting/scroll: explicitly deferred. If Stebbi wants the
  clicked loan to be highlighted or scrolled into view, that is a separate
  feature request and needs its own plan.
- #40 filter state independence: still open, unrelated to this fix.
- Phase B updateLoan counterpart: still awaiting product decision.
- #39 deleteLoan counterpart: still awaiting product decision.

## Test results

```
npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/loan-list.test.tsx lib/__tests__/loan-pages.test.tsx
# 3 passed test files
# 107 passed

npm run type-check
# exit 0
```

## Localhost checks for Stebbi

1. User A and User B have an accepted shared loan.
2. User A changes a note or item detail. User B receives `loan_updated` in Ólesið.
3. User B clicks `Skoða`. Confirm it opens the loan list, not a 404.
4. Confirm the section heading says `Ólesið`, not `Nýlegt`.
5. With no unread events, confirm empty copy reads `Engin ólesin atriði.`
6. User B receives `loan_returned` event. `Skoða` opens the loan list.
7. `loan_invitation_received` still opens `?invitation={id}` flow.
8. Deleted loan event still shows no `Skoða` link.
9. Mobile 360-460px: `Ólesið`, event labels, and `Skoða` button render without overflow.
