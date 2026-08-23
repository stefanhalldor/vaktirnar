import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdmin, mockRpc } = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))

import {
  createEventWithParticipationsV2,
  eventV2SafeActorViewSchemaDiagnostic,
  eventV2SafeRpcDiagnostic,
  getEventActorViewV2,
  getEventPersonSourceRosterV2,
  getEventRosterManagementV2,
  listEventPersonSourceEventsV2,
  listEventsForActorV2,
  repairEventPersonLabelV2,
  replaceEventRosterWithParticipationsV2,
  setEventRsvpV2,
} from '@/lib/events/participant-identity-v2.repository.server'

const actorId = '10000000-0000-4000-8000-000000000001'
const requestId = '10000000-0000-4000-8000-000000000002'
const eventId = '20000000-0000-4000-8000-000000000001'
const eventId2 = '20000000-0000-4000-8000-000000000002'
const organizerRef = '30000000-0000-4000-8000-000000000001'
const guestRef = '30000000-0000-4000-8000-000000000002'
const invitationId = '40000000-0000-4000-8000-000000000001'
const timestamp = '2026-08-21T15:00:00.000+00:00'

function organizer(isSelf = true) {
  return {
    person_ref: organizerRef,
    participant_kind: 'organizer',
    position: 0,
    is_self: isSelf,
    shared: {
      label_state: 'resolved',
      display_name: 'Stebbi',
      selectable: true,
      bulk_eligible: true,
      disabled_reason: null,
    },
  }
}

function guest(overrides: Record<string, unknown> = {}) {
  return {
    person_ref: guestRef,
    participant_kind: 'guest',
    position: 1,
    is_self: false,
    shared: {
      label_state: 'resolved',
      display_name: 'Berglind',
      access_state: 'active',
      rsvp_state: 'no_response',
      selectable: true,
      bulk_eligible: true,
      disabled_reason: null,
    },
    label_version: '1',
    identity_version: '2',
    identity_generation: '1',
    access_version: '3',
    rsvp_version: '4',
    ...overrides,
  }
}

function roster(overrides: Record<string, unknown> = {}) {
  return {
    event_id: eventId,
    name: 'Gönguferð',
    roster_revision: '9007199254740993',
    viewer_role: 'owner',
    people: [organizer(), guest()],
    ...overrides,
  }
}

function invitationReceipt() {
  return {
    invitation_id: invitationId,
    event_guest_id: guestRef,
    invitation_kind: 'identity_and_access',
    recipient_label: 'b***@example.is',
    invited_at: timestamp,
    expires_at: timestamp,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAdmin.mockReturnValue({ rpc: mockRpc })
})

