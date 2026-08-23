import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const {
  mockCanUseEventExpenses,
  mockGetEventContext,
  mockGetEventAttendeeContext,
  mockGetEventExpenseActivity,
  mockGetEventDetails,
  mockGetEventGuestAttendancePreview,
  mockGetExpenseParticipantOptions,
  mockGetTranslations,
  mockGuardEventAccess,
  mockGuardEventSession,
  mockHasEventFeatureAccess,
  mockCheckFeatureAccess,
  mockListEventDashboard,
  mockListEventsForActorV3,
  mockListEventPersonSourceEventsV3,
  mockGetEventActorViewV3,
  mockResolveEventInvitationV3,
  mockGetEventRosterManagementV2,
  mockNoStore,
  mockNotFound,
  mockRedirect,
} = vi.hoisted(() => ({
  mockCanUseEventExpenses: vi.fn(),
  mockGetEventContext: vi.fn(),
  mockGetEventAttendeeContext: vi.fn(),
  mockGetEventExpenseActivity: vi.fn(),
  mockGetEventDetails: vi.fn(),
  mockGetEventGuestAttendancePreview: vi.fn(),
  mockGetExpenseParticipantOptions: vi.fn(),
  mockGetTranslations: vi.fn(),
  mockGuardEventAccess: vi.fn(),
  mockGuardEventSession: vi.fn(),
  mockHasEventFeatureAccess: vi.fn(),
  mockCheckFeatureAccess: vi.fn(),
  mockListEventDashboard: vi.fn(),
  mockListEventsForActorV3: vi.fn(),
  mockListEventPersonSourceEventsV3: vi.fn(),
  mockGetEventActorViewV3: vi.fn(),
  mockResolveEventInvitationV3: vi.fn(),
  mockGetEventRosterManagementV2: vi.fn(),
  mockNoStore: vi.fn(),
  mockNotFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  mockRedirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ unstable_noStore: mockNoStore }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))
