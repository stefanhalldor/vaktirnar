import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  canonicalOneOffExpenseHref,
  expenseDetailHref,
  expenseEditStepHref,
  parseExpenseFlowStep,
  parseExpenseSavedView,
} from '@/lib/expenses/flow'

describe('expense flow route mapping', () => {
  it('accepts only known edit steps and falls back safely to details', () => {
    expect(parseExpenseFlowStep('people')).toBe('split')
    expect(parseExpenseFlowStep('review')).toBe('split')
    expect(parseExpenseFlowStep(['split', 'details'])).toBe('split')
    expect(parseExpenseFlowStep('unknown')).toBe('details')
    expect(parseExpenseFlowStep(undefined)).toBe('details')
  })

  it('builds stable detail and edit deep links', () => {
    expect(expenseDetailHref('expense-1')).toBe(
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-1',
    )
    expect(expenseEditStepHref('expense-1', 'split')).toBe(
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-1/breyta?step=split',
    )
  })

  it('keeps only Útlagt and Uppgjör in read mode while preserving old deep links', () => {
    expect(parseExpenseSavedView('review')).toBe('review')
    expect(parseExpenseSavedView('settlement')).toBe('settlement')
    expect(parseExpenseSavedView('people')).toBe('settlement')
    expect(parseExpenseSavedView('split')).toBe('settlement')
    expect(parseExpenseSavedView('unknown')).toBe('review')
  })

  it('routes only an unambiguous one-off group to its canonical expense summary', () => {
    expect(canonicalOneOffExpenseHref('one_off', ['expense-1'])).toBe(
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-1',
    )
    expect(canonicalOneOffExpenseHref('one_off', [])).toBeNull()
    expect(canonicalOneOffExpenseHref('one_off', ['expense-1', 'expense-2'])).toBeNull()
    expect(canonicalOneOffExpenseHref('group', ['expense-1'])).toBeNull()
  })

  it('wires the one-off group route to the canonical summary without a dead group step bar', () => {
    const groupPage = readFileSync(join(
      process.cwd(),
      'app/auth-mvp/utlagt-og-endurgreitt/hopar/[groupId]/page.tsx',
    ), 'utf8')
    const groupDetail = readFileSync(join(
      process.cwd(),
      'components/expenses/ExpenseGroupDetail.tsx',
    ), 'utf8')
    const expensePage = readFileSync(join(
      process.cwd(),
      'app/auth-mvp/utlagt-og-endurgreitt/utgjold/[expenseId]/page.tsx',
    ), 'utf8')

    expect(groupPage).toContain('canonicalOneOffExpenseHref(')
    expect(groupPage).toContain('if (canonicalExpenseHref) redirect(canonicalExpenseHref)')
    expect(groupDetail).not.toContain('<ExpenseFlowNav')
    expect(expensePage).toContain("result.group.kind === 'one_off'")
    expect(expensePage).toContain("? '/auth-mvp/utlagt-og-endurgreitt'")
  })
})
