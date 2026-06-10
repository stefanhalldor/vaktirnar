# TODO #34 / #35 - Refined quick-fix plan: CTA and save-to-redirect gap

## Relevant TODO items

- TODO #34: Meira áberandi `Skrá hlut í láni` takki
- TODO #35: Loader/pending-state helst virkur þar til vistaður hlutur redirectar

## Why this supersedes v001

Stebbi clarified the #35 symptom:

> Þegar smellt er á `Vista` koma punktar á Vista takkann, en svo verður Vista
> takkinn aftur eðlilegur og það líða 2-3 sekúndur þangað til redirect gerist
> og hluturinn sést sem vistaður.

So the issue is not that the first loader never appears. The issue is that the
button returns to its normal `Vista` state during the success-feedback /
redirect delay.

This supersedes:

`2026-06-10-0013-todo-034-035-v001-codex-loan-cta-save-loader-quick-fix-plan.md`

## Codex assessment

This is still a quick fix.

Expected scope:

- UI-only improvement for the `Skrá hlut í láni` CTA.
- Client-side state fix in `LoanForm`.
- No SQL.
- No Supabase changes.
- No auth/RLS/grants changes.
- No loan RPC changes.

## Likely root cause for #35

In `components/loans/LoanForm.tsx`, submit currently uses `useTransition`.

On successful create with `emailStatus !== undefined`, the form does:

```ts
setSaveEmailStatus(result.emailStatus)
setTimeout(() => {
  router.push('/auth-mvp/lanad-og-skilad')
  router.refresh()
}, 2500)
```

During that `2500ms` delay, the server action has already finished, so
`isPending` can become false. The submit button then renders normal `Vista`
again even though the app is intentionally waiting to redirect.

That creates a confusing gap where the user can think nothing happened or can
try to submit again.

## Implementation plan

### 1. Keep #34 from v001

In `app/auth-mvp/lanad-og-skilad/page.tsx`:

- Make `Skrá hlut í láni` visually primary.
- Prefer a `Plus` icon from `lucide-react` instead of a literal `+`.
- Keep the translated text `t('newItem')`.
- Keep full-width mobile layout.
- Preserve focus-visible and accessible link behavior.
- Avoid too much vertical bulk.

Suggested direction:

```tsx
<Link
  href="/auth-mvp/lanad-og-skilad/ny"
  className="flex items-center justify-center gap-2 h-12 rounded-xl bg-[#154212] text-white text-sm font-semibold shadow-sm hover:bg-[#2d5a27] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
>
  <Plus size={18} aria-hidden />
  <span>{t('newItem')}</span>
</Link>
```

Claude Code should adapt classes to local style if there is a better existing
primary button pattern.

### 2. Fix the real #35 gap: submitting state must survive the redirect delay

In `components/loans/LoanForm.tsx`:

- Add explicit local state, for example:

```ts
const [isSubmitting, setIsSubmitting] = useState(false)
const saving = isSubmitting || isPending
```

- At the start of `handleSubmit`, guard duplicate submits and set local state:

```ts
if (saving) return
setIsSubmitting(true)
setError('')
setSaveEmailStatus(null)
```

- Use `saving`, not only `isPending`, for:
  - disabling submit,
  - disabling or de-emphasizing cancel/back,
  - rendering save label/spinner.

- On action failure:

```ts
setIsSubmitting(false)
```

- On successful create with email feedback and delayed redirect:
  - keep `isSubmitting` true during the 2.5 second feedback window,
  - keep submit disabled,
  - show the success/uncertain email message,
  - show a saving/done/redirecting state on the button rather than normal
    `Vista`.

- On successful save with immediate `router.push`, no reset is needed before
  navigation.

Important: do not let the button return to normal `Vista` between server action
success and route change.

### 3. Button label

Use a translated loading label instead of only `...`.

Prefer existing key if present:

- `teskeid.loans.saving`

Possible behavior:

- while submitting: `Vista...` or existing localized `saving`,
- after success message is displayed but before redirect: keep the same saving
  label, or use a clear `Vistað`/`Færi þig...` label if existing translations
  support it.

Do not add lots of new text unless necessary. This is a quick fix.

### 4. Duplicate-submit protection

Because `createLoan` already uses a stable `request_id`, duplicate backend rows
should be guarded server-side. But the UI should still prevent repeated submits.

Claude Code should ensure:

- repeated taps during the 2.5 second success window do nothing,
- submit remains disabled until navigation or failure,
- validation failure restores editability.

### 5. Tests

Update focused tests only.

Likely file:

- `lib/__tests__/loan-pages.test.tsx`

Recommended assertions:

- `Skrá hlut í láni` CTA still links to
  `/auth-mvp/lanad-og-skilad/ny`.
- CTA accessible text remains `Skrá hlut í láni`, even if the visible `+`
  becomes an icon.
- In create mode, after a successful action with `emailStatus`, the submit
  button stays disabled during the delayed redirect window.
- During that delay, the button does not revert to normal `Vista`.
- On action failure, submit is re-enabled and the existing error is shown.

If timing tests are awkward, use fake timers around the `setTimeout`.

## Manual verification for Stebbi

1. Open `/auth-mvp/lanad-og-skilad`.
2. Confirm `Skrá hlut í láni` reads as the primary action.
3. Open `/auth-mvp/lanad-og-skilad/ny`.
4. Create a valid item with recipient/email path that triggers the feedback
   delay if applicable.
5. Tap `Vista`.
6. Confirm dots/saving state appears immediately.
7. Confirm the button does **not** return to normal `Vista` during the 2-3 second
   delay before redirect.
8. Confirm repeated taps cannot submit again.
9. Confirm redirect finishes and the item appears.

## Risk assessment

Low risk.

Main risk is a stuck disabled button if a failure path forgets to reset
`isSubmitting`. Claude Code should audit every `result.ok === false` path and
any thrown action path.

No expected impact on:

- Supabase,
- production data,
- RLS,
- auth,
- secrets/API keys,
- billing,
- SQL migrations.

## Required Claude Code handoff after implementation

Claude Code should create:

`2026-06-10-HHMM-todo-034-035-v003-claude-loan-cta-save-loader-post-implementation.md`

Include:

1. Files changed.
2. Exact CTA visual behavior.
3. Exact save/pending behavior, especially during the delayed redirect.
4. Tests run and exit codes.
5. Manual checks Stebbi should perform.
