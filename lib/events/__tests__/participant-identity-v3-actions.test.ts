import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGuard,
  mockLeave,
  mockListPage,
  mockRevalidate,
  mockRsvp,
} = vi.hoisted(() => ({
  mockGuard: vi.fn(),
  mockLeave: vi.fn(),
  mockListPage: vi.fn(),
  mockRevalidate: vi.fn(),
  mockRsvp: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidate }))
vi.mock('@/lib/events/guard', () => ({ guardEventSession: mockGuard }))
vi.mock('@/lib/events/participant-identity-v3.repository.server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/events/participant-identity-v3.repository.server')>(
    '@/lib/events/participant-identity-v3.repository.server',
  )
  return {
    ...actual,
    leaveEventParticipationV3: mockLeave,
    listEventPersonSourceEventsV3: mockListPage,
    setEventRsvpV3: mockRsvp,
  }
})

import {
  leaveEventParticipationV3Action,
  loadEventDirectoryPageV3Action,
  setEventRsvpV3Action,
} from '@/lib/events/participant-identity-v3.actions'
import { EventV3RepositoryError } from '@/lib/events/participant-identity-v3.contracts'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const ATTACKER_ID = '10000000-0000-4000-8000-000000000002'
const EVENT_ID = '20000000-0000-4000-8000-000000000001'
const GUEST_ID = '30000000-0000-4000-8000-000000000001'
const REQUEST_ID = '40000000-0000-4000-8000-000000000001'
const TIMESTAMP = '2026-08-23T10:00:00.000+00:00'

const RSVP_INPUT = {
  event_id: EVENT_ID,
  event_guest_id: GUEST_ID,
  identity_generation: '3',
  rsvp_state: 'considering',
  private_note: '  Er að redda pössun  ',
  expected_decision_version: '7',
  request_id: REQUEST_ID,
}

const LEAVE_INPUT = {
  event_id: EVENT_ID,
  event_guest_id: GUEST_ID,
  identity_generation: '3',
  expected_identity_version: '5',
  expected_access_version: '11',
  request_id: REQUEST_ID,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGuard.mockResolvedValue({ user: { id: ACTOR_ID, email: 'actor@example.is' } })
})

describe('Phase 3C-4 Event v3 actions', () => {
  it('derives the RSVP actor from the server session and rejects client actor injection', async () => {
    mockRsvp.mockResolvedValue({
      eventId: EVENT_ID,
      eventGuestId: GUEST_ID,
      identityGeneration: '3',
      accessVersion: '11',
      rsvpState: 'considering',
      decisionVersion: '8',
    })
    await expect(setEventRsvpV3Action(RSVP_INPUT)).resolves.toEqual({
      ok: true,
      data: {
        eventId: EVENT_ID,
        eventGuestId: GUEST_ID,
        identityGeneration: '3',
        accessVersion: '11',
        rsvpState: 'considering',
        decisionVersion: '8',
      },
    })
    expect(mockRsvp).toHaveBeenCalledWith(ACTOR_ID, {
      ...RSVP_INPUT,
      private_note: 'Er að redda pössun',
    })
    expect(mockRevalidate).toHaveBeenCalledWith('/auth-mvp/vidburdir')
    expect(mockRevalidate).toHaveBeenCalledWith(`/auth-mvp/vidburdir/${EVENT_ID}`)
    expect(mockRevalidate).toHaveBeenCalledWith('/auth-mvp/heim')

    await expect(setEventRsvpV3Action({
      ...RSVP_INPUT,
      actor_user_id: ATTACKER_ID,
    })).resolves.toEqual({ ok: false, error: 'invalid_input' })
    expect(mockRsvp).toHaveBeenCalledTimes(1)
  })

  it('passes the exact leave identity/access closure fences under the session actor', async () => {
    mockLeave.mockResolvedValue({
      eventId: EVENT_ID,
      eventGuestId: GUEST_ID,
      identityGeneration: '3',
      identityVersion: '5',
      accessVersion: '12',
    })
    await expect(leaveEventParticipationV3Action(LEAVE_INPUT)).resolves.toEqual({
      ok: true,
      data: {
        eventId: EVENT_ID,
        eventGuestId: GUEST_ID,
        identityGeneration: '3',
        identityVersion: '5',
        accessVersion: '12',
      },
    })
    expect(mockLeave).toHaveBeenCalledWith(ACTOR_ID, LEAVE_INPUT)
  })

  it('keeps session redirect control flow outside mutation catches', async () => {
    const redirect = new Error('NEXT_REDIRECT')
    mockGuard.mockRejectedValueOnce(redirect)
    await expect(leaveEventParticipationV3Action(LEAVE_INPUT)).rejects.toBe(redirect)
    expect(mockLeave).not.toHaveBeenCalled()
  })

  it('returns bounded mutation failures without logging object IDs or private notes', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRsvp.mockRejectedValueOnce(new EventV3RepositoryError('conflict'))
    await expect(setEventRsvpV3Action(RSVP_INPUT))
      .resolves.toEqual({ ok: false, error: 'conflict' })
    expect(consoleError).toHaveBeenCalledWith('[events:v3] RSVP update failed')
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(EVENT_ID)
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('pössun')
    consoleError.mockRestore()
  })

  it('uses the session actor for bounded directory paging', async () => {
    mockListPage.mockResolvedValue({ events: [], nextCursor: null })
    await expect(loadEventDirectoryPageV3Action({
      cursor: { beforeSortAt: TIMESTAMP, beforeEventId: EVENT_ID },
    })).resolves.toEqual({ ok: true, data: { events: [], nextCursor: null } })
    expect(mockListPage).toHaveBeenCalledWith(
      ACTOR_ID,
      { beforeSortAt: TIMESTAMP, beforeEventId: EVENT_ID },
      20,
    )
  })
})
