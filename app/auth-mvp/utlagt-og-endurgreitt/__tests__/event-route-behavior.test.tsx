import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  canUseEventExpenses: vi.fn(),
  checkFeatureAccess: vi.fn(),
  expenseForm: vi.fn(),
  getActorName: vi.fn(),
  getDraft: vi.fn(),
  getEventPreview: vi.fn(),
  getEventSource: vi.fn(),
  getPayAll: vi.fn(),
  getParticipantOptions: vi.fn(),
  getRelationshipCircles: vi.fn(),
  guardExpenseAccess: vi.fn(),
  listEventSources: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next-intl/server', () => ({ getLocale: vi.fn().mockResolvedValue('is') }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('@/components/expenses/ExpenseShell', () => ({
  ExpenseShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/components/expenses/ExpenseForm', () => ({
  ExpenseForm: (props: {
    initialEventSource?: { id: string } | null
    draft?: { payload: { eventId: string | null; members: Array<{ label: string }> } } | null
    eventSelectionWarning?: boolean
  }) => {
    mocks.expenseForm(props)
    return (
      <div
        data-testid="expense-form"
        data-initial-event={props.initialEventSource?.id ?? ''}
        data-draft-event={props.draft?.payload.eventId ?? ''}
        data-draft-guest={props.draft?.payload.members[1]?.label ?? ''}
        data-warning={String(props.eventSelectionWarning ?? false)}
      />
    )
  },
}))
vi.mock('@/components/expenses/EventExpensePreview', () => ({
  EventExpensePreview: ({ preview }: { preview: { status: string } }) => (
    <div data-testid="event-preview" data-status={preview.status} />
  ),
}))
vi.mock('@/components/expenses/ExpensePayAll', () => ({
  ExpensePayAll: () => <div data-testid="writable-global-pay-all" />,
}))
vi.mock('@/components/expenses/i18n.server', () => ({
  getExpenseTranslations: vi.fn().mockResolvedValue((key: string) => (
    key === 'expenseForm.eventGuestUnavailableLabel' ? 'Gestur úr viðburði' : key
  )),
}))
vi.mock('@/lib/expenses/guard', () => ({ guardExpenseAccess: mocks.guardExpenseAccess }))
vi.mock('@/lib/expenses/participants.server', () => ({
  getExpenseActorDisplayName: mocks.getActorName,
  getExpenseParticipantOptions: mocks.getParticipantOptions,
}))
vi.mock('@/lib/expenses/repository.server', () => ({
  getExpensePrivateDraft: mocks.getDraft,
  getExpensePayAllView: mocks.getPayAll,
}))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mocks.checkFeatureAccess }))
vi.mock('@/lib/relationships/repository-v2.server', () => ({
  getRelationshipCircleOptions: mocks.getRelationshipCircles,
}))
vi.mock('@/lib/events/guard', () => ({ canUseEventExpenses: mocks.canUseEventExpenses }))
vi.mock('@/lib/events/repository.server', () => ({
  listEventExpenseSources: mocks.listEventSources,
  getOwnedEventExpenseSource: mocks.getEventSource,
  getEventExpensePreview: mocks.getEventPreview,
}))

import NewOneOffExpensePage from '../nytt/page'
import ExpensePayAllPage from '../gera-upp/page'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const EVENT_A = '80000000-0000-4000-8000-000000000001'
const EVENT_B = '80000000-0000-4000-8000-000000000002'
const EVENT_GUEST = '90000000-0000-4000-8000-000000000001'
const sourceA = {
  id: EVENT_A,
  name: 'Sumarferð',
  rosterRevision: 4,
  guests: [{ id: EVENT_GUEST, displayName: 'Anna', sourceKind: 'manual_name' as const }],
}

function draftWithLeakyLegacyLabel() {
  return {
    id: '50000000-0000-4000-8000-000000000001',
    contextType: 'one_off' as const,
    groupId: null,
    expenseId: null,
    currentStep: 'split' as const,
    payload: {
      circleId: null,
      eventId: EVENT_A,
      eventRosterRevision: 4,
      members: [
        { key: 'self', label: 'Stebbi', input: { type: 'self' as const, key: 'self' }, isSelf: true },
        {
          key: `event:${EVENT_GUEST}`,
          label: 'secret@example.com',
          input: { type: 'event_guest' as const, key: `event:${EVENT_GUEST}`, event_guest_id: EVENT_GUEST },
          isSelf: false,
        },
      ],
      removedMemberIds: [],
      included: { self: true, [`event:${EVENT_GUEST}`]: false },
      title: 'Kvöldmatur', total: '100', currency: 'ISK' as const, incurredOn: '2026-08-16',
      category: '', note: '', splitMethod: 'weighted' as const,
      payments: { self: '100', [`event:${EVENT_GUEST}`]: '' }, payerKeys: ['self'],
      amounts: { self: '0', [`event:${EVENT_GUEST}`]: '0' },
      percentages: { self: '100', [`event:${EVENT_GUEST}`]: '' },
      weights: { self: '1', [`event:${EVENT_GUEST}`]: '1' }, preserveShares: false,
    },
    version: 1,
    savedAt: '2026-08-16T10:00:00.000Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.guardExpenseAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
  mocks.canUseEventExpenses.mockResolvedValue(true)
  mocks.getDraft.mockResolvedValue(null)
  mocks.listEventSources.mockResolvedValue([sourceA])
  mocks.getEventSource.mockResolvedValue(sourceA)
  mocks.getEventPreview.mockResolvedValue({
    eventId: EVENT_A, status: 'none_tagged', taggedExpenseCount: 0, currencies: [],
  })
  mocks.getPayAll.mockResolvedValue({})
  mocks.getActorName.mockResolvedValue('Stebbi')
  mocks.getParticipantOptions.mockResolvedValue([])
  mocks.checkFeatureAccess.mockResolvedValue(false)
  mocks.getRelationshipCircles.mockResolvedValue([])
})

