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
      'expense.delete': 'Eyða kostnaði varanlega',
      'expense.deleteDisclosure': 'Þetta er ekki hægt að afturkalla.',
      'expense.confirmDelete': 'Eyða kostnaði',
      'expense.deleting': 'Eyði kostnaði...',
      'expense.keep': 'Halda kostnaði',
      'expense.deleteBlocked.open_revision': 'Fjarlægðu fyrst opin breytingadrög.',
      'errors.delete_outcome_unknown': 'Ekki tókst að staðfesta hvort kostnaðinum var eytt.',
    }[key] ?? key
  },
}))

vi.mock('@/lib/expenses/actions', () => ({
  cancelExpense: mockCancelExpense,
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
        deleteCapability={{ status: 'available', expectedFinancialVersion: 7 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði varanlega' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Eyða kostnaði varanlega' })
    expect(dialog).toHaveTextContent('Þetta er ekki hægt að afturkalla.')
    expect(screen.getByRole('button', { name: 'Eyða kostnaði' })).toHaveFocus()

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

  it('does not render a destructive control when the server blocks an open revision', () => {
    render(
      <ExpenseItemActions
        expenseId="11111111-1111-4111-8111-111111111111"
        canEdit={false}
        canCancel={false}
        deleteCapability={{ status: 'blocked', reason: 'open_revision' }}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Eyða kostnaði varanlega' })).not.toBeInTheDocument()
    expect(screen.getByText('Fjarlægðu fyrst opin breytingadrög.')).toBeInTheDocument()
  })

  it('closes the confirmation with Escape and restores focus to the trigger', async () => {
    render(
      <ExpenseItemActions
        expenseId="11111111-1111-4111-8111-111111111111"
        canEdit={false}
        canCancel={false}
        deleteCapability={{ status: 'available', expectedFinancialVersion: 7 }}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Eyða kostnaði varanlega' })
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eyða kostnaði varanlega' })).toHaveFocus()
    expect(mockDeleteExpense).not.toHaveBeenCalled()
  })

  it('closes the confirmation with the keep action and restores focus to the trigger', async () => {
    render(
      <ExpenseItemActions
        expenseId="11111111-1111-4111-8111-111111111111"
        canEdit={false}
        canCancel={false}
        deleteCapability={{ status: 'available', expectedFinancialVersion: 7 }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði varanlega' }))
    fireEvent.click(screen.getByRole('button', { name: 'Halda kostnaði' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eyða kostnaði varanlega' })).toHaveFocus()
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
        deleteCapability={{ status: 'available', expectedFinancialVersion: 7 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði varanlega' }))
    const confirm = screen.getByRole('button', { name: 'Eyða kostnaði' })
    await act(async () => {
      fireEvent.click(confirm)
      fireEvent.click(confirm)
      await Promise.resolve()
    })

    expect(mockDeleteExpense).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Eyði kostnaði...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Halda kostnaði' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fella útgjald niður' })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await act(async () => {
      mutation.resolve({ ok: true })
    })
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Eyði kostnaði...' })).toBeDisabled()
  })

  it('reports an uncertain transport outcome, unlocks, focuses it, and keeps the request id', async () => {
    mockDeleteExpense
      .mockRejectedValueOnce(new Error('transport failed'))
      .mockResolvedValueOnce({ ok: false, error: 'delete_outcome_unknown' })
    render(
      <ExpenseItemActions
        expenseId="11111111-1111-4111-8111-111111111111"
        canEdit={false}
        canCancel={false}
        deleteCapability={{ status: 'available', expectedFinancialVersion: 7 }}
      />,
    )

    async function submit() {
      fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði varanlega' }))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
      })
    }

    await submit()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ekki tókst að staðfesta hvort kostnaðinum var eytt.',
    )
    expect(screen.getByRole('alert')).toHaveFocus()
    const firstRequestId = mockDeleteExpense.mock.calls[0]![0].request_id

    await submit()
    expect(mockDeleteExpense.mock.calls[1]![0].request_id).toBe(firstRequestId)
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
