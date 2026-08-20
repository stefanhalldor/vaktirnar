import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({ rpc: mockRpc })),
}))

import * as repository from '@/lib/household-chores/repository-v2.server'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const CIRCLE = '22222222-2222-4222-8222-222222222222'
const PARTICIPANT = '33333333-3333-4333-8333-333333333333'
const DEFINITION = '44444444-4444-4444-8444-444444444444'
const ASSIGNMENT = '55555555-5555-4555-8555-555555555555'
const EVENT = '66666666-6666-4666-8666-666666666666'
const REQUEST = '77777777-7777-4777-8777-777777777777'
const TOKEN = 'a'.repeat(64)
const RECORDED_AT = '2026-08-19T14:00:00+00:00'

function response(code: string, data: unknown) {
  return { data: { ok: true, code, data }, error: null }
}

function mutationResponse(code: string, data: unknown) {
  return { data: { ok: true, code, request_id: REQUEST, data }, error: null }
}

function historyItem() {
  return {
    event_id: EVENT,
    assignment_id: ASSIGNMENT,
    title: 'Ryksuga',
    event_type: 'completed',
    occurred_at: RECORDED_AT,
    participant_label: 'Emil',
    participant_identity_marker: 'current',
    assignment_origin: 'quick_completed',
    snapshot_points: 10,
    status_after: 'completed',
    actor_kind: 'participant',
    actor_label: 'Emil',
    completion_sequence: 1,
    performed_on: '2026-08-18',
    recorded_at: RECORDED_AT,
    points_delta: 10,
  }
}

function historyPage() {
  return { items: [historyItem()], next_cursor: null, has_more: false }
}

function childDefinition() {
  return {
    definition_id: DEFINITION,
    title: 'Ryksuga',
    cadence_days: 7,
    completion_scope: 'per_participant',
    priority_due_on: '2026-08-25',
    priority_due_at: '2026-08-25T00:00:00+00:00',
    own_state: {
      participant_id: PARTICIPANT,
      label: 'Emil',
      points: 10,
      baseline_on: '2026-08-18',
      due_on: '2026-08-25',
      is_remaining: false,
      latest_completion_id: ASSIGNMENT,
      latest_performed_on: '2026-08-18',
      recorded_at: RECORDED_AT,
      baseline_at: '2026-08-18T00:00:00+00:00',
      due_at: '2026-08-25T00:00:00+00:00',
      latest_completed_at: RECORDED_AT,
      expected_state_token: TOKEN,
    },
  }
}

