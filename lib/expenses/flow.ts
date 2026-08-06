export const EXPENSE_FLOW_STEPS = ['details', 'split'] as const

export type ExpenseFlowStep = (typeof EXPENSE_FLOW_STEPS)[number]
export const EXPENSE_SAVED_VIEWS = ['review', 'settlement'] as const
export type ExpenseSavedView = (typeof EXPENSE_SAVED_VIEWS)[number]

export function parseExpenseFlowStep(
  value: string | string[] | undefined,
): ExpenseFlowStep {
  const candidate = Array.isArray(value) ? value[0] : value
  // Old deep links and private drafts used separate people/review steps.
  if (candidate === 'people' || candidate === 'review') return 'split'
  return EXPENSE_FLOW_STEPS.find((step) => step === candidate) ?? 'details'
}

export function expenseDetailHref(expenseId: string): string {
  return `/auth-mvp/utlagt-og-endurgreitt/utgjold/${expenseId}`
}

export function canonicalOneOffExpenseHref(
  kind: 'group' | 'one_off',
  expenseIds: readonly string[],
): string | null {
  return kind === 'one_off' && expenseIds.length === 1
    ? expenseDetailHref(expenseIds[0]!)
    : null
}

export function parseExpenseSavedView(
  value: string | string[] | undefined,
): ExpenseSavedView {
  const candidate = Array.isArray(value) ? value[0] : value
  // Preserve old shared/deep links after the three read-only views were
  // consolidated into the participant-centred settlement view.
  if (candidate === 'people' || candidate === 'split') return 'settlement'
  return EXPENSE_SAVED_VIEWS.find((view) => view === candidate) ?? 'review'
}

export function expenseSavedViewHref(expenseId: string, view: ExpenseSavedView): string {
  const base = expenseDetailHref(expenseId)
  return view === 'review' ? base : `${base}?view=${view}`
}

export function parseExpenseDraftId(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value
  return candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null
}

export function expenseEditStepHref(
  expenseId: string,
  step: ExpenseFlowStep,
): string {
  return `${expenseDetailHref(expenseId)}/breyta?step=${step}`
}
