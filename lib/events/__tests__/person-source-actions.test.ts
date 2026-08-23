import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetEventPersonSourceRoster,
  mockGuardEventAccess,
  mockListEventPersonSourceEvents,
} = vi.hoisted(() => ({
  mockGetEventPersonSourceRoster: vi.fn(),
  mockGuardEventAccess: vi.fn(),
  mockListEventPersonSourceEvents: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/events/guard', () => ({
  guardEventSession: mockGuardEventAccess,
}))
vi.mock('@/lib/events/participant-identity-v3.repository.server', () => ({
  getEventPersonSourceRosterV3: mockGetEventPersonSourceRoster,
  listEventPersonSourceEventsV3: mockListEventPersonSourceEvents,
}))

import {
  loadEventPersonSourcePage,
  loadEventPersonSourceRoster,
} from '@/lib/events/person-source.actions'
import {
  PersonSourceEventPageViewSchema,
  PersonSourcePageResultSchema,
  PersonSourceRosterResultSchema,
  PersonSourceRosterViewSchema,
} from '@/lib/events/person-source.presentation'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const EVENT_ID = '20000000-0000-4000-8000-000000000001'
const SECOND_EVENT_ID = '20000000-0000-4000-8000-000000000002'
const ORGANIZER_REF = '30000000-0000-4000-8000-000000000001'
const GUEST_REF = '30000000-0000-4000-8000-000000000002'
const CURSOR_AT = '2026-08-21T08:00:00.000Z'

function repositoryPage(overrides: Record<string, unknown> = {}) {
  return {
    events: [{
      id: EVENT_ID,
      name: 'Kvisskvöld',
      rosterRevision: '4',
      viewerRole: 'owner',
      activePersonCount: 2,
    }],
    nextCursor: null,
    ...overrides,
  }
}

function ownerRoster() {
  return {
    eventId: EVENT_ID,
    name: 'Kvisskvöld',
    rosterRevision: '4',
    viewerRole: 'owner',
    people: [
      {
        personRef: ORGANIZER_REF,
        participantKind: 'organizer',
        position: 0,
        isSelf: true,
        shared: { labelState: 'resolved', displayName: 'Eigandi', selectable: true, bulkEligible: true, disabledReason: null },
      },
      {
        personRef: GUEST_REF,
        participantKind: 'guest',
        position: 1,
        isSelf: false,
        shared: { accessState: 'active', rsvpState: 'no_response', labelState: 'needs_owner_input', displayName: null, selectable: false, bulkEligible: false, disabledReason: 'name_required' },
        rsvp: { state: 'no_response', decisionVersion: '1' },
      },
    ],
  }
}

