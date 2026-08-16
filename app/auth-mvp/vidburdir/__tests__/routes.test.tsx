import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const {
  mockGetEventContext,
  mockGetExpenseGroupView,
  mockGetExpenseParticipantOptions,
  mockGetTranslations,
  mockGuardEventAccess,
  mockListEvents,
  mockNoStore,
  mockNotFound,
} = vi.hoisted(() => ({
  mockGetEventContext: vi.fn(),
  mockGetExpenseGroupView: vi.fn(),
  mockGetExpenseParticipantOptions: vi.fn(),
  mockGetTranslations: vi.fn(),
  mockGuardEventAccess: vi.fn(),
  mockListEvents: vi.fn(),
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
vi.mock('@/components/events/EventList', () => ({
  EventList: ({ events }: { events: unknown[] }) => <div data-testid="event-list" data-count={events.length} />,
}))
vi.mock('@/components/events/EventCreateForm', () => ({
  EventCreateForm: ({ options, optionsError }: { options: unknown[]; optionsError: boolean }) => (
    <div data-testid="event-form" data-option-count={options.length} data-options-error={String(optionsError)} />
  ),
}))
vi.mock('@/components/events/EventDetail', () => ({
  EventDetail: ({ event, group }: { event: { id: string }; group: { id: string } }) => (
    <div data-testid="event-detail" data-event-id={event.id} data-group-id={group.id} />
  ),
}))
vi.mock('@/lib/events/guard', () => ({ guardEventAccess: mockGuardEventAccess }))
vi.mock('@/lib/events/repository.server', () => ({
  getEventContext: mockGetEventContext,
  listEvents: mockListEvents,
}))
vi.mock('@/lib/expenses/participants.server', () => ({
  getExpenseParticipantOptions: mockGetExpenseParticipantOptions,
}))
vi.mock('@/lib/expenses/repository.server', () => ({
  getExpenseGroupView: mockGetExpenseGroupView,
}))

import EventLayout, { generateMetadata } from '../layout'
import EventsPage from '../page'
import NewEventPage from '../nyr/page'
import EventDetailPage from '../[eventId]/page'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const EVENT_ID = '30000000-0000-4000-8000-000000000001'
const event = {
  id: EVENT_ID,
  name: 'Kvisskvöld',
  createdAt: '2026-08-15T21:53:00.000Z',
  participants: [],
}
const group = { id: EVENT_ID }

beforeEach(() => {
  vi.clearAllMocks()
  mockGetTranslations.mockResolvedValue((key: string) => `events.${key}`)
  mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
  mockListEvents.mockResolvedValue([])
  mockGetExpenseParticipantOptions.mockResolvedValue([])
  mockGetEventContext.mockResolvedValue(event)
  mockGetExpenseGroupView.mockResolvedValue(group)
})

describe('event route access and private metadata', () => {
  it('guards the route layout and disables static caching', async () => {
    const view = await EventLayout({ children: <div data-testid="child" /> })
    render(view)

    expect(mockNoStore).toHaveBeenCalledTimes(1)
    expect(mockGuardEventAccess).toHaveBeenCalledTimes(1)
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
    for (const file of ['loading.tsx', 'nyr/loading.tsx', '[eventId]/loading.tsx']) {
      expect(readFileSync(join(base, file), 'utf8')).toContain('EventRouteLoading')
    }
    expect(readFileSync(join(base, 'EventRouteLoading.tsx'), 'utf8')).toContain('<TeskeidLoader')
    expect(readFileSync(join(base, 'error.tsx'), 'utf8')).toContain("t('errors.load_failed')")
    expect(readFileSync(join(base, '[eventId]/not-found.tsx'), 'utf8')).toContain("t('notFoundDescription')")
    expect(readFileSync(join(base, 'EventShell.tsx'), 'utf8'))
      .toContain('min-w-0 flex-1 break-words text-pretty')
  })
})

describe('event pages', () => {
  it('lists only the current actor event projection', async () => {
    mockListEvents.mockResolvedValue([{ id: EVENT_ID }])
    render(await EventsPage())

    expect(mockListEvents).toHaveBeenCalledWith(ACTOR_ID)
    expect(screen.getByTestId('event-list').getAttribute('data-count')).toBe('1')
    expect(screen.getByTestId('closed-testing-banner')).toBeDefined()
  })

  it('loads owner-scoped relationship options for create', async () => {
    mockGetExpenseParticipantOptions.mockResolvedValue([{ relationshipId: 'relationship-1' }])
    render(await NewEventPage())

    expect(mockGetExpenseParticipantOptions).toHaveBeenCalledWith(ACTOR_ID)
    expect(screen.getByTestId('event-form').getAttribute('data-option-count')).toBe('1')
    expect(screen.getByTestId('event-form').getAttribute('data-options-error')).toBe('false')
  })

  it('fails soft when relationship options cannot load', async () => {
    mockGetExpenseParticipantOptions.mockRejectedValue(new Error('private lookup detail'))
    render(await NewEventPage())

    expect(screen.getByTestId('event-form').getAttribute('data-option-count')).toBe('0')
    expect(screen.getByTestId('event-form').getAttribute('data-options-error')).toBe('true')
  })

  it('requires an independent canonical expense membership check before rendering finances', async () => {
    render(await EventDetailPage({ params: Promise.resolve({ eventId: EVENT_ID }) }))

    expect(mockGetEventContext).toHaveBeenCalledWith(ACTOR_ID, EVENT_ID)
    expect(mockGetExpenseGroupView).toHaveBeenCalledWith(ACTOR_ID, EVENT_ID, {
      includeCurrentPaymentInstructions: true,
    })
    expect(mockGetEventContext.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetExpenseGroupView.mock.invocationCallOrder[0]!,
    )
    expect(screen.getByTestId('event-detail').getAttribute('data-event-id')).toBe(EVENT_ID)
    expect(screen.getByTestId('event-detail').getAttribute('data-group-id')).toBe(EVENT_ID)
  })

  it('returns the same not-found boundary for absent event metadata and missing financial membership', async () => {
    mockGetEventContext.mockResolvedValueOnce(null)
    await expect(EventDetailPage({ params: Promise.resolve({ eventId: EVENT_ID }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockGetExpenseGroupView).not.toHaveBeenCalled()

    vi.clearAllMocks()
    mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
    mockGetTranslations.mockResolvedValue((key: string) => `events.${key}`)
    mockGetEventContext.mockResolvedValue(event)
    mockGetExpenseGroupView.mockResolvedValue(null)
    await expect(EventDetailPage({ params: Promise.resolve({ eventId: EVENT_ID }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
  })
})
