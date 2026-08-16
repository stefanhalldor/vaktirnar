import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAdmin,
  mockGuardEventAccess,
  mockRevalidatePath,
  mockRpc,
} = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
  mockGuardEventAccess: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))
vi.mock('@/lib/events/guard', () => ({ guardEventAccess: mockGuardEventAccess }))

import { createEvent, saveEventRoster } from '@/lib/events/actions'
import {
  createEventContext,
  getEventAttendeeContext,
  getEventContext,
  getEventExpensePreview,
  getEventGuestAttendancePreview,
  getOwnedEventExpenseSource,
  isExpenseEventContext,
  listEventDashboard,
  listEventExpenseSources,
  listEvents,
  replaceEventRoster,
  reserveEventGuestAttendanceDelivery,
  respondEventGuestAttendanceInvitation,
} from '@/lib/events/repository.server'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const REQUEST_ID = '20000000-0000-4000-8000-000000000001'
const EVENT_ID = '30000000-0000-4000-8000-000000000001'
const GUEST_ID = '40000000-0000-4000-8000-000000000001'
const RELATIONSHIP_ID = '50000000-0000-4000-8000-000000000001'
const PARTY_A = '60000000-0000-4000-8000-000000000001'
const PARTY_B = '60000000-0000-4000-8000-000000000002'
const INVITATION_ID = '70000000-0000-4000-8000-000000000001'
const INVITED_AT = '2026-08-16T09:00:00.000Z'
const EXPIRES_AT = '2026-08-23T09:00:00.000Z'
const ACCEPTED_AT = '2026-08-16T09:05:00.000Z'

const validInput = {
  request_id: REQUEST_ID,
  name: '  Kvisskvöld  ',
  guests: [
    { source_kind: 'manual_name', display_name: '  Anna  ' },
    { source_kind: 'manual_email', email: ' GESTUR@EXAMPLE.IS ' },
    { source_kind: 'relationship', relationship_id: RELATIONSHIP_ID },
  ],
}

function ownerDetailGuest(overrides: Record<string, unknown> = {}) {
  return {
    event_id: EVENT_ID,
    name: 'Kvisskvöld',
    roster_revision: 2,
    created_at: '2026-08-15T21:53:00.000Z',
    updated_at: '2026-08-16T08:00:00.000Z',
    guests: [{
      event_guest_id: GUEST_ID,
      source_kind: 'manual_email',
      display_name: 'gestur@example.is',
      email: 'gestur@example.is',
      is_teskeid_user: true,
      position: 0,
      ...overrides,
    }],
  }
}

