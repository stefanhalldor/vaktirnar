import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  canUseEventExpenses: vi.fn(),
  checkFeatureAccess: vi.fn(),
  expenseContextChooser: vi.fn(),
  expenseForm: vi.fn(),
  getActorName: vi.fn(),
  getDraft: vi.fn(),
  getPublicationLifecycle: vi.fn(),
  getEventSource: vi.fn(),
  getPayAll: vi.fn(),
  getParticipantOptions: vi.fn(),
  getRelationshipCircles: vi.fn(),
  guardExpenseAccess: vi.fn(),
  listEventSources: vi.fn(),
  listEventSourcePresentation: vi.fn(),
  getEventSourcePresentation: vi.fn(),
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
vi.mock('@/components/events/ExpenseEventContextChooser', () => ({
  ExpenseEventContextChooser: (props: { events: Array<{ id: string; name: string }> }) => {
    mocks.expenseContextChooser(props)
    return <div data-testid="expense-context-chooser" />
  },
}))
vi.mock('@/components/expenses/ExpenseForm', () => ({
  ExpenseForm: (props: {
    initialEventSource?: { id: string } | null
    draft?: { payload: { eventId: string | null; members: Array<{ label: string }> } } | null
    eventSources?: Array<{ id: string }>
    eventSourcesError?: boolean
    eventSelectionWarning?: boolean
    publicationLifecycle?: { status: string; draftId?: string } | null
  }) => {
    mocks.expenseForm(props)
    return (
      <div
        data-testid="expense-form"
        data-initial-event={props.initialEventSource?.id ?? ''}
        data-draft-event={props.draft?.payload.eventId ?? ''}
        data-draft-guest={props.draft?.payload.members[1]?.label ?? ''}
        data-event-sources-error={String(props.eventSourcesError ?? false)}
        data-warning={String(props.eventSelectionWarning ?? false)}
      />
    )
  },
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
  getExpenseDraftPublicationLifecycle: mocks.getPublicationLifecycle,
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
}))
vi.mock('@/lib/events/legacy-expense-event-source-v2.repository.server', () => ({
  listLegacyExpenseEventSourcesV2: mocks.listEventSourcePresentation,
  getLegacyExpenseEventSourceV2: mocks.getEventSourcePresentation,
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
const sourceAPresentation = {
  eventId: EVENT_A,
  name: 'Sumarferð',
  rosterRevision: '4',
  viewerRole: 'owner' as const,
  people: [{
    legacyPersonRef: EVENT_GUEST,
    participantKind: 'guest' as const,
    position: 0,
    shared: {
      accessState: 'active' as const,
      labelState: 'resolved' as const,
      displayName: 'Anna',
      selectable: true,
      disabledReason: null,
    },
  }],
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
  mocks.getPublicationLifecycle.mockImplementation(async (_actorId: string, draftId: string) => ({
    status: 'ready',
    draftId,
    draftVersion: 1,
    sharingState: 'never_shared',
    expectedPublicationVersion: null,
    hasUnsharedChanges: false,
  }))
  mocks.listEventSources.mockResolvedValue([sourceA])
  mocks.getEventSource.mockResolvedValue(sourceA)
  mocks.listEventSourcePresentation.mockResolvedValue([sourceAPresentation])
  mocks.getEventSourcePresentation.mockResolvedValue(sourceAPresentation)
  mocks.getPayAll.mockResolvedValue({})
  mocks.getActorName.mockResolvedValue('Stebbi')
  mocks.getParticipantOptions.mockResolvedValue([])
  mocks.checkFeatureAccess.mockResolvedValue(false)
  mocks.getRelationshipCircles.mockResolvedValue([])
})

describe('event-aware new expense route', () => {
  it('renders the fresh chooser from one safe authoritative read before form-dependent reads', async () => {
    render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({}),
    }))

    expect(screen.getByTestId('expense-context-chooser')).toBeInTheDocument()
    expect(screen.queryByTestId('expense-form')).not.toBeInTheDocument()
    expect(mocks.listEventSources).toHaveBeenCalledTimes(1)
    expect(mocks.listEventSources).toHaveBeenCalledWith(ACTOR_ID)
    expect(mocks.expenseContextChooser).toHaveBeenCalledWith({
      events: [{ id: EVENT_A, name: 'Sumarferð' }],
    })
    expect(mocks.getDraft).not.toHaveBeenCalled()
    expect(mocks.getPublicationLifecycle).not.toHaveBeenCalled()
    expect(mocks.listEventSourcePresentation).not.toHaveBeenCalled()
    expect(mocks.getEventSource).not.toHaveBeenCalled()
    expect(mocks.getEventSourcePresentation).not.toHaveBeenCalled()
    expect(mocks.getActorName).not.toHaveBeenCalled()
    expect(mocks.getParticipantOptions).not.toHaveBeenCalled()
    expect(mocks.checkFeatureAccess).not.toHaveBeenCalled()
    expect(mocks.getRelationshipCircles).not.toHaveBeenCalled()
    expect(mocks.expenseForm).not.toHaveBeenCalled()
  })

  it.each([
    ['empty', ''],
    ['unknown', 'anything-else'],
    ['duplicated', ['standalone', 'standalone']],
  ])('does not let %s context bypass the chooser', async (_label, context) => {
    render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({ context }),
    }))

    expect(screen.getByTestId('expense-context-chooser')).toBeInTheDocument()
    expect(screen.queryByTestId('expense-form')).not.toBeInTheDocument()
  })

  it('lets only exact scalar standalone context bypass while retaining the form Event source', async () => {
    render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({ context: 'standalone' }),
    }))

    expect(screen.getByTestId('expense-form')).toBeInTheDocument()
    expect(screen.queryByTestId('expense-context-chooser')).not.toBeInTheDocument()
    expect(mocks.listEventSources).toHaveBeenCalledTimes(1)
    expect(mocks.expenseForm.mock.calls.at(-1)?.[0].eventSources).toEqual([sourceA])
  })

  it('keeps exact standalone usable when the bounded Event source rejects', async () => {
    mocks.listEventSources.mockRejectedValueOnce(new Error('bounded load failure'))

    render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({ context: 'standalone' }),
    }))

    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-event-sources-error', 'true')
    expect(screen.queryByTestId('expense-context-chooser')).not.toBeInTheDocument()
    expect(mocks.listEventSources).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['empty', ''],
    ['duplicated', [EVENT_A, EVENT_B]],
  ])('preserves the warning form path for %s explicit Event input', async (_label, event) => {
    render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({ event }),
    }))

    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-warning', 'true')
    expect(screen.queryByTestId('expense-context-chooser')).not.toBeInTheDocument()
  })

  it('preserves exact fallback and warning semantics for a nonempty malformed Event scalar', async () => {
    mocks.getEventSource.mockResolvedValueOnce(null)

    render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({ event: 'not-an-event-id' }),
    }))

    expect(mocks.getEventSource).toHaveBeenCalledWith(ACTOR_ID, 'not-an-event-id')
    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-warning', 'true')
    expect(screen.queryByTestId('expense-context-chooser')).not.toBeInTheDocument()
  })

  it('falls through to the usable form without retrying when the fresh Event source rejects', async () => {
    mocks.listEventSources.mockRejectedValueOnce(new Error('bounded load failure'))

    render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({}),
    }))

    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-event-sources-error', 'true')
    expect(screen.queryByTestId('expense-context-chooser')).not.toBeInTheDocument()
    expect(mocks.listEventSources).toHaveBeenCalledTimes(1)
    expect(mocks.expenseForm.mock.calls.at(-1)?.[0].eventSources).toEqual([])
  })

  it('skips an empty chooser and reuses the one bounded read for the form', async () => {
    mocks.listEventSources.mockResolvedValueOnce([])

    render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({}),
    }))

    expect(screen.getByTestId('expense-form')).toBeInTheDocument()
    expect(screen.queryByTestId('expense-context-chooser')).not.toBeInTheDocument()
    expect(mocks.listEventSources).toHaveBeenCalledTimes(1)
  })

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

  it('keeps explicit Event entry usable when the bounded list rejects and exact authority resolves', async () => {
    mocks.listEventSources.mockRejectedValueOnce(new Error('bounded load failure'))
    mocks.getEventSource.mockResolvedValueOnce(sourceA)

    render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({ event: EVENT_A }),
    }))

    expect(mocks.getEventSource).toHaveBeenCalledWith(ACTOR_ID, EVENT_A)
    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-initial-event', EVENT_A)
    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-warning', 'false')
    expect(screen.queryByTestId('expense-context-chooser')).not.toBeInTheDocument()
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
    expect(mocks.getPublicationLifecycle).toHaveBeenCalledWith(
      ACTOR_ID,
      '50000000-0000-4000-8000-000000000001',
    )
    expect(mocks.expenseForm.mock.calls.at(-1)?.[0].publicationLifecycle).toEqual(
      expect.objectContaining({ status: 'ready', sharingState: 'never_shared' }),
    )
  })

  it('keeps draft resume usable when the bounded list rejects and exact authority resolves', async () => {
    mocks.getDraft.mockResolvedValueOnce(draftWithLeakyLegacyLabel())
    mocks.listEventSources.mockRejectedValueOnce(new Error('bounded load failure'))
    mocks.getEventSource.mockResolvedValueOnce(sourceA)

    render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({ draft: '50000000-0000-4000-8000-000000000001' }),
    }))

    expect(mocks.getEventSource).toHaveBeenCalledWith(ACTOR_ID, EVENT_A)
    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-draft-event', EVENT_A)
    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-draft-guest', 'Anna')
    expect(screen.queryByTestId('expense-context-chooser')).not.toBeInTheDocument()
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

  it('fails closed on a missing v2 label projection instead of restoring a legacy email label', async () => {
    mocks.getDraft.mockResolvedValueOnce(draftWithLeakyLegacyLabel())
    mocks.listEventSourcePresentation.mockRejectedValueOnce(new Error('bounded load failure'))
    mocks.getEventSourcePresentation.mockResolvedValueOnce(null)
    render(await NewOneOffExpensePage({
      searchParams: Promise.resolve({ draft: '50000000-0000-4000-8000-000000000001' }),
    }))

    expect(screen.getByTestId('expense-form')).toHaveAttribute('data-draft-guest', 'Gestur úr viðburði')
    expect(document.body.textContent).not.toContain('secret@example.com')
    expect(mocks.expenseForm.mock.calls.at(-1)?.[0].eventSourcesError).toBe(true)
  })
})

describe('global settlement route', () => {
  it('always renders the existing writable pay-all flow without an event-specific mode', async () => {
    render(await ExpensePayAllPage())
    expect(screen.getByTestId('writable-global-pay-all')).toBeInTheDocument()
    expect(mocks.getPayAll).toHaveBeenCalledWith(ACTOR_ID)
    expect(mocks.getEventSource).not.toHaveBeenCalled()
  })
})
