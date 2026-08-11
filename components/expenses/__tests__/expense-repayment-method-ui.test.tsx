import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseGroupView, ExpenseRepaymentView } from '@/lib/expenses/contracts'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => React.createElement('a', { href, ...props }, children),
}))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'is' }))
vi.mock('@/components/expenses/ExpenseRepaymentDialog', () => ({
  ExpenseRepaymentDialog: () => null,
}))
vi.mock('@/components/expenses/ExpenseGroupActions', () => ({
  ExpenseGroupActions: () => null,
}))
vi.mock('@/components/expenses/ExpenseMemberManager', () => ({
  ExpenseMemberManager: () => null,
}))
vi.mock('@/components/expenses/ExpenseRepaymentActions', () => ({
  ExpenseRepaymentActions: () => <div>stakar repayment-aðgerðir</div>,
}))
vi.mock('@/components/expenses/ExpensePaymentDetails', () => ({
  ExpensePaymentDetails: () => <div>greiðsluupplýsingar</div>,
}))

const translations: Record<string, string> = {
  'common.date': 'Dagsetning',
  'common.status': 'Staða',
  'group.statusActive': 'Virkt',
  'group.balances': 'Staða',
  'group.settlement': 'Uppgjör',
  'group.settlementEmpty': 'Ekkert óuppgert',
  'group.expenses': 'Útgjöld',
  'group.repayments': 'Endurgreiðslur',
  'dashboard.empty': 'Engin útgjöld',
  'repayment.outsidePayment': 'Greiðslan fór fram utan Teskeiðar.',
  'repayment.debtOffsetDescription': 'Þessi færsla er skuldajöfnun í Teskeið og felur ekki í sér millifærslu.',
  'repayment.fromTo': '{from} greiðir {to}',
  'repayment.offsetFromTo': 'Skuldajöfnun milli {from} og {to}',
  'repayment.method': 'Aðferð',
  'repayment.methodDebtOffset': 'Skuldajöfnun',
  'repayment.methodExternalPayment': 'Greiðsla',
  'repayment.statusReported': 'Tilkynnt',
  'repayment.paymentDetails': 'Greiðsluupplýsingar',
  'repayment.openGroup': 'Opna hópinn',
}

function translate(key: string, values?: Record<string, string | number | Date>): string {
  let value = translations[key] ?? key
  for (const [name, replacement] of Object.entries(values ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

vi.mock('@/components/expenses/i18n.server', () => ({
  getExpenseTranslations: async () => translate,
}))

import { ExpenseGroupDetail } from '@/components/expenses/ExpenseGroupDetail'
import { ExpenseRepaymentDetail } from '@/components/expenses/ExpenseRepaymentDetail'

function repayment(
  id: string,
  settlementMethod: 'external_payment' | 'debt_offset',
): ExpenseRepaymentView {
  return {
    id,
    obligationId: `obligation-${id}`,
    groupId: 'group-1',
    fromMemberId: 'anna',
    fromDisplayName: 'Anna',
    toMemberId: 'stefan',
    toDisplayName: 'Stefan',
    amountMinor: settlementMethod === 'debt_offset' ? 5_000 : 25_000,
    currency: 'ISK',
    occurredOn: '2026-08-09',
    note: null,
    status: 'reported',
    createdAt: '2026-08-10T12:00:00.000Z',
    canConfirm: true,
    canReject: true,
    canCancel: true,
    requiresReview: false,
    paymentSnapshot: null,
    settlementBatchId: 'batch-1',
    settlementMethod,
  }
}

function group(repayments: ExpenseRepaymentView[]): ExpenseGroupView {
  return {
    id: 'group-1',
    kind: 'group',
    name: 'Ferð',
    description: null,
    emoji: null,
    defaultCurrency: 'ISK',
    defaultIncludeCreator: true,
    financialVersion: 2,
    status: 'active',
    role: 'member',
    canManage: false,
    canLeave: false,
    canCreateExpense: false,
    createdAt: '2026-08-01T12:00:00.000Z',
    members: [],
    expenses: [],
    balances: [],
    settlementTransfers: [],
    settlementRequiresReview: false,
    repayments,
    activity: [],
  }
}

describe('batch repayment method copy', () => {
  it('distinguishes debt offset from the external payment leg in group history', async () => {
    render(await ExpenseGroupDetail({
      group: group([
        repayment('repayment-offset', 'debt_offset'),
        repayment('repayment-cash', 'external_payment'),
      ]),
      initialDate: '2026-08-10',
      participantOptions: [],
      participantOptionsError: false,
    }))

    expect(screen.getByText('Skuldajöfnun milli Anna og Stefan')).toBeInTheDocument()
    expect(screen.getAllByText('Skuldajöfnun').length).toBeGreaterThan(0)
    expect(screen.getByText('Anna greiðir Stefan')).toBeInTheDocument()
    expect(screen.getByText('Greiðsla')).toBeInTheDocument()
  })

  it('renders a debt offset without outside-cash copy, payment details or individual actions', async () => {
    const offset = repayment('repayment-offset', 'debt_offset')
    render(await ExpenseRepaymentDetail({ group: group([offset]), repayment: offset }))

    expect(screen.getByText('Þessi færsla er skuldajöfnun í Teskeið og felur ekki í sér millifærslu.')).toBeInTheDocument()
    expect(screen.getByText('Skuldajöfnun milli Anna og Stefan')).toBeInTheDocument()
    expect(screen.getByText('Skuldajöfnun')).toBeInTheDocument()
    expect(screen.queryByText('Greiðslan fór fram utan Teskeiðar.')).not.toBeInTheDocument()
    expect(screen.queryByText('greiðsluupplýsingar')).not.toBeInTheDocument()
    expect(screen.queryByText('stakar repayment-aðgerðir')).not.toBeInTheDocument()
  })

  it('keeps the external batch leg clearly labelled as a payment without individual actions', async () => {
    const cash = repayment('repayment-cash', 'external_payment')
    render(await ExpenseRepaymentDetail({ group: group([cash]), repayment: cash }))

    expect(screen.getByText('Greiðslan fór fram utan Teskeiðar.')).toBeInTheDocument()
    expect(screen.getByText('Anna greiðir Stefan')).toBeInTheDocument()
    expect(screen.getByText('Greiðsla')).toBeInTheDocument()
    expect(screen.getByText('greiðsluupplýsingar')).toBeInTheDocument()
    expect(screen.queryByText('Skuldajöfnun')).not.toBeInTheDocument()
    expect(screen.queryByText('stakar repayment-aðgerðir')).not.toBeInTheDocument()
  })
})