function ownerAttendanceState(
  status: 'not_invited' | 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'left' | 'revoked',
  overrides: Record<string, unknown> = {},
) {
  const empty = {
    invitation_id: null,
    invitation_kind: null,
    recipient_label: null,
    delivery_status: null,
    attempt_number: null,
    invited_at: null,
    expires_at: null,
    accepted_at: null,
  }
  const invited = status === 'not_invited' ? empty : {
    ...empty,
    invitation_id: INVITATION_ID,
    invitation_kind: 'identity_and_access',
    invited_at: INVITED_AT,
  }
  const state = status === 'pending' ? {
    ...invited,
    recipient_label: 'g***@example.is',
    delivery_status: 'sent',
    attempt_number: 1,
    expires_at: EXPIRES_AT,
  } : status === 'accepted' ? {
    ...invited,
    accepted_at: ACCEPTED_AT,
  } : invited
  return {
    event_id: EVENT_ID,
    roster_revision: 2,
    guests: [{
      event_guest_id: GUEST_ID,
      attendance_status: status,
      ...state,
      ...overrides,
    }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAdmin.mockReturnValue({ rpc: mockRpc })
  mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('event action boundaries', () => {
  it('normalizes and sends the exact strict v2 create payload', async () => {
    mockRpc.mockResolvedValue({
      data: { event_id: EVENT_ID, roster_revision: 1, invitations: [] },
      error: null,
    })

    await expect(createEvent(validInput)).resolves.toEqual({
      ok: true,
      data: {
        eventId: EVENT_ID,
        rosterRevision: 1,
        invitationCount: 0,
        deliveredCount: 0,
        deliveryIssue: false,
      },
    })
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_create_with_attendance_invitations', {
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_name: 'Kvisskvöld',
      p_guests: [
        { source_kind: 'manual_name', display_name: 'Anna' },
        { source_kind: 'manual_email', email: 'gestur@example.is' },
        { source_kind: 'relationship', relationship_id: RELATIONSHIP_ID },
      ],
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/auth-mvp/vidburdir')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/auth-mvp/vidburdir/${EVENT_ID}`)
  })

  it('saves one ordered full replacement with revision and retained stable IDs', async () => {
    mockRpc.mockResolvedValue({
      data: { event_id: EVENT_ID, roster_revision: 3, invitations: [] },
      error: null,
    })
    const input = {
      event_id: EVENT_ID,
      request_id: REQUEST_ID,
      expected_roster_revision: 2,
      guests: [
        { event_guest_id: GUEST_ID },
        { source_kind: 'manual_email', email: 'NEW@example.is' },
      ],
    }

    await expect(saveEventRoster(input)).resolves.toEqual({
      ok: true,
      data: {
        eventId: EVENT_ID,
        rosterRevision: 3,
        invitationCount: 0,
        deliveredCount: 0,
        deliveryIssue: false,
      },
    })
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_replace_roster_with_attendance_invitations', {
      p_actor_id: ACTOR_ID,
      p_event_id: EVENT_ID,
      p_request_id: REQUEST_ID,
      p_expected_roster_revision: 2,
      p_guests: [
        { event_guest_id: GUEST_ID },
        { source_kind: 'manual_email', email: 'new@example.is' },
      ],
    })
  })

  it.each([
    { ...validInput, extra: 'not allowed' },
    { ...validInput, guests: [{ source_kind: 'relationship', relationship_id: RELATIONSHIP_ID, user_id: ACTOR_ID }] },
    { ...validInput, guests: [{ source_kind: 'manual_name', display_name: 'anna@example.is' }] },
    { ...validInput, guests: [{ source_kind: 'manual_email', email: 'not-an-email' }] },
    { ...validInput, guests: Array.from({ length: 50 }, () => ({ source_kind: 'manual_name', display_name: 'Gestur' })) },
    { ...validInput, name: 'Bad\u202ename' },
  ])('rejects non-contract or unsafe create input before any RPC', async (input) => {
    await expect(createEvent(input)).resolves.toEqual({ ok: false, error: 'invalid_input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects duplicate retained IDs, Relationships and canonical emails before any roster RPC', async () => {
    for (const guests of [
      [{ event_guest_id: GUEST_ID }, { event_guest_id: GUEST_ID }],
      [
        { source_kind: 'relationship', relationship_id: RELATIONSHIP_ID },
        { source_kind: 'relationship', relationship_id: RELATIONSHIP_ID },
      ],
      [
        { source_kind: 'manual_email', email: 'same@example.is' },
        { source_kind: 'manual_email', email: ' SAME@example.is ' },
      ],
    ]) {
      await expect(saveEventRoster({
        event_id: EVENT_ID,
        request_id: REQUEST_ID,
        expected_roster_revision: 1,
        guests,
      })).resolves.toEqual({ ok: false, error: 'invalid_input' })
    }
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('preserves guard redirects and maps stale conflicts without logging private details', async () => {
    const redirectSignal = new Error('NEXT_REDIRECT:/')
    mockGuardEventAccess.mockRejectedValueOnce(redirectSignal)
    await expect(createEvent(validInput)).rejects.toBe(redirectSignal)

    mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID } })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'teskeid_event_roster_conflict private@example.is' },
    })
    await expect(saveEventRoster({
      event_id: EVENT_ID,
      request_id: REQUEST_ID,
      expected_roster_revision: 1,
      guests: [],
    })).resolves.toEqual({ ok: false, error: 'conflict' })
    expect(consoleError).toHaveBeenCalledWith('[events] roster save failed')
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('private@example.is'))
  })

  it('maps a semantic duplicate-guest conflict to correctable invalid input', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'teskeid_event_guest_conflict' },
    })

    await expect(saveEventRoster({
      event_id: EVENT_ID,
      request_id: REQUEST_ID,
      expected_roster_revision: 1,
      guests: [],
    })).resolves.toEqual({ ok: false, error: 'invalid_input' })
    expect(consoleError).toHaveBeenCalledWith('[events] roster save failed')
  })
})

