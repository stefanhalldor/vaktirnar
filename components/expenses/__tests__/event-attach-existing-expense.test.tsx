import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ attach: vi.fn(), refresh: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/lib/expenses/actions', () => ({ attachExpenseToEvent: mocks.attach }))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key.replace('teskeid.expenses.', ''),
}))

import { EventAttachExistingExpense } from '../EventAttachExistingExpense'

const eventId = '10000000-0000-4000-8000-000000000001'
const expenseId = '20000000-0000-4000-8000-000000000001'

describe('EventAttachExistingExpense', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('crypto', { randomUUID: () => '30000000-0000-4000-8000-000000000001' })
    mocks.attach.mockResolvedValue({ ok: true, data: {} })
  })

  it('uses the exact discovered IDs and revisions with the privacy-first default', async () => {
    render(<EventAttachExistingExpense
      eventId={eventId}
      rosterRevision={7}
      directory={{
        status: 'ready',
        expenses: [{
          id: expenseId,
          title: 'Rúta',
          totalMinor: 12_500,
          currency: 'ISK',
          incurredOn: '2026-08-27',
          financialVersion: 4,
        }],
      }}
    />)

    expect(screen.getByRole('radio', { name: 'eventVisibility.participantsOnly' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: /Rúta/ }))
    fireEvent.click(screen.getByRole('button', { name: 'expense.attachExistingAction' }))

    await waitFor(() => expect(mocks.attach).toHaveBeenCalledWith({
      expense_id: expenseId,
      event_id: eventId,
      expected_financial_version: 4,
      expected_event_roster_revision: 7,
      visibility: 'participants_only',
      request_id: '30000000-0000-4000-8000-000000000001',
    }))
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('renders unavailable without exposing or inventing candidates', () => {
    render(<EventAttachExistingExpense
      eventId={eventId}
      rosterRevision={7}
      directory={{ status: 'unavailable', expenses: [] }}
    />)

    expect(screen.getByText('expense.attachExistingUnavailable')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(mocks.attach).not.toHaveBeenCalled()
  })
})