function completionData(extra: object = {}) {
  return {
    resource_id: ASSIGNMENT,
    version: '2',
    status: 'completed',
    completion_sequence: '1',
    points_delta: 10,
    performed_on: '2026-08-18',
    recorded_at: RECORDED_AT,
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SQL146 v2 read repository', () => {
  it('calls and maps all five exact read RPCs', async () => {
    mockRpc.mockResolvedValueOnce(response('get_priority_dashboard_v2_loaded', {
      viewer_type: 'child',
      own_participant_id: PARTICIPANT,
      server_today: '2026-08-19',
      next_day_boundary_at: '2026-08-20T00:00:00+00:00',
      definitions: [childDefinition()],
    }))
    await expect(repository.loadHouseholdChorePriorityDashboardV2(
      ACTOR, CIRCLE,
    )).resolves.toMatchObject({ viewerType: 'child', serverToday: '2026-08-19' })
    expect(mockRpc).toHaveBeenLastCalledWith('household_chore_get_priority_dashboard_v2', {
      p_actor_id: ACTOR,
      p_circle_id: CIRCLE,
    })

    mockRpc.mockResolvedValueOnce(response('get_definition_detail_v3_loaded', {
      viewer_type: 'child',
      server_today: '2026-08-19',
      definition: childDefinition(),
      history: historyPage(),
    }))
    await expect(repository.loadHouseholdChoreDefinitionDetailV3(
      ACTOR, CIRCLE, DEFINITION,
    )).resolves.toMatchObject({ viewerType: 'child', history: { hasMore: false } })
    expect(mockRpc).toHaveBeenLastCalledWith('household_chore_get_definition_detail_v3', {
      p_actor_id: ACTOR,
      p_circle_id: CIRCLE,
      p_definition_id: DEFINITION,
    })

    mockRpc.mockResolvedValueOnce(response('get_assignment_v2_loaded', {
      viewer_type: 'child',
      assignment: {
        assignment_id: ASSIGNMENT,
        title: 'Ryksuga',
        participant_label: 'Emil',
        participant_identity_marker: 'current',
        points: 10,
        origin: 'quick_completed',
        status: 'completed',
        created_at: '2026-08-18T10:00:00+00:00',
        performed_on: '2026-08-18',
        recorded_at: RECORDED_AT,
        completed_at: RECORDED_AT,
        own_assignment: true,
        completion_sequence: 1,
        version: '2',
        can_complete: false,
        can_cancel: false,
        can_correct_date: true,
      },
      timeline: historyPage(),
    }))
    const assignment = await repository.loadHouseholdChoreAssignmentV2(
      ACTOR, CIRCLE, ASSIGNMENT,
    )
    expect(assignment).toMatchObject({
      viewerType: 'child',
      assignment: { ownAssignment: true, canCorrectDate: true },
    })
    expect(assignment.assignment).not.toHaveProperty('participantId')
    expect(mockRpc).toHaveBeenLastCalledWith('household_chore_get_assignment_v2', {
      p_actor_id: ACTOR,
      p_circle_id: CIRCLE,
      p_assignment_id: ASSIGNMENT,
    })

    mockRpc.mockResolvedValueOnce(response('get_definition_history_v2_loaded', historyPage()))
    await repository.loadHouseholdChoreDefinitionHistoryV2(ACTOR, CIRCLE, DEFINITION, {
      cursor: { occurredAt: RECORDED_AT, eventId: EVENT },
      limit: 25,
    })
    expect(mockRpc).toHaveBeenLastCalledWith('household_chore_get_definition_history_v2', {
      p_actor_id: ACTOR,
      p_circle_id: CIRCLE,
      p_definition_id: DEFINITION,
      p_cursor_at: RECORDED_AT,
      p_cursor_id: EVENT,
      p_limit: 25,
    })

    mockRpc.mockResolvedValueOnce(response('get_assignment_timeline_v2_loaded', historyPage()))
    await repository.loadHouseholdChoreAssignmentTimelineV2(ACTOR, CIRCLE, ASSIGNMENT)
    expect(mockRpc).toHaveBeenLastCalledWith('household_chore_get_assignment_timeline_v2', {
      p_actor_id: ACTOR,
      p_circle_id: CIRCLE,
      p_assignment_id: ASSIGNMENT,
      p_cursor_at: null,
      p_cursor_id: null,
      p_limit: 20,
    })
  })

  it('turns SQL/parser drift into save_failed without a loose fallback', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue(response('get_priority_dashboard_v2_loaded', {
      viewer_type: 'child',
      own_participant_id: PARTICIPANT,
      server_today: '2026-02-30',
      next_day_boundary_at: '2026-08-20T00:00:00+00:00',
      definitions: [],
      unexpected_sql_field: 'drift',
    }))
    await expect(repository.loadHouseholdChorePriorityDashboardV2(
      ACTOR, CIRCLE,
    )).rejects.toMatchObject({ code: 'save_failed' })
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('unexpected_sql_field')
    errorSpy.mockRestore()
  })
})

