import { describe, expect, it } from 'vitest'
import type { HouseholdChoreV2MemberPriorityDefinition } from '@/lib/household-chores/contracts-v2'
import {
  filterHouseholdChoreV2Definitions,
  householdChoreCalendarDayDifference,
  householdChoreParticipantInitials,
  previousHouseholdChoreCalendarDate,
  reykjavikDateOnlyFromInstant,
} from '@/lib/household-chores/priority-v2'

const participant = (participantId: string) => ({
  participantId,
  label: participantId,
  identityMarker: 'current' as const,
  points: 1,
  valueVersion: '1',
  baselineOn: '2026-08-01',
  dueOn: '2026-08-02',
  isRemaining: true,
  latestCompletionId: null,
  latestPerformedOn: null,
  recordedAt: null,
  oldestOpenAssignmentId: null,
  oldestOpenAssignmentVersion: null,
  expectedStateToken: 'a'.repeat(64),
})

const definition = (definitionId: string, participantIds: string[]): HouseholdChoreV2MemberPriorityDefinition => ({
  definitionId,
  title: definitionId,
  description: null,
  materials: null,
  cadenceDays: 1,
  completionScope: 'per_participant',
  priorityDueOn: '2026-08-02',
  priorityDueAt: '2026-08-02T00:00:00+00:00',
  version: '1',
  participantStates: participantIds.map(participant),
  openAssignments: [],
  openAssignmentCount: 0,
  latestPerformer: null,
})

describe('household chore v2 priority adapter', () => {
  it('uses AND and OR only for definition eligibility', () => {
    const definitions = [definition('both', ['a', 'b']), definition('one', ['a'])]
    expect(filterHouseholdChoreV2Definitions(definitions, ['a', 'b'], 'and').map(item => item.definitionId))
      .toEqual(['both'])
    expect(filterHouseholdChoreV2Definitions(definitions, ['a', 'b'], 'or').map(item => item.definitionId))
      .toEqual(['both', 'one'])
  })

  it('does date-only arithmetic without local-time rollover', () => {
    expect(previousHouseholdChoreCalendarDate('2024-03-01')).toBe('2024-02-29')
    expect(previousHouseholdChoreCalendarDate('2026-01-01')).toBe('2025-12-31')
    expect(householdChoreCalendarDayDifference('2026-08-18', '2026-08-20')).toBe(-2)
    expect(reykjavikDateOnlyFromInstant('2026-08-19T23:59:59+00:00')).toBe('2026-08-19')
  })

  it('derives Icelandic initials by grapheme from first and last words', () => {
    expect(householdChoreParticipantInitials('Þór')).toBe('Þ')
    expect(householdChoreParticipantInitials('Ásta María Jónsdóttir')).toBe('ÁJ')
    expect(householdChoreParticipantInitials('👩‍🔧 Sól')).toBe('👩‍🔧S')
  })
})
