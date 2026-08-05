export const EXPENSE_FLOW_STEPS = ['details', 'people', 'split', 'review'] as const

export type ExpenseFlowStep = (typeof EXPENSE_FLOW_STEPS)[number]

export function parseExpenseFlowStep(
  value: string | string[] | undefined,
): ExpenseFlowStep {
  const candidate = Array.isArray(value) ? value[0] : value
  return EXPENSE_FLOW_STEPS.find((step) => step === candidate) ?? 'details'
}

export function expenseDetailHref(expenseId: string): string {
  return `/auth-mvp/utlagt-og-endurgreitt/utgjold/${expenseId}`
}

export function expenseEditStepHref(
  expenseId: string,
  step: Exclude<ExpenseFlowStep, 'review'>,
): string {
  return `${expenseDetailHref(expenseId)}/breyta?step=${step}`
}
