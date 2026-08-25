import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  attach: vi.fn(),
  setVisibility: vi.fn(),
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
  setExpenseEventVisibility: mocks.setVisibility,
  detachExpenseFromEvent: mocks.detach,
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const short = key.replace('teskeid.expenses.', '')
    if (short === 'expense.linkToEvent') return 'Tengja við viðburð'
    if (short === 'expense.detachEvent') return 'Aftengja viðburð'
    if (short === 'expense.openEvent') return 'Opna viðburð'
    if (short === 'expense.linkedEventUnavailable') return 'Tengdur við viðburð'
    if (short === 'expense.eventLinkUpdated') return 'Tengingin við viðburðinn var uppfærð.'
    if (short === 'expense.chooseEvent') return 'Veldu viðburð'
    if (short === 'expense.confirmLinkEvent') return 'Tengja kostnað'
    if (short === 'expense.confirmDetachEvent') return 'Aftengja viðburð'
    if (short === 'expense.detachEventDescription') return `Aftengja ${values?.event}?`
    if (short === 'eventVisibility.legend') return 'Hverjir sjá kostnaðinn?'
    if (short === 'eventVisibility.participantsOnly') return 'Aðeins þátttakendur kostnaðarins'
    if (short === 'eventVisibility.participantsOnlyHint') return 'Aðrir sjá hann ekki.'
    if (short === 'eventVisibility.allEvent') return 'Allir sem sjá viðburðinn'
    if (short === 'eventVisibility.allEventHint') return 'Núverandi og nýir gestir sjá yfirlitið.'
    if (short === 'eventVisibility.currentLabel') return 'Sýnilegt'
    if (short === 'eventVisibility.editAction') return 'Breyta sýnileika'
    if (short === 'eventVisibility.save') return 'Vista sýnileika'
    if (short === 'eventVisibility.updated') return 'Sýnileikinn var uppfærður.'
    if (short === 'eventVisibility.promotionTitle') return 'Sýna öllum?'
    if (short === 'eventVisibility.promotionBody') return 'Allir gestir sjá yfirlitið.'
    if (short === 'eventVisibility.promotionConfirm') return 'Sýna öllum'
    if (short === 'eventVisibility.demotionTitle') return 'Takmarka sýnileikann?'
    if (short === 'eventVisibility.demotionBody') return 'Aðeins þátttakendur sjá yfirlitið.'
    if (short === 'eventVisibility.demotionConfirm') return 'Takmarka sýnileika'
    if (short === 'eventVisibility.cancel') return 'Hætta við'
    if (short === 'eventVisibility.conflict') return 'Sýnileikinn hefur breyst.'
    if (short === 'errors.conflict') return 'Gögnin hafa breyst.'
    if (short === 'errors.save_failed') return 'Ekki tókst að vista.'
    if (short === 'expense.eventLinkClose') return 'Loka'
    return short
  },
}))

import { ExpenseEventLinkControl } from '@/components/expenses/ExpenseEventLinkControl'

