# TODO #23/#24/#26/#28/#31 - Loans polish package implementation plan

Relevant TODO items:

- #23 - `Breyta nafni á lánaða hlutnum`
- #24 - `Athugasemdir á hluti í Lánað og skilað`
- #26 - `Hreinsa Skila fyrir (valfrjálst)`
- #28 - `Fallegri Skila fyrir birting á lánaspjaldi`
- #31 - `Einfalda lánalistann með pillum, röðun og leit`

Stebbi asked Codex to prepare the next implementation package while Claude Code
is working on TODO #29. The goal is to package as many high-priority TODO items
as possible without mixing unrelated risk surfaces.

Claude Code should implement this package only after finishing the current #29
hamburger/nav work and producing the requested #29 post-implementation handoff.

## Executive summary

This is the next logical high-priority bundle after #29 because all items touch
`Lánað og skilað` and mostly the same UI surface.

Recommended package:

1. First, verify/reconcile #23/#24 status.
2. Then complete/verify #26.
3. Implement #28.
4. Implement #31 as a focused client-side list simplification.
5. Produce a post-implementation handoff for Codex review before release.

Important: #23/#24 are not normal UI TODOs anymore. The app code appears to be
implemented, but `sql/44_loan_item_details_edit.sql` still needs Supabase
application/production confirmation before #23/#24 can move to `DONE.md`.

## Current facts from Codex read-only review

Codex inspected these files on 2026-06-09:

- `TODO.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-06-09-0905-todo-023-024-025-v003-codex-post-release-review.md`
- `components/loans/LoanList.tsx`
- `components/loans/LoanCard.tsx`
- `components/loans/LoanForm.tsx`
- `components/loans/LoanDateField.tsx`
- `app/auth-mvp/lanad-og-skilad/page.tsx`
- `lib/__tests__/loans.test.ts`
- `lib/__tests__/loan-pages.test.tsx`

Observed state:

- #23/#24 app code appears to exist:
  - `LoanItemDetailsForm`
  - `updateLoanItemDetails`
  - edit-route split
  - `canEditItemDetails`
  - tests for the narrow edit path
  - `sql/44_loan_item_details_edit.sql`
- #23/#24 are still blocked on Supabase confirmation, not necessarily code.
- #26 appears partly or fully implemented already:
  - `LoanForm` uses `dueAt || null` in submit payload.
  - `LoanForm` renders a clear button when `dueAt` has a value.
  - `messages/is.json` already has `dueDateOptional: "Skila fyrir (valfrjálst)"`.
  - `messages/is.json` already has `clearDueDate`.
  - Do not reimplement blindly; verify behavior and add/adjust tests if needed.
- #28 is not fully implemented:
  - `LoanCard` currently renders due date in the same flex-wrap date row.
  - Non-overdue due date uses short `toLocaleDateString` formatting.
  - Desired display is its own line under `Lánað...`, e.g.
    `Skila fyrir 9. júní 2026`.
- #31 is still pending:
  - `LoanList` currently has role filter buttons `all/lender/borrower`.
  - `LoanList` currently has open/returned tabs.
  - No search input.
  - No visible sort control.
  - No pill counts.

## Guardrails

Do not treat navigation, filtering, or hidden buttons as security boundaries.
All loan authorization must remain server-side in existing guards/RPCs/actions.

Do not create or run SQL for #31/#26/#28. They should be app/UI changes only.

Do not change RLS, grants, service-role boundaries, auth, middleware, email
delivery, invitation claim/decline logic, or Supabase functions in this package
unless Stebbi explicitly asks for a separate SQL/database change.

Do not implement TODO #27 here. Pending-invitation-as-normal-row is a larger
data/auth flow and must stay separate.

Do not implement TODO #22 canonical URL cleanup here. Keep existing
`/auth-mvp/lanad-og-skilad` paths unless #29 has already introduced a shared
route abstraction and Codex has reviewed it.

## Phase 0 - Status gate for #23/#24

Before touching list UI, Claude Code should reconcile #23/#24:

1. Read the current local `sql/44_loan_item_details_edit.sql`.
2. Confirm it still matches the intended constraints:
   - `update_loan_item_details` updates only `public.loan_items`.
   - It does not update `loan_invitations.item_name_snapshot`.
   - It allows `created_by` or `lender_user_id`.
   - It returns `not_found` for unauthorized users rather than leaking existence.
   - It validates `item_name` and `note` inside SQL.
   - It revokes execute from `PUBLIC`, `anon`, and `authenticated`.
   - It grants execute only to `service_role`.
3. Determine whether Stebbi has already applied `sql/44` to Supabase production.

If SQL has not been applied, do not apply it silently. Ask Stebbi explicitly.
The permission request must say:

- exact SQL/migration action,
- whether it changes schema/functions,
- that it affects Supabase production function availability,
- that it should not modify existing rows except future RPC behavior,
- rollback/recovery plan,
- worst-case impact.

