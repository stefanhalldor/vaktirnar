import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdmin, mockRpc } = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))

import {
  getEventPersonSourceRoster,
  listEventPersonSourceEvents,
} from '@/lib/events/person-source.repository.server'

const actorId = '10000000-0000-4000-8000-000000000001'
const eventId = '20000000-0000-4000-8000-000000000001'
const eventId2 = '20000000-0000-4000-8000-000000000002'
const organizerRef = '30000000-0000-4000-8000-000000000001'
const guestRef = '30000000-0000-4000-8000-000000000002'
const timestamp = '2026-08-21T08:00:00.000+00:00'

function page(overrides: Record<string, unknown> = {}) {
  return {
    events: [{
      event_id: eventId,
      name: 'Gönguferð',
      roster_revision: 4,
      viewer_role: 'owner',
      active_person_count: 2,
    }],
    next_cursor: null,
    ...overrides,
  }
}

function ownerRoster(overrides: Record<string, unknown> = {}) {
  return {
    event_id: eventId,
    name: 'Gönguferð',
    roster_revision: 4,
    viewer_role: 'owner',
    people: [{
      person_ref: organizerRef,
      participant_kind: 'organizer',
      source_kind: 'linked_user',
      display_name: 'Stebbi',
      position: 0,
      is_self: true,
    }, {
      person_ref: guestRef,
      participant_kind: 'guest',
      source_kind: 'manual_name',
      display_name: 'Biggi',
      position: 1,
      is_self: false,
    }],
    ...overrides,
  }
}

