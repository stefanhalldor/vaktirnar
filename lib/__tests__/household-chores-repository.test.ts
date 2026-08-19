import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({ rpc: mockRpc })),
}))

import * as repository from '@/lib/household-chores/repository.server'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const REQUEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_REQUEST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CIRCLE = '22222222-2222-4222-8222-222222222222'
const PARTICIPANT = '33333333-3333-4333-8333-333333333333'
const DEFINITION = '44444444-4444-4444-8444-444444444444'
const ASSIGNMENT = '55555555-5555-4555-8555-555555555555'
const INVITATION = '66666666-6666-4666-8666-666666666666'
const MEMBERSHIP = '77777777-7777-4777-8777-777777777777'
const RELATIONSHIP = '88888888-8888-4888-8888-888888888888'
const EVENT = '99999999-9999-4999-8999-999999999999'
const CREATED_AT = '2026-08-18T05:00:00+00:00'
const COMPLETED_AT = '2026-08-18T06:00:00+00:00'

function readEnvelope(code: string, data: unknown) {
  return { data: { ok: true, code, data }, error: null }
}

function completedHistoryItem() {
  return {
    event_id: EVENT,
    assignment_id: ASSIGNMENT,
    title: 'Ryksuga',
    event_type: 'completed',
    occurred_at: COMPLETED_AT,
    participant_label: 'Barn',
    participant_identity_marker: 'current',
    assignment_origin: 'member_assigned',
    snapshot_points: 10,
    status_after: 'completed',
    actor_kind: 'member',
    actor_label: 'Foreldri',
    completion_sequence: 1,
    completed_at: COMPLETED_AT,
    points_delta: 10,
  }
}

function memberCircleData() {
  return {
    viewer_type: 'member',
    circle: {
      circle_id: CIRCLE,
      name: 'Heima',
      display_reference: 'ABCD2345',
      version: '2',
      member_count: 2,
    },
    participants: [{
      participant_id: PARTICIPANT,
      label: 'Barn',
      identity_marker: 'current',
      status: 'active',
      version: '3',
    }],
    definitions: [{
      definition_id: DEFINITION,
      title: 'Ryksuga',
      status: 'active',
      version: '4',
    }],
    open_assignments: [{
      assignment_id: ASSIGNMENT,
      definition_id: DEFINITION,
      title: 'Ryksuga',
      participant_id: PARTICIPANT,
      participant_label: 'Barn',
      participant_identity_marker: 'current',
      points: 10,
      origin: 'member_assigned',
      status: 'open',
      version: '1',
      created_at: CREATED_AT,
      can_complete: true,
      can_cancel: true,
    }],
    recent_assignments: [completedHistoryItem()],
    point_totals: [{
      participant_id: PARTICIPANT,
      label: 'Barn',
      identity_marker: 'current',
      points: 10,
    }],
    memberships: [{
      membership_id: MEMBERSHIP,
      participant_id: PARTICIPANT,
      label: 'Barn',
      identity_marker: 'current',
      membership_type: 'member',
      status: 'active',
      version: '2',
      is_viewer: true,
    }],
    pending_invitations: [{
      invitation_id: INVITATION,
      invitee_label: 'Maki',
      requested_type: 'member',
      version: '1',
      expires_at: COMPLETED_AT,
    }],
  }
}

