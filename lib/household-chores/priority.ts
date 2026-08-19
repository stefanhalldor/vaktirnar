import type {
  HouseholdChorePriorityDefinition,
  HouseholdChorePriorityParticipantState,
} from './contracts'

export type HouseholdChoreParticipantMatchMode = 'and' | 'or'

export function priorityStates(
  definition: HouseholdChorePriorityDefinition,
): HouseholdChorePriorityParticipantState[] {
  if (definition.participantStates) return definition.participantStates
  return definition.ownState ? [definition.ownState] : []
}

export function matchesHouseholdChoreParticipantFilter(
  definition: HouseholdChorePriorityDefinition,
  selectedParticipantIds: string[],
  mode: HouseholdChoreParticipantMatchMode,
): boolean {
  if (selectedParticipantIds.length === 0) return true
  const eligible = new Set(priorityStates(definition).map(state => state.participantId))
  return mode === 'and'
    ? selectedParticipantIds.every(id => eligible.has(id))
    : selectedParticipantIds.some(id => eligible.has(id))
}

export function priorityStateFor(
  definition: HouseholdChorePriorityDefinition,
  participantId: string,
) {
  return priorityStates(definition).find(state => state.participantId === participantId) ?? null
}

export function priorityDueAtForView(
  definition: HouseholdChorePriorityDefinition,
  workAsParticipantId: string | null,
  selectedParticipantIds: string[],
) {
  if (workAsParticipantId) {
    return priorityStateFor(definition, workAsParticipantId)?.dueAt ?? null
  }
  const selected = new Set(selectedParticipantIds)
  const candidates = priorityStates(definition)
    .filter(state => selected.size === 0 || selected.has(state.participantId))
    .map(state => state.dueAt)
    .filter((dueAt): dueAt is string => dueAt !== null)
    .sort((a, b) => Date.parse(a) - Date.parse(b))
  return candidates[0] ?? definition.priorityDueAt
}

export function filterAndSortHouseholdChorePriorities(
  definitions: HouseholdChorePriorityDefinition[],
  workAsParticipantId: string | null,
  selectedParticipantIds: string[],
  mode: HouseholdChoreParticipantMatchMode,
) {
  return definitions
    .filter(definition => !workAsParticipantId
      || priorityStateFor(definition, workAsParticipantId) !== null)
    .filter(definition => matchesHouseholdChoreParticipantFilter(
      definition,
      selectedParticipantIds,
      mode,
    ))
    .sort((left, right) => {
      const leftDue = priorityDueAtForView(left, workAsParticipantId, selectedParticipantIds)
      const rightDue = priorityDueAtForView(right, workAsParticipantId, selectedParticipantIds)
      if (leftDue === null && rightDue !== null) return 1
      if (leftDue !== null && rightDue === null) return -1
      if (leftDue !== null && rightDue !== null) {
        const difference = Date.parse(leftDue) - Date.parse(rightDue)
        if (difference !== 0) return difference
      }
      const titleDifference = left.title.localeCompare(right.title, 'is')
      return titleDifference || left.definitionId.localeCompare(right.definitionId)
    })
}
