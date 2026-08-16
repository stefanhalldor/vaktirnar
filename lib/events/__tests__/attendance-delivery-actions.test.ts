import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAdmin,
  mockGuardEventAccess,
  mockGuardEventSession,
  mockRevalidatePath,
  mockRpc,
  mockSendEmail,
} = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
  mockGuardEventAccess: vi.fn(),
  mockGuardEventSession: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRpc: vi.fn(),
  mockSendEmail: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))
vi.mock('@/lib/events/guard', () => ({
  guardEventAccess: mockGuardEventAccess,
  guardEventSession: mockGuardEventSession,
}))
vi.mock('@/lib/events/email', () => ({
  sendEventAttendanceInvitationEmail: mockSendEmail,
}))
vi.mock('@/lib/events/invitation-security.server', () => ({
  eventGuestAttendanceReykjavikDate: () => '2026-08-16',
  eventGuestAttendanceSecurityContext: ({ recipientEmail }: { recipientEmail: string }) => ({
    canonicalEmail: recipientEmail,
    recipientHash: 'a'.repeat(64),
    actorRecipientRateHash: 'b'.repeat(64),
    actorTotalRateHash: 'c'.repeat(64),
  }),
}))

import {
  createEvent,
  inviteEventGuestAttendance,
  leaveEventAttendance,
  resendEventGuestAttendanceInvitation,
  respondEventGuestAttendanceInvitation,
} from '@/lib/events/actions'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const REQUEST_ID = '20000000-0000-4000-8000-000000000001'
const SECOND_REQUEST_ID = '20000000-0000-4000-8000-000000000002'
const EVENT_ID = '30000000-0000-4000-8000-000000000001'
const INVITED_AT = '2026-08-16T09:00:00.000Z'
const EXPIRES_AT = '2026-08-23T09:00:00.000Z'

function indexedUuid(prefix: string, index: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function invitations(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    invitation_id: indexedUuid('8', index),
    event_guest_id: indexedUuid('9', index),
    invitation_kind: 'access_only',
    recipient_label: 'g***@example.is',
    invited_at: INVITED_AT,
    expires_at: EXPIRES_AT,
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAdmin.mockReturnValue({ rpc: mockRpc })
  mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
  mockGuardEventSession.mockResolvedValue({ user: { id: ACTOR_ID, email: 'guest@example.is' } })
})