describe('owner-safe independent event repository', () => {
  it('maps the exact bounded list projection with no expense metadata', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        event_id: EVENT_ID,
        name: 'Kvisskvöld',
        active_guest_count: 2,
        roster_revision: 4,
        created_at: '2026-08-15T21:53:00.000Z',
        updated_at: '2026-08-16T08:00:00.000Z',
      }],
      error: null,
    })

    await expect(listEvents(ACTOR_ID)).resolves.toEqual([{
      id: EVENT_ID,
      name: 'Kvisskvöld',
      guestCount: 2,
      rosterRevision: 4,
      createdAt: '2026-08-15T21:53:00.000Z',
      updatedAt: '2026-08-16T08:00:00.000Z',
    }])
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_list', { p_actor_id: ACTOR_ID })
  })

  it('maps ordered owner detail and exposes raw email only for manual_email', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        event_id: EVENT_ID,
        name: 'Kvisskvöld',
        roster_revision: 2,
        created_at: '2026-08-15T21:53:00.000Z',
        updated_at: '2026-08-16T08:00:00.000Z',
        guests: [{
          event_guest_id: GUEST_ID,
          source_kind: 'manual_email',
          display_name: 'gestur@example.is',
          email: 'GESTUR@example.is',
          is_teskeid_user: false,
          position: 0,
        }],
      },
      error: null,
    })
    mockRpc.mockResolvedValueOnce({
      data: {
        event_id: EVENT_ID,
        roster_revision: 2,
        guests: [{
          event_guest_id: GUEST_ID,
          attendance_status: 'not_invited',
          invitation_id: null,
          invitation_kind: null,
          recipient_label: null,
          delivery_status: null,
          attempt_number: null,
          invited_at: null,
          expires_at: null,
          accepted_at: null,
        }],
      },
      error: null,
    })

    await expect(getEventContext(ACTOR_ID, EVENT_ID)).resolves.toEqual({
      id: EVENT_ID,
      name: 'Kvisskvöld',
      rosterRevision: 2,
      createdAt: '2026-08-15T21:53:00.000Z',
      updatedAt: '2026-08-16T08:00:00.000Z',
      guests: [{
        id: GUEST_ID,
        sourceKind: 'manual_email',
        displayName: 'gestur@example.is',
        email: 'gestur@example.is',
        isTeskeidUser: false,
        attendance: {
          status: 'not_invited',
          invitationId: null,
          invitationKind: null,
          recipientLabel: null,
          deliveryStatus: null,
          attemptNumber: null,
          invitedAt: null,
          expiresAt: null,
          acceptedAt: null,
        },
        position: 0,
      }],
    })
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_get', {
      p_actor_id: ACTOR_ID,
      p_event_id: EVENT_ID,
    })
  })

  it('keeps an anonymized relationship snapshot readable after linked-attendee deletion', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        event_id: EVENT_ID,
        name: 'Kvisskvöld',
        roster_revision: 2,
        created_at: '2026-08-15T21:53:00.000Z',
        updated_at: '2026-08-16T08:00:00.000Z',
        guests: [{
          event_guest_id: GUEST_ID,
          source_kind: 'relationship',
          display_name: 'Varðveitt nafn',
          email: null,
          is_teskeid_user: false,
          position: 0,
        }],
      },
      error: null,
    })
    mockRpc.mockResolvedValueOnce({
      data: {
        event_id: EVENT_ID,
        roster_revision: 2,
        guests: [{
          event_guest_id: GUEST_ID,
          attendance_status: 'not_invited',
          invitation_id: null,
          invitation_kind: null,
          recipient_label: null,
          delivery_status: null,
          attempt_number: null,
          invited_at: null,
          expires_at: null,
          accepted_at: null,
        }],
      },
      error: null,
    })

    await expect(getEventContext(ACTOR_ID, EVENT_ID)).resolves.toMatchObject({
      guests: [{
        id: GUEST_ID,
        sourceKind: 'relationship',
        displayName: 'Varðveitt nafn',
        email: null,
        isTeskeidUser: false,
      }],
    })
  })

  it.each([
    'not_invited',
    'pending',
    'accepted',
    'declined',
    'cancelled',
    'expired',
    'left',
    'revoked',
  ] as const)('maps the exact %s owner attendance lifecycle shape', async (status) => {
    mockRpc
      .mockResolvedValueOnce({ data: ownerDetailGuest(), error: null })
      .mockResolvedValueOnce({ data: ownerAttendanceState(status), error: null })

    const detail = await getEventContext(ACTOR_ID, EVENT_ID)
    expect(detail?.guests[0]?.isTeskeidUser).toBe(true)
    expect(detail?.guests[0]?.sourceKind).toBe('manual_email')
    expect(detail?.guests[0]?.attendance).toMatchObject({ status })
    if (status === 'pending') {
      expect(detail?.guests[0]?.attendance).toMatchObject({
        recipientLabel: 'g***@example.is',
        deliveryStatus: 'sent',
        attemptNumber: 1,
        expiresAt: EXPIRES_AT,
        acceptedAt: null,
      })
    } else if (status === 'accepted') {
      expect(detail?.guests[0]?.attendance).toMatchObject({
        recipientLabel: null,
        deliveryStatus: null,
        attemptNumber: null,
        expiresAt: null,
        acceptedAt: ACCEPTED_AT,
      })
    }
  })

  it.each([
    'hello*',
    'guest@example.is',
    'g***@example.is\u202e',
    'g**@example.is',
    'G***@example.is',
  ])('rejects hostile masked recipient label %s', async (recipientLabel) => {
    mockRpc
      .mockResolvedValueOnce({ data: ownerDetailGuest(), error: null })
      .mockResolvedValueOnce({
        data: ownerAttendanceState('pending', { recipient_label: recipientLabel }),
        error: null,
      })
    await expect(getEventContext(ACTOR_ID, EVENT_ID)).rejects.toThrow('event_load_failed')
  })

  it('rejects accepted and terminal states carrying pending-only fields', async () => {
    for (const state of [
      ownerAttendanceState('accepted', { recipient_label: 'g***@example.is' }),
      ownerAttendanceState('revoked', { expires_at: EXPIRES_AT }),
    ]) {
      mockRpc
        .mockResolvedValueOnce({ data: ownerDetailGuest(), error: null })
        .mockResolvedValueOnce({ data: state, error: null })
      await expect(getEventContext(ACTOR_ID, EVENT_ID)).rejects.toThrow('event_load_failed')
    }
  })

  it.each(['teskeid_event_not_found', 'teskeid_event_not_allowed'])(
    'collapses %s to null for IDOR safety',
    async (message) => {
      mockRpc.mockResolvedValue({ data: { private: true }, error: { message } })
      await expect(getEventContext(ACTOR_ID, EVENT_ID)).resolves.toBeNull()
    },
  )

  it.each(['linked_user_id', 'relationship_id', 'owner_id', 'recipient_email'])(
    'rejects sensitive list projection key %s',
    async (forbiddenKey) => {
      mockRpc.mockResolvedValue({
        data: [{
          event_id: EVENT_ID,
          name: 'Kvisskvöld',
          active_guest_count: 0,
          roster_revision: 1,
          created_at: '2026-08-15T21:53:00.000Z',
          updated_at: '2026-08-15T21:53:00.000Z',
          [forbiddenKey]: 'private',
        }],
        error: null,
      })
      await expect(listEvents(ACTOR_ID)).rejects.toThrow('event_load_failed')
    },
  )

  it('fails closed when an exact event RPC returns another event ID', async () => {
    mockRpc.mockResolvedValue({
      data: {
        event_id: PARTY_A,
        name: 'Wrong event',
        roster_revision: 1,
        created_at: '2026-08-15T21:53:00.000Z',
        updated_at: '2026-08-15T21:53:00.000Z',
        guests: [],
      },
      error: null,
    })
    await expect(getEventContext(ACTOR_ID, EVENT_ID)).rejects.toThrow('event_load_failed')
  })

  it('returns null for malformed IDs without an RPC', async () => {
    await expect(getEventContext(ACTOR_ID, 'not-a-uuid')).resolves.toBeNull()
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('attendance dashboard and attendee-safe projections', () => {
  const summary = (id: string, viewerRole: 'owner' | 'attendee') => ({
    event_id: id,
    name: 'Kvisskvöld',
    active_guest_count: 1,
    roster_revision: 2,
    viewer_role: viewerRole,
    created_at: '2026-08-15T21:53:00.000Z',
    updated_at: '2026-08-16T08:00:00.000Z',
  })

  it('maps exact owned, pending and attending buckets', async () => {
    mockRpc.mockResolvedValue({ data: {
      owned: [summary(EVENT_ID, 'owner')],
      pending: [{
        invitation_id: INVITATION_ID,
        event_id: PARTY_A,
        name: 'Matarboð',
        guest_display_name: 'Anna',
        inviter_display_name: 'Bjarni',
        invitation_kind: 'access_only',
        status: 'pending',
        expires_at: EXPIRES_AT,
        invited_at: INVITED_AT,
      }],
      attending: [summary(PARTY_B, 'attendee')],
    }, error: null })

    await expect(listEventDashboard(ACTOR_ID)).resolves.toMatchObject({
      owned: [{ id: EVENT_ID, viewerRole: 'owner' }],
      pending: [{
        invitationId: INVITATION_ID,
        eventId: PARTY_A,
        guestDisplayName: 'Anna',
        inviterDisplayName: 'Bjarni',
      }],
      attending: [{ id: PARTY_B, viewerRole: 'attendee' }],
    })
  })

  it('fails closed when any dashboard bucket exceeds 100 rows', async () => {
    const owned = Array.from({ length: 101 }, (_, index) => summary(
      `80000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      'owner',
    ))
    mockRpc.mockResolvedValue({ data: { owned, pending: [], attending: [] }, error: null })
    await expect(listEventDashboard(ACTOR_ID)).rejects.toThrow('event_load_failed')
  })

  it('rejects email-like display values from attendee, pending-list and consent projections', async () => {
    mockRpc.mockResolvedValueOnce({ data: {
      event_id: EVENT_ID,
      name: 'Kvisskvöld',
      roster_revision: 2,
      viewer_role: 'attendee',
      owner_display_name: 'Eigandi',
      created_at: INVITED_AT,
      updated_at: INVITED_AT,
      guests: [{
        event_guest_id: GUEST_ID,
        display_name: 'private@example.is',
        position: 0,
        is_self: true,
      }],
    }, error: null })
    await expect(getEventAttendeeContext(ACTOR_ID, EVENT_ID))
      .rejects.toThrow('event_load_failed')

    mockRpc.mockResolvedValueOnce({ data: {
      invitation_id: INVITATION_ID,
      event_id: EVENT_ID,
      event_name: 'Kvisskvöld',
      guest_display_name: 'private@example.is',
      inviter_display_name: 'Eigandi',
      invitation_kind: 'identity_and_access',
      status: 'pending',
      roster: [{ display_name: 'Anna', position: 0, is_invited_guest: true }],
      expires_at: EXPIRES_AT,
      invited_at: INVITED_AT,
    }, error: null })
    await expect(getEventGuestAttendancePreview(ACTOR_ID, INVITATION_ID))
      .rejects.toThrow('event_load_failed')

    mockRpc.mockResolvedValueOnce({ data: {
      owned: [],
      pending: [{
        invitation_id: INVITATION_ID,
        event_id: EVENT_ID,
        name: 'Kvisskvöld',
        guest_display_name: 'private@example.is',
        inviter_display_name: 'Eigandi',
        invitation_kind: 'access_only',
        status: 'pending',
        expires_at: EXPIRES_AT,
        invited_at: INVITED_AT,
      }],
      attending: [],
    }, error: null })
    await expect(listEventDashboard(ACTOR_ID)).rejects.toThrow('event_load_failed')
  })

  it('binds invitation response receipts to the requested decision', async () => {
    mockRpc.mockResolvedValueOnce({ data: { status: 'accepted' }, error: null })
    await expect(respondEventGuestAttendanceInvitation(ACTOR_ID, {
      invitation_id: INVITATION_ID,
      action: 'decline',
      request_id: REQUEST_ID,
    })).rejects.toThrow('event_save_failed')

    mockRpc.mockResolvedValueOnce({ data: { status: 'expired' }, error: null })
    await expect(respondEventGuestAttendanceInvitation(ACTOR_ID, {
      invitation_id: INVITATION_ID,
      action: 'accept',
      request_id: REQUEST_ID,
    })).resolves.toBe('expired')
  })

  it('maps only the minimal accepted scoped management preview', async () => {
    mockRpc.mockResolvedValueOnce({ data: {
      invitation_id: INVITATION_ID,
      event_id: EVENT_ID,
      event_name: 'Kvisskvöld',
      guest_display_name: null,
      inviter_display_name: null,
      invitation_kind: 'identity_and_access',
      status: 'accepted',
      roster: [],
      expires_at: null,
      invited_at: INVITED_AT,
    }, error: null })

    await expect(getEventGuestAttendancePreview(ACTOR_ID, INVITATION_ID)).resolves.toEqual({
      invitationId: INVITATION_ID,
      eventId: EVENT_ID,
      eventName: 'Kvisskvöld',
      guestDisplayName: null,
      inviterDisplayName: null,
      invitationKind: 'identity_and_access',
      status: 'accepted',
      roster: [],
      expiresAt: null,
      invitedAt: INVITED_AT,
    })
  })

  it('rejects any pre-accept roster projection', async () => {
    mockRpc.mockResolvedValueOnce({ data: {
      invitation_id: INVITATION_ID,
      event_id: EVENT_ID,
      event_name: 'Kvisskvöld',
      guest_display_name: 'Anna',
      inviter_display_name: 'Eigandi',
      invitation_kind: 'identity_and_access',
      status: 'pending',
      roster: [{ display_name: 'Bjarni', position: 0, is_invited_guest: false }],
      expires_at: EXPIRES_AT,
      invited_at: INVITED_AT,
    }, error: null })
    await expect(getEventGuestAttendancePreview(ACTOR_ID, INVITATION_ID))
      .rejects.toThrow('event_load_failed')
  })

  it('rejects an impossible already-sent delivery replay with attempt zero', async () => {
    mockRpc.mockResolvedValueOnce({ data: {
      attempt_number: 0,
      can_send: false,
      reason: 'already_sent',
      recipient_email: null,
      email_template_version: null,
      event_name: null,
      guest_display_name: null,
      inviter_display_name: null,
      invitation_kind: null,
    }, error: null })
    await expect(reserveEventGuestAttendanceDelivery(
      ACTOR_ID,
      INVITATION_ID,
      REQUEST_ID,
      {
        recipientHash: 'a'.repeat(64),
        actorRecipientRateHash: 'b'.repeat(64),
        actorTotalRateHash: 'c'.repeat(64),
      },
      '2026-08-16',
    )).rejects.toThrow('event_save_failed')
  })

  it('maps a receipt-backed failed replay without exposing delivery context', async () => {
    mockRpc.mockResolvedValueOnce({ data: {
      attempt_number: 2,
      can_send: false,
      reason: 'already_failed',
      recipient_email: null,
      email_template_version: null,
      event_name: null,
      guest_display_name: null,
      inviter_display_name: null,
      invitation_kind: null,
    }, error: null })
    await expect(reserveEventGuestAttendanceDelivery(
      ACTOR_ID,
      INVITATION_ID,
      REQUEST_ID,
      {
        recipientHash: 'a'.repeat(64),
        actorRecipientRateHash: 'b'.repeat(64),
        actorTotalRateHash: 'c'.repeat(64),
      },
      '2026-08-16',
    )).resolves.toEqual({
      canSend: false,
      reason: 'already_failed',
      attemptNumber: 2,
    })
    expect(mockRpc).toHaveBeenCalledWith(
      'teskeid_event_reserve_guest_attendance_delivery',
      expect.objectContaining({ p_delivery_request_id: REQUEST_ID }),
    )
  })
})

describe('owner-safe financial event projections', () => {
  it('maps picker sources without emails or linked identities', async () => {
    mockRpc.mockResolvedValue({
      data: {
        events: [{
          event_id: EVENT_ID,
          name: 'Kvisskvöld',
          roster_revision: 2,
          guests: [{
            event_guest_id: GUEST_ID,
            display_name: 'Anna',
            source_kind: 'manual_name',
            position: 0,
          }],
        }],
      },
      error: null,
    })
    const expected = [{
      id: EVENT_ID,
      name: 'Kvisskvöld',
      rosterRevision: 2,
      guests: [{ id: GUEST_ID, displayName: 'Anna', sourceKind: 'manual_name' }],
    }]
    await expect(listEventExpenseSources(ACTOR_ID)).resolves.toEqual(expected)
    mockRpc.mockClear()
    mockRpc.mockResolvedValue({ data: {
      event_id: EVENT_ID,
      name: 'Kvisskvöld',
      roster_revision: 2,
      guests: [{
        event_guest_id: GUEST_ID,
        display_name: 'Anna',
        source_kind: 'manual_name',
        position: 0,
      }],
    }, error: null })
    await expect(getOwnedEventExpenseSource(ACTOR_ID, EVENT_ID)).resolves.toEqual(expected[0])
    expect(mockRpc).toHaveBeenLastCalledWith('teskeid_event_get_expense_source', {
      p_actor_id: ACTOR_ID,
      p_event_id: EVENT_ID,
    })
  })

  it('uses an exact owner-scoped lookup rather than the bounded recent-event directory', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        event_id: EVENT_ID,
        name: 'Elsti viðburðurinn',
        roster_revision: 8,
        guests: [],
      },
      error: null,
    })

    await expect(getOwnedEventExpenseSource(ACTOR_ID, EVENT_ID)).resolves.toMatchObject({
      id: EVENT_ID,
      name: 'Elsti viðburðurinn',
      rosterRevision: 8,
    })
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_get_expense_source', expect.any(Object))
  })

  it('maps exact ready preview status, transfers, pending counts and blocked reasons', async () => {
    mockRpc.mockResolvedValue({
      data: {
        event_id: EVENT_ID,
        status: 'ready',
        tagged_expense_count: 2,
        currencies: [{
          currency: 'ISK',
          state: 'open',
          transfers: [{
            from_party_id: PARTY_A,
            to_party_id: PARTY_B,
            from_display_name: 'Anna',
            to_display_name: 'Bjarni',
            amount_minor: 12500,
          }],
          pending_repayment_count: 0,
          blocked_parties: [],
        }, {
          currency: 'EUR',
          state: 'pending',
          transfers: [],
          pending_repayment_count: 1,
          blocked_parties: [{
            party_id: PARTY_A,
            display_name: 'Anna',
            reason: 'unresolved_identity',
          }],
        }],
      },
      error: null,
    })

    await expect(getEventExpensePreview(ACTOR_ID, EVENT_ID)).resolves.toEqual({
      eventId: EVENT_ID,
      status: 'ready',
      taggedExpenseCount: 2,
      currencies: [{
        currency: 'ISK',
        state: 'open',
        transfers: [{
          fromPartyId: PARTY_A,
          toPartyId: PARTY_B,
          fromDisplayName: 'Anna',
          toDisplayName: 'Bjarni',
          amountMinor: 12500,
        }],
        pendingRepaymentCount: 0,
        blocked: [],
      }, {
        currency: 'EUR',
        state: 'pending',
        transfers: [],
        pendingRepaymentCount: 1,
        blocked: [{
          partyId: PARTY_A,
          displayName: 'Anna',
          reason: 'unresolved_identity',
        }],
      }],
    })
  })

  it('rejects source email leaks and inconsistent preview states', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { events: [{
        event_id: EVENT_ID,
        name: 'Kvisskvöld',
        roster_revision: 1,
        guests: [{
          event_guest_id: GUEST_ID,
          display_name: 'Anna',
          source_kind: 'manual_email',
          position: 0,
          email: 'private@example.is',
        }],
      }] },
      error: null,
    })
    await expect(listEventExpenseSources(ACTOR_ID)).rejects.toThrow('event_load_failed')

    mockRpc.mockResolvedValueOnce({
      data: {
        event_id: EVENT_ID,
        status: 'none_tagged',
        tagged_expense_count: 1,
        currencies: [],
      },
      error: null,
    })
    await expect(getEventExpensePreview(ACTOR_ID, EVENT_ID)).rejects.toThrow('event_preview_failed')

    mockRpc.mockResolvedValueOnce({
      data: {
        event_id: EVENT_ID,
        status: 'ready',
        tagged_expense_count: 2,
        currencies: [],
      },
      error: null,
    })
    await expect(getEventExpensePreview(ACTOR_ID, EVENT_ID)).rejects.toThrow('event_preview_failed')
  })

  it.each([
    {
      name: 'an open state without an actionable transfer',
      currency: {
        currency: 'ISK', state: 'open', transfers: [],
        pending_repayment_count: 0, blocked_parties: [],
      },
    },
    {
      name: 'a blocked state with a pending repayment',
      currency: {
        currency: 'ISK', state: 'blocked_manual', transfers: [],
        pending_repayment_count: 1,
        blocked_parties: [{
          party_id: PARTY_A, display_name: 'Anna', reason: 'unresolved_identity',
        }],
      },
    },
    {
      name: 'a pending state with no pending repayment',
      currency: {
        currency: 'ISK', state: 'pending', transfers: [],
        pending_repayment_count: 0, blocked_parties: [],
      },
    },
    {
      name: 'a self-transfer',
      currency: {
        currency: 'ISK', state: 'open', pending_repayment_count: 0, blocked_parties: [],
        transfers: [{
          from_party_id: PARTY_A, to_party_id: PARTY_A,
          from_display_name: 'Anna', to_display_name: 'Anna', amount_minor: 100,
        }],
      },
    },
    {
      name: 'duplicate transfers for the same bilateral pair',
      currency: {
        currency: 'ISK', state: 'open', pending_repayment_count: 0, blocked_parties: [],
        transfers: [{
          from_party_id: PARTY_A, to_party_id: PARTY_B,
          from_display_name: 'Anna', to_display_name: 'Bjarni', amount_minor: 50,
        }, {
          from_party_id: PARTY_B, to_party_id: PARTY_A,
          from_display_name: 'Bjarni', to_display_name: 'Anna', amount_minor: 50,
        }],
      },
    },
    {
      name: 'a blocked party included in a transfer',
      currency: {
        currency: 'ISK', state: 'pending', pending_repayment_count: 1,
        transfers: [{
          from_party_id: PARTY_A, to_party_id: PARTY_B,
          from_display_name: 'Anna', to_display_name: 'Bjarni', amount_minor: 50,
        }],
        blocked_parties: [{
          party_id: PARTY_A, display_name: 'Anna', reason: 'unresolved_identity',
        }],
      },
    },
  ])('rejects $name in a ready preview', async ({ currency }) => {
    mockRpc.mockResolvedValue({
      data: {
        event_id: EVENT_ID,
        status: 'ready',
        tagged_expense_count: 1,
        currencies: [currency],
      },
      error: null,
    })

    await expect(getEventExpensePreview(ACTOR_ID, EVENT_ID))
      .rejects.toThrow('event_preview_failed')
  })
})

describe('legacy SQL131 classifier and direct mutation contracts', () => {
  it('preserves only the bounded legacy classifier RPC', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await expect(isExpenseEventContext(ACTOR_ID, EVENT_ID)).resolves.toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('expense_is_event_context', {
      p_actor_id: ACTOR_ID,
      p_group_id: EVENT_ID,
    })
  })

  it('returns exact create and roster mutation identities', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: {
        event_id: EVENT_ID, roster_revision: 1, invitations: [],
      }, error: null })
      .mockResolvedValueOnce({ data: {
        event_id: EVENT_ID, roster_revision: 2, invitations: [],
      }, error: null })
    await expect(createEventContext(ACTOR_ID, {
      request_id: REQUEST_ID,
      name: 'Kvisskvöld',
      guests: [],
    })).resolves.toEqual({ eventId: EVENT_ID, rosterRevision: 1, invitations: [] })
    await expect(replaceEventRoster(ACTOR_ID, {
      event_id: EVENT_ID,
      request_id: REQUEST_ID,
      expected_roster_revision: 1,
      guests: [],
    })).resolves.toEqual({ eventId: EVENT_ID, rosterRevision: 2, invitations: [] })
  })
})
