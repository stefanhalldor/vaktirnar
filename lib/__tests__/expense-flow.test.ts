import { describe, expect, it } from 'vitest'
import {
  expenseDetailHref,
  expenseEditStepHref,
  parseExpenseFlowStep,
} from '@/lib/expenses/flow'

describe('expense flow route mapping', () => {
  it('accepts only known edit steps and falls back safely to details', () => {
    expect(parseExpenseFlowStep('people')).toBe('people')
    expect(parseExpenseFlowStep(['split', 'details'])).toBe('split')
    expect(parseExpenseFlowStep('unknown')).toBe('details')
    expect(parseExpenseFlowStep(undefined)).toBe('details')
  })

  it('builds stable detail and edit deep links', () => {
    expect(expenseDetailHref('expense-1')).toBe(
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-1',
    )
    expect(expenseEditStepHref('expense-1', 'people')).toBe(
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-1/breyta?step=people',
    )
  })
})