If Stebbi does not ask Claude Code to apply SQL, leave #23/#24 in TODO with
status still waiting for Supabase confirmation.

## Phase 1 - #26 verify/finish optional due-date clearing

Because code appears partly implemented, start with verification.

Expected behavior:

- In new loan form, user can choose `Skila fyrir (valfrjálst)` and clear it.
- In edit loan form where `LoanForm` is used, user can clear existing `due_at`.
- Clearing sets `due_at` to `null` in the submitted payload.
- The required `loaned_at` date cannot be cleared.
- The clear control is only visible when optional `dueAt` has a value.
- It does not open the date picker accidentally.
- It does not cause horizontal overflow on 360-460 px mobile.

Likely files:

- `components/loans/LoanForm.tsx`
- `components/loans/LoanDateField.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/loans.test.ts`
- a component/page test file if existing setup supports it

Codex recommendation:

- Keep the clear button outside `LoanDateField` unless there is a clear reason
  to generalize it.
- If generalized, make clearing opt-in with a prop like `clearLabel`; do not
  make the required `loaned_at` field clearable.
- Use an icon button or compact `X` with accessible label, but ensure tap target
  remains at least 40-44 px.

## Phase 2 - #28 due date display on LoanCard

Desired UI:

```text
Lánað 8. júní 2026
Skila fyrir 9. júní 2026
```

Rules:

- Keep the existing `Lánað...` line.
- Add a separate line for `Skila fyrir ...` only when:
  - `item.due_at` exists,
  - `item.returned_at` is null.
- Do not show the due line for returned items.
- Do not show weekday in the due line.
- Use full Icelandic month name: `9. júní 2026`, not `9. jún. 2026`.
- Use the existing month translation pattern in `LoanCard` where possible.
- Add translation keys, for example:
  - `dueAtFull`: `Skila fyrir {date}`
  - English: `Return by {date}`
- Overdue state can still be visually highlighted, but the text should stay
  clear. Suggested:
  - non-overdue: `Skila fyrir 9. júní 2026`
  - overdue: same text plus icon/color, or keep existing `Komið fram yfir skiladag`
    only if Stebbi explicitly prefers warning text over the actual date.

Codex recommendation:

- For first implementation, show the actual due date even when overdue, with
  warning styling. Hiding the date behind only `Komið fram yfir skiladag` loses
  useful information.
- If keeping warning text, consider:
  `Skila fyrir 9. júní 2026 · komið fram yfir skiladag`
  but only if it fits cleanly on mobile.
- Avoid a flex-wrap date row for this due line. Use a vertical stack.

Likely file:

- `components/loans/LoanCard.tsx`

Likely tests:

- `lib/__tests__/loan-pages.test.tsx` if component rendering is practical.
- Otherwise add a small `LoanCard` component test if local test patterns already
  support rendering client loan components.

Minimum test cases:

- `due_at = 2026-06-09`, Icelandic locale -> `Skila fyrir 9. júní 2026`.
- Due line appears below loaned line.
- No due line when `due_at` is null.
- No due line when `returned_at` is set.
- English locale uses a sensible English date.

## Phase 3 - #31 simplify LoanList with pills, counts, sort, search

Implement this in `LoanList` as a client-side UI/data transformation if all
needed data is already in `LoanItem`.

Do not widen `get_my_loans` just for search unless absolutely necessary.
Current `LoanItem` already appears to include:

- `item_name`
- `note`
- `my_role`
- `other_display_name`
- `loaned_at`
- `due_at`
- `returned_at`

That is enough for the requested search/filter/sort.

### UI model

Use pills instead of the current role segmented control plus status tabs.

Status pills:

- `Enn í láni` selected by default.
- `Skilað`.
- Mutually exclusive.

Role pills:

- `Ég lánaði`.
- `Ég fékk lánað`.
- Neither selected by default.
- Treat as one optional role refinement:
  - clicking `Ég lánaði` selects lender,
  - clicking `Ég fékk lánað` selects borrower,
  - clicking the selected role again clears role filtering.

This avoids the confusing state where both role pills are selected and the UI
effectively means "all".

Search:

- Add a search input below/near pills.
- Search in:
  - `item.item_name`
  - `item.note`
  - `item.other_display_name`
- Do not search or expose email addresses.
- Trim query.
- Use case-insensitive matching that handles Icelandic letters. Simple
  `toLocaleLowerCase('is-IS')` is acceptable for this scope.

Sort:

- Default: `Nýjast fyrst`.
- Toggle/menu option: `Elst fyrst`.
- Keep it simple. A small select or compact button is enough.
- Avoid hidden complexity like multiple sort fields.

Codex recommendation for sort date:

- For `Enn í láni`, sort by `loaned_at`.
- For `Skilað`, sort by `returned_at` when present, fallback to `loaned_at`.
- Tie-breaker: `id` descending/ascending according to sort direction, so order
  is deterministic.