const expenseId = '10000000-0000-4000-8000-000000000001'
const secondExpenseId = '10000000-0000-4000-8000-000000000002'
const eventId = '20000000-0000-4000-8000-000000000001'
const requestId = '30000000-0000-4000-8000-000000000001'
const secondRequestId = '30000000-0000-4000-8000-000000000002'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId)
  mocks.attach.mockResolvedValue({
    ok: true,
    data: { expenseId, eventId, visibility: 'participants_only', linkRevision: 1 },
  })
  mocks.setVisibility.mockResolvedValue({
    ok: true,
    data: {
      expenseId,
      eventId,
      previousVisibility: 'participants_only',
      visibility: 'all_event',
      previousLinkRevision: 3,
      linkRevision: 4,
    },
  })
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
    expect(screen.getByRole('radio', { name: /Aðeins þátttakendur kostnaðarins/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ })).toBeEnabled()
    expect(screen.getByText('eventVisibility.helper')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('@')
    fireEvent.click(screen.getByRole('button', { name: 'Tengja kostnað' }))
    await waitFor(() => expect(mocks.attach).toHaveBeenCalledWith({
      expense_id: expenseId,
      event_id: eventId,
      expected_financial_version: 7,
      expected_event_roster_revision: 4,
      visibility: 'participants_only',
      request_id: requestId,
    }))
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Tengingin við viðburðinn var uppfærð.')
  })

  it('shows the one current Event and detaches without offering another', async () => {
    render(<ExpenseEventLinkControl
      expenseId={expenseId}
      financialVersion={7}
      eventHref={`/auth-mvp/vidburdir/${eventId}`}
      management={{
        currentEvent: {
          id: eventId,
          name: 'Afmæli',
          canOpen: true,
          visibility: 'participants_only',
          linkRevision: 3,
        },
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
    expect(screen.getByRole('status')).toHaveTextContent('Tengingin við viðburðinn var uppfærð.')
  })

  it('allows detach without exposing a stale Event name or backlink', () => {
    render(<ExpenseEventLinkControl
      expenseId={expenseId}
      financialVersion={7}
      eventHref={null}
      management={{
        currentEvent: {
          id: eventId,
          name: null,
          canOpen: false,
          visibility: 'participants_only',
          linkRevision: 3,
        },
        eligibleEvents: [],
      }}
    />)
    expect(screen.getByText('Tengdur við viðburð')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Opna viðburð' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Breyta sýnileika' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aftengja viðburð' })).toBeInTheDocument()
  })

  it('lets an authorized non-owner choose all-event visibility when attaching', async () => {
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
    fireEvent.click(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Tengja kostnað' }))

    await waitFor(() => expect(mocks.attach).toHaveBeenCalledWith(expect.objectContaining({
      event_id: eventId,
      visibility: 'all_event',
    })))
  })

  it('resets a stale broad attach draft after linked and detached prop transitions', () => {
    const detachedManagement = {
      currentEvent: null,
      eligibleEvents: [{
        id: eventId,
        name: 'Afmæli',
        rosterRevision: 4,
        viewerRole: 'attendee' as const,
      }],
    }
    const { rerender } = render(<ExpenseEventLinkControl
      expenseId={expenseId}
      financialVersion={7}
      eventHref={null}
      management={detachedManagement}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Tengja við viðburð' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Afmæli' }))
    fireEvent.click(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ }))
    expect(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ })).toBeChecked()

    rerender(<ExpenseEventLinkControl
      expenseId={expenseId}
      financialVersion={7}
      eventHref={null}
      management={{
        currentEvent: {
          id: eventId,
          name: 'Afmæli',
          canOpen: true,
          visibility: 'all_event',
          linkRevision: 1,
        },
        eligibleEvents: [],
      }}
    />)
    rerender(<ExpenseEventLinkControl
      expenseId={expenseId}
      financialVersion={7}
      eventHref={null}
      management={detachedManagement}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Tengja við viðburð' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Afmæli' }))
    expect(screen.getByRole('radio', {
      name: /Aðeins þátttakendur kostnaðarins/,
    })).toBeChecked()
  })

  it('clears retry state when the mounted control changes to another Expense on the same Event state', async () => {
    const management = {
      currentEvent: null,
      eligibleEvents: [{
        id: eventId,
        name: 'Afmæli',
        rosterRevision: 4,
        viewerRole: 'attendee' as const,
      }],
    }
    vi.mocked(globalThis.crypto.randomUUID)
      .mockReturnValueOnce(requestId)
      .mockReturnValueOnce(secondRequestId)
    mocks.attach
      .mockResolvedValueOnce({ ok: false, error: 'conflict' })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          expenseId: secondExpenseId,
          eventId,
          visibility: 'participants_only',
          linkRevision: 1,
        },
      })

    const { rerender } = render(<ExpenseEventLinkControl
      expenseId={expenseId}
      financialVersion={7}
      eventHref={null}
      management={management}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Tengja við viðburð' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Afmæli' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tengja kostnað' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Gögnin hafa breyst.')

    rerender(<ExpenseEventLinkControl
      expenseId={secondExpenseId}
      financialVersion={7}
      eventHref={null}
      management={management}
    />)
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Tengja við viðburð' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Afmæli' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tengja kostnað' }))

    await waitFor(() => expect(mocks.attach).toHaveBeenCalledTimes(2))
    expect(mocks.attach.mock.calls[0]?.[0]).toMatchObject({
      expense_id: expenseId,
      request_id: requestId,
    })
    expect(mocks.attach.mock.calls[1]?.[0]).toMatchObject({
      expense_id: secondExpenseId,
      request_id: secondRequestId,
    })
  })

  it('initializes edit from the persisted mode and requires confirmation for a change', async () => {
    render(<ExpenseEventLinkControl
      expenseId={expenseId}
      financialVersion={7}
      eventHref={null}
      management={{
        currentEvent: {
          id: eventId,
          name: 'Afmæli',
          canOpen: true,
          visibility: 'participants_only',
          linkRevision: 3,
        },
        eligibleEvents: [],
      }}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Breyta sýnileika' }))
    expect(screen.getByRole('radio', { name: /Aðeins þátttakendur kostnaðarins/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Vista sýnileika' })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vista sýnileika' }))
    expect(screen.getByText('Allir gestir sjá yfirlitið.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sýna öllum' }))

    await waitFor(() => expect(mocks.setVisibility).toHaveBeenCalledWith({
      expense_id: expenseId,
      expected_event_id: eventId,
      expected_link_revision: 3,
      visibility: 'all_event',
      request_id: requestId,
    }))
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Sýnileikinn var uppfærður.')
  })

  it('keeps the visibility choice available after a transport failure', async () => {
    mocks.setVisibility.mockRejectedValueOnce(new Error('network unavailable'))
    render(<ExpenseEventLinkControl
      expenseId={expenseId}
      financialVersion={7}
      eventHref={null}
      management={{
        currentEvent: {
          id: eventId,
          name: 'Afmæli',
          canOpen: true,
          visibility: 'participants_only',
          linkRevision: 3,
        },
        eligibleEvents: [],
      }}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Breyta sýnileika' }))
    fireEvent.click(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vista sýnileika' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sýna öllum' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Ekki tókst að vista.'))
    fireEvent.click(screen.getByRole('button', { name: 'Hætta við' }))
    expect(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ })).toBeChecked()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('hydrates persisted broad visibility and discards an unsubmitted edit on reopen', () => {
    render(<ExpenseEventLinkControl
      expenseId={expenseId}
      financialVersion={7}
      eventHref={null}
      management={{
        currentEvent: {
          id: eventId,
          name: 'Afmæli',
          canOpen: true,
          visibility: 'all_event',
          linkRevision: 8,
        },
        eligibleEvents: [],
      }}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Breyta sýnileika' }))
    expect(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Vista sýnileika' })).toBeDisabled()

    fireEvent.click(screen.getByRole('radio', { name: /Aðeins þátttakendur kostnaðarins/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Loka' }))
    fireEvent.click(screen.getByRole('button', { name: 'Breyta sýnileika' }))

    expect(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Vista sýnileika' })).toBeDisabled()
    expect(mocks.setVisibility).not.toHaveBeenCalled()
  })

  it('confirms a broad-to-private demotion against the persisted revision', async () => {
    mocks.setVisibility.mockResolvedValueOnce({
      ok: true,
      data: {
        expenseId,
        eventId,
        previousVisibility: 'all_event',
        visibility: 'participants_only',
        previousLinkRevision: 8,
        linkRevision: 9,
      },
    })
    render(<ExpenseEventLinkControl
      expenseId={expenseId}
      financialVersion={7}
      eventHref={null}
      management={{
        currentEvent: {
          id: eventId,
          name: 'Afmæli',
          canOpen: true,
          visibility: 'all_event',
          linkRevision: 8,
        },
        eligibleEvents: [],
      }}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Breyta sýnileika' }))
    fireEvent.click(screen.getByRole('radio', { name: /Aðeins þátttakendur kostnaðarins/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vista sýnileika' }))
    expect(screen.getByText('Aðeins þátttakendur sjá yfirlitið.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Takmarka sýnileika' }))

    await waitFor(() => expect(mocks.setVisibility).toHaveBeenCalledWith({
      expense_id: expenseId,
      expected_event_id: eventId,
      expected_link_revision: 8,
      visibility: 'participants_only',
      request_id: requestId,
    }))
  })

  it('shows the visibility-specific stale conflict and preserves the requested mode', async () => {
    mocks.setVisibility.mockResolvedValueOnce({ ok: false, error: 'conflict' })
    render(<ExpenseEventLinkControl
      expenseId={expenseId}
      financialVersion={7}
      eventHref={null}
      management={{
        currentEvent: {
          id: eventId,
          name: 'Afmæli',
          canOpen: true,
          visibility: 'participants_only',
          linkRevision: 3,
        },
        eligibleEvents: [],
      }}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Breyta sýnileika' }))
    fireEvent.click(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vista sýnileika' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sýna öllum' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sýnileikinn hefur breyst.')
    fireEvent.click(screen.getByRole('button', { name: 'Hætta við' }))
    expect(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ })).toBeChecked()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
