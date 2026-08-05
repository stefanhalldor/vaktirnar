export const EXPENSE_FLOW_STEPS = ['details', 'people', 'split', 'review'] as const

export type ExpenseFlowStep = (typeof EXPENSE_FLOW_STEPS)[number]
export const EXPENSE_SAVED_VIEWS = ['review', 'people', 'split', 'settlement'] as const
export type ExpenseSavedView = (typeof EXPENSE_SAVED_VIEWS)[number]

export function parseExpenseFlowStep(
  value: string | string[] | undefined,
): ExpenseFlowStep {
  const candidate = Array.isArray(value) ? value[0] : value
  return EXPENSE_FLOW_STEPS.find((step) => step === candidate) ?? 'details'
}

export function expenseDetailHref(expenseId: string): string {
  return `/auth-mvp/utlagt-og-endurgreitt/utgjold/${expenseId}`
}

export function parseExpenseSavedView(
  value: string | string[] | undefined,
): ExpenseSavedView {
  const candidate = Array.isArray(value) ? value[0] : value
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
  step: Exclude<ExpenseFlowStep, 'review'>,
): string {
  return `${expenseDetailHref(expenseId)}/breyta?step=${step}`
}
