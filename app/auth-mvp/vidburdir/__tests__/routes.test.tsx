import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const {
  mockCanUseEventExpenses,
  mockGetEventContext,
  mockGetEventAttendeeContext,
  mockGetEventExpensePreview,
  mockGetEventGuestAttendancePreview,
  mockGetExpenseParticipantOptions,
  mockGetTranslations,
  mockGuardEventAccess,
  mockGuardEventSession,
  mockCheckFeatureAccess,
  mockListEventDashboard,
  mockNoStore,
  mockNotFound,
} = vi.hoisted(() => ({
  mockCanUseEventExpenses: vi.fn(),
  mockGetEventContext: vi.fn(),
  mockGetEventAttendeeContext: vi.fn(),
  mockGetEventExpensePreview: vi.fn(),
  mockGetEventGuestAttendancePreview: vi.fn(),
  mockGetExpenseParticipantOptions: vi.fn(),
  mockGetTranslations: vi.fn(),
  mockGuardEventAccess: vi.fn(),
  mockGuardEventSession: vi.fn(),
  mockCheckFeatureAccess: vi.fn(),
  mockListEventDashboard: vi.fn(),
  mockNoStore: vi.fn(),
  mockNotFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ unstable_noStore: mockNoStore }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))
vi.mock('next-intl/server', () => ({ getTranslations: mockGetTranslations }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('@/components/teskeid/TeskeidMenu', () => ({ TeskeidMenu: () => <div data-testid="menu" /> }))
vi.mock('@/components/teskeid/TeskeidLogo', () => ({ TeskeidLogo: () => <div data-testid="logo" /> }))
vi.mock('@/components/teskeid/ClosedTestingBanner', () => ({
  ClosedTestingBanner: () => <div data-testid="closed-testing-banner" />,
}))
vi.mock('@/components/teskeid/ClosedTestingAccessRequest', () => ({
  ClosedTestingAccessRequest: () => <div data-testid="closed-testing-access-request" />,
}))
vi.mock('@/components/events/EventList', () => ({
  EventList: ({ dashboard }: { dashboard: { owned: unknown[]; pending: unknown[]; attending: unknown[] } }) => (
    <div
      data-testid="event-list"
      data-count={dashboard.owned.length + dashboard.pending.length + dashboard.attending.length}
    />
  ),
}))
vi.mock('@/components/events/EventCreateForm', () => ({
  EventCreateForm: ({ options, optionsError, canUseExpenses }: {
    options: unknown[]
    optionsError: boolean
    canUseExpenses: boolean
  }) => (
    <div
      data-testid="event-form"
      data-option-count={options.length}
      data-options-error={String(optionsError)}
      data-can-use-expenses={String(canUseExpenses)}
    />
  ),
}))
vi.mock('@/components/events/EventDetail', () => ({
  EventDetail: ({ event, options, optionsError, canUseExpenses, financialPanel }: {
    event: { id: string }
    options: unknown[]
    optionsError: boolean
    canUseExpenses: boolean
    financialPanel?: React.ReactNode
  }) => (
    <div>
      <div
        data-testid="event-detail"
        data-event-id={event.id}
        data-option-count={options.length}
        data-options-error={String(optionsError)}
        data-can-use-expenses={String(canUseExpenses)}
      />
      {financialPanel}
    </div>
  ),
}))
vi.mock('@/components/events/EventAttendeeDetail', () => ({
  EventAttendeeDetail: ({ event }: { event: { id: string } }) => (
    <div data-testid="event-attendee-detail" data-event-id={event.id} />
  ),
}))
vi.mock('@/components/events/EventAttendanceInvitationActions', () => ({
  EventAttendanceInvitationActions: ({ status }: { status: string }) => (
    <div data-testid="attendance-invitation-actions" data-status={status} />
  ),
}))
vi.mock('@/components/expenses/EventExpensePreview', () => ({
  EventExpensePreview: ({ preview }: { preview: { status: string } }) => (
    <div data-testid="event-expense-preview" data-status={preview.status} />
  ),
}))
vi.mock('@/lib/events/guard', () => ({
  canUseEventExpenses: mockCanUseEventExpenses,
  guardEventAccess: mockGuardEventAccess,
  guardEventSession: mockGuardEventSession,
}))
vi.mock('@/lib/events/repository.server', () => ({
  getEventContext: mockGetEventContext,
  getEventAttendeeContext: mockGetEventAttendeeContext,
  getEventExpensePreview: mockGetEventExpensePreview,
  getEventGuestAttendancePreview: mockGetEventGuestAttendancePreview,
  listEventDashboard: mockListEventDashboard,
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

beforeEach(() => {
  vi.clearAllMocks()
  mockGetTranslations.mockResolvedValue((key: string) => `events.${key}`)
  mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
  mockGuardEventSession.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
  mockCanUseEventExpenses.mockResolvedValue(false)
  mockListEventDashboard.mockResolvedValue({ owned: [], pending: [], attending: [] })
  mockGetEventAttendeeContext.mockResolvedValue(null)
  mockGetExpenseParticipantOptions.mockResolvedValue([])
  mockGetEventContext.mockResolvedValue(event)
  mockGetEventExpensePreview.mockResolvedValue({
    eventId: EVENT_ID,
    status: 'none_tagged',
    taggedExpenseCount: 0,
    currencies: [],
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
    expect(readFileSync(join(base, 'EventShell.tsx'), 'utf8'))
      .toContain('min-w-0 flex-1 break-words text-pretty')
  })
})

describe('independent event pages', () => {
  it('lists only the current actor event projection', async () => {
    mockListEventDashboard.mockResolvedValue({
      owned: [{ id: EVENT_ID }],
      pending: [],
      attending: [],
    })
    render(await EventsPage())

    expect(mockListEventDashboard).toHaveBeenCalledWith(ACTOR_ID)
    expect(screen.getByTestId('event-list').getAttribute('data-count')).toBe('1')
    expect(screen.getByTestId('closed-testing-banner')).toBeDefined()
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

  it('passes the optional financial capability only after verified event access', async () => {
    mockCanUseEventExpenses.mockResolvedValue(true)
    render(await NewEventPage())
    expect(mockCanUseEventExpenses).toHaveBeenCalledWith(expect.objectContaining({ id: ACTOR_ID }))
    expect(mockGuardEventAccess.mock.invocationCallOrder[0]).toBeLessThan(
      mockCanUseEventExpenses.mock.invocationCallOrder[0]!,
    )
    expect(screen.getByTestId('event-form')).toHaveAttribute('data-can-use-expenses', 'true')

    vi.clearAllMocks()
    mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
    mockGetTranslations.mockResolvedValue((key: string) => `events.${key}`)
    mockGetEventContext.mockResolvedValue(event)
    mockGetExpenseParticipantOptions.mockResolvedValue([])
    mockCanUseEventExpenses.mockResolvedValue(false)
    render(await EventDetailPage({ params: Promise.resolve({ eventId: EVENT_ID }) }))
    expect(mockGuardEventAccess.mock.invocationCallOrder[0]).toBeLessThan(
      mockCanUseEventExpenses.mock.invocationCallOrder[0]!,
    )
    expect(screen.getByTestId('event-detail')).toHaveAttribute('data-can-use-expenses', 'false')
    expect(mockGetEventExpensePreview).not.toHaveBeenCalled()
    expect(screen.queryByTestId('event-expense-preview')).not.toBeInTheDocument()
  })

  it('loads the financial panel only with both gates and degrades preview errors safely', async () => {
    mockCanUseEventExpenses.mockResolvedValue(true)
    const readyView = render(await EventDetailPage({ params: Promise.resolve({ eventId: EVENT_ID }) }))

    expect(mockGetEventExpensePreview).toHaveBeenCalledWith(ACTOR_ID, EVENT_ID)
    expect(screen.getByTestId('event-expense-preview')).toHaveAttribute('data-status', 'none_tagged')
    readyView.unmount()

    vi.clearAllMocks()
    mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
    mockGetTranslations.mockResolvedValue((key: string) => `events.${key}`)
    mockGetEventContext.mockResolvedValue(event)
    mockGetExpenseParticipantOptions.mockResolvedValue([])
    mockCanUseEventExpenses.mockResolvedValue(true)
    mockGetEventExpensePreview.mockRejectedValue(new Error('private financial failure'))
    render(await EventDetailPage({ params: Promise.resolve({ eventId: EVENT_ID }) }))

    expect(screen.getByTestId('event-detail')).toHaveAttribute('data-can-use-expenses', 'true')
    expect(screen.getByTestId('event-expense-preview')).toHaveAttribute('data-status', 'unavailable')
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
    mockGetEventContext.mockResolvedValueOnce(null)
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

  it('renders the attendee branch without loading owner options or financial capabilities', async () => {
    mockGetEventContext.mockResolvedValueOnce(null)
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
    expect(mockCanUseEventExpenses).not.toHaveBeenCalled()
    expect(mockGetExpenseParticipantOptions).not.toHaveBeenCalled()
    expect(mockGetEventExpensePreview).not.toHaveBeenCalled()
  })
})

describe('scoped attendance invitation route', () => {
  it('renders the exact pending preview and access-request CTA without a per-user flag', async () => {
    render(await EventAttendanceInvitationPage({
      params: Promise.resolve({ invitationId: INVITATION_ID }),
    }))

    expect(mockGuardEventSession).toHaveBeenCalledTimes(1)
    expect(mockGuardEventAccess).not.toHaveBeenCalled()
    expect(mockGetEventGuestAttendancePreview).toHaveBeenCalledWith(ACTOR_ID, INVITATION_ID)
    expect(mockCheckFeatureAccess).toHaveBeenCalled()
    expect(screen.getByText('Kvisskvöld')).toBeInTheDocument()
    expect(screen.getByText('events.attendance.genericGuest')).toBeInTheDocument()
    expect(screen.getByText('events.invitation.unknownInviter')).toBeInTheDocument()
    expect(screen.getByTestId('closed-testing-access-request')).toBeInTheDocument()
    expect(screen.getByTestId('attendance-invitation-actions'))
      .toHaveAttribute('data-status', 'pending')
    expect(screen.queryByText('events.attendance.participants')).not.toBeInTheDocument()
  })

  it('renders minimal accepted management with no roster and no per-user flag', async () => {
    mockGetEventGuestAttendancePreview.mockResolvedValueOnce({
      invitationId: INVITATION_ID,
      eventId: EVENT_ID,
      eventName: 'Kvisskvöld',
      guestDisplayName: null,
      inviterDisplayName: null,
      invitationKind: 'identity_and_access',
      status: 'accepted',
      roster: [],
      invitedAt: '2026-08-16T09:00:00.000Z',
      expiresAt: null,
    })
    render(await EventAttendanceInvitationPage({
      params: Promise.resolve({ invitationId: INVITATION_ID }),
    }))

    expect(screen.getByText('events.invitation.acceptedManagementHint')).toBeInTheDocument()
    expect(screen.getByTestId('closed-testing-access-request')).toBeInTheDocument()
    expect(screen.getByTestId('attendance-invitation-actions'))
      .toHaveAttribute('data-status', 'accepted')
    expect(screen.queryByText('events.attendance.participants')).not.toBeInTheDocument()
  })

  it('collapses a foreign, expired, left or revoked preview to generic not-found', async () => {
    mockGetEventGuestAttendancePreview.mockResolvedValueOnce(null)
    await expect(EventAttendanceInvitationPage({
      params: Promise.resolve({ invitationId: INVITATION_ID }),
    })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