describe('bounded-concurrency post-commit attendance delivery', () => {
  it('awaits every one of 49 committed IDs, calls at most four providers, and reports 20/29 honestly', async () => {
    const committed = invitations(49)
    let releaseProvider!: () => void
    const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve })
    let activeProviders = 0
    let maxActiveProviders = 0
    mockSendEmail.mockImplementation(async () => {
      activeProviders += 1
      maxActiveProviders = Math.max(maxActiveProviders, activeProviders)
      await providerGate
      activeProviders -= 1
      return 'sent'
    })
    mockRpc.mockImplementation(async (name: string, args: Record<string, string>) => {
      if (name === 'teskeid_event_create_with_attendance_invitations') {
        return { data: { event_id: EVENT_ID, roster_revision: 1, invitations: committed }, error: null }
      }
      const index = committed.findIndex((row) => row.invitation_id === args.p_invitation_id)
      if (name === 'teskeid_event_prepare_guest_attendance_delivery') {
        return { data: {
          invitation_id: committed[index]!.invitation_id,
          event_id: EVENT_ID,
          event_guest_id: committed[index]!.event_guest_id,
          recipient_email: `guest${index}@example.is`,
        }, error: null }
      }
      if (name === 'teskeid_event_reserve_guest_attendance_delivery') {
        return index < 20 ? { data: {
          attempt_number: 1,
          can_send: true,
          reason: 'ok',
          recipient_email: `guest${index}@example.is`,
          email_template_version: 'event-attendance-v1',
          event_name: 'Kvisskvöld',
          guest_display_name: `Gestur ${index}`,
          inviter_display_name: 'Eigandi',
          invitation_kind: 'access_only',
        }, error: null } : { data: {
          attempt_number: 0,
          can_send: false,
          reason: 'rate_limited',
          recipient_email: null,
          email_template_version: null,
          event_name: null,
          guest_display_name: null,
          inviter_display_name: null,
          invitation_kind: null,
        }, error: null }
      }
      if (name === 'teskeid_event_update_guest_attendance_delivery') {
        return { data: 'ok', error: null }
      }
      throw new Error(`unexpected RPC ${name}`)
    })

    let settled = false
    const resultPromise = createEvent({ request_id: REQUEST_ID, name: 'Kvisskvöld', guests: [] })
      .finally(() => { settled = true })
    await vi.waitFor(() => expect(mockSendEmail).toHaveBeenCalledTimes(4))
    expect(settled).toBe(false)
    expect(maxActiveProviders).toBe(4)
    releaseProvider()

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      data: {
        eventId: EVENT_ID,
        rosterRevision: 1,
        invitationCount: 49,
        deliveredCount: 20,
        deliveryIssue: true,
      },
    })
    expect(mockRpc.mock.calls.filter(([name]) => (
      name === 'teskeid_event_prepare_guest_attendance_delivery'
    ))).toHaveLength(49)
    expect(mockRpc.mock.calls.filter(([name]) => (
      name === 'teskeid_event_reserve_guest_attendance_delivery'
    ))).toHaveLength(49)
    const reserveCalls = mockRpc.mock.calls.filter(([name]) => (
      name === 'teskeid_event_reserve_guest_attendance_delivery'
    ))
    expect(reserveCalls.every(([, args]) => (
      args.p_delivery_request_id === args.p_invitation_id
    ))).toBe(true)
    expect(new Set(reserveCalls.map(([, args]) => args.p_delivery_request_id)).size).toBe(49)
    expect(mockSendEmail).toHaveBeenCalledTimes(20)
    expect(maxActiveProviders).toBeLessThanOrEqual(4)
  })

  it('uses stable per-invitation delivery receipts so a V2 mutation replay sends no duplicate email', async () => {
    const committed = invitations(3)
    const sentDeliveryRequests = new Set<string>()
    mockSendEmail.mockResolvedValue('sent')
    mockRpc.mockImplementation(async (name: string, args: Record<string, string>) => {
      if (name === 'teskeid_event_create_with_attendance_invitations') {
        return { data: { event_id: EVENT_ID, roster_revision: 1, invitations: committed }, error: null }
      }
      const index = committed.findIndex((row) => row.invitation_id === args.p_invitation_id)
      if (name === 'teskeid_event_prepare_guest_attendance_delivery') {
        return { data: {
          invitation_id: committed[index]!.invitation_id,
          event_id: EVENT_ID,
          event_guest_id: committed[index]!.event_guest_id,
          recipient_email: `guest${index}@example.is`,
        }, error: null }
      }
      if (name === 'teskeid_event_reserve_guest_attendance_delivery') {
        if (sentDeliveryRequests.has(args.p_delivery_request_id)) return { data: {
          attempt_number: 1,
          can_send: false,
          reason: 'already_sent',
          recipient_email: null,
          email_template_version: null,
          event_name: null,
          guest_display_name: null,
          inviter_display_name: null,
          invitation_kind: null,
        }, error: null }
        return { data: {
          attempt_number: 1,
          can_send: true,
          reason: 'ok',
          recipient_email: `guest${index}@example.is`,
          email_template_version: 'event-attendance-v1',
          event_name: 'Kvisskvöld',
          guest_display_name: `Gestur ${index}`,
          inviter_display_name: 'Eigandi',
          invitation_kind: 'access_only',
        }, error: null }
      }
      if (name === 'teskeid_event_update_guest_attendance_delivery') {
        sentDeliveryRequests.add(args.p_invitation_id)
        return { data: 'ok', error: null }
      }
      throw new Error(`unexpected RPC ${name}`)
    })

    const input = { request_id: REQUEST_ID, name: 'Kvisskvöld', guests: [] }
    await expect(createEvent(input)).resolves.toMatchObject({
      ok: true,
      data: { invitationCount: 3, deliveredCount: 3, deliveryIssue: false },
    })
    await expect(createEvent(input)).resolves.toMatchObject({
        ok: true,
        data: { invitationCount: 3, deliveredCount: 3, deliveryIssue: false },
      })
    expect(mockSendEmail).toHaveBeenCalledTimes(3)
    const replayRequestIds = mockRpc.mock.calls.filter(([name]) => (
      name === 'teskeid_event_reserve_guest_attendance_delivery'
    )).map(([, args]) => args.p_delivery_request_id)
    expect(replayRequestIds).toHaveLength(6)
    for (const invitation of committed) {
      expect(replayRequestIds.filter((id) => id === invitation.invitation_id)).toHaveLength(2)
    }
  })

  it('continues later committed IDs when one worker pipeline throws', async () => {
    const committed = invitations(6)
    mockRpc.mockImplementation(async (name: string, args: Record<string, string>) => {
      if (name === 'teskeid_event_create_with_attendance_invitations') {
        return { data: { event_id: EVENT_ID, roster_revision: 1, invitations: committed }, error: null }
      }
      const index = committed.findIndex((row) => row.invitation_id === args.p_invitation_id)
      if (name === 'teskeid_event_prepare_guest_attendance_delivery') {
        if (index === 2) return { data: null, error: { message: 'bounded preparation failure' } }
        return { data: {
          invitation_id: committed[index]!.invitation_id,
          event_id: EVENT_ID,
          event_guest_id: committed[index]!.event_guest_id,
          recipient_email: `guest${index}@example.is`,
        }, error: null }
      }
      if (name === 'teskeid_event_reserve_guest_attendance_delivery') {
        return { data: {
          attempt_number: 1,
          can_send: false,
          reason: 'already_sent',
          recipient_email: null,
          email_template_version: null,
          event_name: null,
          guest_display_name: null,
          inviter_display_name: null,
          invitation_kind: null,
        }, error: null }
      }
      throw new Error(`unexpected RPC ${name}`)
    })

    await expect(createEvent({ request_id: REQUEST_ID, name: 'Kvisskvöld', guests: [] }))
      .resolves.toMatchObject({
        ok: true,
        data: { invitationCount: 6, deliveredCount: 5, deliveryIssue: true },
      })
    expect(mockRpc.mock.calls.filter(([name]) => (
      name === 'teskeid_event_prepare_guest_attendance_delivery'
    ))).toHaveLength(6)
    expect(mockRpc.mock.calls.filter(([name]) => (
      name === 'teskeid_event_reserve_guest_attendance_delivery'
    ))).toHaveLength(5)
  })

  it('reports a durable explicit invitation as saved when delivery preparation fails', async () => {
    const invitationId = indexedUuid('8', 1)
    const guestId = indexedUuid('9', 1)
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'teskeid_event_invite_guest_attendance') {
        return { data: {
          status: 'pending',
          invitation_id: invitationId,
          event_guest_id: guestId,
          invitation_kind: 'identity_and_access',
          roster_revision: 1,
          recipient_label: 'g***@example.is',
          attempt_number: 0,
          delivery_status: 'not_sent',
          invited_at: INVITED_AT,
          expires_at: EXPIRES_AT,
        }, error: null }
      }
      if (name === 'teskeid_event_prepare_guest_attendance_delivery') {
        return { data: null, error: { message: 'provider seam unavailable' } }
      }
      throw new Error(`unexpected RPC ${name}`)
    })

    await expect(inviteEventGuestAttendance({
      event_id: EVENT_ID,
      event_guest_id: guestId,
      expected_roster_revision: 1,
      request_id: REQUEST_ID,
      recipient_email: 'guest@example.is',
    })).resolves.toEqual({
      ok: true,
      data: {
        invitationId,
        invitationKind: 'identity_and_access',
        rosterRevision: 1,
        delivery: 'uncertain',
      },
    })
  })

  it('replays the same resend receipt without a provider call and lets a new intent send the next attempt', async () => {
    const invitationId = indexedUuid('8', 1)
    const guestId = indexedUuid('9', 1)
    const sentRequests = new Set<string>()
    let reservedRequestId: string | null = null
    mockSendEmail.mockResolvedValue('sent')
    mockRpc.mockImplementation(async (name: string, args: Record<string, string>) => {
      if (name === 'teskeid_event_prepare_guest_attendance_delivery') return { data: {
        invitation_id: invitationId,
        event_id: EVENT_ID,
        event_guest_id: guestId,
        recipient_email: 'guest@example.is',
      }, error: null }
      if (name === 'teskeid_event_reserve_guest_attendance_delivery') {
        const requestId = args.p_delivery_request_id
        const attemptNumber = requestId === REQUEST_ID ? 2 : 3
        if (sentRequests.has(requestId)) return { data: {
          attempt_number: attemptNumber,
          can_send: false,
          reason: 'already_sent',
          recipient_email: null,
          email_template_version: null,
          event_name: null,
          guest_display_name: null,
          inviter_display_name: null,
          invitation_kind: null,
        }, error: null }
        reservedRequestId = requestId
        return { data: {
          attempt_number: attemptNumber,
          can_send: true,
          reason: 'ok',
          recipient_email: 'guest@example.is',
          email_template_version: 'event-attendance-v1',
          event_name: 'Kvisskvöld',
          guest_display_name: 'Gestur',
          inviter_display_name: 'Eigandi',
          invitation_kind: 'access_only',
        }, error: null }
      }
      if (name === 'teskeid_event_update_guest_attendance_delivery') {
        if (reservedRequestId) sentRequests.add(reservedRequestId)
        return { data: 'ok', error: null }
      }
      throw new Error(`unexpected RPC ${name}`)
    })
    const input = {
      event_id: EVENT_ID,
      event_guest_id: guestId,
      invitation_id: invitationId,
      request_id: REQUEST_ID,
    }

    await expect(resendEventGuestAttendanceInvitation(input))
      .resolves.toEqual({ ok: true, data: { delivery: 'sent' } })
    await expect(resendEventGuestAttendanceInvitation(input))
      .resolves.toEqual({ ok: true, data: { delivery: 'already_sent' } })
    await expect(resendEventGuestAttendanceInvitation({
      ...input,
      request_id: SECOND_REQUEST_ID,
    })).resolves.toEqual({ ok: true, data: { delivery: 'sent' } })
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    expect(mockSendEmail.mock.calls.map(([, , attempt]) => attempt)).toEqual([2, 3])
  })

  it('maps an exact failed receipt replay to a delivery issue without calling the provider', async () => {
    const invitationId = indexedUuid('8', 1)
    const guestId = indexedUuid('9', 1)
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'teskeid_event_prepare_guest_attendance_delivery') return { data: {
        invitation_id: invitationId,
        event_id: EVENT_ID,
        event_guest_id: guestId,
        recipient_email: 'guest@example.is',
      }, error: null }
      if (name === 'teskeid_event_reserve_guest_attendance_delivery') return { data: {
        attempt_number: 2,
        can_send: false,
        reason: 'already_failed',
        recipient_email: null,
        email_template_version: null,
        event_name: null,
        guest_display_name: null,
        inviter_display_name: null,
        invitation_kind: null,
      }, error: null }
      throw new Error(`unexpected RPC ${name}`)
    })

    await expect(resendEventGuestAttendanceInvitation({
      event_id: EVENT_ID,
      event_guest_id: guestId,
      invitation_id: invitationId,
      request_id: REQUEST_ID,
    })).resolves.toEqual({ ok: true, data: { delivery: 'failed' } })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('retries an uncertain reserved attempt with the same provider idempotency identity after reload', async () => {
    const invitationId = indexedUuid('8', 1)
    const guestId = indexedUuid('9', 1)
    mockSendEmail
      .mockResolvedValueOnce('uncertain')
      .mockResolvedValueOnce('sent')
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'teskeid_event_prepare_guest_attendance_delivery') return { data: {
        invitation_id: invitationId,
        event_id: EVENT_ID,
        event_guest_id: guestId,
        recipient_email: 'guest@example.is',
      }, error: null }
      if (name === 'teskeid_event_reserve_guest_attendance_delivery') return { data: {
        attempt_number: 2,
        can_send: true,
        reason: 'ok',
        recipient_email: 'guest@example.is',
        email_template_version: 'event-attendance-v1',
        event_name: 'Kvisskvöld',
        guest_display_name: 'Gestur',
        inviter_display_name: 'Eigandi',
        invitation_kind: 'access_only',
      }, error: null }
      if (name === 'teskeid_event_update_guest_attendance_delivery') {
        return { data: 'ok', error: null }
      }
      throw new Error(`unexpected RPC ${name}`)
    })
    const input = {
      event_id: EVENT_ID,
      event_guest_id: guestId,
      invitation_id: invitationId,
    }

    await expect(resendEventGuestAttendanceInvitation({
      ...input,
      request_id: REQUEST_ID,
    })).resolves.toEqual({ ok: true, data: { delivery: 'uncertain' } })
    await expect(resendEventGuestAttendanceInvitation({
      ...input,
      request_id: SECOND_REQUEST_ID,
    })).resolves.toEqual({ ok: true, data: { delivery: 'sent' } })
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    expect(mockSendEmail.mock.calls.map(([, id, attempt]) => [id, attempt])).toEqual([
      [invitationId, 2],
      [invitationId, 2],
    ])
  })
})

describe('session-only scoped attendance mutations', () => {
  it('allows exact SQL authorization to govern no-flag leave', async () => {
    mockRpc.mockResolvedValueOnce({ data: { status: 'left' }, error: null })
    await expect(leaveEventAttendance({
      event_id: EVENT_ID,
      request_id: REQUEST_ID,
    })).resolves.toEqual({ ok: true, data: { status: 'left' } })
    expect(mockGuardEventSession).toHaveBeenCalledTimes(1)
    expect(mockGuardEventAccess).not.toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_leave_attendance', {
      p_actor_id: ACTOR_ID,
      p_event_id: EVENT_ID,
      p_request_id: REQUEST_ID,
    })
  })

  it('uses the same session-only boundary for an invitation response', async () => {
    mockRpc.mockResolvedValueOnce({ data: { status: 'accepted' }, error: null })
    await expect(respondEventGuestAttendanceInvitation({
      invitation_id: indexedUuid('8', 1),
      action: 'accept',
      request_id: REQUEST_ID,
    })).resolves.toEqual({ ok: true, data: { status: 'accepted' } })
    expect(mockGuardEventSession).toHaveBeenCalledTimes(1)
    expect(mockGuardEventAccess).not.toHaveBeenCalled()
  })
})