describe('SQL146 v2 mutation repository', () => {
  it('uses server-today default and exact explicit performedOn RPC arguments', async () => {
    mockRpc.mockResolvedValueOnce(mutationResponse('assignment_completed', completionData({
      definition_id: DEFINITION,
      participant_id: PARTICIPANT,
    })))
    await expect(repository.completeHouseholdChoreDefinitionV2(ACTOR, {
      requestId: REQUEST,
      circleId: CIRCLE,
      definitionId: DEFINITION,
      participantId: PARTICIPANT,
      expectedStateToken: TOKEN,
    })).resolves.toMatchObject({ ok: true, data: { performedOn: '2026-08-18' } })
    expect(mockRpc).toHaveBeenLastCalledWith('household_chore_complete_definition_v2', {
      p_actor_id: ACTOR,
      p_request_id: REQUEST,
      p_circle_id: CIRCLE,
      p_definition_id: DEFINITION,
      p_participant_id: PARTICIPANT,
      p_expected_state_token: TOKEN,
      p_performed_on: null,
    })

    mockRpc.mockResolvedValueOnce(mutationResponse('assignment_completed', completionData()))
    await repository.completeHouseholdChoreAssignmentV2(ACTOR, {
      requestId: REQUEST,
      circleId: CIRCLE,
      assignmentId: ASSIGNMENT,
      expectedVersion: '1',
      performedOn: '2026-08-18',
    })
    expect(mockRpc).toHaveBeenLastCalledWith('household_chore_complete_assignment_v2', {
      p_actor_id: ACTOR,
      p_request_id: REQUEST,
      p_circle_id: CIRCLE,
      p_assignment_id: ASSIGNMENT,
      p_expected_version: '1',
      p_performed_on: '2026-08-18',
    })
  })

  it('accepts exact idempotent replay and maps fingerprint/stale failures', async () => {
    const success = mutationResponse('assignment_completed', completionData())
    mockRpc.mockResolvedValue(success)
    const input = {
      requestId: REQUEST,
      circleId: CIRCLE,
      assignmentId: ASSIGNMENT,
      expectedVersion: '1',
      performedOn: '2026-08-18',
    }
    const first = await repository.completeHouseholdChoreAssignmentV2(ACTOR, input)
    const replay = await repository.completeHouseholdChoreAssignmentV2(ACTOR, input)
    expect(first).toEqual(replay)

    mockRpc.mockResolvedValueOnce({
      data: {
        ok: false,
        code: 'fingerprint_mismatch',
        request_id: REQUEST,
        data: {},
      },
      error: null,
    })
    await expect(repository.completeHouseholdChoreAssignmentV2(ACTOR, {
      ...input,
      performedOn: '2026-08-17',
    })).resolves.toEqual({ ok: false, error: 'fingerprint_mismatch' })

    mockRpc.mockResolvedValueOnce({
      data: { ok: false, code: 'stale_version', request_id: REQUEST, data: {} },
      error: null,
    })
    await expect(repository.completeHouseholdChoreAssignmentV2(
      ACTOR, input,
    )).resolves.toEqual({ ok: false, error: 'stale_version' })
  })

  it('maps all bounded result codes and rejects malformed result data', async () => {
    for (const code of [
      'invalid_performed_date',
      'not_allowed',
      'not_found',
      'not_available',
    ] as const) {
      mockRpc.mockResolvedValueOnce({
        data: { ok: false, code, request_id: REQUEST, data: {} },
        error: null,
      })
      await expect(repository.completeHouseholdChoreAssignmentV2(ACTOR, {
        requestId: REQUEST,
        circleId: CIRCLE,
        assignmentId: ASSIGNMENT,
        expectedVersion: '1',
      })).resolves.toEqual({ ok: false, error: code })
    }

    mockRpc.mockResolvedValueOnce({
      data: {
        ok: false,
        code: 'terminal_state',
        request_id: REQUEST,
        data: { current_status: 'completed' },
      },
      error: null,
    })
    await expect(repository.completeHouseholdChoreAssignmentV2(ACTOR, {
      requestId: REQUEST,
      circleId: CIRCLE,
      assignmentId: ASSIGNMENT,
      expectedVersion: '1',
    })).resolves.toEqual({ ok: false, error: 'terminal_state' })

    mockRpc.mockResolvedValueOnce({
      data: {
        ok: false,
        code: 'rate_limited',
        request_id: REQUEST,
        data: { retry_after_seconds: 90 },
      },
      error: null,
    })
    await expect(repository.completeHouseholdChoreAssignmentV2(ACTOR, {
      requestId: REQUEST,
      circleId: CIRCLE,
      assignmentId: ASSIGNMENT,
      expectedVersion: '1',
    })).resolves.toEqual({
      ok: false,
      error: 'rate_limited',
      retryAfterSeconds: 90,
    })

    for (const code of ['feature_unavailable', 'deletion_pending'] as const) {
      mockRpc.mockResolvedValueOnce({
        data: { ok: false, code, request_id: REQUEST, data: {} },
        error: null,
      })
      await expect(repository.completeHouseholdChoreAssignmentV2(ACTOR, {
        requestId: REQUEST,
        circleId: CIRCLE,
        assignmentId: ASSIGNMENT,
        expectedVersion: '1',
      })).resolves.toEqual({ ok: false, error: 'feature_disabled' })
    }

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValueOnce(mutationResponse('assignment_completed', {
      ...completionData(),
      performed_on: '2026-02-30',
    }))
    await expect(repository.completeHouseholdChoreAssignmentV2(ACTOR, {
      requestId: REQUEST,
      circleId: CIRCLE,
      assignmentId: ASSIGNMENT,
      expectedVersion: '1',
    })).resolves.toEqual({ ok: false, error: 'save_failed' })
    errorSpy.mockRestore()
  })

  it('sends exact member/child-authority inputs and preserves correction invariants', async () => {
    mockRpc.mockResolvedValueOnce(mutationResponse('assignment_completed', completionData({
      definition_id: DEFINITION,
      participant_id: PARTICIPANT,
    })))
    await repository.completeHouseholdChoreDefinitionV2(ACTOR, {
      requestId: REQUEST,
      circleId: CIRCLE,
      definitionId: DEFINITION,
      participantId: PARTICIPANT,
      expectedStateToken: TOKEN,
      performedOn: '2026-08-18',
    })
    expect(mockRpc.mock.calls[0]?.[1]).toMatchObject({
      p_actor_id: ACTOR,
      p_participant_id: PARTICIPANT,
    })

    mockRpc.mockResolvedValueOnce(mutationResponse('completion_date_corrected', {
      resource_id: ASSIGNMENT,
      version: '3',
      status: 'completed',
      completion_sequence: '1',
      performed_on: '2026-08-17',
      recorded_at: RECORDED_AT,
      points_delta: 0,
    }))
    const result = await repository.correctHouseholdChoreCompletionDate(ACTOR, {
      requestId: REQUEST,
      circleId: CIRCLE,
      assignmentId: ASSIGNMENT,
      expectedVersion: '2',
      completionSequence: 1,
      performedOn: '2026-08-17',
    })
    expect(mockRpc).toHaveBeenLastCalledWith('household_chore_correct_completion_date', {
      p_actor_id: ACTOR,
      p_request_id: REQUEST,
      p_circle_id: CIRCLE,
      p_assignment_id: ASSIGNMENT,
      p_expected_version: '2',
      p_completion_sequence: 1,
      p_performed_on: '2026-08-17',
    })
    expect(result).toEqual({
      ok: true,
      data: {
        resourceId: ASSIGNMENT,
        version: '3',
        status: 'completed',
        completionSequence: '1',
        performedOn: '2026-08-17',
        recordedAt: RECORDED_AT,
        pointsDelta: 0,
      },
    })
    if (result.ok) {
      expect(result.data).not.toHaveProperty('participantId')
      expect(result.data).not.toHaveProperty('recorderLabel')
      expect(result.data).not.toHaveProperty('recordedAt', '2026-08-17')
    }
  })
})