function attendeeRoster() {
  return {
    eventId: SECOND_EVENT_ID,
    name: 'Gönguferð',
    rosterRevision: '7',
    viewerRole: 'attendee',
    people: [
      {
        personRef: ORGANIZER_REF,
        participantKind: 'organizer',
        position: 0,
        isSelf: false,
        shared: { labelState: 'resolved', displayName: 'Skipuleggjandi', selectable: true, bulkEligible: true, disabledReason: null },
      },
      {
        personRef: GUEST_REF,
        participantKind: 'guest',
        position: 1,
        isSelf: true,
        shared: { accessState: 'active', rsvpState: 'attending', labelState: 'resolved', displayName: 'Gestur', selectable: true, bulkEligible: true, disabledReason: null },
        rsvp: { state: 'attending', decisionVersion: '2' },
      },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGuardEventAccess.mockResolvedValue({
    user: { id: ACTOR_ID, email: 'actor@example.is' },
  })
})

describe('SQL153 person-source presentation contracts', () => {
  it('rejects extra keys, malformed cursors and unsafe presentation labels', () => {
    const page = {
      events: [{
        eventId: EVENT_ID,
        name: 'Kvisskvöld',
        rosterRevision: 4,
        activePersonCount: 2,
      }],
      nextCursor: null,
    }
    expect(PersonSourceEventPageViewSchema.safeParse(page).success).toBe(true)
    expect(PersonSourceEventPageViewSchema.safeParse({ ...page, viewerRole: 'owner' }).success)
      .toBe(false)
    expect(PersonSourceEventPageViewSchema.safeParse({
      ...page,
      events: [{ ...page.events[0], sourceKind: 'linked_user' }],
    }).success).toBe(false)
    expect(PersonSourceEventPageViewSchema.safeParse({
      events: Array.from({ length: 20 }, (_, index) => ({
        eventId: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        name: `Viðburður ${index}`,
        rosterRevision: 1,
        activePersonCount: 1,
      })),
      nextCursor: { beforeSortAt: 'not-an-offset-timestamp', beforeEventId: EVENT_ID },
    }).success).toBe(false)

    const unsafeRoster = {
      eventId: EVENT_ID,
      name: 'Kvisskvöld',
      rosterRevision: 4,
      people: [{
        personRef: ORGANIZER_REF,
        participantKind: 'organizer',
        displayName: 'private@example.is',
        position: 0,
        isSelf: true,
      }],
    }
    expect(PersonSourceRosterViewSchema.safeParse(unsafeRoster).success).toBe(false)
  })

  it('keeps success and failure result unions exact', () => {
    expect(PersonSourcePageResultSchema.safeParse({
      ok: false,
      error: 'load_failed',
      detail: 'private',
    }).success).toBe(false)
    expect(PersonSourceRosterResultSchema.safeParse({
      ok: false,
      error: 'not_allowed',
    }).success).toBe(false)
    expect(PersonSourceRosterResultSchema.safeParse({
      ok: false,
      error: 'not_found',
    }).success).toBe(true)
  })
})

describe('SQL153 person-source server actions', () => {
  it('uses only the verified actor, exact cursor and fixed page limit', async () => {
    const fullPage = Array.from({ length: 20 }, (_, index) => ({
      id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: `Viðburður ${index}`,
      rosterRevision: String(index + 1),
      viewerRole: index % 2 === 0 ? 'owner' : 'attendee',
      activePersonCount: 1,
    }))
    const cursor = {
      beforeSortAt: CURSOR_AT,
      beforeEventId: fullPage.at(-1)!.id,
    }
    mockListEventPersonSourceEvents.mockResolvedValue({
      events: fullPage,
      nextCursor: cursor,
    })

    const result = await loadEventPersonSourcePage({ cursor })

    expect(result).toEqual({
      ok: true,
      data: {
        events: fullPage.map(({ id, name, rosterRevision, activePersonCount }) => ({
          eventId: id,
          name,
          rosterRevision,
          activePersonCount,
        })),
        nextCursor: cursor,
      },
    })
    expect(mockListEventPersonSourceEvents).toHaveBeenCalledWith(ACTOR_ID, cursor, 20)
    expect(JSON.stringify(result)).not.toContain('viewerRole')
  })

  it('rejects client actor/limit fields before repository access', async () => {
    const result = await loadEventPersonSourcePage({
      cursor: null,
      actorUserId: '90000000-0000-4000-8000-000000000001',
      limit: 50,
    })

    expect(result).toEqual({ ok: false, error: 'invalid_input' })
    expect(mockGuardEventAccess).toHaveBeenCalledTimes(1)
    expect(mockListEventPersonSourceEvents).not.toHaveBeenCalled()
  })

  it('maps owner and attendee repositories into the same reduced roster shape', async () => {
    mockGetEventPersonSourceRoster
      .mockResolvedValueOnce(ownerRoster())
      .mockResolvedValueOnce(attendeeRoster())

    const ownerResult = await loadEventPersonSourceRoster({ eventId: EVENT_ID })
    const attendeeResult = await loadEventPersonSourceRoster({ eventId: SECOND_EVENT_ID })

    expect(ownerResult).toEqual({
      ok: true,
      data: {
        eventId: EVENT_ID,
        name: 'Kvisskvöld',
        rosterRevision: '4',
        people: [
          {
            personRef: ORGANIZER_REF,
            participantKind: 'organizer',
            displayName: 'Eigandi',
            position: 0,
            isSelf: true,
            selectable: true,
            bulkEligible: true,
            disabledReason: null,
          },
          {
            personRef: GUEST_REF,
            participantKind: 'guest',
            displayName: null,
            position: 1,
            isSelf: false,
            selectable: false,
            bulkEligible: false,
            disabledReason: 'name_required',
            rsvpState: 'no_response',
          },
        ],
      },
    })
    expect(attendeeResult.ok).toBe(true)
    if (!attendeeResult.ok) throw new Error('expected attendee roster')
    expect(Object.keys(attendeeResult.data).sort()).toEqual([
      'eventId',
      'name',
      'people',
      'rosterRevision',
    ])
    expect(attendeeResult.data.people.every((person) => (
      !('sourceKind' in person) && !('viewerRole' in person)
    ))).toBe(true)
    expect(JSON.stringify(ownerResult)).not.toContain('@')
    expect(mockGetEventPersonSourceRoster.mock.calls).toEqual([
      [ACTOR_ID, EVENT_ID],
      [ACTOR_ID, SECOND_EVENT_ID],
    ])
  })

  it('maps not-found, transport and output-parser failures to exact bounded errors', async () => {
    mockGetEventPersonSourceRoster.mockResolvedValueOnce(null)
    await expect(loadEventPersonSourceRoster({ eventId: EVENT_ID }))
      .resolves.toEqual({ ok: false, error: 'not_found' })

    mockGetEventPersonSourceRoster.mockRejectedValueOnce(new Error('transport detail'))
    await expect(loadEventPersonSourceRoster({ eventId: EVENT_ID }))
      .resolves.toEqual({ ok: false, error: 'load_failed' })

    mockListEventPersonSourceEvents.mockResolvedValueOnce(repositoryPage({
      events: [{
        id: EVENT_ID,
        name: 'Kvisskvöld',
        rosterRevision: '0',
        viewerRole: 'owner',
        activePersonCount: 2,
      }],
    }))
    await expect(loadEventPersonSourcePage({ cursor: null }))
      .resolves.toEqual({ ok: false, error: 'load_failed' })
  })

  it('rethrows auth/redirect control flow instead of serializing it', async () => {
    const redirectSignal = new Error('NEXT_REDIRECT:/')
    mockGuardEventAccess.mockRejectedValueOnce(redirectSignal)

    await expect(loadEventPersonSourcePage({ cursor: null })).rejects.toBe(redirectSignal)
    expect(mockListEventPersonSourceEvents).not.toHaveBeenCalled()
  })

  it('has no legacy Expense source fallback in the canonical action module', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/events/person-source.actions.ts'),
      'utf8',
    )
    expect(source).not.toContain('listEventExpenseSources')
    expect(source).not.toContain('getOwnedEventExpenseSource')
    expect(source).not.toContain('/expenses/')
    expect(source).toContain('PersonSourcePageResultSchema.safeParse')
    expect(source).toContain('PersonSourceRosterResultSchema.safeParse')
  })
})