function childCircleData() {
  return {
    viewer_type: 'child',
    circle: { name: 'Heima', display_reference: 'ABCD2345' },
    own_participant_id: PARTICIPANT,
    participants: [{ participant_id: PARTICIPANT, label: 'Barn' }],
    definitions: [{ definition_id: DEFINITION, title: 'Ryksuga' }],
    open_assignments: [{
      assignment_id: ASSIGNMENT,
      title: 'Ryksuga',
      participant_label: 'Barn',
      points: 10,
      version: '1',
      can_complete: true,
      can_cancel: true,
    }],
    recent_assignments: [completedHistoryItem()],
    point_totals: [{ participant_id: PARTICIPANT, label: 'Barn', points: 10 }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Household Chores read repository', () => {
  it('maps the exact root projection and sends only the actor id', async () => {
    mockRpc.mockResolvedValue(readEnvelope('get_root_loaded', {
      circles: [{
        circle_id: CIRCLE,
        name: 'Heima',
        display_reference: 'ABCD2345',
        membership_type: 'member',
        open_count: 1,
      }],
      pending_invitations: [{
        invitation_id: INVITATION,
        circle_name: 'Annað heimili',
        display_reference: 'BCDE3456',
        inviter_label: 'Maki',
        requested_type: 'member',
        version: '1',
        expires_at: COMPLETED_AT,
        href: `/auth-mvp/heimilisverkin/bod/${INVITATION}`,
      }],
    }))

    await expect(repository.loadHouseholdChoreRoot(ACTOR)).resolves.toEqual({
      circles: [{
        circleId: CIRCLE,
        name: 'Heima',
        displayReference: 'ABCD2345',
        viewerType: 'member',
        openAssignmentCount: 1,
      }],
      pendingInvitations: [{
        invitationId: INVITATION,
        circleName: 'Annað heimili',
        displayReference: 'BCDE3456',
        inviterLabel: 'Maki',
        requestedType: 'member',
        version: '1',
        expiresAt: COMPLETED_AT,
        href: `/auth-mvp/verkefnin/bod/${INVITATION}`,
      }],
    })
    expect(mockRpc).toHaveBeenCalledWith('household_chore_get_root', {
      p_actor_id: ACTOR,
    })
  })

  it('discriminates the member payload before returning management data', async () => {
    mockRpc
      .mockResolvedValueOnce(readEnvelope('get_circle_loaded', memberCircleData()))
      .mockResolvedValueOnce(readEnvelope('participant_identity_links_loaded', {
        links: [{ invitation_id: INVITATION, participant_id: PARTICIPANT }],
      }))
    const result = await repository.loadHouseholdChoreCircle(ACTOR, CIRCLE)
    expect(result.viewerType).toBe('member')
    if (result.viewerType !== 'member') throw new Error('unexpected branch')
    expect(result.memberships).toHaveLength(1)
    expect(result.memberships[0]).toMatchObject({
      membershipType: 'member',
      isViewer: true,
    })
    expect(result.openAssignments[0]).toMatchObject({
      participantId: PARTICIPANT,
      definitionId: DEFINITION,
    })
    expect(result.pendingInvitations[0]).toMatchObject({ participantId: PARTICIPANT })
  })

  it('parses a child directly through the safe branch and returns no management keys', async () => {
    mockRpc.mockResolvedValue(readEnvelope('get_circle_loaded', childCircleData()))
    const result = await repository.loadHouseholdChoreCircle(ACTOR, CIRCLE)
    expect(result.viewerType).toBe('child')
    expect(result).not.toHaveProperty('memberships')
    expect(result).not.toHaveProperty('pendingInvitations')
    expect(result.circle).not.toHaveProperty('circleId')
    expect(result.openAssignments[0]).not.toHaveProperty('participantId')
  })

  it('rejects full-member keys embedded in a child response', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue(readEnvelope('get_circle_loaded', {
      ...childCircleData(),
      memberships: memberCircleData().memberships,
    }))
    await expect(repository.loadHouseholdChoreCircle(ACTOR, CIRCLE)).rejects.toMatchObject({
      code: 'save_failed',
    })
    errorSpy.mockRestore()
  })

  it('requires one exact full-member viewer marker in a member projection', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const payload = memberCircleData()
    payload.memberships[0].is_viewer = false
    mockRpc.mockResolvedValue(readEnvelope('get_circle_loaded', payload))
    await expect(repository.loadHouseholdChoreCircle(ACTOR, CIRCLE)).rejects.toMatchObject({
      code: 'save_failed',
    })
    errorSpy.mockRestore()
  })

  it.each([
    ['unknown email key', { email: 'private@example.com' }],
    ['auth identity key', { auth_user_id: ACTOR }],
  ])('fails closed on %s without projecting leaked data', async (_label, leaked) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const payload = memberCircleData()
    payload.participants[0] = { ...payload.participants[0], ...leaked }
    mockRpc.mockResolvedValue(readEnvelope('get_circle_loaded', payload))
    await expect(repository.loadHouseholdChoreCircle(ACTOR, CIRCLE)).rejects.toMatchObject({
      code: 'save_failed',
    })
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('private@example.com')
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(ACTOR)
    errorSpy.mockRestore()
  })

  it('rejects an email-like display label', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const payload = childCircleData()
    payload.participants[0].label = 'private@example.com'
    mockRpc.mockResolvedValue(readEnvelope('get_circle_loaded', payload))
    await expect(repository.loadHouseholdChoreCircle(ACTOR, CIRCLE)).rejects.toMatchObject({
      code: 'save_failed',
    })
    errorSpy.mockRestore()
  })

  it('rejects numeric bigint versions instead of coercing them', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const payload = memberCircleData()
    payload.circle.version = 2 as unknown as string
    mockRpc.mockResolvedValue(readEnvelope('get_circle_loaded', payload))
    await expect(repository.loadHouseholdChoreCircle(ACTOR, CIRCLE)).rejects.toMatchObject({
      code: 'save_failed',
    })
    errorSpy.mockRestore()
  })

  it('parses the repaired member-only definition detail with exact version tokens', async () => {
    mockRpc.mockResolvedValue(readEnvelope('get_definition_detail_v2_loaded', {
      definition: {
        definition_id: DEFINITION,
        title: 'Ryksuga',
        description: null,
        materials: null,
        status: 'active',
        version: '5',
        cadence_days: 7,
        completion_scope: 'global',
      },
      participant_values: [{
        participant_id: PARTICIPANT,
        label: 'Barn',
        identity_marker: 'current',
        participant_status: 'active',
        participant_version: '3',
        value_status: 'missing',
        value_version: '0',
        points: null,
      }],
    }))
    await expect(repository.loadHouseholdChoreDefinitionDetail(
      ACTOR, CIRCLE, DEFINITION,
    )).resolves.toMatchObject({
      definition: {
        definitionId: DEFINITION,
        version: '5',
        cadenceDays: 7,
        completionScope: 'global',
      },
      participantValues: [{
        participantId: PARTICIPANT,
        participantVersion: '3',
        valueVersion: '0',
      }],
    })
    expect(mockRpc).toHaveBeenCalledWith('household_chore_get_definition_detail_v2', {
      p_actor_id: ACTOR,
      p_circle_id: CIRCLE,
      p_definition_id: DEFINITION,
    })
  })

  it('rejects an inconsistent missing participant-value row', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue(readEnvelope('get_definition_detail_v2_loaded', {
      definition: {
        definition_id: DEFINITION,
        title: 'Ryksuga',
        description: null,
        materials: null,
        status: 'active',
        version: '5',
        cadence_days: 7,
        completion_scope: 'global',
      },
      participant_values: [{
        participant_id: PARTICIPANT,
        label: 'Barn',
        identity_marker: 'current',
        participant_status: 'active',
        participant_version: '3',
        value_status: 'missing',
        value_version: '2',
        points: 10,
      }],
    }))
    await expect(repository.loadHouseholdChoreDefinitionDetail(
      ACTOR, CIRCLE, DEFINITION,
    )).rejects.toMatchObject({ code: 'save_failed' })
    errorSpy.mockRestore()
  })

  it('parses authoritative member priority state and exact quick-completion token', async () => {
    mockRpc.mockResolvedValue(readEnvelope('get_priority_dashboard_loaded', {
      viewer_type: 'member',
      own_participant_id: PARTICIPANT,
      participants: [{
        participant_id: PARTICIPANT,
        label: 'Barn',
        identity_marker: 'current',
        is_viewer: true,
      }],
      definitions: [{
        definition_id: DEFINITION,
        title: 'Ryksuga',
        version: '4',
        cadence_days: 7,
        completion_scope: 'per_participant',
        priority_due_at: COMPLETED_AT,
        participant_states: [{
          participant_id: PARTICIPANT,
          label: 'Barn',
          identity_marker: 'current',
          points: 10,
          value_version: '3',
          baseline_at: CREATED_AT,
          due_at: COMPLETED_AT,
          expected_state_token: 'a'.repeat(64),
        }],
        open_assignments: [],
        open_assignment_count: 0,
      }],
    }))

    await expect(repository.loadHouseholdChorePriorityDashboard(
      ACTOR, CIRCLE,
    )).resolves.toMatchObject({
      viewerType: 'member',
      ownParticipantId: PARTICIPANT,
      definitions: [{
        completionScope: 'per_participant',
        participantStates: [{ expectedStateToken: 'a'.repeat(64) }],
      }],
    })
  })

  it('rejects a child priority payload containing full-member participant data', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue(readEnvelope('get_priority_dashboard_loaded', {
      viewer_type: 'child',
      own_participant_id: PARTICIPANT,
      participants: [{ participant_id: PARTICIPANT, label: 'Barn' }],
      definitions: [],
    }))
    await expect(repository.loadHouseholdChorePriorityDashboard(
      ACTOR, CIRCLE,
    )).rejects.toMatchObject({ code: 'save_failed' })
    errorSpy.mockRestore()
  })

  it('returns the full assignment projection only to a full member', async () => {
    mockRpc.mockResolvedValue(readEnvelope('get_assignment_loaded', {
      viewer_type: 'member',
      assignment: {
        assignment_id: ASSIGNMENT,
        circle_id: CIRCLE,
        definition_id: DEFINITION,
        participant_id: PARTICIPANT,
        title: 'Ryksuga',
        description: null,
        materials: null,
        participant_label: 'Barn',
        participant_identity_marker: 'current',
        points: 10,
        origin: 'member_assigned',
        status: 'open',
        completion_sequence: 0,
        version: '1',
        created_at: CREATED_AT,
        completed_at: null,
        cancelled_at: null,
      },
      timeline_preview: [{
        event_id: EVENT,
        assignment_id: ASSIGNMENT,
        title: 'Ryksuga',
        event_type: 'created',
        occurred_at: CREATED_AT,
        participant_label: 'Barn',
        participant_identity_marker: 'current',
        assignment_origin: 'member_assigned',
        snapshot_points: 10,
        status_after: 'open',
        actor_kind: 'member',
        actor_label: 'Foreldri',
      }],
    }))
    const result = await repository.loadHouseholdChoreAssignment(ACTOR, CIRCLE, ASSIGNMENT)
    expect(result.viewerType).toBe('member')
    if (result.viewerType !== 'member') throw new Error('expected member view')
    expect(result.assignment.participantId).toBe(PARTICIPANT)
    expect(result.timelinePreview[0]).toMatchObject({
      title: 'Ryksuga',
      completionSequence: null,
    })
  })

  it('returns a separate bounded child assignment projection without member identifiers', async () => {
    mockRpc.mockResolvedValue(readEnvelope('get_assignment_loaded', {
      viewer_type: 'child',
      assignment: {
        assignment_id: ASSIGNMENT,
        title: 'Ryksuga',
        description: null,
        materials: null,
        participant_label: 'Barn',
        participant_identity_marker: 'current',
        points: 10,
        origin: 'member_assigned',
        status: 'open',
        created_at: CREATED_AT,
        completed_at: null,
        cancelled_at: null,
        own_assignment: true,
        version: '1',
        can_complete: true,
        can_cancel: true,
      },
      timeline_preview: [],
    }))

    const result = await repository.loadHouseholdChoreAssignment(ACTOR, CIRCLE, ASSIGNMENT)
    expect(result).toMatchObject({
      viewerType: 'child',
      assignment: {
        assignmentId: ASSIGNMENT,
        ownAssignment: true,
        version: '1',
        canComplete: true,
        canCancel: true,
      },
    })
    expect(result.assignment).not.toHaveProperty('circleId')
    expect(result.assignment).not.toHaveProperty('definitionId')
    expect(result.assignment).not.toHaveProperty('participantId')
    expect(result.assignment).not.toHaveProperty('completionSequence')
  })

  function childAssignment(overrides: Record<string, unknown> = {}) {
    return {
      assignment_id: ASSIGNMENT,
      title: 'Ryksuga',
      description: null,
      materials: null,
      participant_label: 'Barn',
      participant_identity_marker: 'current',
      points: 10,
      origin: 'member_assigned',
      status: 'open',
      created_at: CREATED_AT,
      completed_at: null,
      cancelled_at: null,
      own_assignment: true,
      version: '1',
      can_complete: true,
      can_cancel: true,
      ...overrides,
    }
  }

  it('rejects forged child action capabilities', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue(readEnvelope('get_assignment_loaded', {
      viewer_type: 'child',
      assignment: childAssignment({ own_assignment: false }),
      timeline_preview: [],
    }))

    await expect(repository.loadHouseholdChoreAssignment(
      ACTOR, CIRCLE, ASSIGNMENT,
    )).rejects.toMatchObject({ code: 'save_failed' })
    errorSpy.mockRestore()
  })

  it('rejects PostgreSQL bigint overflow in a response version', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue(readEnvelope('get_assignment_loaded', {
      viewer_type: 'child',
      assignment: childAssignment({ version: '9223372036854775808' }),
      timeline_preview: [],
    }))
    await expect(repository.loadHouseholdChoreAssignment(
      ACTOR, CIRCLE, ASSIGNMENT,
    )).rejects.toMatchObject({ code: 'save_failed' })
    errorSpy.mockRestore()
  })

  it('rejects member-only identifiers injected into the child projection', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue(readEnvelope('get_assignment_loaded', {
      viewer_type: 'child',
      assignment: childAssignment({ participant_id: PARTICIPANT }),
      timeline_preview: [],
    }))
    await expect(repository.loadHouseholdChoreAssignment(
      ACTOR, CIRCLE, ASSIGNMENT,
    )).rejects.toMatchObject({ code: 'save_failed' })
    errorSpy.mockRestore()
  })

  it('passes a bounded history cursor as the frozen RPC parameters', async () => {
    mockRpc.mockResolvedValue(readEnvelope('get_definition_history_loaded', {
      items: [completedHistoryItem()],
      has_more: false,
      next_cursor: null,
    }))
    await repository.loadHouseholdChoreDefinitionHistory(ACTOR, CIRCLE, DEFINITION, {
      cursor: { occurredAt: COMPLETED_AT, eventId: EVENT },
      limit: 25,
    })
    expect(mockRpc).toHaveBeenCalledWith('household_chore_get_definition_history', {
      p_actor_id: ACTOR,
      p_circle_id: CIRCLE,
      p_definition_id: DEFINITION,
      p_cursor_at: COMPLETED_AT,
      p_cursor_id: EVENT,
      p_limit: 25,
    })
  })

  it('covers the remaining exact read RPC names and projections', async () => {
    mockRpc.mockResolvedValueOnce(readEnvelope('get_invitation_preview_loaded', {
      invitation_id: INVITATION,
      circle_name: 'Heima',
      display_reference: 'ABCD2345',
      inviter_label: 'Maki',
      requested_type: 'member',
      version: '1',
      expires_at: COMPLETED_AT,
      accept_available: true,
    }))
    await expect(repository.loadHouseholdChoreInvitationPreview(
      ACTOR, INVITATION,
    )).resolves.toMatchObject({ invitationId: INVITATION, acceptAvailable: true })
    expect(mockRpc).toHaveBeenLastCalledWith('household_chore_get_invitation_preview', {
      p_actor_id: ACTOR,
      p_invitation_id: INVITATION,
    })

    mockRpc.mockResolvedValueOnce(readEnvelope('get_memberships_loaded', {
      memberships: [{
        circle_id: CIRCLE,
        circle_name: 'Heima',
        display_reference: 'ABCD2345',
        membership_type: 'member',
        membership_status: 'active',
        circle_version: '2',
        membership_version: '3',
        can_leave: true,
        can_delete_circle: false,
      }],
      pending_invitations: [{
        invitation_id: INVITATION,
        circle_name: 'Annað heimili',
        display_reference: 'BCDE3456',
        inviter_label: 'Maki',
        requested_type: 'child',
        version: '1',
        expires_at: COMPLETED_AT,
        href: `/auth-mvp/heimilisverkin/bod/${INVITATION}`,
        accept_available: true,
      }],
    }))
    await expect(repository.loadHouseholdChoreMemberships(ACTOR)).resolves.toMatchObject({
      memberships: [{
        circleId: CIRCLE,
        membershipStatus: 'active',
        canLeave: true,
        canDeleteCircle: false,
      }],
      pendingInvitations: [{
        invitationId: INVITATION,
        href: `/auth-mvp/verkefnin/bod/${INVITATION}`,
        acceptAvailable: true,
      }],
    })
    expect(mockRpc).toHaveBeenLastCalledWith('household_chore_get_memberships', {
      p_actor_id: ACTOR,
    })

    mockRpc.mockResolvedValueOnce(readEnvelope('get_self_service_loaded', {
      circle_id: CIRCLE,
      participant_id: PARTICIPANT,
      items: [{
        definition_id: DEFINITION,
        title: 'Ryksuga',
        definition_version: '2',
        participant_value_version: '3',
        points: 10,
        own_open_count: 30,
      }],
    }))
    await expect(repository.loadHouseholdChoreSelfService(ACTOR, CIRCLE)).resolves.toMatchObject({
      circleId: CIRCLE,
      participantId: PARTICIPANT,
      items: [{ ownOpenCount: 30 }],
    })
    expect(mockRpc).toHaveBeenLastCalledWith('household_chore_get_self_service', {
      p_actor_id: ACTOR,
      p_circle_id: CIRCLE,
    })

    mockRpc.mockResolvedValueOnce(readEnvelope('get_assignment_timeline_loaded', {
      items: [completedHistoryItem()],
      has_more: false,
      next_cursor: null,
    }))
    await expect(repository.loadHouseholdChoreAssignmentTimeline(
      ACTOR, CIRCLE, ASSIGNMENT,
    )).resolves.toMatchObject({ items: [{ title: 'Ryksuga' }], hasMore: false })
    expect(mockRpc).toHaveBeenLastCalledWith('household_chore_get_assignment_timeline', {
      p_actor_id: ACTOR,
      p_circle_id: CIRCLE,
      p_assignment_id: ASSIGNMENT,
      p_cursor_at: null,
      p_cursor_id: null,
      p_limit: 20,
    })
  })

  it.each([
    ['child', true, false],
    ['member', true, false],
    ['member', false, true],
  ] as const)(
    'maps server-derived membership capabilities for %s (leave=%s delete=%s)',
    async (membershipType, canLeave, canDeleteCircle) => {
      mockRpc.mockResolvedValue(readEnvelope('get_memberships_loaded', {
        memberships: [{
          circle_id: CIRCLE,
          circle_name: 'Heima',
          display_reference: 'ABCD2345',
          membership_type: membershipType,
          membership_status: 'active',
          circle_version: '2',
          membership_version: '3',
          can_leave: canLeave,
          can_delete_circle: canDeleteCircle,
        }],
        pending_invitations: [],
      }))

      await expect(repository.loadHouseholdChoreMemberships(ACTOR)).resolves.toMatchObject({
        memberships: [{ canLeave, canDeleteCircle }],
      })
    },
  )

  it.each([
    ['child', false, false],
    ['child', true, true],
    ['member', false, false],
    ['member', true, true],
  ] as const)(
    'rejects impossible server-derived membership capabilities for %s',
    async (membershipType, canLeave, canDeleteCircle) => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mockRpc.mockResolvedValue(readEnvelope('get_memberships_loaded', {
        memberships: [{
          circle_id: CIRCLE,
          circle_name: 'Heima',
          display_reference: 'ABCD2345',
          membership_type: membershipType,
          membership_status: 'active',
          circle_version: '2',
          membership_version: '3',
          can_leave: canLeave,
          can_delete_circle: canDeleteCircle,
        }],
        pending_invitations: [],
      }))

      await expect(repository.loadHouseholdChoreMemberships(ACTOR)).rejects.toMatchObject({
        code: 'save_failed',
      })
      errorSpy.mockRestore()
    },
  )

  it('preserves a safe business failure code and hides malformed technical responses', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: false, code: 'not_found', data: {} },
      error: null,
    })
    await expect(repository.loadHouseholdChoreRoot(ACTOR)).rejects.toMatchObject({
      code: 'not_found',
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValueOnce({
      data: { ok: true, code: 'get_root_loaded', data: { secret: 'do-not-log' } },
      error: null,
    })
    await expect(repository.loadHouseholdChoreRoot(ACTOR)).rejects.toMatchObject({
      code: 'save_failed',
    })
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('do-not-log')
    errorSpy.mockRestore()
  })
})