function attendeeRoster(overrides: Record<string, unknown> = {}) {
  return {
    ...ownerRoster(),
    viewer_role: 'attendee',
    people: [{
      person_ref: organizerRef,
      participant_kind: 'organizer',
      source_kind: 'linked_user',
      display_name: 'Stebbi',
      position: 0,
      is_self: false,
    }, {
      person_ref: guestRef,
      participant_kind: 'guest',
      source_kind: 'linked_user',
      display_name: 'Biggi',
      position: 1,
      is_self: true,
    }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAdmin.mockReturnValue({ rpc: mockRpc })
})

describe('Event person-source repository', () => {
  it('maps owner and attendee directory rows and an absent cursor', async () => {
    mockRpc.mockResolvedValueOnce({
      data: page({
        events: [page().events[0], {
          event_id: eventId2,
          name: 'Kvöldmatur',
          roster_revision: 2,
          viewer_role: 'attendee',
          active_person_count: 5,
        }],
      }),
      error: null,
    })

    await expect(listEventPersonSourceEvents(actorId)).resolves.toEqual({
      events: [{
        id: eventId,
        name: 'Gönguferð',
        rosterRevision: 4,
        viewerRole: 'owner',
        activePersonCount: 2,
      }, {
        id: eventId2,
        name: 'Kvöldmatur',
        rosterRevision: 2,
        viewerRole: 'attendee',
        activePersonCount: 5,
      }],
      nextCursor: null,
    })
    expect(mockRpc).toHaveBeenCalledWith(
      'teskeid_event_list_person_source_events_v1',
      {
        p_actor_id: actorId,
        p_before_sort_at: null,
        p_before_event_id: null,
        p_limit: 20,
      },
    )
  })

  it('passes and maps an exact keyset cursor', async () => {
    mockRpc.mockResolvedValueOnce({
      data: page({ next_cursor: { before_sort_at: timestamp, before_event_id: eventId } }),
      error: null,
    })
    await expect(listEventPersonSourceEvents(
      actorId,
      { beforeSortAt: timestamp, beforeEventId: eventId2 },
      1,
    )).resolves.toMatchObject({
      nextCursor: { beforeSortAt: timestamp, beforeEventId: eventId },
    })
    expect(mockRpc).toHaveBeenCalledWith(
      'teskeid_event_list_person_source_events_v1',
      expect.objectContaining({
        p_before_sort_at: timestamp,
        p_before_event_id: eventId2,
        p_limit: 1,
      }),
    )
  })

  it.each([
    page({ extra: true }),
    page({ events: [{ ...page().events[0], email: 'private@example.is' }] }),
    page({ next_cursor: { before_sort_at: timestamp, before_event_id: eventId, user_id: actorId } }),
    page({ events: [page().events[0], page().events[0]] }),
    page({ next_cursor: { before_sort_at: timestamp, before_event_id: eventId2 } }),
    page({ events: [{ ...page().events[0], active_person_count: 51 }] }),
    page({ events: [{ ...page().events[0], roster_revision: 0 }] }),
    page({ events: [{ ...page().events[0], event_id: 'not-a-uuid' }] }),
  ])('fails closed on malformed or drifting directory payload %#', async (payload) => {
    mockRpc.mockResolvedValueOnce({ data: payload, error: null })
    await expect(listEventPersonSourceEvents(actorId)).rejects.toThrow('event_load_failed')
  })

  it('rejects invalid cursor timestamps and limit values before transport', async () => {
    await expect(listEventPersonSourceEvents(actorId, {
      beforeSortAt: '2026-08-21', beforeEventId: eventId,
    })).rejects.toThrow('event_load_failed')
    await expect(listEventPersonSourceEvents(actorId, null, 51))
      .rejects.toThrow('event_load_failed')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects responses beyond the requested page bound and the 50-person roster cap', async () => {
    const events = Array.from({ length: 21 }, (_, index) => ({
      ...page().events[0],
      event_id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    }))
    mockRpc.mockResolvedValueOnce({ data: page({ events }), error: null })
    await expect(listEventPersonSourceEvents(actorId, null, 20))
      .rejects.toThrow('event_load_failed')

    const people = Array.from({ length: 51 }, (_, index) => ({
      person_ref: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      participant_kind: index === 0 ? 'organizer' : 'guest',
      source_kind: 'linked_user',
      display_name: `Aðili ${index + 1}`,
      position: index,
      is_self: index === 0,
    }))
    mockRpc.mockResolvedValueOnce({ data: ownerRoster({ people }), error: null })
    await expect(getEventPersonSourceRoster(actorId, eventId))
      .rejects.toThrow('event_load_failed')
  })

  it('maps strict owner and attendee roster discriminants', async () => {
    mockRpc.mockResolvedValueOnce({ data: ownerRoster(), error: null })
    await expect(getEventPersonSourceRoster(actorId, eventId)).resolves.toMatchObject({
      eventId,
      viewerRole: 'owner',
      people: [{ sourceKind: 'linked_user' }, { sourceKind: 'manual_name' }],
    })

    mockRpc.mockResolvedValueOnce({ data: attendeeRoster(), error: null })
    await expect(getEventPersonSourceRoster(actorId, eventId)).resolves.toMatchObject({
      eventId,
      viewerRole: 'attendee',
      people: [{ sourceKind: 'linked_user' }, { sourceKind: 'linked_user' }],
    })
  })

  it.each([
    ownerRoster({ extra: true }),
    ownerRoster({ event_id: eventId2 }),
    ownerRoster({ people: ownerRoster().people.map((person, index) => index === 1
      ? { ...person, person_ref: organizerRef } : person) }),
    ownerRoster({ people: ownerRoster().people.map((person, index) => index === 1
      ? { ...person, position: 2 } : person) }),
    ownerRoster({ people: ownerRoster().people.map((person, index) => index === 1
      ? { ...person, participant_kind: 'organizer' } : person) }),
    ownerRoster({ people: ownerRoster().people.map((person) => ({ ...person, is_self: false })) }),
    ownerRoster({ people: ownerRoster().people.map((person, index) => index === 1
      ? { ...person, source_kind: 'manual_email', display_name: 'Biggi' } : person) }),
    ownerRoster({ people: ownerRoster().people.map((person, index) => index === 1
      ? { ...person, email: 'private@example.is' } : person) }),
    attendeeRoster({ people: attendeeRoster().people.map((person, index) => index === 1
      ? { ...person, source_kind: 'manual_email' } : person) }),
    attendeeRoster({ people: attendeeRoster().people.map((person, index) => index === 1
      ? { ...person, relationship_id: actorId } : person) }),
    attendeeRoster({ people: attendeeRoster().people.map((person, index) => index === 1
      ? { ...person, user_id: actorId } : person) }),
    attendeeRoster({ people: attendeeRoster().people.map((person, index) => index === 1
      ? { ...person, expense_member_id: actorId } : person) }),
    ownerRoster({ people: ownerRoster().people.map((person, index) => index === 1
      ? { ...person, source_kind: 'unlinked_guest' } : person) }),
  ])('fails closed on role drift, identity leaks or roster invariant violations %#', async (payload) => {
    mockRpc.mockResolvedValueOnce({ data: payload, error: null })
    await expect(getEventPersonSourceRoster(actorId, eventId))
      .rejects.toThrow('event_load_failed')
  })

  it('accepts owner manual-email only as a null label', async () => {
    const payload = ownerRoster({
      people: ownerRoster().people.map((person, index) => index === 1
        ? { ...person, source_kind: 'manual_email', display_name: null }
        : person),
    })
    mockRpc.mockResolvedValueOnce({ data: payload, error: null })
    await expect(getEventPersonSourceRoster(actorId, eventId)).resolves.toMatchObject({
      people: [{}, { sourceKind: 'manual_email', displayName: null }],
    })
  })

  it('maps not-found safely and bounds all other transport/parser failures', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'teskeid_event_not_found' } })
    await expect(getEventPersonSourceRoster(actorId, eventId)).resolves.toBeNull()

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'network failed' } })
    await expect(getEventPersonSourceRoster(actorId, eventId))
      .rejects.toThrow('event_load_failed')

    mockRpc.mockResolvedValueOnce({ data: { loose: true }, error: null })
    await expect(listEventPersonSourceEvents(actorId)).rejects.toThrow('event_load_failed')
  })
})
