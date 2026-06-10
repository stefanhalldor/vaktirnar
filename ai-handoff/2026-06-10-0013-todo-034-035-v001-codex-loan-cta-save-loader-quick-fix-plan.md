# TODO #34 / #35 - Loan CTA and immediate save loader quick-fix plan

## Relevant TODO items

- TODO #34: Meira áberandi `Skrá hlut í láni` takki
- TODO #35: Loader birtist strax þegar nýr hlutur er vistaður

## Codex assessment

This should be a quick fix if Claude Code keeps the scope tight.

Expected scope:

- UI-only change for the `Skrá hlut í láni` entry point.
- Client-side pending-state fix in the loan form.
- No SQL.
- No Supabase changes.
- No auth/RLS/grants changes.
- No loan RPC changes.
- No changes to idempotency semantics beyond preventing duplicate submits in the
  client while a save is already in progress.

The only non-trivial part is #35: `useTransition` alone may not provide the
immediate tactile feedback Stebbi expects. The fix should use an explicit local
submitting state that flips synchronously on submit.

## Files likely involved

Claude Code should inspect these first:

- `app/auth-mvp/lanad-og-skilad/page.tsx`
- `components/loans/LoanForm.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/loan-pages.test.tsx`

Potentially related, but do not change unless needed:

- `components/loans/LoanShell.tsx`
- `components/loans/LoanList.tsx`
- `components/loans/LoanItemDetailsForm.tsx`

## Current observations from Codex

In `app/auth-mvp/lanad-og-skilad/page.tsx`, the CTA is currently:

- full-width,
- height `h-10`,
- dashed border,
- text `+ {t('newItem')}`.

That can read as secondary/placeholder rather than the main action.

In `components/loans/LoanForm.tsx`, submit currently uses:

- `useTransition`,
- `disabled={isPending}`,
- button label `{isPending ? '...' : t('save')}`.

Stebbi reports that after tapping `Vista`, the UI can appear unchanged for 2-3
seconds. That suggests the visual pending state is not immediate or not obvious
enough.

## Implementation plan

### 1. Make `Skrá hlut í láni` clearly primary

In `app/auth-mvp/lanad-og-skilad/page.tsx`:

- Change the `Skrá hlut í láni` link from dashed-outline to a clear primary CTA.
- Keep the translated label from `t('newItem')`.
- Prefer a real icon from `lucide-react`, likely `Plus`, instead of a literal
  `+` text prefix.
- Keep it full width on mobile.
- Make it at least `h-11` or `h-12`, with strong primary background and
  primary-foreground/white text.
- Keep focus-visible styles.
- Ensure it does not overlap with nav, bottom bar, or list content.

Suggested shape, not mandatory:

```tsx
<Link
  href="/auth-mvp/lanad-og-skilad/ny"
  className="flex items-center justify-center gap-2 h-12 rounded-xl bg-[#154212] text-white text-sm font-semibold shadow-sm hover:bg-[#2d5a27] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
>
  <Plus size={18} aria-hidden />
  <span>{t('newItem')}</span>
</Link>
```

Claude Code should align classes with existing project conventions if there is
a better local primary-button pattern.

### 2. Make `Vista` show pending state immediately

In `components/loans/LoanForm.tsx`:

- Add explicit local state, for example:

```ts
const [isSubmitting, setIsSubmitting] = useState(false)
const saving = isSubmitting || isPending
```

- In `handleSubmit`, guard duplicate submits:

```ts
if (isSubmitting || isPending) return
setIsSubmitting(true)
setError('')
setSaveEmailStatus(null)
```

- Keep `setIsSubmitting(true)` outside and before `startTransition(...)`, so the
  UI changes immediately after tap/click.
- Use `saving` to disable the submit button.
- Consider disabling the cancel button while saving, or at least prevent it from
  looking like the primary action during save.
- On failed result, reset `setIsSubmitting(false)`.
- On validation/schema error returned by the action, reset
  `setIsSubmitting(false)` and show the existing error message.
- On success with navigation, no reset is needed before route change.
- On success with delayed email feedback, keep `isSubmitting` true while the
  2.5 second status message is shown, so the user cannot submit twice.

Do not rely on `useTransition` alone for the immediate loader.

### 3. Improve the loading label

Avoid showing only `...` if translations already provide a saving label.

Use existing translation key if available:

- `teskeid.loans.saving`

If it exists in both `messages/is.json` and `messages/en.json`, use:

```tsx
{saving ? t('saving') : t('save')}
```

If one locale is missing the key, add it to both.

Optional but good:

- Add a small inline spinner if there is an existing spinner/loader pattern.
- If adding a spinner creates visual churn, a text label is enough for this
  quick fix.

### 4. Tests

Update or add focused tests only.

Likely test file:

- `lib/__tests__/loan-pages.test.tsx`

Recommended assertions:

- The `Skrá hlut í láni` CTA still links to
  `/auth-mvp/lanad-og-skilad/ny`.
- The CTA is no longer tested as literal `+ Skrá hlut í láni` if `+` becomes an
  icon. Prefer accessible name or text matching `Skrá hlut í láni`.
- `LoanForm` disables the `Vista` submit button immediately after submit.
- `LoanForm` shows `Vista...` / saving label immediately after submit.
- On action failure, the button is re-enabled and the existing error message is
  shown.

If existing tests make component-level pending-state hard to assert, Claude Code
should add the smallest direct `LoanForm` test rather than over-mocking the whole
page.

## Manual verification for Stebbi

After Claude Code implements:

1. Open `/auth-mvp/lanad-og-skilad` on mobile width.
2. Confirm `Skrá hlut í láni` is obviously the primary action.
3. Open `/auth-mvp/lanad-og-skilad/ny`.
4. Enter a valid item.
5. Tap `Vista`.
6. Confirm the button changes immediately to saving/loading and becomes disabled.
7. Confirm no duplicate item is created if tapping repeatedly.
8. Confirm validation/save errors restore the form to an editable state.

## Risk assessment

Low risk if scoped correctly.

Potential regressions:

- CTA becomes too visually dominant or takes too much vertical space.
- Existing test expecting literal `+ Skrá hlut í láni` fails after switching to
  an icon.
- Submit button can get stuck disabled if failure paths do not reset
  `isSubmitting`.
- Cancel/back behavior during save might become confusing if not considered.

No expected impact on:

- Supabase,
- production data,
- RLS,
- auth,
- secrets/API keys,
- billing,
- SQL migrations.

## Required Claude Code handoff after implementation

Claude Code should create a short post-implementation handoff, for example:

`2026-06-10-HHMM-todo-034-035-v002-claude-loan-cta-save-loader-post-implementation.md`

It should include:

1. Files changed.
2. Exact UI behavior changed for #34.
3. Exact pending-state behavior changed for #35.
4. Tests run and exit codes.
5. Whether any translation keys were added or reused.
6. Any remaining risk or manual checks Stebbi should perform.
