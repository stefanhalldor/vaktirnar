import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseGroupView, ExpenseItemView } from '@/lib/expenses/contracts'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const translations: Record<string, string> = {
  'expenseForm.stepNavAriaLabel': 'Skref við skráningu útgjalds',
  'expenseForm.steps.details': 'Útgjald',
  'expenseForm.steps.people': 'Aðilar',
  'expenseForm.steps.split': 'Skipting',
  'expenseForm.steps.review': 'Yfirferð',
  'expenseForm.stepCompleted': 'Lokið, opna til að breyta',
  'expenseForm.stepEditUnavailable': 'Ekki er hægt að breyta þessu útgjaldi',
  'expenseForm.previewNet': 'Nettóstaða eftir útgjaldið',
  'expenseForm.previewSettlement': 'Hver greiðir hverjum',
  'expenseForm.previewIsOwed': '{name} á inni',
  'expenseForm.previewOwesBalance': '{name} skuldar',
  'expenseForm.previewEven': '{name} er í jafnvægi',
  'expenseForm.previewOwes': '{from} greiðir {to}',
  'expenseForm.previewSettled': 'Engin greiðsla þarf að fara milli aðila.',
  'common.status': 'Staða',
  'expense.active': 'Virkt',
  'expense.splitMethod': 'Skipting',
  'expense.paid': 'Greitt við kaup',
  'expense.shares': 'Hlutur hvers',
  'expense.openGroup': 'Opna hópinn',
  'expense.edit': 'Breyta útgjaldinu',
  'expense.cancel': 'Fella útgjald niður',
  'splitMethods.equal': 'Jafnt',
}

function translate(rawKey: string, values?: Record<string, string | number>): string {
  const key = rawKey.replace(/^teskeid\.expenses\./, '')
  let result = translations[key] ?? key
  for (const [name, value] of Object.entries(values ?? {})) {
    result = result.replace(`{${name}}`, String(value))
  }
  return result
}

vi.mock('next-intl', () => ({ useTranslations: () => translate }))
vi.mock('next-intl/server', () => ({
  getLocale: vi.fn().mockResolvedValue('is'),
  getTranslations: vi.fn().mockResolvedValue(translate),
}))
vi.mock('@/lib/expenses/actions', () => ({ cancelExpense: vi.fn() }))

import { ExpenseItemDetail } from '@/components/expenses/ExpenseItemDetail'

const expense: ExpenseItemView = {
  id: 'expense-1',
  groupId: 'group-1',
  title: 'Kvöldmatur',
  totalMinor: 10_000,
  currency: 'ISK',
  incurredOn: '2026-08-04',
  category: null,
  note: null,
  status: 'active',
  splitMethod: 'equal',
  createdBySelf: true,
  createdAt: '2026-08-04T12:00:00.000Z',
  payments: [{ memberId: 'self', displayName: 'Ég', amountMinor: 10_000 }],
  shares: [
    { memberId: 'self', displayName: 'Ég', amountMinor: 5_000 },
    { memberId: 'anna', displayName: 'Anna', amountMinor: 5_000 },
  ],
}

const group: ExpenseGroupView = {
  id: 'group-1',
  kind: 'group',
  name: 'Ferð',
  description: null,
  emoji: null,
  defaultCurrency: 'ISK',
  defaultIncludeCreator: true,
  financialVersion: 1,
  status: 'active',
  role: 'owner',
  canManage: true,
  canLeave: false,
  canCreateExpense: true,
  createdAt: '2026-08-04T10:00:00.000Z',
  members: [],
  expenses: [expense],
  balances: [],
  settlementTransfers: [],
  repayments: [],
  activity: [],
}

describe('ExpenseItemDetail flow context', () => {
  it('keeps review active and shows the saved expense net position and settlement', async () => {
    render(await ExpenseItemDetail({ group, expense }))

    const nav = screen.getByRole('navigation', { name: 'Skref við skráningu útgjalds' })
    expect(within(nav).getByRole('button', { name: 'Yfirferð' })).toHaveAttribute('aria-current', 'step')
    expect(within(nav).getByRole('button', { name: /Aðilar.*Lokið/ })).toBeEnabled()
    expect(screen.getByRole('heading', { name: 'Nettóstaða eftir útgjaldið' })).toBeInTheDocument()
    expect(screen.getByText('Ég á inni')).toBeInTheDocument()
    expect(screen.getByText('Anna skuldar')).toBeInTheDocument()
    expect(screen.getByText('Anna greiðir Ég')).toBeInTheDocument()
  })
})
