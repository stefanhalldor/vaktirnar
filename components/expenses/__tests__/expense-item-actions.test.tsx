import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCancelExpense, mockPush, mockRefresh } = vi.hoisted(() => ({
  mockCancelExpense: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
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
    }[key] ?? key
  },
}))

vi.mock('@/lib/expenses/actions', () => ({
  cancelExpense: mockCancelExpense,
}))

import { ExpenseItemActions } from '@/components/expenses/ExpenseItemActions'

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
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-1/breyta',
    )
    expect(screen.queryByRole('button', { name: 'Fella útgjald niður' })).not.toBeInTheDocument()
  })
})
