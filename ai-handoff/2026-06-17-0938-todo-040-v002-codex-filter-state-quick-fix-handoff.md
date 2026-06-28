# TODO #40 - Filterar i lanalista hafi sjalfstaett state

**Agent:** Codex  
**Fyrir:** Claude Code  
**Tilefni:** Stebbi vill klara #40 snogglega.  
**Stada:** Ready for Claude Code execution after Claude Code confirms the tiny scope.

## Stebbi request

Stebbi vill laga hegðunina þar sem efri filter i `Lanad og skilad` hefur ahrif
a nedri filter. Sem notandi a eg ekki von a thvi ad nedri filterinn stokki i
`Allt` bara af thvi ad eg breyti efri filter.

Stebbi spurdi lika hvort #30, #41 og #42 maettu fara a eftir. Codex mat: ja,
en ekki blanda theim inn i #40. #40 er hreinn UI-state bugfix. #30/#41/#42 eru
heimaskjar/branding/feature-flag vinna og eiga ad koma sem ser pakki.

## Codex findings

**Primary issue:** `components/loans/LoanList.tsx` resets the role filter in all
three status pill handlers:

- `components/loans/LoanList.tsx:87` uses `setStatus('open'); setRoleFilter(null)`
- `components/loans/LoanList.tsx:96` uses `setStatus('returned'); setRoleFilter(null)`
- `components/loans/LoanList.tsx:105` uses `setStatus('all'); setRoleFilter(null)`

This directly contradicts TODO #40. The status filter and role filter are stored
as independent state variables, but the status handlers deliberately clear the
role filter.

**Test currently locks in the wrong behavior:**  
`lib/__tests__/loan-list.test.tsx:193-199` has:

`it('switching status tab clears role filter', ...)`

That test should be updated to assert the new product behavior:

- choose `Eg lanadi`
- switch status to `Skilad`
- `Eg lanadi` remains `aria-pressed="true"`
- returned lender row is visible
- returned borrower row is hidden

## Recommended implementation

Keep this as a minimal UI-only change.

1. In `components/loans/LoanList.tsx`, change the three status button handlers:

   - from `onClick={() => { setStatus('open'); setRoleFilter(null) }}`
   - to `onClick={() => setStatus('open')}`

   Do the same for `returned` and `all`.

2. Do not change the data model, SQL, RPCs, Supabase access, RLS, server
   actions, or event feed.

3. Keep role counts as they are for now. They are already based on
   `statusItems`, so the role counts describe the selected status bucket. This
   is acceptable and likely expected.

4. If the preserved role filter produces zero rows under the newly selected
   status, show the current empty/search result state. Do not auto-reset to
   `Allt`.

5. Update `lib/__tests__/loan-list.test.tsx`:

   - Rename the old clearing test to something like
     `switching status tab preserves role filter`.
   - Assert the role pill remains selected after status switch.
   - Assert the filtered returned/open rows match both filters.

6. Optional but good: add a second regression test for the inverse direction:

   - choose `Eg fekk lanad`
   - switch status to `Allt`
   - borrower role remains selected and only borrower rows show.

## Scope limits

Claude Code should only need to touch:

- `components/loans/LoanList.tsx`
- `lib/__tests__/loan-list.test.tsx`

Avoid touching:

- `sql/`
- `lib/loans/actions.ts`
- `recent_events`
- Supabase grants/RLS/auth
- route aliases or #22 work
- #30/#41/#42 home/branding work

## Risk assessment

**Risk level:** Low.

This should be client-side state only. It does not need migrations, secrets,
deployment config, service-role code, billing, auth changes, or production data
changes.

**Main regression risk:** A role filter can remain active while a status filter
has zero matching rows. That is intended by Stebbi's request. The UI should show
a calm empty state instead of silently changing the user's filter.

**Secondary UX risk:** The `Allt` label exists in both status and role filter
rows. Tests should keep distinguishing the first `Allt` as status and second
`Allt` as role, or use more robust queries if practical.

## Suggested commands

Run focused tests first:

```bash
npm run test:run -- lib/__tests__/loan-list.test.tsx
```

If quick enough, also run:

```bash
npm run type-check
```

Do not start or restart the dev server unless Stebbi explicitly asks. Stebbi
runs localhost himself.

## Localhost checks for Stebbi

Page to test:

- `http://localhost:3000/auth-mvp/lanad-og-skilad`

Helpful data setup:

- Best: at least one open item and one returned item.
- Even better: at least one `Eg lanadi` item and one `Eg fekk lanad` item in
  open/returned combinations.

Manual checks:

1. Open `Lanad og skilad`.
2. In the lower role filter row, choose `Eg lanadi`.
3. In the upper status filter row, click `Skilad`.
4. Expected: lower filter still shows `Eg lanadi` as selected. It must not jump
   to `Allt`.
5. Click upper `Allt`.
6. Expected: lower filter still shows `Eg lanadi`.
7. Switch lower filter to `Eg fekk lanad`.
8. Click upper `Enn i lani`, `Skilad`, and `Allt`.
9. Expected: lower filter stays on `Eg fekk lanad` until Stebbi explicitly
   changes it.
10. If no matching rows exist, expected result is an empty state, not an
    automatic reset.

Mobile check:

- Test around 360-460 px viewport.
- Confirm the two filter rows wrap cleanly and there is no horizontal scroll or
  overlapping text.

What not to test casually:

- No Supabase dashboard changes.
- No SQL.
- No production data edits.
- No auth/RLS checks needed beyond confirming the page still loads for the
  normal local test user.

## Recommendation after #40

Codex recommends this order:

1. Finish #40 as the quick bugfix.
2. If Stebbi wants another very small win, do #36 wording.
3. Then take #42 + #41 as a combined `/heim` Teskeid-card package:
   - active Teskeidar more prominent
   - Umonnun behind feature flag with explanatory click target
   - no sensitive Umonnun data in Teskeid.is
4. Keep #30 separate unless Stebbi wants a branding/design pass, because favicon
   and logo asset decisions have a different review loop than home-card layout.