vi.mock('next-intl/server', () => ({ getTranslations: mockGetTranslations }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('@/components/teskeid/TeskeidMenu', () => ({ TeskeidMenu: () => <div data-testid="menu" /> }))
vi.mock('@/components/teskeid/TeskeidNavigationFeedback', () => ({
  TeskeidNavigationFeedbackProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/components/teskeid/TeskeidUnreadSection.server', () => ({
  TeskeidUnreadSection: () => <div data-testid="teskeid-unread-section" />,
}))
vi.mock('@/components/teskeid/TeskeidLogo', () => ({ TeskeidLogo: () => <div data-testid="logo" /> }))
vi.mock('@/components/teskeid/ClosedTestingBanner', () => ({
  ClosedTestingBanner: () => <div data-testid="closed-testing-banner" />,
}))
vi.mock('@/components/teskeid/ClosedTestingAccessRequest', () => ({
  ClosedTestingAccessRequest: () => <div data-testid="closed-testing-access-request" />,
}))
vi.mock('@/components/events/EventList', () => ({
  EventList: ({ dashboard, directory, canManageEvents }: { dashboard: { owned: unknown[]; pending: unknown[]; attending: unknown[] } | null; directory: { owned: unknown[]; participating: unknown[] }; canManageEvents: boolean }) => (
    <div
      data-testid="event-list"
      data-count={directory.owned.length + (dashboard?.pending.length ?? 0) + directory.participating.length}
      data-can-manage={String(canManageEvents)}
    />
  ),
}))
vi.mock('@/components/events/EventCreateForm', () => ({
  EventCreateForm: ({ options, optionsError }: {
    options: unknown[]
    optionsError: boolean
  }) => (
    <div
      data-testid="event-form"
      data-option-count={options.length}
      data-options-error={String(optionsError)}
    />
  ),
}))
vi.mock('@/components/events/EventDetail', () => ({
  EventDetail: ({ event, options, optionsError, canUseExpenses, financialPanel }: {
    event: { eventId: string }
    options: unknown[]
    optionsError: boolean
    canUseExpenses: boolean
    financialPanel?: React.ReactNode
  }) => (
    <div>
      <div
        data-testid="event-detail"
        data-event-id={event.eventId}
        data-option-count={options.length}
        data-options-error={String(optionsError)}
        data-can-use-expenses={String(canUseExpenses)}
        data-financial-panel-key={React.isValidElement(financialPanel) ? financialPanel.key : undefined}
      />
      {financialPanel}
    </div>
  ),
}))
vi.mock('@/components/events/EventAttendeeDetail', () => ({
  EventAttendeeDetail: ({ event, canUseExpenses, financialPanel }: {
    event: { eventId: string }
    canUseExpenses: boolean
    financialPanel?: React.ReactNode
  }) => (
    <div>
      <div
        data-testid="event-attendee-detail"
        data-event-id={event.eventId}
        data-can-use-expenses={String(canUseExpenses)}
        data-financial-panel-key={React.isValidElement(financialPanel) ? financialPanel.key : undefined}
      />
      {financialPanel}
    </div>
  ),
}))
vi.mock('@/components/events/EventAttendanceInvitationActions', () => ({
  EventAttendanceInvitationActions: ({ status }: { status: string }) => (
    <div data-testid="attendance-invitation-actions" data-status={status} />
  ),
}))
vi.mock('@/components/expenses/EventExpenseActivity', () => ({
  EventExpenseActivity: ({ view }: { view: { status: string } }) => view.status === 'none'
    ? null
    : <div data-testid="event-expense-activity" data-status={view.status} />,
}))
vi.mock('@/lib/events/guard', () => ({
  canUseEventExpenses: mockCanUseEventExpenses,
  guardEventAccess: mockGuardEventAccess,
  guardEventSession: mockGuardEventSession,
  hasEventFeatureAccess: mockHasEventFeatureAccess,
}))
vi.mock('@/lib/events/repository.server', () => ({
  getEventContext: mockGetEventContext,
  getEventAttendeeContext: mockGetEventAttendeeContext,
  getEventExpenseActivity: mockGetEventExpenseActivity,
  getEventDetails: mockGetEventDetails,
  getEventGuestAttendancePreview: mockGetEventGuestAttendancePreview,
  listEventDashboard: mockListEventDashboard,
}))
vi.mock('@/lib/events/participant-identity-v2.repository.server', () => ({
  getEventRosterManagementV2: mockGetEventRosterManagementV2,
}))
vi.mock('@/lib/events/participant-identity-v3.repository.server', () => ({
  listEventsForActorV3: mockListEventsForActorV3,
  listEventPersonSourceEventsV3: mockListEventPersonSourceEventsV3,
  getEventActorViewV3: mockGetEventActorViewV3,
  resolveEventInvitationV3: mockResolveEventInvitationV3,
}))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mockCheckFeatureAccess }))
vi.mock('@/lib/expenses/participants.server', () => ({
  getExpenseParticipantOptions: mockGetExpenseParticipantOptions,
}))

