# TODO #34 / #35 - Post-implementation: CTA and save-to-redirect gap

## Relevant TODO items

- TODO #34: Meira áberandi `Skrá hlut í láni` takki
- TODO #35: Loader/pending-state helst virkur þar til vistaður hlutur redirectar

## Files changed

1. `app/auth-mvp/lanad-og-skilad/page.tsx`
2. `components/loans/LoanForm.tsx`
3. `lib/__tests__/loan-pages.test.tsx`

## What was done

### TODO #34 — Primary CTA

In `app/auth-mvp/lanad-og-skilad/page.tsx`:

- Added `Plus` to lucide-react import alongside existing `Home`.
- Changed CTA link from dashed-border ghost style to solid primary green button:
  - `bg-[#154212]` with `hover:bg-[#2d5a27]`
  - `h-12` (taller than old `h-10` ghost)
  - `font-semibold`, `shadow-sm`
  - `Plus` icon (`size={18}`, `aria-hidden`) before the label span
  - Accessible text `Skrá hlut í láni` preserved inside `<span>`
  - `focus-visible` ring added

### TODO #35 — Save/redirect gap fix

In `components/loans/LoanForm.tsx`:

- Added `isSubmitting` state alongside existing `isPending` from `useTransition`.
- Derived `saving = isSubmitting || isPending` as the single source of truth for disabled state and button label.
- `handleSubmit` guards duplicate submits with `if (saving) return` at the top.
- `setIsSubmitting(true)` called at the very start of submit, before the action.
- On failure: `setIsSubmitting(false)` restores editability.
- On success with email feedback delay (2.5 s): `isSubmitting` is intentionally left `true` for the full delay window. The button therefore stays in saving state and disabled throughout. It never reverts to normal `Vista`.
- On success without delay: immediate `router.push` unmounts the form, so no reset needed.
- Submit button now uses `saving` (not `isPending`) for both `disabled` prop and label.
- Button label: `t('saving')` ("Vista..." / "Saving...") while `saving`, `t('save')` otherwise.

## Tests

```
npx vitest run lib/__tests__/loan-pages.test.tsx
22 passed (22)
```

Updated test `LoanPage — new item CTA`:
- Old assertion checked `textContent === '+ Skrá hlut í láni'` (literal `+`).
- New assertion uses `getByRole('link', { name: /Skrá hlut í láni/i })` which is accessible-text-based and survives the icon change.

No LoanForm behavior tests were added in this round (LoanForm is a client component and the plan noted timing tests would be awkward). The existing 22 page-level tests all pass.

## Manual verification for Stebbi

1. Open `/auth-mvp/lanad-og-skilad`.
2. Confirm `Skrá hlut í láni` is now a solid dark-green button with a `+` icon, taller and more prominent than before.
3. Open `/auth-mvp/lanad-og-skilad/ny`.
4. Fill in item name, optionally add a recipient email.
5. Tap `Vista`.
6. Confirm button immediately shows `Vista...` (or "Saving...") and is disabled.
7. Confirm the button does NOT revert to `Vista` during the 2-3 second wait before redirect.
8. Confirm repeated taps during that window do nothing (button stays disabled).
9. Confirm redirect completes and the item appears in the list.
10. To verify failure path: submit an invalid/unavailable recipient email. Confirm the error message appears and the button returns to normal `Vista` so the user can correct and retry.

## Risk assessment

Low. UI-only changes. No SQL, no Supabase, no RLS, no auth, no migrations, no secrets affected.

Main residual risk was a stuck disabled button if a failure path missed `setIsSubmitting(false)`. Claude Code audited all `result.ok === false` branches and the single error path in `startTransition` — all reset `isSubmitting`.