describe('event-aware new expense route', () => {
  it('preselects only an exact owned event and keeps an invalid query standalone', async () => {
    const first = render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({ event: EVENT_A }),
    }))
    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-initial-event', EVENT_A)
    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-warning', 'false')
    first.unmount()

    mocks.getEventSource.mockResolvedValueOnce(null)
    render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({ event: EVENT_B }),
    }))
    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-initial-event', '')
    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-warning', 'true')
  })

  it('exact-fetches and merges an owned event outside the bounded recent directory', async () => {
    mocks.listEventSources.mockResolvedValueOnce([])
    mocks.getEventSource.mockResolvedValueOnce(sourceA)
    render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({ event: EVENT_A }),
    }))

    expect(mocks.getEventSource).toHaveBeenCalledWith(ACTOR_ID, EVENT_A)
    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-initial-event', EVENT_A)
    expect(mocks.expenseForm.mock.calls.at(-1)?.[0].eventSources).toEqual([sourceA])
  })

  it('lets the saved draft beat a conflicting query and hydrates only an authorized current label', async () => {
    mocks.getDraft.mockResolvedValueOnce(draftWithLeakyLegacyLabel())
    render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({ draft: '50000000-0000-4000-8000-000000000001', event: EVENT_B }),
    }))

    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-initial-event', '')
    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-draft-event', EVENT_A)
    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-draft-guest', 'Anna')
    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-warning', 'false')
  })

  it('redacts a resumed event draft when the Events chain is unavailable', async () => {
    mocks.canUseEventExpenses.mockResolvedValueOnce(false)
    mocks.getDraft.mockResolvedValueOnce(draftWithLeakyLegacyLabel())
    render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({ draft: '50000000-0000-4000-8000-000000000001' }),
    }))

    expect(mocks.listEventSources).not.toHaveBeenCalled()
    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-draft-guest', 'Gestur úr viðburði')
    expect(document.body.textContent).not.toContain('secret@example.com')
    expect(document.body.textContent).not.toContain('Sumarferð')
  })
})

describe('read-only event settlement route', () => {
  it('never mounts writable global settlement inside a valid event preview', async () => {
    render(await ExpensePayAllPage({ searchParams: Promise.resolve({ event: EVENT_A }) }))

    expect(screen.getByTestId('event-preview')).toBeInTheDocument()
    expect(screen.queryByTestId('writable-global-pay-all')).not.toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute(
      'href', '/auth-mvp/utlagt-og-endurgreitt/gera-upp',
    )
    expect(mocks.getPayAll).not.toHaveBeenCalled()
  })

  it('fails closed for an invalid event query while keeping the global route separate', async () => {
    mocks.getEventSource.mockResolvedValueOnce(null)
    render(await ExpensePayAllPage({ searchParams: Promise.resolve({ event: EVENT_B }) }))

    expect(screen.getByRole('status')).toHaveTextContent('eventPreview.queryUnavailable')
    expect(screen.queryByTestId('event-preview')).not.toBeInTheDocument()
    expect(screen.queryByTestId('writable-global-pay-all')).not.toBeInTheDocument()
    expect(mocks.getPayAll).not.toHaveBeenCalled()
  })

  it('renders the read-only preview as unavailable when strict DTO mapping fails', async () => {
    mocks.getEventPreview.mockRejectedValueOnce(new Error('event_preview_failed'))
    render(await ExpensePayAllPage({ searchParams: Promise.resolve({ event: EVENT_A }) }))

    expect(screen.getByTestId('event-preview')).toHaveAttribute('data-status', 'unavailable')
    expect(screen.queryByTestId('writable-global-pay-all')).not.toBeInTheDocument()
    expect(mocks.getPayAll).not.toHaveBeenCalled()
  })

  it('renders the existing writable pay-all flow only on the queryless route', async () => {
    render(await ExpensePayAllPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('writable-global-pay-all')).toBeInTheDocument()
    expect(screen.queryByTestId('event-preview')).not.toBeInTheDocument()
    expect(mocks.getPayAll).toHaveBeenCalledWith(ACTOR_ID)
  })
})