import EventLayout, { generateMetadata } from '../layout'
import EventsPage from '../page'
import NewEventPage from '../nyr/page'
import EventDetailPage from '../[eventId]/page'
import EventAttendanceInvitationPage from '../bod/thattaka/[invitationId]/page'
import { EventShell } from '../EventShell'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const EVENT_ID = '30000000-0000-4000-8000-000000000001'
const INVITATION_ID = '50000000-0000-4000-8000-000000000001'
const event = {
  id: EVENT_ID,
  name: 'Kvisskvöld',
  rosterRevision: 1,
  createdAt: '2026-08-15T21:53:00.000Z',
  updatedAt: '2026-08-15T21:53:00.000Z',
  guests: [],
}
const actorView = {
  eventId: EVENT_ID,
  name: 'Kvisskvöld',
  rosterRevision: '1',
  viewerRole: 'owner' as const,
  createdAt: '2026-08-15T21:53:00.000Z',
  updatedAt: '2026-08-15T21:53:00.000Z',
  eventDate: null,
  eventTime: null,
  description: null,
  agenda: null,
  people: [{
    personRef: '30000000-0000-4000-8000-000000000099',
    participantKind: 'organizer' as const,
    position: 0 as const,
    isSelf: true,
    shared: { labelState: 'resolved' as const, displayName: 'Eigandi', selectable: true, bulkEligible: true, disabledReason: null },
  }],
}
const rosterManagement = {
  eventId: EVENT_ID,
  name: 'Kvisskvöld',
  rosterRevision: '1',
  viewerRole: 'owner' as const,
  guests: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetTranslations.mockResolvedValue((key: string) => `events.${key}`)
  mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
  mockGuardEventSession.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
  mockCanUseEventExpenses.mockResolvedValue(false)
  mockListEventDashboard.mockResolvedValue({ owned: [], pending: [], attending: [] })
  mockHasEventFeatureAccess.mockResolvedValue(true)
  mockListEventsForActorV3.mockResolvedValue({
    owned: [], ownedHasMore: false, participating: [], participatingHasMore: false, claimHasMore: false,
  })
  mockListEventPersonSourceEventsV3.mockResolvedValue({ events: [], nextCursor: null })
  mockGetEventActorViewV3.mockResolvedValue(actorView)
  mockResolveEventInvitationV3.mockResolvedValue({
    status: 'pending', eventId: EVENT_ID, capability: 'active_participant',
  })
  mockGetEventRosterManagementV2.mockResolvedValue(rosterManagement)
  mockGetEventAttendeeContext.mockResolvedValue(null)
  mockGetExpenseParticipantOptions.mockResolvedValue([])
  mockGetEventContext.mockResolvedValue(event)
  mockGetEventDetails.mockResolvedValue({
    eventId: EVENT_ID,
    eventDate: null,
    eventTime: null,
    description: null,
    agenda: null,
  })
  mockGetEventExpenseActivity.mockResolvedValue({
    status: 'none',
    expenses: [],
    positions: [],
  })
  mockCheckFeatureAccess.mockResolvedValue(false)
  mockGetEventGuestAttendancePreview.mockResolvedValue({
    invitationId: INVITATION_ID,
    eventId: EVENT_ID,
    eventName: 'Kvisskvöld',
    guestDisplayName: null,
    inviterDisplayName: null,
    invitationKind: 'identity_and_access',
    status: 'pending',
    roster: [],
    invitedAt: '2026-08-16T09:00:00.000Z',
    expiresAt: '2026-08-23T09:00:00.000Z',
  })
})

describe('event route access and private metadata', () => {
  it('guards the route layout and disables static caching', async () => {
    const view = await EventLayout({ children: <div data-testid="child" /> })
    render(view)

    expect(mockNoStore).toHaveBeenCalledTimes(1)
    expect(mockGuardEventSession).toHaveBeenCalledTimes(1)
    expect(mockGuardEventAccess).not.toHaveBeenCalled()
    expect(screen.getByTestId('child')).toBeDefined()
    expect(readFileSync(join(process.cwd(), 'app/auth-mvp/vidburdir/layout.tsx'), 'utf8'))
      .toContain('<TeskeidNavigationFeedbackProvider')
  })

  it('marks the authenticated namespace noindex and no-referrer', async () => {
    await expect(generateMetadata()).resolves.toMatchObject({
      robots: { index: false, follow: false },
      referrer: 'no-referrer',
    })
  })

  it('provides canonical loaders and translated error/not-found boundaries', () => {
    const base = join(process.cwd(), 'app/auth-mvp/vidburdir')
    for (const file of [
      'loading.tsx',
      'nyr/loading.tsx',
      '[eventId]/loading.tsx',
      'bod/thattaka/[invitationId]/loading.tsx',
    ]) {
      expect(readFileSync(join(base, file), 'utf8')).toContain('EventRouteLoading')
    }
    expect(readFileSync(join(base, 'EventRouteLoading.tsx'), 'utf8')).toContain('<TeskeidLoader')
    expect(readFileSync(join(base, 'error.tsx'), 'utf8')).toContain("t('errors.load_failed')")
    expect(readFileSync(join(base, '[eventId]/not-found.tsx'), 'utf8')).toContain("t('notFoundDescription')")
    expect(readFileSync(join(base, 'EventHeading.tsx'), 'utf8'))
      .toContain('min-w-0 flex-1 break-words text-pretty')
  })

  it('focuses the Event heading only for the invitation redirect hash', async () => {
    window.location.hash = '#event-heading'
    render(<EventShell title="Kvisskvöld" homeLabel="Heim">{null}</EventShell>)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Kvisskvöld' })).toHaveFocus())
    window.location.hash = ''
  })
})

