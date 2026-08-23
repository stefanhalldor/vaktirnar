import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreate,
  mockDeliver,
  mockGuard,
  mockRepair,
  mockReplace,
  mockRevalidate,
  mockRsvp,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(), mockDeliver: vi.fn(), mockGuard: vi.fn(), mockRepair: vi.fn(),
  mockReplace: vi.fn(), mockRevalidate: vi.fn(), mockRsvp: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidate }))
vi.mock('@/lib/events/guard', () => ({ guardEventAccess: mockGuard }))
vi.mock('@/lib/events/attendance-delivery.server', () => ({
  deliverCommittedEventInvitations: mockDeliver,
}))
vi.mock('@/lib/events/participant-identity-v2.repository.server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/events/participant-identity-v2.repository.server')>(
    '@/lib/events/participant-identity-v2.repository.server',
  )
  return {
    ...actual,
    createEventWithParticipationsV2: mockCreate,
    replaceEventRosterWithParticipationsV2: mockReplace,
    repairEventPersonLabelV2: mockRepair,
    setEventRsvpV2: mockRsvp,
  }
})

import {
  createEventV2,
  repairEventPersonLabel,
  saveEventRosterV2,
  setEventRsvp,
} from '@/lib/events/participant-identity-v2.actions'
import { EventV2RepositoryError } from '@/lib/events/participant-identity-v2.contracts'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const EVENT_ID = '20000000-0000-4000-8000-000000000001'
const GUEST_ID = '30000000-0000-4000-8000-000000000001'
const REQUEST_ID = '40000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  mockGuard.mockResolvedValue({ user: { id: ACTOR_ID, email: 'actor@example.is' } })
  mockDeliver.mockResolvedValue({ invitationCount: 0, deliveredCount: 0, deliveryIssue: false })
})

describe('Phase 3C Event v2 actions', () => {
  it('derives the actor server-side and creates with the strict shared-name email shape', async () => {
    mockCreate.mockResolvedValue({
      eventId: EVENT_ID, rosterRevision: '1', invitations: [],
    })
    const input = {
      request_id: REQUEST_ID,
      name: 'Kvisskvöld',
      guests: [{
        source_kind: 'manual_email', email: ' GUEST@EXAMPLE.IS ', shared_display_name: 'Anna',
      }],
      event_date: null,
      event_time: null,
      description: '',
      agenda: '',
    }
    await expect(createEventV2(input)).resolves.toEqual({
      ok: true,
      data: {
        eventId: EVENT_ID, rosterRevision: '1',
        invitationCount: 0, deliveredCount: 0, deliveryIssue: false,
      },
    })
    expect(mockCreate).toHaveBeenCalledWith(ACTOR_ID, {
      ...input,
      description: null,
      agenda: null,
      guests: [{ source_kind: 'manual_email', email: 'guest@example.is', shared_display_name: 'Anna' }],
    })
    expect(mockDeliver).toHaveBeenCalledWith(ACTOR_ID, EVENT_ID, [])
  })

  it('rejects client actor fields and malformed names without repository access', async () => {
    await expect(createEventV2({
      request_id: REQUEST_ID,
      actor_user_id: ACTOR_ID,
      name: 'Kvisskvöld', guests: [], event_date: null, event_time: null, description: '', agenda: '',
    })).resolves.toEqual({ ok: false, error: 'invalid_input' })
    await expect(repairEventPersonLabel({
      event_id: EVENT_ID, event_guest_id: GUEST_ID,
      expected_roster_revision: '1', expected_label_version: '1',
      shared_display_name: 'private@example.is', request_id: REQUEST_ID,
    })).resolves.toEqual({ ok: false, error: 'invalid_input' })
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockRepair).not.toHaveBeenCalled()
  })

  it('maps bounded repository conflicts and never logs private payloads', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockReplace.mockRejectedValue(new EventV2RepositoryError('conflict'))
    const result = await saveEventRosterV2({
      event_id: EVENT_ID,
      request_id: REQUEST_ID,
      expected_roster_revision: '7',
      guests: [{ event_guest_id: GUEST_ID }],
    })
    expect(result).toEqual({ ok: false, error: 'conflict' })
    expect(consoleError).toHaveBeenCalledWith('[events:v2] roster save failed')
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(EVENT_ID)
    consoleError.mockRestore()
  })

  it('keeps auth redirect/control flow outside action catches', async () => {
    const redirect = new Error('NEXT_REDIRECT')
    mockGuard.mockRejectedValueOnce(redirect)
    await expect(setEventRsvp({})).rejects.toBe(redirect)
    expect(mockRsvp).not.toHaveBeenCalled()
  })

  it('uses exact RSVP and repair refs and returns only bounded presentation results', async () => {
    mockRsvp.mockResolvedValue({
      eventId: EVENT_ID, eventGuestId: GUEST_ID,
      accessState: 'active', accessVersion: '4', rsvpState: 'not_attending', rsvpVersion: '2',
    })
    mockRepair.mockResolvedValue({
      eventId: EVENT_ID, eventGuestId: GUEST_ID, rosterRevision: '8', labelVersion: '2',
    })
    const rsvpInput = {
      event_id: EVENT_ID, event_guest_id: GUEST_ID, rsvp_state: 'not_attending',
      expected_rsvp_version: '1', request_id: REQUEST_ID,
    }
    const repairInput = {
      event_id: EVENT_ID, event_guest_id: GUEST_ID,
      expected_roster_revision: '7', expected_label_version: '1',
      shared_display_name: 'Anna', request_id: REQUEST_ID,
    }
    await expect(setEventRsvp(rsvpInput)).resolves.toEqual({
      ok: true,
      data: { eventId: EVENT_ID, eventGuestId: GUEST_ID, rsvpState: 'not_attending', rsvpVersion: '2' },
    })
    await expect(repairEventPersonLabel(repairInput)).resolves.toEqual({
      ok: true,
      data: { eventId: EVENT_ID, eventGuestId: GUEST_ID, rosterRevision: '8', labelVersion: '2' },
    })
    expect(mockRsvp).toHaveBeenCalledWith(ACTOR_ID, rsvpInput)
    expect(mockRepair).toHaveBeenCalledWith(ACTOR_ID, repairInput)
  })
})
