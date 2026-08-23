import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdmin, mockRpc } = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))

import {
  eventV3SafeRpcDiagnostic,
  eventV3SafeSchemaDiagnostic,
  getEventActorViewV3,
  leaveEventParticipationV3,
  resolveEventInvitationV3,
  setEventRsvpV3,
} from '@/lib/events/participant-identity-v3.repository.server'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const OTHER_ACTOR_ID = '10000000-0000-4000-8000-000000000002'
const EVENT_ID = '20000000-0000-4000-8000-000000000001'
const GUEST_ID = '30000000-0000-4000-8000-000000000001'
const INVITATION_ID = '40000000-0000-4000-8000-000000000001'
const REQUEST_ID = '50000000-0000-4000-8000-000000000001'

const RSVP_INPUT = {
  event_id: EVENT_ID,
  event_guest_id: GUEST_ID,
  identity_generation: '3',
  rsvp_state: 'considering' as const,
  private_note: 'Er að redda pössun',
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
  mockGetAdmin.mockReturnValue({ rpc: mockRpc })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('SQL153 participant identity v3 repository', () => {
  it('sends the strict RSVP identity-generation payload and validates an updated version echo', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        status: 'updated',
        request_id: REQUEST_ID,
        event_id: EVENT_ID,
        event_guest_id: GUEST_ID,
        identity_generation: '3',
        access_state: 'active',
        access_version: '11',
        rsvp_state: 'considering',
        decision_version: '8',
      },
      error: null,
    })

    await expect(setEventRsvpV3(ACTOR_ID, {
      ...RSVP_INPUT,
      private_note: '  Er að redda pössun  ',
    })).resolves.toEqual({
      status: 'updated',
      requestId: REQUEST_ID,
      eventId: EVENT_ID,
      eventGuestId: GUEST_ID,
      identityGeneration: '3',
      accessState: 'active',
      accessVersion: '11',
      rsvpState: 'considering',
      decisionVersion: '8',
    })
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_set_rsvp_v3', {
      p_actor_id: ACTOR_ID,
      p_event_id: EVENT_ID,
      p_event_guest_id: GUEST_ID,
      p_identity_generation: '3',
      p_rsvp_state: 'considering',
      p_private_note: 'Er að redda pössun',
      p_expected_decision_version: '7',
      p_request_id: REQUEST_ID,
    })
  })

  it.each([
    { status: 'updated', request_id: OTHER_ACTOR_ID, decision_version: '8' },
    { status: 'updated', request_id: REQUEST_ID, decision_version: '7' },
    { status: 'unchanged', request_id: REQUEST_ID, decision_version: '8' },
  ])('fails closed on a mismatched RSVP mutation echo %#', async (drift) => {
    mockRpc.mockResolvedValueOnce({
      data: {
        status: drift.status,
        request_id: drift.request_id,
        event_id: EVENT_ID,
        event_guest_id: GUEST_ID,
        identity_generation: '3',
        access_state: 'active',
        access_version: '11',
        rsvp_state: 'considering',
        decision_version: drift.decision_version,
      },
      error: null,
    })
    await expect(setEventRsvpV3(ACTOR_ID, RSVP_INPUT))
      .rejects.toMatchObject({ code: 'save_failed', message: 'event_v3_save_failed' })
  })

  it('passes every leave closure fence and accepts only the exact correlated versions', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        status: 'left',
        request_id: REQUEST_ID,
        event_id: EVENT_ID,
        event_guest_id: GUEST_ID,
        identity_generation: '3',
        identity_version: '5',
        access_version: '12',
      },
      error: null,
    })
    await expect(leaveEventParticipationV3(ACTOR_ID, LEAVE_INPUT)).resolves.toEqual({
      status: 'left',
      requestId: REQUEST_ID,
      eventId: EVENT_ID,
      eventGuestId: GUEST_ID,
      identityGeneration: '3',
      identityVersion: '5',
      accessVersion: '12',
    })
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_leave_participation_v3', {
      p_actor_id: ACTOR_ID,
      p_event_id: EVENT_ID,
      p_event_guest_id: GUEST_ID,
      p_identity_generation: '3',
      p_expected_identity_version: '5',
      p_expected_access_version: '11',
      p_request_id: REQUEST_ID,
    })

    mockRpc.mockResolvedValueOnce({
      data: {
        status: 'left',
        request_id: REQUEST_ID,
        event_id: EVENT_ID,
        event_guest_id: GUEST_ID,
        identity_generation: '3',
        identity_version: '6',
        access_version: '12',
      },
      error: null,
    })
    await expect(leaveEventParticipationV3(ACTOR_ID, LEAVE_INPUT))
      .rejects.toMatchObject({ code: 'save_failed' })
  })

  it('collapses resolver absence and denies malformed object references before transport', async () => {
    await expect(resolveEventInvitationV3('not-an-actor', INVITATION_ID)).resolves.toBeNull()
    expect(mockRpc).not.toHaveBeenCalled()

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'teskeid_event_not_allowed' },
    })
    await expect(resolveEventInvitationV3(ACTOR_ID, INVITATION_ID)).resolves.toBeNull()

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'prefix_teskeid_event_not_found_suffix actor@example.is' },
    })
    await expect(resolveEventInvitationV3(ACTOR_ID, INVITATION_ID))
      .rejects.toMatchObject({ code: 'load_failed', message: 'event_v3_load_failed' })
  })

  it('maps an exact fingerprint conflict without substring matching', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'teskeid_event_fingerprint_mismatch' },
    })
    await expect(setEventRsvpV3(ACTOR_ID, RSVP_INPUT))
      .rejects.toMatchObject({ code: 'conflict', message: 'event_v3_conflict' })
  })

  it('collapses only an exact actor-view authorization absence to null', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'teskeid_event_not_found' },
    })
    await expect(getEventActorViewV3(ACTOR_ID, EVENT_ID)).resolves.toBeNull()
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_get_actor_view_v3', {
      p_actor_id: ACTOR_ID,
      p_event_id: EVENT_ID,
    })
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'teskeid_event_not_allowed' },
    })
    await expect(getEventActorViewV3(ACTOR_ID, EVENT_ID)).resolves.toBeNull()
    expect(consoleError).not.toHaveBeenCalled()

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'prefix_teskeid_event_not_found_suffix' },
    })
    await expect(getEventActorViewV3(ACTOR_ID, EVENT_ID))
      .rejects.toMatchObject({ code: 'load_failed' })
  })

  it('reports only bounded database categories and sanitized schema paths', () => {
    const rpc = eventV3SafeRpcDiagnostic({
      code: '42883',
      message: `private ${ACTOR_ID} actor@example.is`,
    })
    expect(rpc).toEqual({
      postgresCode: '42883',
      category: 'undefined_function_or_operator',
    })
    expect(JSON.stringify(rpc)).not.toContain(ACTOR_ID)
    expect(JSON.stringify(rpc)).not.toContain('actor@example.is')

    const schema = eventV3SafeSchemaDiagnostic('actor_view', {
      issues: [{
        code: 'custom',
        path: ['people', 2, 'rsvp', 'actor@example.is'],
        message: `private ${ACTOR_ID}`,
      }],
    } as unknown as import('zod').ZodError)
    expect(schema).toEqual({
      schema: 'actor_view',
      issueCount: 1,
      issues: [{ code: 'custom', path: 'people[2].rsvp.?' }],
      truncated: false,
    })
    expect(JSON.stringify(schema)).not.toContain(ACTOR_ID)
    expect(JSON.stringify(schema)).not.toContain('actor@example.is')
  })

})