- If Claude Code chooses a different rule, document it in the post-handoff.

### Count semantics

Use stable counts that do not jump while typing search.

Recommended:

- Status pill counts are based on all `items`, before role filter and before
  search:
  - `Enn í láni (N)`
  - `Skilað (N)`
- Role pill counts are based on the currently selected status, before search:
  - `Ég lánaði (N)`
  - `Ég fékk lánað (N)`
- Search changes visible result count and empty state, but not pill counts.

If Claude Code thinks another count rule is better, document it clearly before
or in the implementation handoff.

### Empty states

Use separate messages for:

- no open loans,
- no returned loans,
- no matches after filters/search.

Existing `noOpen` and `noReturned` can be reused for the first two.
Add a short `noSearchResults` or similar key for filtered/search-empty state.

### Accessibility and mobile

- Pills should be real `<button type="button">`.
- Use `aria-pressed` for selected pill states.
- Search input must have a visible label or an accessible label.
- Sort control must have a visible label or accessible label.
- Keep controls wrapping cleanly on 360-460 px.
- No horizontal scroll.
- Do not use a wide segmented control that forces overflow.
- Do not hide focus styles.

### Likely files

- `components/loans/LoanList.tsx`
- `messages/is.json`
- `messages/en.json`
- tests, likely one of:
  - new `components/loans/__tests__/LoanList.test.tsx` if pattern exists,
  - `lib/__tests__/loan-pages.test.tsx`,
  - another nearby React Testing Library test file.

### Minimum tests for #31

- Default shows `Enn í láni` selected and returned items hidden.
- `Skilað` pill shows returned items.
- `Ég lánaði` filters lender items within selected status.
- `Ég fékk lánað` filters borrower items within selected status.
- Clicking selected role pill clears role filtering.
- Counts match the agreed rule.
- Search finds by item name.
- Search finds by note.
- Search finds by counterpart display name.
- Search is case-insensitive and works with Icelandic letters.
- Sort default is newest first.
- Sort toggle shows oldest first.
- Empty search/filter state is clear.

## Phase 4 - TODO/DONE bookkeeping

Do not move #23/#24 to `DONE.md` unless both are true:

1. `sql/44_loan_item_details_edit.sql` has been applied to the relevant
   Supabase environment.
2. Save-flow has been verified in the app/production-equivalent environment.

Do not move #26/#28/#31 to `DONE.md` until Stebbi has tested locally or Claude
Code has enough automated/manual evidence and Stebbi agrees.

If Claude Code edits `TODO.md`/`DONE.md`, keep `TODO.md` containing only open
items and preserve the historical note in `DONE.md`.

## Recommended command checks

Run after implementation:

```bash
npm run type-check
npm run test:run
```

If tests are too broad or slow, at minimum run the relevant targeted Vitest
files first, then explain what was skipped:

- `lib/__tests__/loans.test.ts`
- `lib/__tests__/loan-pages.test.tsx`
- any new/updated LoanList or LoanCard tests

Do not start or restart the dev server. Stebbi runs localhost.

## Manual localhost checks for Stebbi

After Claude Code implements:

- `/auth-mvp/lanad-og-skilad`
  - default shows `Enn í láni`
  - counts look right
  - role pills toggle correctly
  - search works for item name, note, and counterpart name
  - sort toggles newest/oldest
  - no horizontal scroll at 360-460 px
- `/auth-mvp/lanad-og-skilad/ny`
  - `Skila fyrir (valfrjálst)` can be selected and cleared
  - clearing submits no due date
  - form does not zoom or overflow on mobile
- `/auth-mvp/lanad-og-skilad/breyta/[id]`
  - editable due date can be cleared where full `LoanForm` is used
  - narrow item-details edit still only edits item name/note
- Loan cards:
  - due date appears as `Skila fyrir 9. júní 2026` on its own line
  - returned loans do not show the due-date line
  - note remains readable and searchable

## Required post-implementation handoff from Claude Code

After implementation, Claude Code should create a new handoff in `ai-handoff/`,
for example:

`2026-06-09-HHMM-todo-023-024-026-028-031-v002-claude-loans-polish-post-implementation.md`

It must include:

1. What was implemented and what was only verified.
2. Exact status of #23/#24 and whether `sql/44` is applied in Supabase.
3. Files inspected.
4. Files changed.
5. Tests/commands run and exit codes.
6. Tests skipped and why.
7. Manual localhost routes Stebbi should test.
8. Chosen count semantics for #31.
9. Chosen sort semantics for #31.
10. Any changes to TODO.md/DONE.md.
11. Confirmation that no Supabase/RLS/grant/function changes were made, unless
    Stebbi explicitly approved SQL work.
12. Questions for Codex review.

Codex should review that handoff before release/commit, especially around:

- accidental data exposure in search,
- counts/search/sort edge cases,
- due-date display for returned/overdue items,
- #23/#24 Supabase confirmation,
- mobile overflow and tap targets.
