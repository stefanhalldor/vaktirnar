import { describe, expect, it } from 'vitest'
import type { HouseholdChorePriorityDefinition } from '@/lib/household-chores/contracts'
import {
  filterAndSortHouseholdChorePriorities,
  matchesHouseholdChoreParticipantFilter,
} from '@/lib/household-chores/priority'

const EMIL = '00000000-0000-4000-8000-000000000001'
const BERGLIND = '00000000-0000-4000-8000-000000000002'
const GRETAR = '00000000-0000-4000-8000-000000000003'

function definition(
  id: string,
  title: string,
  dueAt: string | null,
  participants: string[],
): HouseholdChorePriorityDefinition {
  return {
    definitionId: id,
    title,
    description: null,
    materials: null,
    version: '1',
    cadenceDays: dueAt ? 7 : null,
    completionScope: 'per_participant',
    priorityDueAt: dueAt,
    participantStates: participants.map((participantId, index) => ({
      participantId,
      label: `Participant ${index}`,
      identityMarker: 'current',
      points: 5,
      valueVersion: '1',
      baselineAt: '2026-08-01T00:00:00Z',
      dueAt,
      latestCompletedAt: null,
      oldestOpenAssignmentId: null,
      oldestOpenAssignmentVersion: null,
      expectedStateToken: 'a'.repeat(64),
    })),
    openAssignments: [],
    openAssignmentCount: 0,
  }
}

describe('household chore priority presentation', () => {
  const shared = definition(
    '00000000-0000-4000-8000-000000000011',
    'Sameiginlegt',
    '2026-08-20T00:00:00Z',
    [EMIL, BERGLIND],
  )
  const emilOnly = definition(
    '00000000-0000-4000-8000-000000000012',
    'Emil',
    '2026-08-19T00:00:00Z',
    [EMIL],
  )
  const noCadence = definition(
    '00000000-0000-4000-8000-000000000013',
    'Án tíðni',
    null,
    [EMIL, GRETAR],
  )

  it('uses AND intersection and OR union exactly', () => {
    expect(matchesHouseholdChoreParticipantFilter(
      shared, [EMIL, BERGLIND], 'and',
    )).toBe(true)
    expect(matchesHouseholdChoreParticipantFilter(
      emilOnly, [EMIL, BERGLIND], 'and',
    )).toBe(false)
    expect(matchesHouseholdChoreParticipantFilter(
      emilOnly, [EMIL, BERGLIND], 'or',
    )).toBe(true)
  })

  it('composes work-as first, then participant filtering', () => {
    expect(filterAndSortHouseholdChorePriorities(
      [shared, emilOnly, noCadence],
      BERGLIND,
      [EMIL, BERGLIND],
      'and',
    ).map(item => item.title)).toEqual(['Sameiginlegt'])
  })

  it('orders authoritative due dates and keeps null cadence last', () => {
    expect(filterAndSortHouseholdChorePriorities(
      [shared, noCadence, emilOnly], null, [], 'and',
    ).map(item => item.title)).toEqual(['Emil', 'Sameiginlegt', 'Án tíðni'])
  })
})