describe('SQL149 participant identity v2 repository', () => {
  it('reports only bounded schema paths and codes for actor-view drift', () => {
    const result = eventV2SafeActorViewSchemaDiagnostic({
      issues: [
        {
          code: 'custom',
          path: ['people', 3, 'viewer_private', 'private@example.is'],
          message: `private ${actorId}`,
        },
      ],
    } as unknown as import('zod').ZodError)
    expect(result).toEqual({
      schema: 'actor_view',
      issueCount: 1,
      issues: [{
        code: 'custom',
        path: 'people[3].viewer_private.?',
      }],
      truncated: false,
    })
    expect(JSON.stringify(result)).not.toContain('private@example.is')
    expect(JSON.stringify(result)).not.toContain(actorId)
  })

  it('classifies development diagnostics without returning raw private values', () => {
    expect(eventV2SafeRpcDiagnostic({
      code: '42883',
      message: 'function pg_catalog.to_char(time without time zone, unknown) does not exist',
    })).toEqual({
      postgresCode: '42883',
      category: 'undefined_function_or_operator',
      subject: 'pg_catalog.to_char(time without time zone, unknown)',
    })
    const privateMessage = [
      'recipient alice@example.is',
      actorId,
      'could not be projected',
    ].join(' ')
    const diagnostic = eventV2SafeRpcDiagnostic({
      code: 'XX000',
      message: privateMessage,
    })
    expect(diagnostic).toEqual({
      postgresCode: 'XX000',
      category: 'unclassified_database_error',
    })
    expect(JSON.stringify(diagnostic)).not.toContain('alice@example.is')
    expect(JSON.stringify(diagnostic)).not.toContain(actorId)
  })

  it('passes an exact v2 cursor and preserves bigint strings', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        events: [{
          event_id: eventId,
          name: 'Gönguferð',
          roster_revision: '9007199254740993',
          viewer_role: 'owner',
          active_person_count: 2,
        }],
        next_cursor: { before_sort_at: timestamp, before_event_id: eventId },
      },
      error: null,
    })
    await expect(listEventPersonSourceEventsV2(
      actorId,
      { beforeSortAt: timestamp, beforeEventId: eventId2 },
      1,
    )).resolves.toEqual({
      events: [{
        id: eventId,
        name: 'Gönguferð',
        rosterRevision: '9007199254740993',
        viewerRole: 'owner',
        activePersonCount: 2,
      }],
      nextCursor: { beforeSortAt: timestamp, beforeEventId: eventId },
    })
    expect(mockRpc).toHaveBeenCalledWith(
      'teskeid_event_list_person_source_events_v2',
      {
        p_actor_id: actorId,
        p_before_sort_at: timestamp,
        p_before_event_id: eventId2,
        p_limit: 1,
      },
    )
  })

  it('maps owner and attendee rosters with structurally private relationship data', async () => {
    mockRpc.mockResolvedValueOnce({
      data: roster({
        people: [organizer(), guest({
          viewer_private: {
            kind: 'relationship',
            alias: 'Biggi',
            email: 'biggi@example.is',
            built_in_tags: ['family'],
            custom_labels: ['Golf'],
            hidden_custom_label_count: 3,
            note: null,
          },
        })],
      }),
      error: null,
    })
    const ownerResult = await getEventPersonSourceRosterV2(actorId, eventId)
    expect(ownerResult).toMatchObject({
      eventId,
      rosterRevision: '9007199254740993',
      viewerRole: 'owner',
      people: [{
        participantKind: 'organizer',
        shared: {
          labelState: 'resolved',
          displayName: 'Stebbi',
          selectable: true,
          bulkEligible: true,
          disabledReason: null,
        },
      }, {
        participantKind: 'guest',
        identityGeneration: '1',
        viewerPrivate: {
          alias: 'Biggi',
          email: 'biggi@example.is',
          builtInTags: ['family'],
          customLabels: ['Golf'],
          hiddenCustomLabelCount: 3,
        },
      }],
    })
    expect(ownerResult?.people[0]?.shared).not.toHaveProperty('accessState')
    expect(ownerResult?.people[0]?.shared).not.toHaveProperty('rsvpState')

    mockRpc.mockResolvedValueOnce({
      data: roster({
        viewer_role: 'attendee',
        people: [organizer(false), guest({ is_self: true })],
      }),
      error: null,
    })
    await expect(getEventPersonSourceRosterV2(actorId, eventId)).resolves.toMatchObject({
      viewerRole: 'attendee',
      people: [{ isSelf: false }, { isSelf: true }],
    })
    expect(mockRpc).toHaveBeenLastCalledWith(
      'teskeid_event_get_person_source_roster_v2',
      { p_actor_id: actorId, p_event_id: eventId },
    )
  })

  it.each([
    roster({ extra: true }),
    roster({ people: [organizer(), guest({ person_ref: organizerRef })] }),
    roster({ people: [organizer(), guest({ position: 2 })] }),
    roster({ people: [organizer(false), guest()] }),
    roster({ people: [organizer(), guest({ email: 'private@example.is' })] }),
    roster({ people: [organizer(), guest({ viewer_private: null })] }),
  ])('fails closed on roster drift, identity leakage or invariant mismatch %#', async (payload) => {
    mockRpc.mockResolvedValueOnce({ data: payload, error: null })
    await expect(getEventPersonSourceRosterV2(actorId, eventId))
      .rejects.toMatchObject({ code: 'load_failed' })
  })

  it('maps full Event list and actor view without mixing pending invitations', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        owned: [{
          event_id: eventId,
          name: 'Gönguferð',
          active_guest_count: 1,
          roster_revision: '2',
          viewer_role: 'owner',
          created_at: timestamp,
          updated_at: timestamp,
        }],
        participating: [{
          event_id: eventId2,
          name: 'Kvöldmatur',
          active_guest_count: 4,
          roster_revision: '8',
          viewer_role: 'attendee',
          self_rsvp_state: 'not_attending',
          created_at: timestamp,
          updated_at: timestamp,
        }],
      },
      error: null,
    })
    await expect(listEventsForActorV2(actorId)).resolves.toMatchObject({
      owned: [{ id: eventId, viewerRole: 'owner' }],
      participating: [{ id: eventId2, viewerRole: 'attendee', rsvpState: 'not_attending' }],
    })
    expect(mockRpc).toHaveBeenLastCalledWith(
      'teskeid_event_list_for_actor_v2',
      { p_actor_id: actorId },
    )

    mockRpc.mockResolvedValueOnce({
      data: {
        ...roster(),
        created_at: timestamp,
        updated_at: timestamp,
        event_date: '2026-08-21',
        event_time: '19:30:00',
        description: 'Lýsing',
        agenda: null,
      },
      error: null,
    })
    await expect(getEventActorViewV2(actorId, eventId)).resolves.toMatchObject({
      eventId,
      eventDate: '2026-08-21',
      eventTime: '19:30:00',
      viewerRole: 'owner',
    })
    expect(mockRpc).toHaveBeenLastCalledWith(
      'teskeid_event_get_actor_view_v2',
      { p_actor_id: actorId, p_event_id: eventId },
    )
  })

  it('keeps administrative email in its owner-only management DTO', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        event_id: eventId,
        name: 'Gönguferð',
        roster_revision: '2',
        viewer_role: 'owner',
        guests: [{
          event_guest_id: guestRef,
          position: 0,
          label_state: 'needs_owner_input',
          shared_display_name: null,
          label_version: '1',
          administrative_email: 'biggi@example.is',
          recipient_state: 'email_unbound',
          identity_version: '2',
          identity_generation: '1',
          access_state: 'active',
          access_version: '1',
          rsvp_state: 'no_response',
          rsvp_version: '1',
          invitation_status: 'pending',
        }],
      },
      error: null,
    })
    const result = await getEventRosterManagementV2(actorId, eventId)
    expect(result).toMatchObject({
      guests: [{
        administrativeEmail: 'biggi@example.is',
        recipientState: 'email_unbound',
        identityGeneration: '1',
        invitationStatus: 'pending',
      }],
    })
    expect(result?.guests[0]).not.toHaveProperty('sourceKind')
    expect(mockRpc).toHaveBeenLastCalledWith(
      'teskeid_event_get_roster_management_v2',
      { p_actor_id: actorId, p_event_id: eventId },
    )
  })

  it('sends the strict manual-email create payload and correlates request receipt', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        status: 'created',
        request_id: requestId,
        event_id: eventId,
        roster_revision: '1',
        invitations: [invitationReceipt()],
      },
      error: null,
    })
    await expect(createEventWithParticipationsV2(actorId, {
      request_id: requestId,
      name: 'Viðburður',
      guests: [{
        source_kind: 'manual_email',
        email: 'biggi@example.is',
        shared_display_name: 'Biggi',
      }],
      event_date: null,
      event_time: null,
      description: null,
      agenda: null,
    })).resolves.toMatchObject({
      status: 'created',
      requestId,
      eventId,
      rosterRevision: '1',
    })
    expect(mockRpc).toHaveBeenCalledWith(
      'teskeid_event_create_with_details_and_participations_v2',
      {
        p_actor_id: actorId,
        p_request_id: requestId,
        p_name: 'Viðburður',
        p_guests: [{
          source_kind: 'manual_email',
          email: 'biggi@example.is',
          shared_display_name: 'Biggi',
        }],
        p_event_date: null,
        p_event_time: null,
        p_description: null,
        p_agenda: null,
      },
    )
  })

  it('passes versions as decimal strings for replace, repair and RSVP', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        status: 'updated', request_id: requestId, event_id: eventId,
        roster_revision: '9007199254740994', invitations: [],
      },
      error: null,
    })
    await replaceEventRosterWithParticipationsV2(actorId, {
      event_id: eventId,
      request_id: requestId,
      expected_roster_revision: '9007199254740993',
      guests: [{ event_guest_id: guestRef }],
    })
    expect(mockRpc).toHaveBeenLastCalledWith(
      'teskeid_event_replace_roster_with_participations_v2',
      {
        p_actor_id: actorId,
        p_event_id: eventId,
        p_request_id: requestId,
        p_expected_roster_revision: '9007199254740993',
        p_guests: [{ event_guest_id: guestRef }],
      },
    )

    mockRpc.mockResolvedValueOnce({
      data: {
        status: 'updated', request_id: requestId, event_id: eventId,
        event_guest_id: guestRef, roster_revision: '8', label_version: '3',
      },
      error: null,
    })
    await repairEventPersonLabelV2(actorId, {
      event_id: eventId,
      event_guest_id: guestRef,
      expected_roster_revision: '7',
      expected_label_version: '2',
      shared_display_name: 'Biggi',
      request_id: requestId,
    })
    expect(mockRpc).toHaveBeenLastCalledWith(
      'teskeid_event_repair_person_label_v2',
      {
        p_actor_id: actorId,
        p_event_id: eventId,
        p_event_guest_id: guestRef,
        p_expected_roster_revision: '7',
        p_expected_label_version: '2',
        p_shared_display_name: 'Biggi',
        p_request_id: requestId,
      },
    )

    mockRpc.mockResolvedValueOnce({
      data: {
        status: 'updated', request_id: requestId, event_id: eventId,
        event_guest_id: guestRef, access_state: 'active', access_version: '1',
        rsvp_state: 'not_attending', rsvp_version: '3',
      },
      error: null,
    })
    await setEventRsvpV2(actorId, {
      event_id: eventId,
      event_guest_id: guestRef,
      rsvp_state: 'not_attending',
      expected_rsvp_version: '2',
      request_id: requestId,
    })
    expect(mockRpc).toHaveBeenLastCalledWith(
      'teskeid_event_set_rsvp_v2',
      {
        p_actor_id: actorId,
        p_event_id: eventId,
        p_event_guest_id: guestRef,
        p_rsvp_state: 'not_attending',
        p_expected_rsvp_version: '2',
        p_request_id: requestId,
      },
    )
  })

  it('rejects invalid input before transport and malformed or mismatched results', async () => {
    await expect(listEventPersonSourceEventsV2('not-a-uuid'))
      .rejects.toMatchObject({ code: 'invalid_input' })
    expect(mockRpc).not.toHaveBeenCalled()

    mockRpc.mockResolvedValueOnce({
      data: {
        status: 'updated', request_id: eventId2, event_id: eventId,
        event_guest_id: guestRef, roster_revision: '2', label_version: '2',
      },
      error: null,
    })
    await expect(repairEventPersonLabelV2(actorId, {
      event_id: eventId,
      event_guest_id: guestRef,
      expected_roster_revision: '1',
      expected_label_version: '1',
      shared_display_name: 'Biggi',
      request_id: requestId,
    })).rejects.toMatchObject({ code: 'save_failed' })
  })

  it('fails closed on duplicate event and invitation correlations', async () => {
    const summary = {
      event_id: eventId,
      name: 'Gönguferð',
      active_guest_count: 1,
      roster_revision: '2',
      created_at: timestamp,
      updated_at: timestamp,
    }
    mockRpc.mockResolvedValueOnce({
      data: {
        owned: [{ ...summary, viewer_role: 'owner' }],
        participating: [{
          ...summary,
          viewer_role: 'attendee',
          self_rsvp_state: 'no_response',
        }],
      },
      error: null,
    })
    await expect(listEventsForActorV2(actorId))
      .rejects.toMatchObject({ code: 'load_failed' })

    const receipt = invitationReceipt()
    mockRpc.mockResolvedValueOnce({
      data: {
        status: 'created', request_id: requestId, event_id: eventId,
        roster_revision: '1', invitations: [receipt, receipt],
      },
      error: null,
    })
    await expect(createEventWithParticipationsV2(actorId, {
      request_id: requestId,
      name: 'Viðburður',
      guests: [],
      event_date: null,
      event_time: null,
      description: null,
      agenda: null,
    })).rejects.toMatchObject({ code: 'save_failed' })
  })

  it.each([
    ['teskeid_event_guest_conflict', 'conflict'],
    ['teskeid_event_revision_conflict', 'conflict'],
    ['teskeid_event_label_version_conflict', 'conflict'],
    ['teskeid_event_rate_limited', 'rate_limited'],
    ['teskeid_event_invitation_rate_limited', 'rate_limited'],
    ['teskeid_event_invitation_recipient_unavailable', 'not_available'],
    ['teskeid_event_claim_limit_exceeded', 'not_available'],
  ])('maps exact SQL token %s to bounded code %s', async (message, code) => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message } })
    await expect(listEventsForActorV2(actorId)).rejects.toMatchObject({ code })
  })

  it('does not substring-match unknown SQL or transport errors', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'prefix_teskeid_event_not_found_suffix' },
    })
    await expect(getEventActorViewV2(actorId, eventId))
      .rejects.toMatchObject({ code: 'load_failed' })

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'network failed' } })
    await expect(listEventsForActorV2(actorId))
      .rejects.toMatchObject({ code: 'load_failed' })
  })

  it('bounds thrown read and mutation transports', async () => {
    mockRpc.mockRejectedValueOnce(new Error('private transport detail'))
    await expect(listEventsForActorV2(actorId))
      .rejects.toMatchObject({ code: 'load_failed', message: 'event_v2_load_failed' })

    mockRpc.mockRejectedValueOnce(new Error('private transport detail'))
    await expect(createEventWithParticipationsV2(actorId, {
      request_id: requestId,
      name: 'Viðburður',
      guests: [],
      event_date: null,
      event_time: null,
      description: null,
      agenda: null,
    })).rejects.toMatchObject({ code: 'save_failed', message: 'event_v2_save_failed' })
  })

  it('maps an unknown mutation SQL error to save_failed without leaking it', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'private_database_detail' },
    })
    await expect(createEventWithParticipationsV2(actorId, {
      request_id: requestId,
      name: 'Viðburður',
      guests: [],
      event_date: null,
      event_time: null,
      description: null,
      agenda: null,
    })).rejects.toMatchObject({ code: 'save_failed', message: 'event_v2_save_failed' })
  })

  it('collapses exact not-found and not-allowed reads without exposing existence', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'teskeid_event_not_found' } })
    await expect(getEventActorViewV2(actorId, eventId)).resolves.toBeNull()
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'teskeid_event_not_allowed' } })
    await expect(getEventPersonSourceRosterV2(actorId, eventId)).resolves.toBeNull()
  })
})