function successResponse(rpcName: string, requestId: string) {
  const base = { resource_id: ASSIGNMENT, version: '2' }
  const map: Record<string, { code: string; data: Record<string, unknown> }> = {
    household_chore_create_circle: {
      code: 'circle_created',
      data: { resource_id: CIRCLE, version: '1', status: 'active', display_reference: 'ABCD2345' },
    },
    household_chore_rename_circle: { code: 'circle_renamed', data: { ...base, resource_id: CIRCLE, status: 'active' } },
    household_chore_delete_circle: { code: 'circle_deleted', data: { ...base, resource_id: CIRCLE, status: 'deleted' } },
    household_chore_create_invitation: { code: 'invitation_created', data: { ...base, resource_id: INVITATION, status: 'pending' } },
    household_chore_cancel_invitation: { code: 'invitation_cancelled', data: { ...base, resource_id: INVITATION, status: 'cancelled' } },
    household_chore_accept_invitation: {
      code: 'invitation_accepted',
      data: { ...base, resource_id: MEMBERSHIP, circle_id: CIRCLE, status: 'active', membership_type: 'member' },
    },
    household_chore_decline_invitation: { code: 'invitation_declined', data: { ...base, resource_id: INVITATION, status: 'declined' } },
    household_chore_change_membership_type: {
      code: 'membership_type_changed',
      data: { ...base, resource_id: MEMBERSHIP, status: 'active', membership_type: 'child' },
    },
    household_chore_remove_member: { code: 'membership_removed', data: { ...base, resource_id: MEMBERSHIP, status: 'removed' } },
    household_chore_leave_circle: { code: 'membership_left', data: { ...base, resource_id: MEMBERSHIP, status: 'left' } },
    household_chore_create_participant: { code: 'participant_created', data: { ...base, resource_id: PARTICIPANT, status: 'active' } },
    household_chore_rename_participant: { code: 'participant_renamed', data: { ...base, resource_id: PARTICIPANT, status: 'active' } },
    household_chore_link_participant: { code: 'participant_link_invitation_created', data: { ...base, resource_id: INVITATION, status: 'pending' } },
    household_chore_archive_participant: { code: 'participant_archived', data: { ...base, resource_id: PARTICIPANT, status: 'archived' } },
    household_chore_reactivate_participant: { code: 'participant_reactivated', data: { ...base, resource_id: PARTICIPANT, status: 'active' } },
    household_chore_create_definition_v2: { code: 'definition_created', data: { ...base, resource_id: DEFINITION, status: 'active' } },
    household_chore_update_definition_v2: { code: 'definition_updated', data: { ...base, resource_id: DEFINITION, status: 'active' } },
    household_chore_archive_definition: { code: 'definition_archived', data: { ...base, resource_id: DEFINITION, status: 'archived' } },
    household_chore_reactivate_definition: { code: 'definition_reactivated', data: { ...base, resource_id: DEFINITION, status: 'active' } },
    household_chore_set_participant_value: {
      code: 'participant_value_set', data: { ...base, status: 'active', points: 10 },
    },
    household_chore_assign: { code: 'assignment_created', data: { ...base, status: 'open' } },
    household_chore_self_assign: { code: 'assignment_created', data: { ...base, status: 'open' } },
    household_chore_repeat_assignment: {
      code: 'assignment_repeated', data: { ...base, source_assignment_id: ASSIGNMENT, status: 'open' },
    },
    household_chore_complete_assignment: {
      code: 'assignment_completed', data: { ...base, status: 'completed', completion_sequence: '1', points_delta: 10 },
    },
    household_chore_complete_definition: {
      code: 'assignment_completed',
      data: {
        ...base,
        definition_id: DEFINITION,
        participant_id: PARTICIPANT,
        status: 'completed',
        completion_sequence: '1',
        points_delta: 10,
      },
    },
    household_chore_cancel_assignment: {
      code: 'assignment_cancelled', data: { ...base, status: 'cancelled', points_delta: 0 },
    },
    household_chore_cancel_own_assignment: {
      code: 'assignment_cancelled', data: { ...base, status: 'cancelled', points_delta: 0 },
    },
    household_chore_undo_completion: {
      code: 'completion_reversed',
      data: { ...base, status: 'open', points_delta: -10, reopen_outcome: 'open', reopen_reason: null },
    },
  }
  const entry = map[rpcName]
  if (!entry) throw new Error(`missing fixture for ${rpcName}`)
  return { data: { ok: true, code: entry.code, request_id: requestId, data: entry.data }, error: null }
}

