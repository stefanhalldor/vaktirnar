import type {
  HouseholdChoreV2MemberPriorityDefinition,
  HouseholdChoreV2MemberPriorityState,
} from './contracts-v2'

export type HouseholdChorePriorityMatchMode = 'and' | 'or'

function dateSerial(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year!, month! - 1, day!) / 86_400_000
}

export function householdChoreCalendarDayDifference(
  dueOn: string,
  serverToday: string,
): number {
  return dateSerial(dueOn) - dateSerial(serverToday)
}

export function previousHouseholdChoreCalendarDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  const previous = new Date(Date.UTC(year!, month! - 1, day! - 1))
  return previous.toISOString().slice(0, 10)
}

export function reykjavikDateOnlyFromInstant(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Atlantic/Reykjavik',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find(item => item.type === type)?.value ?? ''
  )
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function filterHouseholdChoreV2Definitions(
  definitions: HouseholdChoreV2MemberPriorityDefinition[],
  selectedParticipantIds: string[],
  matchMode: HouseholdChorePriorityMatchMode,
): HouseholdChoreV2MemberPriorityDefinition[] {
  if (selectedParticipantIds.length === 0) return definitions
  return definitions.filter((definition) => {
    const eligible = new Set(definition.participantStates.map(state => state.participantId))
    return matchMode === 'and'
      ? selectedParticipantIds.every(id => eligible.has(id))
      : selectedParticipantIds.some(id => eligible.has(id))
  })
}

export function relevantHouseholdChoreV2States(
  definition: HouseholdChoreV2MemberPriorityDefinition,
  selectedParticipantIds: string[],
): HouseholdChoreV2MemberPriorityState[] {
  if (selectedParticipantIds.length === 0) return definition.participantStates
  const selected = new Set(selectedParticipantIds)
  return definition.participantStates.filter(state => selected.has(state.participantId))
}

export function householdChoreV2PriorityDueOn(
  definition: HouseholdChoreV2MemberPriorityDefinition,
  selectedParticipantIds: string[],
): string | null {
  if (definition.completionScope === 'global') return definition.priorityDueOn
  const dueDates = relevantHouseholdChoreV2States(definition, selectedParticipantIds)
    .map(state => state.dueOn)
    .filter((value): value is string => value !== null)
    .sort()
  return dueDates[0] ?? null
}

export function sortHouseholdChoreV2Definitions(
  definitions: HouseholdChoreV2MemberPriorityDefinition[],
  selectedParticipantIds: string[],
): HouseholdChoreV2MemberPriorityDefinition[] {
  return [...definitions].sort((left, right) => {
    const leftDue = householdChoreV2PriorityDueOn(left, selectedParticipantIds)
    const rightDue = householdChoreV2PriorityDueOn(right, selectedParticipantIds)
    if (leftDue === null && rightDue !== null) return 1
    if (leftDue !== null && rightDue === null) return -1
    if (leftDue !== rightDue) return (leftDue ?? '').localeCompare(rightDue ?? '')
    return left.title.localeCompare(right.title, 'is')
  })
}

function firstGrapheme(value: string): string {
  if (typeof Intl.Segmenter === 'function') {
    const segment = new Intl.Segmenter('is', { granularity: 'grapheme' })
      .segment(value)[Symbol.iterator]().next().value
    if (segment?.segment) return segment.segment
  }
  return Array.from(value)[0] ?? ''
}

export function householdChoreParticipantInitials(label: string): string {
  const words = label.trim().split(/\s+/u).filter(Boolean)
  if (words.length === 0) return ''
  const initials = words.length === 1
    ? firstGrapheme(words[0]!)
    : `${firstGrapheme(words[0]!)}${firstGrapheme(words[words.length - 1]!)}`
  return initials.toLocaleUpperCase('is-IS')
}