describe('independent event pages', () => {
  it('lists only the current actor event projection', async () => {
    mockListEventDashboard.mockResolvedValue({
      owned: [{ id: EVENT_ID }],
      pending: [],
      attending: [],
    })
    mockListEventsForActorV3.mockResolvedValue({
      owned: [{ id: EVENT_ID }], ownedHasMore: false,
      participating: [], participatingHasMore: false, claimHasMore: false,
    })
    render(await EventsPage())

    expect(mockListEventDashboard).toHaveBeenCalledWith(ACTOR_ID)
    expect(mockListEventsForActorV3).toHaveBeenCalledWith(ACTOR_ID)
    expect(mockListEventPersonSourceEventsV3).toHaveBeenCalledWith(ACTOR_ID, null, 20)
    expect(mockListEventsForActorV3.mock.invocationCallOrder[0])
      .toBeLessThan(mockListEventDashboard.mock.invocationCallOrder[0]!)
    expect(screen.getByTestId('event-list').getAttribute('data-count')).toBe('1')
    expect(screen.getByTestId('closed-testing-banner')).toBeDefined()
  })

  it('gives a scoped participant a durable list without owner dashboard authority', async () => {
    mockHasEventFeatureAccess.mockResolvedValueOnce(false)
    mockListEventsForActorV3.mockResolvedValueOnce({
      owned: [], ownedHasMore: false,
      participating: [{ id: EVENT_ID }], participatingHasMore: false, claimHasMore: false,
    })
    mockListEventPersonSourceEventsV3.mockResolvedValueOnce({
      events: [{
        id: EVENT_ID, name: 'Kvisskvöld', rosterRevision: '1', viewerRole: 'attendee',
        activePersonCount: 2, rsvpState: 'no_response', decisionVersion: '1',
      }],
      nextCursor: null,
    })

    render(await EventsPage())

    expect(screen.getByTestId('event-list')).toHaveAttribute('data-can-manage', 'false')
    expect(screen.getByTestId('event-list')).toHaveAttribute('data-count', '1')
    expect(mockListEventDashboard).not.toHaveBeenCalled()
  })

  it('loads owner-scoped relationship options for create and detail', async () => {
    mockGetExpenseParticipantOptions.mockResolvedValue([{ relationshipId: 'relationship-1' }])
    render(await NewEventPage())
    expect(mockGetExpenseParticipantOptions).toHaveBeenCalledWith(ACTOR_ID)
    expect(screen.getByTestId('event-form').getAttribute('data-option-count')).toBe('1')

    vi.clearAllMocks()
    mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
    mockGetTranslations.mockResolvedValue((key: string) => `events.${key}`)
    mockGetEventContext.mockResolvedValue(event)
    mockGetExpenseParticipantOptions.mockResolvedValue([{ relationshipId: 'relationship-1' }])
    render(await EventDetailPage({ params: Promise.resolve({ eventId: EVENT_ID }) }))
    expect(mockGetEventContext).toHaveBeenCalledWith(ACTOR_ID, EVENT_ID)
    expect(mockGetExpenseParticipantOptions).toHaveBeenCalledWith(ACTOR_ID)
    expect(screen.getByTestId('event-detail').getAttribute('data-option-count')).toBe('1')
  })

  it('keeps the optional financial capability on verified event detail only', async () => {
    render(await NewEventPage())
    expect(mockCanUseEventExpenses).not.toHaveBeenCalled()

    vi.clearAllMocks()
    mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
    mockGetTranslations.mockResolvedValue((key: string) => `events.${key}`)
    mockGetEventContext.mockResolvedValue(event)
    mockGetExpenseParticipantOptions.mockResolvedValue([])
    mockCanUseEventExpenses.mockResolvedValue(false)
    render(await EventDetailPage({ params: Promise.resolve({ eventId: EVENT_ID }) }))
    expect(mockGuardEventSession.mock.invocationCallOrder[0]).toBeLessThan(
      mockCanUseEventExpenses.mock.invocationCallOrder[0]!,
    )
    expect(screen.getByTestId('event-detail')).toHaveAttribute('data-can-use-expenses', 'false')
    expect(mockGetEventExpenseActivity).not.toHaveBeenCalled()
    expect(screen.queryByTestId('event-expense-activity')).not.toBeInTheDocument()
  })

  it('shows the financial panel only when a tagged expense actually exists', async () => {
    mockCanUseEventExpenses.mockResolvedValue(true)
    const emptyView = render(await EventDetailPage({ params: Promise.resolve({ eventId: EVENT_ID }) }))

    expect(mockGetEventExpenseActivity).toHaveBeenCalledWith(ACTOR_ID, EVENT_ID)
    expect(screen.queryByTestId('event-expense-activity')).not.toBeInTheDocument()
    emptyView.unmount()

    vi.clearAllMocks()
    mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
    mockGetTranslations.mockResolvedValue((key: string) => `events.${key}`)
    mockGetEventContext.mockResolvedValue(event)
    mockGetExpenseParticipantOptions.mockResolvedValue([])
    mockCanUseEventExpenses.mockResolvedValue(true)
    mockGetEventExpenseActivity.mockRejectedValue(new Error('private financial failure'))
    const unavailableView = render(await EventDetailPage({
      params: Promise.resolve({ eventId: EVENT_ID }),
    }))

    expect(screen.getByTestId('event-detail')).toHaveAttribute('data-can-use-expenses', 'true')
    expect(screen.getByTestId('event-expense-activity')).toHaveAttribute('data-status', 'unavailable')
    unavailableView.unmount()

    vi.clearAllMocks()
    mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
    mockGetTranslations.mockResolvedValue((key: string) => `events.${key}`)
    mockGetEventContext.mockResolvedValue(event)
    mockGetExpenseParticipantOptions.mockResolvedValue([])
    mockCanUseEventExpenses.mockResolvedValue(true)
    mockGetEventExpenseActivity.mockResolvedValue({
      status: 'ready',
      expenses: [{
        title: 'Kvöldmatur',
        description: null,
        totalMinor: 10_000,
        currency: 'ISK',
        payers: [{ displayName: 'Stebbi', amountMinor: 10_000 }],
      }],
      positions: [{ currency: 'ISK', state: 'owes', amountMinor: 5_000 }],
    })
    render(await EventDetailPage({ params: Promise.resolve({ eventId: EVENT_ID }) }))

    expect(screen.getByTestId('event-expense-activity')).toHaveAttribute('data-status', 'ready')
    expect(screen.getByTestId('event-detail')).toHaveAttribute(
      'data-financial-panel-key',
      'event-expense-activity',
    )
  })

  it('fails soft when relationship options cannot load on create or detail', async () => {
    mockGetExpenseParticipantOptions.mockRejectedValue(new Error('private lookup detail'))
    render(await NewEventPage())
    expect(screen.getByTestId('event-form').getAttribute('data-options-error')).toBe('true')

    vi.clearAllMocks()
    mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
    mockGetTranslations.mockResolvedValue((key: string) => `events.${key}`)
    mockGetEventContext.mockResolvedValue(event)
    mockGetExpenseParticipantOptions.mockRejectedValue(new Error('private lookup detail'))
    render(await EventDetailPage({ params: Promise.resolve({ eventId: EVENT_ID }) }))
    expect(screen.getByTestId('event-detail').getAttribute('data-option-count')).toBe('0')
    expect(screen.getByTestId('event-detail').getAttribute('data-options-error')).toBe('true')
  })

  it('returns not-found for absent owner event without any expense-group dependency', async () => {
    mockGetEventActorViewV3.mockResolvedValueOnce(null)
    await expect(EventDetailPage({ params: Promise.resolve({ eventId: EVENT_ID }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockGetExpenseParticipantOptions).not.toHaveBeenCalled()
    expect(mockCanUseEventExpenses).not.toHaveBeenCalled()

    const source = readFileSync(
      join(process.cwd(), 'app/auth-mvp/vidburdir/[eventId]/page.tsx'),
      'utf8',
    )
    expect(source).not.toMatch(/ExpenseGroupView|getExpenseGroupView|expense_group/i)
  })

  it('renders the same attendee-safe expense activity for an accepted attendee', async () => {
    mockCanUseEventExpenses.mockResolvedValueOnce(true)
    mockGetEventExpenseActivity.mockResolvedValueOnce({
      status: 'ready',
      expenses: [{
        title: 'Kvöldmatur', description: null, totalMinor: 10_000, currency: 'ISK',
        payers: [{ displayName: 'Stebbi', amountMinor: 10_000 }],
      }],
      positions: [{ currency: 'ISK', state: 'zero', amountMinor: 0 }],
    })
    mockGetEventContext.mockResolvedValueOnce(null)
    mockGetEventActorViewV3.mockResolvedValueOnce({
      ...actorView,
      viewerRole: 'attendee',
      selfRsvp: { state: 'attending', decisionVersion: '1' },
      people: [
        { ...actorView.people[0], isSelf: false },
        {
          personRef: '40000000-0000-4000-8000-000000000001',
          participantKind: 'guest', position: 1, isSelf: true,
          shared: {
            accessState: 'active', rsvpState: 'attending', labelState: 'resolved',
            displayName: 'Gestur', selectable: true, bulkEligible: true, disabledReason: null,
          },
          labelVersion: '1', identityVersion: '1', identityGeneration: '1', accessVersion: '1',
          rsvp: { state: 'attending', decisionVersion: '1' },
        },
      ],
    })
    mockGetEventAttendeeContext.mockResolvedValueOnce({
      id: EVENT_ID,
      name: 'Kvisskvöld',
      rosterRevision: 2,
      viewerRole: 'attendee',
      ownerDisplayName: null,
      createdAt: '2026-08-16T09:00:00.000Z',
      updatedAt: '2026-08-16T09:00:00.000Z',
      guests: [{ id: '40000000-0000-4000-8000-000000000001', displayName: null, position: 0, isSelf: true }],
    })

    render(await EventDetailPage({ params: Promise.resolve({ eventId: EVENT_ID }) }))
    expect(screen.getByTestId('event-attendee-detail')).toHaveAttribute('data-event-id', EVENT_ID)
    expect(screen.getByTestId('event-attendee-detail')).toHaveAttribute('data-can-use-expenses', 'true')
    expect(mockCanUseEventExpenses).toHaveBeenCalledOnce()
    expect(mockGetExpenseParticipantOptions).not.toHaveBeenCalled()
    expect(mockGetEventExpenseActivity).toHaveBeenCalledWith(ACTOR_ID, EVENT_ID)
    expect(screen.getByTestId('event-expense-activity')).toHaveAttribute('data-status', 'ready')
    expect(screen.getByTestId('event-attendee-detail')).toHaveAttribute(
      'data-financial-panel-key',
      'event-expense-activity',
    )
  })

  it('gives an entitled no-response participant the full Event view without granting Expense access', async () => {
    mockGetEventContext.mockResolvedValueOnce(null)
    mockGetEventAttendeeContext.mockResolvedValueOnce(null)
    mockGetEventActorViewV3.mockResolvedValueOnce({
      ...actorView,
      viewerRole: 'attendee',
      selfRsvp: { state: 'no_response', decisionVersion: '1' },
      people: [
        { ...actorView.people[0], isSelf: false },
        {
          personRef: '40000000-0000-4000-8000-000000000001',
          participantKind: 'guest',
          position: 1,
          isSelf: true,
          shared: {
            accessState: 'active', rsvpState: 'no_response', labelState: 'resolved',
            displayName: 'Gestur', selectable: true, bulkEligible: true, disabledReason: null,
          },
          labelVersion: '1', identityVersion: '1', identityGeneration: '1',
          accessVersion: '1', rsvp: { state: 'no_response', decisionVersion: '1' },
        },
      ],
    })

    render(await EventDetailPage({ params: Promise.resolve({ eventId: EVENT_ID }) }))
    expect(screen.getByTestId('event-attendee-detail')).toHaveAttribute('data-event-id', EVENT_ID)
    expect(screen.getByTestId('event-attendee-detail')).toHaveAttribute('data-can-use-expenses', 'false')
    expect(mockCanUseEventExpenses).not.toHaveBeenCalled()
    expect(mockGetEventExpenseActivity).not.toHaveBeenCalled()
    expect(mockGetExpenseParticipantOptions).not.toHaveBeenCalled()
  })
})

describe('scoped attendance invitation route', () => {
  it('resolves an exact active participant and redirects to the canonical full Event view', async () => {
    await expect(EventAttendanceInvitationPage({
      params: Promise.resolve({ invitationId: INVITATION_ID }),
    })).rejects.toThrow('NEXT_REDIRECT')

    expect(mockGuardEventSession).toHaveBeenCalledTimes(1)
    expect(mockGuardEventAccess).not.toHaveBeenCalled()
    expect(mockResolveEventInvitationV3).toHaveBeenCalledWith(ACTOR_ID, INVITATION_ID)
    expect(mockRedirect).toHaveBeenCalledWith(`/auth-mvp/vidburdir/${EVENT_ID}#event-heading`)
    expect(mockGetEventGuestAttendancePreview).not.toHaveBeenCalled()
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled()
  })

  it('claims a current recipient-scoped invitation when its v3 anchor resolver is not yet usable', async () => {
    mockResolveEventInvitationV3.mockResolvedValueOnce(null)
    mockGetEventActorViewV3.mockResolvedValueOnce({
      ...actorView,
      viewerRole: 'attendee',
      selfRsvp: { state: 'no_response', decisionVersion: '1' },
    })

    await expect(EventAttendanceInvitationPage({
      params: Promise.resolve({ invitationId: INVITATION_ID }),
    })).rejects.toThrow('NEXT_REDIRECT')

    expect(mockGetEventGuestAttendancePreview).toHaveBeenCalledWith(ACTOR_ID, INVITATION_ID)
    expect(mockGetEventActorViewV3).toHaveBeenCalledWith(ACTOR_ID, EVENT_ID)
    expect(mockRedirect).toHaveBeenCalledWith(`/auth-mvp/vidburdir/${EVENT_ID}#event-heading`)
  })

  it('collapses a foreign, left, revoked or removed invitation to generic not-found', async () => {
    mockResolveEventInvitationV3.mockResolvedValueOnce(null)
    mockGetEventGuestAttendancePreview.mockResolvedValueOnce(null)
    await expect(EventAttendanceInvitationPage({
      params: Promise.resolve({ invitationId: INVITATION_ID }),
    })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockRedirect).not.toHaveBeenCalled()
    expect(mockGetEventActorViewV3).not.toHaveBeenCalled()
  })

  it('does not use the recipient-scoped fallback without canonical attendee access', async () => {
    mockResolveEventInvitationV3.mockResolvedValueOnce(null)
    mockGetEventActorViewV3.mockResolvedValueOnce(actorView)

    await expect(EventAttendanceInvitationPage({
      params: Promise.resolve({ invitationId: INVITATION_ID }),
    })).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
