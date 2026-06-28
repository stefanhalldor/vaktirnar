# Codex review: `Ólesið` viewHref fix approval

Related TODOs: #019, #037

Reviewed handoff: `ai-handoff/2026-06-10-1945-todo-019-037-v044-claude-olesid-viewhref-fix-post-release.md`

Codex verdict: **approved**. The reported 404 path is fixed by routing generic unread loan events to the loan list instead of the edit-only `/breyta/[id]` route. No SQL/auth/RLS changes were introduced.

## Findings

### No blocking findings

Refs:
- `app/auth-mvp/heim/page.tsx:133`
- `app/auth-mvp/heim/page.tsx:137`
- `app/auth-mvp/heim/page.tsx:139`
- `messages/is.json:339`
- `messages/is.json:346`
- `messages/en.json:335`
- `messages/en.json:342`
- `lib/__tests__/home-page.test.tsx:759`

Generic non-deleted loan events now link to `/auth-mvp/lanad-og-skilad`, not `/auth-mvp/lanad-og-skilad/breyta/{entityId}`. That avoids sending a counterpart to an edit page that can correctly return 404 when the user does not have edit rights.

`loan_invitation_received` still keeps its special `?invitation={id}` link, and deleted events still have no `Skoða` link.

The visible section copy is now `Ólesið` / `Unread`, and empty copy is now `Engin ólesin atriði.` / `No unread items.`

### Low cleanup note: stale internal comment

Ref:
- `app/auth-mvp/heim/page.tsx:184`

There is still an internal code comment saying `Nýlegt`. This is not user-facing and is not a blocker. Claude Code can clean it later with nearby changes.

## Tests Run By Codex

```powershell
npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/loan-list.test.tsx lib/__tests__/loan-pages.test.tsx
# 3 passed test files
# 107 passed

npm run type-check
# exit 0
```

## Residual Product Notes

- This is a minimal safe fix. `Skoða` opens the loan list but does not scroll/highlight the exact loan.
- #40 filter state independence remains open.
- No SQL was changed or run by Codex.
- `/breyta/[id]` permissions should stay unchanged.

## Localhost Checks For Stebbi

1. User A and User B have an accepted shared loan.
2. User A changes a note/comment so User B receives `Breytt: [item]` in `Ólesið`.
3. User B clicks `Skoða`.
4. Confirm User B lands on `/auth-mvp/lanad-og-skilad`, not a 404.
5. Confirm the section heading says `Ólesið`.
6. With no unread events, confirm the empty copy says `Engin ólesin atriði.`
7. Confirm `loan_invitation_received` still opens the pending invitation context with `?invitation=...`.
8. Confirm deleted-loan events still do not show a misleading `Skoða` link.

