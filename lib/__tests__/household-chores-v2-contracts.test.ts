import { describe, expect, it } from 'vitest'
import {
  HouseholdChoreIsoDateSchema,
  HouseholdChoreV2AssignmentDetailDataWireSchema,
  HouseholdChoreV2ChildPriorityStateWireSchema,
  HouseholdChoreV2DefinitionDetailDataWireSchema,
  HouseholdChoreV2HistoryItemWireSchema,
  HouseholdChoreV2PriorityDashboardDataWireSchema,
  mapHouseholdChoreV2AssignmentDetail,
  mapHouseholdChoreV2DefinitionDetail,
  mapHouseholdChoreV2PriorityDashboard,
} from '@/lib/household-chores/contracts-v2'
import {
  CompleteHouseholdChoreDefinitionV2Schema,
  CorrectHouseholdChoreCompletionDateSchema,
} from '@/lib/household-chores/validation-v2'

const ACTOR_PARTICIPANT = '11111111-1111-4111-8111-111111111111'
const OTHER_PARTICIPANT = '22222222-2222-4222-8222-222222222222'
const DEFINITION = '33333333-3333-4333-8333-333333333333'
const ASSIGNMENT = '44444444-4444-4444-8444-444444444444'
const EVENT = '55555555-5555-4555-8555-555555555555'
const CIRCLE = '66666666-6666-4666-8666-666666666666'
const REQUEST = '77777777-7777-4777-8777-777777777777'
const TOKEN = 'a'.repeat(64)
const RECORDED_AT = '2026-08-19T12:30:00+00:00'

function emptyHistory() {
  return { items: [], next_cursor: null, has_more: false }
}

function childState() {
  return {
    participant_id: ACTOR_PARTICIPANT,
    label: 'Emil',
    points: 10,
    due_on: '2026-08-20',
    is_remaining: false,
    baseline_at: '2026-08-14T00:00:00+00:00',
    due_at: '2026-08-20T00:00:00+00:00',
    expected_state_token: TOKEN,
  }
}

function childDefinition() {
  return {
    definition_id: DEFINITION,
    title: 'Ryksuga',
    cadence_days: 6,
    completion_scope: 'global' as const,
    priority_due_on: '2026-08-20',
    priority_due_at: '2026-08-20T00:00:00+00:00',
    own_state: childState(),
  }
}

function childDashboard() {
  return {
    viewer_type: 'child' as const,
    own_participant_id: ACTOR_PARTICIPANT,
    server_today: '2026-08-19',
    next_day_boundary_at: '2026-08-20T00:00:00+00:00',
    definitions: [childDefinition()],
  }
}

function memberDefinition() {
  return {
    definition_id: DEFINITION,
    title: 'Ryksuga',
    version: '4',
    cadence_days: 7,
    completion_scope: 'per_participant' as const,
    priority_due_on: '2026-08-19',
    priority_due_at: '2026-08-19T00:00:00+00:00',
    participant_states: [{
      participant_id: ACTOR_PARTICIPANT,
      label: 'Emil',
      identity_marker: 'current' as const,
      points: 10,
      value_version: '3',
      baseline_on: '2026-08-12',
      due_on: '2026-08-19',
      is_remaining: true,
      baseline_at: '2026-08-12T00:00:00+00:00',
      due_at: '2026-08-19T00:00:00+00:00',
      expected_state_token: TOKEN,
    }],
    open_assignments: [],
    open_assignment_count: 0,
  }
}

function completedEvent() {
  return {
    event_id: EVENT,
    assignment_id: ASSIGNMENT,
    title: 'Ryksuga',
    event_type: 'completed' as const,
    occurred_at: RECORDED_AT,
    participant_label: 'Emil',
    participant_identity_marker: 'current' as const,
    assignment_origin: 'quick_completed' as const,
    snapshot_points: 10,
    status_after: 'completed' as const,
    actor_kind: 'participant' as const,
    actor_label: 'Emil',
    completion_sequence: 1,
    performed_on: '2026-08-18',
    recorded_at: RECORDED_AT,
    points_delta: 10,
  }
}

