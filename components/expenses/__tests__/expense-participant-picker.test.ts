import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import React from 'react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    'teskeid.expenses.expenseForm.closeParticipantPicker': 'Loka vali',
    'teskeid.expenses.expenseForm.participantLoadError': 'Ekki tókst að sækja tengsl',
    'teskeid.expenses.expenseForm.relationshipCircles': 'Tengslahringir',
    'teskeid.expenses.expenseForm.searchKnownParticipant': 'Leita í þekktum aðilum',
    'teskeid.expenses.expenseForm.searchKnownParticipantPlaceholder': 'Nafn eða label',
    'teskeid.expenses.expenseForm.filterKnownPeople': 'Sía þekkta aðila',
    'teskeid.expenses.expenseForm.allKnownPeople': 'Allir',
    'teskeid.expenses.expenseForm.noKnownParticipantResults': 'Enginn aðili fannst',
    'teskeid.expenses.expenseForm.participantSource': 'Leið til að bæta við',
    'teskeid.expenses.expenseForm.knownParticipant': 'Þekktur aðili',
    'teskeid.expenses.expenseForm.nameOrEmail': 'Nafn eða netfang',
    'teskeid.expenses.expenseForm.nameOrEmailPlaceholder': 'Nafn eða netfang',
    'teskeid.expenses.expenseForm.nameOrEmailHint': 'Skráðu nafn eða netfang',
    'teskeid.expenses.expenseForm.addParticipant': 'Bæta við þátttakanda',
    'teskeid.expenses.expenseForm.addParticipantDescription': 'Veldu aðila',
    'teskeid.expenses.expenseForm.participantEmailInvalid': 'Ógilt netfang',
    'teskeid.expenses.expenseForm.participantNameInvalid': 'Ógilt nafn',
  }[key] ?? key),
}))

import {
  classifyManualExpenseParticipant,
  ExpenseParticipantPicker,
} from '../ExpenseParticipantPicker'

describe('unified expense participant input', () => {
  it('classifies a plain name as a durable guest participant', () => {
    expect(classifyManualExpenseParticipant('  Greta Jóns  ')).toEqual({
      kind: 'guest',
      displayName: 'Greta Jóns',
    })
  })

  it('canonicalizes an email and rejects malformed email-like input', () => {
    expect(classifyManualExpenseParticipant(' GRETA@EXAMPLE.IS ')).toEqual({
      kind: 'email',
      recipientEmail: 'greta@example.is',
    })
    expect(classifyManualExpenseParticipant('greta@')).toBeNull()
    expect(classifyManualExpenseParticipant('')).toBeNull()
  })

  it('keeps shared profile labels searchable while returning the exact expense option', () => {
    const option = {
      relationshipId: 'relationship-1',
      pickerLabel: 'Mamma',
      sharedLabel: 'Guðrún Jónsdóttir',
      customLabels: [{ id: 'family', name: 'Fjölskylda' }],
    }
    const onAddKnown = vi.fn(() => true)

    render(React.createElement(ExpenseParticipantPicker, {
      options: [option],
      onAddKnown,
      onAddManual: vi.fn(() => true),
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Leita í þekktum aðilum' }), {
      target: { value: 'Jónsdóttir' },
    })

    expect(screen.getByText('Mamma')).toBeInTheDocument()
    expect(screen.queryByText('Guðrún Jónsdóttir')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mamma/ }))
    expect(onAddKnown).toHaveBeenCalledWith(option)
  })

  it('maps successful manual and circle choices back to exact Expense values', () => {
    const onAddManual = vi.fn(() => true)
    const onSelectCircle = vi.fn(() => true)
    const circle = {
      id: 'circle-1',
      name: 'Fjölskyldan',
      members: [{ circleMemberId: 'member-1', displayName: 'Mamma', isSelf: false }],
    }

    const { rerender } = render(React.createElement(ExpenseParticipantPicker, {
      options: [],
      onAddKnown: vi.fn(() => true),
      onAddManual,
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nafn eða netfang' }), {
      target: { value: ' VINUR@EXAMPLE.IS ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    expect(onAddManual).toHaveBeenCalledWith({
      kind: 'email',
      recipientEmail: 'vinur@example.is',
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(React.createElement(ExpenseParticipantPicker, {
      options: [],
      circles: [circle],
      onAddKnown: vi.fn(() => true),
      onAddManual,
      onSelectCircle,
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    fireEvent.click(screen.getByRole('button', { name: 'Þekktur aðili' }))
    fireEvent.click(screen.getByRole('button', { name: /Fjölskyldan/ }))
    expect(onSelectCircle).toHaveBeenCalledWith(circle)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
