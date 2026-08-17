import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  attach: vi.fn(),
  detach: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('@/lib/expenses/actions', () => ({
  attachExpenseToEvent: mocks.attach,
  detachExpenseFromEvent: mocks.detach,
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const short = key.replace('teskeid.expenses.', '')
    if (short === 'expense.linkToEvent') return 'Tengja við viðburð'
    if (short === 'expense.detachEvent') return 'Aftengja viðburð'
    if (short === 'expense.openEvent') return 'Opna viðburð'
    if (short === 'expense.linkedEventUnavailable') return 'Tengdur við viðburð'
    if (short === 'expense.chooseEvent') return 'Veldu viðburð'
    if (short === 'expense.confirmLinkEvent') return 'Tengja kostnað'
    if (short === 'expense.confirmDetachEvent') return 'Aftengja viðburð'
    if (short === 'expense.detachEventDescription') return `Aftengja ${values?.event}?`
    return short
  },
}))

import { ExpenseEventLinkControl } from '@/components/expenses/ExpenseEventLinkControl'

const expenseId = '10000000-0000-4000-8000-000000000001'
const eventId = '20000000-0000-4000-8000-000000000001'
const requestId = '30000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId)
  mocks.attach.mockResolvedValue({ ok: true, data: { expenseId, eventId } })
  mocks.detach.mockResolvedValue({ ok: true, data: { expenseId, eventId } })
})

describe('ExpenseEventLinkControl', () => {
  it('offers only eligible Events and binds attach to the current versions', async () => {
    render(<ExpenseEventLinkControl
      expenseId={expenseId}
      financialVersion={7}
      eventHref={null}
      management={{
        currentEvent: null,
        eligibleEvents: [{
          id: eventId,
          name: 'Afmæli',
          rosterRevision: 4,
          viewerRole: 'attendee',
        }],
      }}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Tengja við viðburð' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Afmæli' }))
    expect(screen.getByText('expense.linkDisclosureParticipants')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('@')
    fireEvent.click(screen.getByRole('button', { name: 'Tengja kostnað' }))
    await waitFor(() => expect(mocks.attach).toHaveBeenCalledWith({
      expense_id: expenseId,
      event_id: eventId,
      expected_financial_version: 7,
      expected_event_roster_revision: 4,
      request_id: requestId,
    }))
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('shows the one current Event and detaches without offering another', async () => {
    render(<ExpenseEventLinkControl
      expenseId={expenseId}
      financialVersion={7}
      eventHref={`/auth-mvp/vidburdir/${eventId}`}
      management={{
        currentEvent: { id: eventId, name: 'Afmæli', canOpen: true },
        eligibleEvents: [],
      }}
    />)
    expect(screen.getByRole('link', { name: 'Opna viðburð' })).toHaveAttribute(
      'href', `/auth-mvp/vidburdir/${eventId}`,
    )
    expect(screen.queryByRole('button', { name: 'Tengja við viðburð' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aftengja viðburð' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Aftengja viðburð' }).at(-1)!)
    await waitFor(() => expect(mocks.detach).toHaveBeenCalledWith({
      expense_id: expenseId,
      expected_event_id: eventId,
      expected_financial_version: 7,
      request_id: requestId,
    }))
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('allows detach without exposing a stale Event name or backlink', () => {
    render(<ExpenseEventLinkControl
      expenseId={expenseId}
      financialVersion={7}
      eventHref={null}
      management={{
        currentEvent: { id: eventId, name: null, canOpen: false },
        eligibleEvents: [],
      }}
    />)
    expect(screen.getByText('Tengdur við viðburð')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Opna viðburð' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aftengja viðburð' })).toBeInTheDocument()
  })
})
