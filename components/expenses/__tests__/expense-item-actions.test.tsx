import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCancelExpense, mockDeleteExpense, mockPush, mockReplace, mockRefresh } = vi.hoisted(() => ({
  mockCancelExpense: vi.fn(),
  mockDeleteExpense: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: mockRefresh }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (rawKey: string) => {
    const key = rawKey.replace(/^teskeid\.expenses\./, '')
    return {
      'expense.edit': 'Breyta útgjaldinu',
      'expense.openingEdit': 'Opna breytingar...',
      'expense.cancel': 'Fella útgjald niður',
      'expense.cancelling': 'Felli niður...',
      'expense.cancelConfirm': 'Staðfesta?',
      'deleteControl.trigger': 'Eyða kostnaði',
      'deleteControl.confirm': 'Eyða kostnaði',
      'deleteControl.deleting': 'Eyði kostnaði...',
      'deleteControl.keep': 'Halda kostnaði',
      'deleteControl.close': 'Loka',
      'deleteControl.closeLabel': 'Loka staðfestingu',
      'deleteControl.checkStatus': 'Athuga stöðu',
      'deleteControl.checkingStatus': 'Athuga stöðu...',
      'deleteControl.subjects.confirmedExpense.title': 'Eyða staðfestum kostnaði?',
      'deleteControl.subjects.confirmedExpense.description': 'Þetta er ekki hægt að afturkalla.',
      'deleteControl.blocked.open_revision': 'Hættu fyrst við opnu breytingarnar.',
      'errors.delete_outcome_unknown': 'Ekki tókst að staðfesta hvort kostnaðinum var eytt.',
    }[key] ?? key
  },
}))

vi.mock('@/lib/expenses/actions', () => ({
  cancelExpense: mockCancelExpense,
  deleteOwnExpenseCreationDraft: vi.fn(),
  deleteOwnUnsettledExpense: mockDeleteExpense,
}))

import { ExpenseItemActions } from '@/components/expenses/ExpenseItemActions'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ExpenseItemActions', () => {
  it('opens the authorized edit route with immediate navigation feedback', async () => {
    render(<ExpenseItemActions expenseId="expense-1" canEdit canCancel={false} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Breyta útgjaldinu' }))
    })

    expect(mockPush).toHaveBeenCalledWith(
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-1/breyta?step=details',
    )
    expect(screen.queryByRole('button', { name: 'Fella útgjald niður' })).not.toBeInTheDocument()
  })

  it('requires an accessible second step and deletes with the sealed capability version', async () => {
    mockDeleteExpense.mockResolvedValue({ ok: true })
    render(
      <ExpenseItemActions
        expenseId="11111111-1111-4111-8111-111111111111"
        canEdit={false}
        canCancel={false}
        deleteCreatorKnown
        deleteCapability={{ status: 'available', expectedFinancialVersion: 7 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Eyða staðfestum kostnaði?' })
    expect(dialog).toHaveTextContent('Þetta er ekki hægt að afturkalla.')
    expect(screen.getByRole('button', { name: 'Halda kostnaði' })).toHaveFocus()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    })

    expect(mockDeleteExpense).toHaveBeenCalledWith(expect.objectContaining({
      expense_id: '11111111-1111-4111-8111-111111111111',
      expected_financial_version: 7,
      request_id: expect.any(String),
    }))
    expect(mockReplace).toHaveBeenCalledWith('/auth-mvp/utlagt-og-endurgreitt')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('renders a visible disabled delete control when the server blocks an open revision', () => {
    render(
      <ExpenseItemActions
        expenseId="11111111-1111-4111-8111-111111111111"
        canEdit={false}
        canCancel={false}
        deleteCreatorKnown
        deleteCapability={{ status: 'blocked', reason: 'open_revision' }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Eyða kostnaði' })).toBeDisabled()
    expect(screen.getByText('Hættu fyrst við opnu breytingarnar.')).toBeInTheDocument()
  })

  it('closes the confirmation with Escape and restores focus to the trigger', async () => {
    render(
      <ExpenseItemActions
        expenseId="11111111-1111-4111-8111-111111111111"
        canEdit={false}
        canCancel={false}
        deleteCreatorKnown
        deleteCapability={{ status: 'available', expectedFinancialVersion: 7 }}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Eyða kostnaði' })
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eyða kostnaði' })).toHaveFocus()
    expect(mockDeleteExpense).not.toHaveBeenCalled()
  })

  it('closes the confirmation with the keep action and restores focus to the trigger', async () => {
    render(
      <ExpenseItemActions
        expenseId="11111111-1111-4111-8111-111111111111"
        canEdit={false}
        canCancel={false}
        deleteCreatorKnown
        deleteCapability={{ status: 'available', expectedFinancialVersion: 7 }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    fireEvent.click(screen.getByRole('button', { name: 'Halda kostnaði' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eyða kostnaði' })).toHaveFocus()
    expect(mockDeleteExpense).not.toHaveBeenCalled()
  })

  it('locks the full destructive flow and suppresses rapid re-entry until navigation', async () => {
    const mutation = deferred<{ ok: true }>()
    mockDeleteExpense.mockReturnValue(mutation.promise)
    render(
      <ExpenseItemActions
        expenseId="11111111-1111-4111-8111-111111111111"
        canEdit={false}
        canCancel
        deleteCreatorKnown
        deleteCapability={{ status: 'available', expectedFinancialVersion: 7 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    const confirm = screen.getByRole('button', { name: 'Eyða kostnaði' })
    await act(async () => {
      fireEvent.click(confirm)
      fireEvent.click(confirm)
      await Promise.resolve()
    })

    expect(mockDeleteExpense).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Eyði kostnaði...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Halda kostnaði' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fella útgjald niður', hidden: true })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await act(async () => {
      mutation.resolve({ ok: true })
    })
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Eyði kostnaði...' })).toBeDisabled()
  })

  it('can close and reopen an uncertain outcome only to perform safe reconciliation', async () => {
    mockDeleteExpense.mockRejectedValueOnce(new Error('transport failed'))
    render(
      <ExpenseItemActions
        expenseId="11111111-1111-4111-8111-111111111111"
        canEdit
        canCancel
        deleteCreatorKnown
        deleteCapability={{ status: 'available', expectedFinancialVersion: 7 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ekki tókst að staðfesta hvort kostnaðinum var eytt.',
    )
    expect(screen.queryByRole('button', { name: 'Eyða kostnaði' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Breyta útgjaldinu', hidden: true })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fella útgjald niður', hidden: true })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Halda kostnaði' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Loka' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eyða kostnaði' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Athuga stöðu' }))
    expect(mockDeleteExpense).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/auth-mvp/utlagt-og-endurgreitt')
  })
})
