import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isValidElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
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
  })
})

const routeMocks = vi.hoisted(() => ({
  lookup: vi.fn(), expenses: vi.fn(), events: vi.fn(), linkedEvent: vi.fn(), context: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('unexpected notFound') } }))
vi.mock('@/components/expenses/ExpenseShell', () => ({ ExpenseShell: () => null }))
vi.mock('@/components/expenses/ExpenseItemDetail', () => ({ ExpenseItemDetail: () => null }))
vi.mock('@/components/expenses/i18n.server', () => ({
  getExpenseTranslations: async () => (key: string) => key,
}))
vi.mock('@/lib/expenses/guard', () => ({
  guardExpenseSession: async () => ({ user: { id: 'actor-test', email: 'actor@example.test' } }),
}))
vi.mock('@/lib/expenses/participants.server', () => ({ getExpenseParticipantOptions: vi.fn() }))
vi.mock('@/lib/expenses/repository.server', () => ({
  getExpenseItemLookup: routeMocks.lookup,
  getExpenseEventIdentityCandidates: vi.fn(),
  getExpenseRelationshipIdentityManagement: vi.fn(),
}))
vi.mock('@/lib/events/repository.server', () => ({
  getExpenseEventLinkManagementV2: vi.fn(),
  getExpenseLinkedEventId: routeMocks.linkedEvent,
  isExpenseEventContext: routeMocks.context,
}))
vi.mock('@/lib/events/guard', () => ({ canUseEventExpenses: routeMocks.events }))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: routeMocks.expenses }))

import ExpenseItemPage from '@/app/auth-mvp/utlagt-og-endurgreitt/utgjold/[expenseId]/page'
import { eventDetailPath } from '@/lib/events/contracts'

// Exercise the actual page and both consumers of its routing decision.
// Permissions overlap deliberately, so moving a branch changes an observed result.
describe('expense page return-route behavior', () => {
  const groupId = 'group-routing-42'
  const linkedId = 'linked-event-73'
  const root = '/auth-mvp/utlagt-og-endurgreitt'
  const cases = [
    { label: 'one-off root', kind: 'one_off', events: false, linked: null, context: false, href: root },
    { label: 'group detail', kind: 'group', events: false, linked: null, context: false, href: root + '/hopar/' + groupId },
    { label: 'linked event over one-off', kind: 'one_off', events: true, linked: linkedId, context: false, href: eventDetailPath(linkedId) },
    { label: 'linked event over group', kind: 'group', events: true, linked: linkedId, context: true, href: eventDetailPath(linkedId) },
    { label: 'event context uses group ID', kind: 'group', events: true, linked: null, context: true, href: eventDetailPath(groupId) },
    { label: 'event permission without context', kind: 'group', events: true, linked: null, context: false, href: root + '/hopar/' + groupId },
    { label: 'event permission alone keeps root', kind: 'one_off', events: true, linked: null, context: false, href: root },
    { label: 'disabled events keep group', kind: 'group', events: false, linked: linkedId, context: true, href: root + '/hopar/' + groupId },
  ] as const

  for (const canUseExpenses of [false, true]) {
    it.each(cases)(`$label, expenses access = ${canUseExpenses}`, async (scenario) => {
      routeMocks.lookup.mockResolvedValue({
        status: 'ok',
        group: { id: groupId, kind: scenario.kind, status: 'active', canManage: false },
        expense: { id: 'expense-routing-99', title: 'Routing test', status: 'active', createdBySelf: false },
      })
      routeMocks.expenses.mockResolvedValue(canUseExpenses)
      routeMocks.events.mockResolvedValue(scenario.events)
      routeMocks.linkedEvent.mockResolvedValue(scenario.linked)
      routeMocks.context.mockResolvedValue(scenario.context)
      const page = await ExpenseItemPage({
        params: Promise.resolve({ expenseId: 'expense-routing-99' }),
        searchParams: Promise.resolve({}),
      })
      expect(isValidElement(page)).toBe(true)
      if (!isValidElement<{ backHref: string; children: unknown }>(page)) throw new Error('missing shell')
      const expectedHref = canUseExpenses ? scenario.href : '/auth-mvp/heim'
      expect(page.props.backHref).toBe(expectedHref)
      const detail = page.props.children
      expect(isValidElement(detail)).toBe(true)
      if (!isValidElement<{ deleteSuccessHref: string }>(detail)) throw new Error('missing detail')
      expect(detail.props.deleteSuccessHref).toBe(expectedHref)
    })
  }
})