function correctedEvent() {
  const { recorded_at: _recordedAt, points_delta: _pointsDelta, ...base } = completedEvent()
  return {
    ...base,
    event_type: 'completion_date_corrected' as const,
    previous_performed_on: '2026-08-17',
  }
}

describe('SQL146 v2 strict contracts', () => {
  it.each([
    '2024-02-29',
    '2026-08-19',
    '9999-12-31',
  ])('accepts the strict calendar date %s', (value) => {
    expect(HouseholdChoreIsoDateSchema.safeParse(value).success).toBe(true)
  })

  it.each([
    '2023-02-29',
    '2026-02-30',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '0000-01-01',
    '2026-8-19',
    '2026-08-19T00:00:00Z',
  ])('rejects the malformed calendar date %s', (value) => {
    expect(HouseholdChoreIsoDateSchema.safeParse(value).success).toBe(false)
  })

  it('keeps member and child dashboards separately discriminated', () => {
    const member = HouseholdChoreV2PriorityDashboardDataWireSchema.parse({
      viewer_type: 'member',
      own_participant_id: ACTOR_PARTICIPANT,
      server_today: '2026-08-19',
      next_day_boundary_at: '2026-08-20T00:00:00+00:00',
      participants: [{
        participant_id: ACTOR_PARTICIPANT,
        label: 'Emil',
        identity_marker: 'current',
        is_viewer: true,
      }],
      definitions: [memberDefinition()],
    })
    const child = HouseholdChoreV2PriorityDashboardDataWireSchema.parse(childDashboard())

    expect(mapHouseholdChoreV2PriorityDashboard(member)).toMatchObject({
      viewerType: 'member',
      definitions: [{ participantStates: [{ valueVersion: '3' }] }],
    })
    expect(mapHouseholdChoreV2PriorityDashboard(child)).toMatchObject({
      viewerType: 'child',
      definitions: [{ ownState: { participantId: ACTOR_PARTICIPANT } }],
    })
  })

  it('projects a child without other participant identity or legacy date/version state', () => {
    const raw = childDashboard()
    raw.definitions[0]!.own_state.baseline_at = '2026-08-14T00:00:00+00:00'
    const parsed = HouseholdChoreV2PriorityDashboardDataWireSchema.parse(raw)
    const projected = mapHouseholdChoreV2PriorityDashboard(parsed)
    const serialized = JSON.stringify(projected)

    expect(projected.viewerType).toBe('child')
    expect(serialized).not.toContain(OTHER_PARTICIPANT)
    expect(serialized).not.toContain('Berglind')
    expect(serialized).not.toContain('2026-08-14T00:00:00+00:00')
    expect(serialized).not.toContain('baselineAt')
    expect(serialized).not.toContain('valueVersion')
    expect(serialized).not.toContain('participantStates')
    expect(serialized).not.toContain('openAssignments')
  })

  it('rejects member-only and malformed state injected into a child payload', () => {
    expect(HouseholdChoreV2PriorityDashboardDataWireSchema.safeParse({
      ...childDashboard(),
      participants: [{
        participant_id: OTHER_PARTICIPANT,
        label: 'Berglind',
        identity_marker: 'current',
        is_viewer: false,
      }],
    }).success).toBe(false)

    expect(HouseholdChoreV2ChildPriorityStateWireSchema.safeParse({
      ...childState(),
      value_version: '7',
    }).success).toBe(false)
  })

  it('enforces exact correction and reversal history shapes', () => {
    expect(HouseholdChoreV2HistoryItemWireSchema.safeParse(completedEvent()).success).toBe(true)
    expect(HouseholdChoreV2HistoryItemWireSchema.safeParse(correctedEvent()).success).toBe(true)
    expect(HouseholdChoreV2HistoryItemWireSchema.safeParse({
      ...completedEvent(),
      event_type: 'completion_date_corrected',
      previous_performed_on: '2026-08-17',
    }).success).toBe(false)
  })

  it('keeps child assignment fields bounded and rejects member ids', () => {
    const raw = {
      viewer_type: 'child' as const,
      assignment: {
        assignment_id: ASSIGNMENT,
        title: 'Ryksuga',
        participant_label: 'Emil',
        participant_identity_marker: 'current' as const,
        points: 10,
        origin: 'quick_completed' as const,
        status: 'completed' as const,
        created_at: '2026-08-18T10:00:00+00:00',
        performed_on: '2026-08-18',
        recorded_at: RECORDED_AT,
        completed_at: RECORDED_AT,
        own_assignment: true as const,
        completion_sequence: 1,
        version: '2',
        can_complete: false,
        can_cancel: false,
        can_correct_date: true,
      },
      timeline: { items: [completedEvent()], next_cursor: null, has_more: false },
    }
    const parsed = HouseholdChoreV2AssignmentDetailDataWireSchema.parse(raw)
    const projected = mapHouseholdChoreV2AssignmentDetail(parsed)
    expect(projected).toMatchObject({
      viewerType: 'child',
      assignment: {
        ownAssignment: true,
        canCorrectDate: true,
        performedOn: '2026-08-18',
      },
    })
    expect(projected.assignment).not.toHaveProperty('circleId')
    expect(projected.assignment).not.toHaveProperty('definitionId')
    expect(projected.assignment).not.toHaveProperty('participantId')

    expect(HouseholdChoreV2AssignmentDetailDataWireSchema.safeParse({
      ...raw,
      assignment: { ...raw.assignment, participant_id: OTHER_PARTICIPANT },
    }).success).toBe(false)
  })

  it('maps correction history without mutating completion identity fields', () => {
    const raw = {
      viewer_type: 'member' as const,
      server_today: '2026-08-19',
      definition: memberDefinition(),
      history: {
        items: [{
          ...correctedEvent(),
          performed_on: '2026-08-19',
          previous_performed_on: '2026-08-18',
        }],
        next_cursor: null,
        has_more: false,
      },
    }
    const parsed = HouseholdChoreV2DefinitionDetailDataWireSchema.parse(raw)
    const projected = mapHouseholdChoreV2DefinitionDetail(parsed)
    const item = projected.history.items[0]
    expect(item).toMatchObject({
      eventType: 'completion_date_corrected',
      performedOn: '2026-08-19',
      previousPerformedOn: '2026-08-18',
      snapshotPoints: 10,
      participantLabel: 'Emil',
      occurredAt: RECORDED_AT,
    })
    expect(item).not.toHaveProperty('pointsDelta')
    expect(item).not.toHaveProperty('recordedAt')
  })

  it('validates today/default and explicit performedOn inputs without accepting actor data', () => {
    const base = {
      requestId: REQUEST,
      circleId: CIRCLE,
      definitionId: DEFINITION,
      participantId: ACTOR_PARTICIPANT,
      expectedStateToken: TOKEN,
    }
    expect(CompleteHouseholdChoreDefinitionV2Schema.parse(base)).toEqual(base)
    expect(CompleteHouseholdChoreDefinitionV2Schema.parse({
      ...base,
      performedOn: '2026-08-18',
    })).toMatchObject({ performedOn: '2026-08-18' })
    expect(CompleteHouseholdChoreDefinitionV2Schema.safeParse({
      ...base,
      actorId: OTHER_PARTICIPANT,
    }).success).toBe(false)
    expect(CorrectHouseholdChoreCompletionDateSchema.safeParse({
      requestId: REQUEST,
      circleId: CIRCLE,
      assignmentId: ASSIGNMENT,
      expectedVersion: '2',
      completionSequence: 1,
      performedOn: '2026-02-30',
    }).success).toBe(false)
  })
})