describe('Household Chores mutation repository', () => {
  it('uses the exact frozen RPC parameter names for every ordinary mutation wrapper', async () => {
    mockRpc.mockImplementation(async (name: string, args: Record<string, unknown>) => (
      successResponse(name, String(args.p_request_id))
    ))

    const cases: Array<{
      name: string
      invoke: () => Promise<unknown>
      args: Record<string, unknown>
    }> = [
      {
        name: 'household_chore_create_circle',
        invoke: () => repository.createHouseholdChoreCircle(ACTOR, { requestId: REQUEST, name: ' Heima ' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_name: 'Heima' },
      },
      {
        name: 'household_chore_rename_circle',
        invoke: () => repository.renameHouseholdChoreCircle(ACTOR, { requestId: REQUEST, circleId: CIRCLE, expectedVersion: '1', name: 'Nýtt' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_expected_version: '1', p_name: 'Nýtt' },
      },
      {
        name: 'household_chore_delete_circle',
        invoke: () => repository.deleteHouseholdChoreCircle(ACTOR, { requestId: REQUEST, circleId: CIRCLE, expectedVersion: '1', displayReference: 'abcd2345' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_expected_version: '1', p_display_reference: 'ABCD2345' },
      },
      {
        name: 'household_chore_create_invitation',
        invoke: () => repository.createHouseholdChoreInvitation(ACTOR, { requestId: REQUEST, circleId: CIRCLE, relationshipId: RELATIONSHIP, requestedType: 'member' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_relationship_id: RELATIONSHIP, p_requested_type: 'member' },
      },
      {
        name: 'household_chore_cancel_invitation',
        invoke: () => repository.cancelHouseholdChoreInvitation(ACTOR, { requestId: REQUEST, circleId: CIRCLE, invitationId: INVITATION, expectedVersion: '1' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_invitation_id: INVITATION, p_expected_version: '1' },
      },
      {
        name: 'household_chore_accept_invitation',
        invoke: () => repository.acceptHouseholdChoreInvitation(ACTOR, { requestId: REQUEST, invitationId: INVITATION, expectedVersion: '1' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_invitation_id: INVITATION, p_expected_version: '1' },
      },
      {
        name: 'household_chore_decline_invitation',
        invoke: () => repository.declineHouseholdChoreInvitation(ACTOR, { requestId: REQUEST, invitationId: INVITATION, expectedVersion: '1' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_invitation_id: INVITATION, p_expected_version: '1' },
      },
      {
        name: 'household_chore_change_membership_type',
        invoke: () => repository.changeHouseholdChoreMembershipType(ACTOR, { requestId: REQUEST, circleId: CIRCLE, membershipId: MEMBERSHIP, expectedVersion: '1', newType: 'child' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_membership_id: MEMBERSHIP, p_expected_version: '1', p_new_type: 'child' },
      },
      {
        name: 'household_chore_remove_member',
        invoke: () => repository.removeHouseholdChoreMember(ACTOR, { requestId: REQUEST, circleId: CIRCLE, membershipId: MEMBERSHIP, expectedVersion: '1' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_membership_id: MEMBERSHIP, p_expected_version: '1' },
      },
      {
        name: 'household_chore_leave_circle',
        invoke: () => repository.leaveHouseholdChoreCircle(ACTOR, { requestId: REQUEST, circleId: CIRCLE, expectedVersion: '1' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_expected_version: '1' },
      },
      {
        name: 'household_chore_create_participant',
        invoke: () => repository.createHouseholdChoreParticipant(ACTOR, { requestId: REQUEST, circleId: CIRCLE, label: ' Barn ' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_label: 'Barn' },
      },
      {
        name: 'household_chore_rename_participant',
        invoke: () => repository.renameHouseholdChoreParticipant(ACTOR, { requestId: REQUEST, circleId: CIRCLE, participantId: PARTICIPANT, expectedVersion: '1', label: ' Nýtt nafn ' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_participant_id: PARTICIPANT, p_expected_version: '1', p_label: 'Nýtt nafn' },
      },
      {
        name: 'household_chore_link_participant',
        invoke: () => repository.linkHouseholdChoreParticipant(ACTOR, { requestId: REQUEST, circleId: CIRCLE, participantId: PARTICIPANT, expectedVersion: '1', recipientEmail: 'person@example.com', requestedType: 'child' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_participant_id: PARTICIPANT, p_expected_version: '1', p_recipient_email: 'person@example.com', p_requested_type: 'child' },
      },
      ...(['archive', 'reactivate'] as const).map(action => ({
        name: `household_chore_${action}_participant`,
        invoke: () => action === 'archive'
          ? repository.archiveHouseholdChoreParticipant(ACTOR, { requestId: REQUEST, circleId: CIRCLE, participantId: PARTICIPANT, expectedVersion: '1' })
          : repository.reactivateHouseholdChoreParticipant(ACTOR, { requestId: REQUEST, circleId: CIRCLE, participantId: PARTICIPANT, expectedVersion: '1' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_participant_id: PARTICIPANT, p_expected_version: '1' },
      })),
      {
        name: 'household_chore_create_definition_v2',
        invoke: () => repository.createHouseholdChoreDefinition(ACTOR, { requestId: REQUEST, circleId: CIRCLE, title: ' Ryksuga ', description: '', materials: null, cadenceDays: 7, completionScope: 'global' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_title: 'Ryksuga', p_description: null, p_materials: null, p_cadence_days: 7, p_completion_scope: 'global' },
      },
      {
        name: 'household_chore_update_definition_v2',
        invoke: () => repository.updateHouseholdChoreDefinition(ACTOR, { requestId: REQUEST, circleId: CIRCLE, definitionId: DEFINITION, expectedVersion: '1', title: 'Ryksuga', description: null, materials: null, cadenceDays: 3, completionScope: 'per_participant' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_definition_id: DEFINITION, p_expected_version: '1', p_title: 'Ryksuga', p_description: null, p_materials: null, p_cadence_days: 3, p_completion_scope: 'per_participant' },
      },
      ...(['archive', 'reactivate'] as const).map(action => ({
        name: `household_chore_${action}_definition`,
        invoke: () => action === 'archive'
          ? repository.archiveHouseholdChoreDefinition(ACTOR, { requestId: REQUEST, circleId: CIRCLE, definitionId: DEFINITION, expectedVersion: '1' })
          : repository.reactivateHouseholdChoreDefinition(ACTOR, { requestId: REQUEST, circleId: CIRCLE, definitionId: DEFINITION, expectedVersion: '1' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_definition_id: DEFINITION, p_expected_version: '1' },
      })),
      {
        name: 'household_chore_set_participant_value',
        invoke: () => repository.setHouseholdChoreParticipantValue(ACTOR, { requestId: REQUEST, circleId: CIRCLE, definitionId: DEFINITION, participantId: PARTICIPANT, expectedDefinitionVersion: '1', expectedValueVersion: '1', points: 10, active: true }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_definition_id: DEFINITION, p_participant_id: PARTICIPANT, p_expected_definition_version: '1', p_expected_value_version: '1', p_points: 10, p_active: true },
      },
      {
        name: 'household_chore_assign',
        invoke: () => repository.assignHouseholdChore(ACTOR, { requestId: REQUEST, circleId: CIRCLE, definitionId: DEFINITION, participantId: PARTICIPANT, expectedDefinitionVersion: '1', expectedValueVersion: '1' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_definition_id: DEFINITION, p_participant_id: PARTICIPANT, p_expected_definition_version: '1', p_expected_value_version: '1' },
      },
      {
        name: 'household_chore_self_assign',
        invoke: () => repository.selfAssignHouseholdChore(ACTOR, { requestId: REQUEST, circleId: CIRCLE, definitionId: DEFINITION, expectedDefinitionVersion: '1', expectedValueVersion: '1' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_definition_id: DEFINITION, p_expected_definition_version: '1', p_expected_value_version: '1' },
      },
      {
        name: 'household_chore_complete_definition',
        invoke: () => repository.completeHouseholdChoreDefinition(ACTOR, {
          requestId: REQUEST,
          circleId: CIRCLE,
          definitionId: DEFINITION,
          participantId: PARTICIPANT,
          expectedStateToken: 'a'.repeat(64),
        }),
        args: {
          p_actor_id: ACTOR,
          p_request_id: REQUEST,
          p_circle_id: CIRCLE,
          p_definition_id: DEFINITION,
          p_participant_id: PARTICIPANT,
          p_expected_state_token: 'a'.repeat(64),
        },
      },
      {
        name: 'household_chore_repeat_assignment',
        invoke: () => repository.repeatHouseholdChoreAssignment(ACTOR, { requestId: REQUEST, circleId: CIRCLE, sourceAssignmentId: ASSIGNMENT, expectedSourceVersion: '1', expectedDefinitionVersion: '1', expectedValueVersion: '1' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_source_assignment_id: ASSIGNMENT, p_expected_source_version: '1', p_expected_definition_version: '1', p_expected_value_version: '1' },
      },
      ...([
        ['complete', repository.completeHouseholdChoreAssignment],
        ['cancel', repository.cancelHouseholdChoreAssignment],
        ['cancel_own', repository.cancelOwnHouseholdChoreAssignment],
        ['undo_completion', repository.undoHouseholdChoreCompletion],
      ] as const).map(([suffix, fn]) => ({
        name: `household_chore_${suffix}_assignment`.replace('_undo_completion_assignment', '_undo_completion'),
        invoke: () => fn(ACTOR, { requestId: REQUEST, circleId: CIRCLE, assignmentId: ASSIGNMENT, expectedVersion: '1' }),
        args: { p_actor_id: ACTOR, p_request_id: REQUEST, p_circle_id: CIRCLE, p_assignment_id: ASSIGNMENT, p_expected_version: '1' },
      })),
    ]

    for (const testCase of cases) {
      mockRpc.mockClear()
      const result = await testCase.invoke()
      expect(result, testCase.name).toMatchObject({ ok: true })
      expect(mockRpc, testCase.name).toHaveBeenCalledWith(testCase.name, testCase.args)
    }
  })

  it('accepts an exact replay envelope and requires response request_id to equal input', async () => {
    mockRpc.mockResolvedValue(successResponse('household_chore_create_circle', REQUEST))
    const input = { requestId: REQUEST, name: 'Heima' }
    const first = await repository.createHouseholdChoreCircle(ACTOR, input)
    const replay = await repository.createHouseholdChoreCircle(ACTOR, input)
    expect(first).toEqual(replay)

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue(successResponse('household_chore_create_circle', OTHER_REQUEST))
    await expect(repository.createHouseholdChoreCircle(ACTOR, input)).resolves.toEqual({
      ok: false,
      error: 'save_failed',
    })
    errorSpy.mockRestore()
  })

  it('retains operation-specific committed result fields after exact validation', async () => {
    mockRpc.mockResolvedValueOnce(successResponse('household_chore_create_circle', REQUEST))
    await expect(repository.createHouseholdChoreCircle(ACTOR, {
      requestId: REQUEST,
      name: 'Heima',
    })).resolves.toMatchObject({
      ok: true,
      data: { displayReference: 'ABCD2345' },
    })

    mockRpc.mockResolvedValueOnce(successResponse('household_chore_accept_invitation', REQUEST))
    await expect(repository.acceptHouseholdChoreInvitation(ACTOR, {
      requestId: REQUEST,
      invitationId: INVITATION,
      expectedVersion: '1',
    })).resolves.toMatchObject({
      ok: true,
      data: { circleId: CIRCLE, membershipType: 'member' },
    })

    mockRpc.mockResolvedValueOnce(successResponse('household_chore_set_participant_value', REQUEST))
    await expect(repository.setHouseholdChoreParticipantValue(ACTOR, {
      requestId: REQUEST,
      circleId: CIRCLE,
      definitionId: DEFINITION,
      participantId: PARTICIPANT,
      expectedDefinitionVersion: '1',
      expectedValueVersion: '1',
      points: 10,
      active: true,
    })).resolves.toMatchObject({
      ok: true,
      data: { points: 10 },
    })

    mockRpc.mockResolvedValueOnce(successResponse('household_chore_repeat_assignment', REQUEST))
    await expect(repository.repeatHouseholdChoreAssignment(ACTOR, {
      requestId: REQUEST,
      circleId: CIRCLE,
      sourceAssignmentId: ASSIGNMENT,
      expectedSourceVersion: '1',
      expectedDefinitionVersion: '1',
      expectedValueVersion: '1',
    })).resolves.toMatchObject({
      ok: true,
      data: { sourceAssignmentId: ASSIGNMENT },
    })

    mockRpc.mockResolvedValueOnce(successResponse('household_chore_complete_assignment', REQUEST))
    await expect(repository.completeHouseholdChoreAssignment(ACTOR, {
      requestId: REQUEST,
      circleId: CIRCLE,
      assignmentId: ASSIGNMENT,
      expectedVersion: '1',
    })).resolves.toMatchObject({
      ok: true,
      data: { completionSequence: '1', pointsDelta: 10 },
    })

    mockRpc.mockResolvedValueOnce(successResponse('household_chore_undo_completion', REQUEST))
    await expect(repository.undoHouseholdChoreCompletion(ACTOR, {
      requestId: REQUEST,
      circleId: CIRCLE,
      assignmentId: ASSIGNMENT,
      expectedVersion: '1',
    })).resolves.toMatchObject({
      ok: true,
      data: {
        pointsDelta: -10,
        reopenOutcome: 'open',
        reopenReason: null,
      },
    })
  })

  it('maps business failures but keeps transport detail out of the result and logs', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: false, code: 'stale_version', request_id: REQUEST, data: {} },
      error: null,
    })
    await expect(repository.renameHouseholdChoreCircle(ACTOR, {
      requestId: REQUEST,
      circleId: CIRCLE,
      expectedVersion: '1',
      name: 'Heima',
    })).resolves.toEqual({ ok: false, error: 'stale' })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: `secret failure for ${ACTOR}`, details: 'private@example.com' },
    })
    await expect(repository.createHouseholdChoreCircle(ACTOR, {
      requestId: REQUEST,
      name: 'Heima',
    })).resolves.toEqual({ ok: false, error: 'save_failed' })
    const logs = JSON.stringify(errorSpy.mock.calls)
    expect(logs).not.toContain(ACTOR)
    expect(logs).not.toContain('private@example.com')
    expect(logs).not.toContain('secret failure')
    errorSpy.mockRestore()
  })

  it('rejects invalid input before making an admin RPC', async () => {
    await expect(repository.createHouseholdChoreCircle(ACTOR, {
      requestId: 'not-a-uuid',
      name: 'Heima',
    })).resolves.toEqual({ ok: false, error: 'invalid_input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
