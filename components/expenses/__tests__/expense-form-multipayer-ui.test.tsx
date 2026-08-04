import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateExpense, mockPush, mockRefresh } = vi.hoisted(() => ({
  mockCreateExpense: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

const translations: Record<string, string> = {
  'common.amount': 'Upphæð',
  'common.currency': 'Gjaldmiðill',
  'common.date': 'Dagsetning',
  'common.optional': 'Valfrjálst',
  'common.note': 'Athugasemd',
  'expenseForm.details': 'Upplýsingar',
  'expenseForm.title': 'Heiti útgjalds',
  'expenseForm.titlePlaceholder': 'Til dæmis Kvöldmatur',
  'expenseForm.category': 'Flokkur',
  'expenseForm.participants': 'Fyrir hvern?',
  'expenseForm.paidBy': 'Hver borgaði?',
  'expenseForm.paidHint': 'Samanlagðar greiðslur þurfa að vera nákvæmlega heildarupphæðin.',
  'expenseForm.split': 'Hvernig skiptist útgjaldið?',
  'expenseForm.preview': 'Forskoðun',
  'expenseForm.previewHint': 'Þetta er hvernig útgjaldið verður vistað.',
  'expenseForm.previewPaidBy': 'Greiðendur',
  'expenseForm.previewShares': 'Skipting',
  'expenseForm.previewNet': 'Nettóstaða eftir útgjaldið',
  'expenseForm.previewSettlement': 'Hver greiðir hverjum',
  'expenseForm.previewOwes': '{from} greiðir {to}',
  'expenseForm.previewIsOwed': '{name} á inni',
  'expenseForm.previewOwesBalance': '{name} skuldar',
  'expenseForm.previewEven': '{name} er í jafnvægi',
  'expenseForm.previewSettled': 'Engin greiðsla þarf að fara milli aðila.',
  'expenseForm.previewPaymentDetails': 'Greiðsluupplýsingar viðtakanda birtast aðeins viðkomandi skuldara eftir vistun.',
  'expenseForm.roundingHint': 'Nákvæm rúnnun sést í upphæð hvers aðila.',
  'expenseForm.totalPaid': 'Samtals greitt',
  'expenseForm.create': 'Vista útgjald',
  'expenseForm.creating': 'Vista...',
  'splitMethods.equal': 'Jafnt',
  'splitMethods.percentage': 'Prósentur',
  'splitMethods.weighted': 'Hlutföll',
  'splitMethods.fixed': 'Fastar upphæðir',
  'splitMethods.mixedEqual': 'Föst upphæð og jafnar leifar',
  'splitMethods.mixedPercentage': 'Föst upphæð og prósenta af leifum',
  'splitMethods.fixedLabel': 'Föst upphæð',
  'splitMethods.percentageLabel': 'Prósenta',
  'splitMethods.remainderPercentage': 'Prósenta af leifum',
  'splitMethods.weightLabel': 'Hlutfall',
  'splitMethods.inRemainder': 'Tekur þátt í leifum',
  'errors.invalid_input': 'Athugaðu reitina og reyndu aftur.',
  'errors.paymentTotal': 'Greiðslurnar þurfa að stemma við heildarupphæðina.',
  'errors.splitTotal': 'Skiptingin þarf að stemma við heildarupphæðina.',
}

function translate(rawKey: string, values?: Record<string, string | number>): string {
  const key = rawKey.replace(/^teskeid\.expenses\./, '')
  let value = translations[key] ?? key
  for (const [name, replacement] of Object.entries(values ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

vi.mock('next-intl', () => ({
  useTranslations: () => translate,
}))

vi.mock('@/lib/expenses/actions', () => ({
  createExpense: mockCreateExpense,
}))

import { ExpenseForm } from '@/components/expenses/ExpenseForm'

const initialMembers = [
  { key: 'member-self', label: 'Ég', isSelf: true },
  { key: 'member-anna', label: 'Anna', isSelf: false },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateExpense.mockResolvedValue({
    ok: true,
    data: { groupId: 'group-1', expenseId: 'expense-1' },
  })
})

function renderForm() {
  return render(
    <ExpenseForm
      mode="group"
      groupId="group-1"
      defaultCurrency="ISK"
      initialMembers={initialMembers}
      initialDate="2026-08-04"
    />,
  )
}

describe('ExpenseForm split and payer controls', () => {
  it('exposes all six supported split modes as mutually exclusive radio controls', () => {
    renderForm()

    const splitFieldset = screen.getByRole('group', { name: 'Hvernig skiptist útgjaldið?' })
    const expectedLabels = [
      'Jafnt',
      'Prósentur',
      'Hlutföll',
      'Fastar upphæðir',
      'Föst upphæð og jafnar leifar',
      'Föst upphæð og prósenta af leifum',
    ]

    expect(within(splitFieldset).getAllByRole('radio')).toHaveLength(6)
    for (const label of expectedLabels) {
      expect(within(splitFieldset).getByRole('radio', { name: label })).toBeInTheDocument()
    }
    expect(within(splitFieldset).getByRole('radio', { name: 'Jafnt' })).toBeChecked()
  })

  it('allows multiple payers and submits both authoritative payer rows', async () => {
    renderForm()

    fireEvent.change(screen.getByRole('textbox', { name: 'Heiti útgjalds' }), {
      target: { value: 'Kvöldmatur' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Upphæð' }), {
      target: { value: '10000' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Upphæð Ég' }), {
      target: { value: '6000' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Upphæð Anna' }), {
      target: { value: '4000' },
    })

    expect(screen.getByText('Samtals greitt').nextElementSibling).toHaveTextContent('10.000')
    expect(screen.getByText('Greiðendur')).toBeInTheDocument()
    expect(screen.getByText('Skipting')).toBeInTheDocument()
    expect(screen.getByText('Nettóstaða eftir útgjaldið')).toBeInTheDocument()
    expect(screen.getByText('Hver greiðir hverjum')).toBeInTheDocument()
    expect(screen.getByText('Ég á inni')).toBeInTheDocument()
    expect(screen.getByText('Anna skuldar')).toBeInTheDocument()
    expect(screen.getByText('Anna greiðir Ég').nextElementSibling).toHaveTextContent('1.000')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vista útgjald' }))
    })

    await waitFor(() => expect(mockCreateExpense).toHaveBeenCalledTimes(1))
    expect(mockCreateExpense).toHaveBeenCalledWith(expect.objectContaining({
      group_id: 'group-1',
      title: 'Kvöldmatur',
      total: '10000',
      split_method: 'equal',
      payments: [
        { member_key: 'member-self', amount: '6000' },
        { member_key: 'member-anna', amount: '4000' },
      ],
      allocations: [
        { member_key: 'member-self' },
        { member_key: 'member-anna' },
      ],
    }))
    expect(mockPush).toHaveBeenCalledWith('/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-1')
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('reveals method-specific inputs for weighted and both mixed split modes', () => {
    renderForm()
    const splitFieldset = screen.getByRole('group', { name: 'Hvernig skiptist útgjaldið?' })

    fireEvent.click(within(splitFieldset).getByRole('radio', { name: 'Hlutföll' }))
    expect(within(splitFieldset).getAllByRole('textbox', { name: 'Hlutfall' })).toHaveLength(2)

    fireEvent.click(within(splitFieldset).getByRole('radio', { name: 'Föst upphæð og jafnar leifar' }))
    expect(within(splitFieldset).getAllByRole('textbox', { name: 'Föst upphæð' })).toHaveLength(2)
    expect(within(splitFieldset).getAllByRole('checkbox', { name: 'Tekur þátt í leifum' })).toHaveLength(2)

    fireEvent.click(within(splitFieldset).getByRole('radio', { name: 'Föst upphæð og prósenta af leifum' }))
    expect(within(splitFieldset).getAllByRole('textbox', { name: 'Föst upphæð' })).toHaveLength(2)
    expect(within(splitFieldset).getAllByRole('textbox', { name: 'Prósenta af leifum' })).toHaveLength(2)
  })
})
