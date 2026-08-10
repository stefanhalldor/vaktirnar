import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpensePayAllView } from '@/lib/expenses/contracts'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => React.createElement('a', { href, ...props }, children),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const translations: Record<string, string> = {
  'common.amount': 'Upphæð',
  'preferences.title': 'Greiðsluleiðir',
  'preferences.accountNumber': 'Reikningsnúmer',
  'preferences.nationalId': 'Kennitala',
  'repayment.currentPaymentDetailsHidden': 'Viðtakandi hefur ekki deilt greiðsluupplýsingum fyrir þetta uppgjör.',
  'repayment.currentPaymentDetailsHint': 'Þetta er núverandi greiðsluleið viðtakanda fyrir þetta uppgjör.',
  'repayment.copy': 'Afrita',
  'repayment.copied': 'Afritað',
  'repayment.copyValue': 'Afrita {label}',
  'repayment.copyFailed': 'Ekki tókst að afrita.',
  'payAll.intro': 'Hér sérðu upphæðirnar og greiðsluupplýsingarnar.',
  'payAll.outsidePayment': 'Teskeið millifærir ekki peninga.',
  'payAll.payRecipient': 'Greiða {name}',
  'payAll.details': 'Nánar',
  'payAll.detailsTitle': 'Samhengi greiðslunnar',
  'payAll.detailsDescription': 'Þetta er það sem greiðslan til {name} gerir upp.',
  'payAll.closeDetails': 'Loka nánari upplýsingum',
  'payAll.groupContext': 'Hópur',
  'payAll.oneOffContext': 'Stök færsla',
  'payAll.openSettlement': 'Opna uppgjör',
  'payAll.relatedEntries': 'Tengdar færslur',
  'payAll.reportHint': 'Opnaðu uppgjörið og tilkynntu greiðsluna.',
  'payAll.markPaid': 'Búinn að borga',
  'repayment.report': 'Tilkynna greiðslu',
  'repayment.reportDialogTitle': 'Tilkynna greiðslu',
  'repayment.reportDialogDescription': 'Skráðu greiðsluna.',
  'repayment.close': 'Loka',
  'repayment.payBeforeReport': 'Greiddu áður en þú tilkynnir.',
  'payAll.empty': 'Allt er uppgert 😊',
  'payAll.reviewTitle': 'Sum uppgjör þarfnast yfirferðar',
  'payAll.reviewBody': 'Opnaðu uppgjörið áður en þú greiðir.',
  'payAll.reviewContext': '{group}: greiðsla til {name}',
}

function translate(rawKey: string, values?: Record<string, string | number>): string {
  const key = rawKey.replace(/^teskeid\.expenses\./, '')
  let value = translations[key] ?? key
  for (const [name, replacement] of Object.entries(values ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

vi.mock('next-intl', () => ({ useTranslations: () => translate }))

import { ExpensePayAll } from '@/components/expenses/ExpensePayAll'

function payAllView(): ExpensePayAllView {
  return {
    payments: [{
      id: 'payment-1',
      recipientDisplayName: 'Anna',
      amountMinor: 12_500,
      currency: 'ISK',
      paymentInstruction: {
        title: 'payment_profile_v2',
        kind: 'bank_account',
        currency: 'ISK',
        details: { accountNumber: '0159-26-123456', nationalId: '010180-9999' },
        visibility: 'debt_context',
        capturedAt: '2026-08-09T12:00:00.000Z',
      },
      contexts: [{
        groupId: 'group-1',
        groupKind: 'group',
        groupName: 'Bústaðarferð',
        emoji: '🏡',
        amountMinor: 12_500,
        currency: 'ISK',
        expenses: [{ id: 'expense-1', title: 'Matur', incurredOn: '2026-08-08' }],
        transfer: {
          fromMemberId: 'self', fromDisplayName: 'Ég', toMemberId: 'anna', toDisplayName: 'Anna',
          amountMinor: 12_500, currency: 'ISK', expectedFinancialVersion: 4, canReport: true,
          paymentInstruction: null,
        },
      }],
    }],
    blockedContexts: [],
  }
}

describe('ExpensePayAll', () => {
  it('shows the consolidated amount and authorized payment details', () => {
    render(<ExpensePayAll view={payAllView()} locale="is" initialDate="2026-08-10" />)

    expect(screen.getByRole('heading', { name: 'Greiða Anna' })).toBeInTheDocument()
    expect(screen.getByText(/12\.500/)).toBeInTheDocument()
    expect(screen.getByText('0159-26-123456')).toBeInTheDocument()
    expect(screen.getByText('010180-9999')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Búinn að borga' })).toBeInTheDocument()
  })

  it('opens a mobile detail drawer with direct settlement and entry links', () => {
    render(<ExpensePayAll view={payAllView()} locale="is" initialDate="2026-08-10" />)
    fireEvent.click(screen.getByRole('button', { name: 'Nánar' }))

    expect(screen.getByRole('dialog', { name: 'Samhengi greiðslunnar' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Bústaðarferð/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Opna uppgjör' })).toHaveAttribute(
      'href',
      '/auth-mvp/utlagt-og-endurgreitt/hopar/group-1',
    )
    expect(screen.getByRole('link', { name: /Matur/ })).toHaveAttribute(
      'href',
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-1',
    )
  })

  it('fails closed when payment details are unavailable and handles an empty settlement', () => {
    const hidden = payAllView()
    hidden.payments[0]!.paymentInstruction = null
    const { rerender } = render(<ExpensePayAll view={hidden} locale="is" initialDate="2026-08-10" />)
    expect(screen.getByText('Viðtakandi hefur ekki deilt greiðsluupplýsingum fyrir þetta uppgjör.')).toBeInTheDocument()

    rerender(<ExpensePayAll view={{ payments: [], blockedContexts: [] }} locale="is" initialDate="2026-08-10" />)
    expect(screen.getByText('Allt er uppgert 😊')).toBeInTheDocument()
  })

  it('never offers one ambiguous aggregate report action for multiple contexts', () => {
    const view = payAllView()
    view.payments[0]!.contexts.push({
      ...view.payments[0]!.contexts[0]!,
      groupId: 'group-2',
      groupName: 'Önnur ferð',
      amountMinor: 2_500,
      transfer: {
        ...view.payments[0]!.contexts[0]!.transfer,
        amountMinor: 2_500,
        expectedFinancialVersion: 7,
      },
    })
    render(<ExpensePayAll view={view} locale="is" initialDate="2026-08-10" />)

    expect(screen.queryByRole('button', { name: 'Búinn að borga' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Nánar' }))
    expect(screen.getAllByRole('button', { name: 'Búinn að borga' })).toHaveLength(2)
  })
})
