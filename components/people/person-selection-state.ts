export type RelationshipPersonSelectionKey = Readonly<{
  source: 'relationship'
  relationshipId: string
}>

export type EventPersonSelectionKey = Readonly<{
  source: 'event'
  eventId: string
  personRef: string
}>

export type ManualPersonSelectionKey = Readonly<{
  source: 'manual'
  draftRef: string
}>

export type PersonSelectionKey =
  | RelationshipPersonSelectionKey
  | EventPersonSelectionKey
  | ManualPersonSelectionKey

export type SelectionValidity = 'valid' | 'needs_revalidation' | 'removed'
export type PersonSourceRevision = number | string

export type StagedRelationshipPerson = Readonly<{
  key: RelationshipPersonSelectionKey
  safeDisplayName: string
  state: SelectionValidity
}>

export type StagedEventPerson = Readonly<{
  key: EventPersonSelectionKey
  selectedRosterRevision: PersonSourceRevision
  safeDisplayName: string | null
  participantKind: 'organizer' | 'guest'
  position: number
  state: SelectionValidity
}>

export type ManualPersonSelectionValue =
  | Readonly<{ kind: 'name'; displayName: string }>
  | Readonly<{ kind: 'email'; recipientEmail: string }>

export type StagedManualPerson = Readonly<{
  key: ManualPersonSelectionKey
  safeDisplayName: string
  value: ManualPersonSelectionValue
  state: SelectionValidity
}>

export type StagedPersonSelection =
  | StagedRelationshipPerson
  | StagedEventPerson
  | StagedManualPerson

export type PersonSelectionSession = Readonly<{
  initial: readonly StagedPersonSelection[]
  staged: readonly StagedPersonSelection[]
}>

export type CrossEventPolicy =
  | Readonly<{ kind: 'allow' }>
  | Readonly<{
    kind: 'single-event'
    switchBehavior: 'block-until-clear'
  }>

export type SelectionCandidate = Readonly<{
  selection: StagedPersonSelection
  disabled?: boolean
}>

export type SelectionChangeResult =
  | Readonly<{
    accepted: true
    session: PersonSelectionSession
    addedCount: number
  }>
  | Readonly<{
    accepted: false
    reason: 'cross_event_blocked'
    blockingEventIds: readonly string[]
    attemptedEventIds: readonly string[]
  }>

export type VisibleSelectionSummary = Readonly<{
  totalSelectedCount: number
  visibleSelectableCount: number
  visibleSelectedCount: number
  checked: boolean
  indeterminate: boolean
  action: 'select-all' | 'deselect-all'
}>

export type EventRosterSelectionPerson = Readonly<{
  personRef: string
  participantKind: 'organizer' | 'guest'
  safeDisplayName: string | null
  position: number
}>

export type EventRosterSelectionSnapshot = Readonly<{
  eventId: string
  rosterRevision: PersonSourceRevision
  people: readonly EventRosterSelectionPerson[]
}>

function isStagedRelationshipPerson(
  selection: StagedPersonSelection,
): selection is StagedRelationshipPerson {
  return selection.key.source === 'relationship'
}

function isStagedEventPerson(
  selection: StagedPersonSelection,
): selection is StagedEventPerson {
  return selection.key.source === 'event'
}

function compareRevision(left: PersonSourceRevision, right: PersonSourceRevision): number {
  const normalizedLeft = String(left).replace(/^0+(?=\d)/, '')
  const normalizedRight = String(right).replace(/^0+(?=\d)/, '')
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length < normalizedRight.length ? -1 : 1
  }
  return normalizedLeft.localeCompare(normalizedRight)
}

/**
 * JSON tuple encoding keeps source discriminants and every opaque ID in
 * separate fields. Delimiters inside IDs therefore cannot create collisions.
 */
export function serializePersonSelectionKey(key: PersonSelectionKey): string {
  switch (key.source) {
    case 'relationship':
      return JSON.stringify(['relationship', key.relationshipId])
    case 'event':
      return JSON.stringify(['event', key.eventId, key.personRef])
    case 'manual':
      return JSON.stringify(['manual', key.draftRef])
  }
}

export function personSelectionKeysEqual(
  left: PersonSelectionKey,
  right: PersonSelectionKey,
): boolean {
  return serializePersonSelectionKey(left) === serializePersonSelectionKey(right)
}

function freezeSelection(selection: StagedPersonSelection): StagedPersonSelection {
  const key = Object.freeze({ ...selection.key })

  if (isStagedRelationshipPerson(selection)) {
    return Object.freeze({
      ...selection,
      key: key as RelationshipPersonSelectionKey,
    })
  }
  if (isStagedEventPerson(selection)) {
    return Object.freeze({
      ...selection,
      key: key as EventPersonSelectionKey,
    })
  }
  return Object.freeze({
    ...selection,
    key: key as ManualPersonSelectionKey,
    value: Object.freeze({ ...selection.value }),
  })
}

function freezeUniqueSelections(
  selections: readonly StagedPersonSelection[],
): readonly StagedPersonSelection[] {
  const unique = new Map<string, StagedPersonSelection>()
  for (const selection of selections) {
    unique.set(serializePersonSelectionKey(selection.key), freezeSelection(selection))
  }
  return Object.freeze([...unique.values()])
}

function withStagedSelections(
  session: PersonSelectionSession,
  selections: readonly StagedPersonSelection[],
): PersonSelectionSession {
  return Object.freeze({
    initial: session.initial,
    staged: freezeUniqueSelections(selections),
  })
}

export function createPersonSelectionSession(
  initial: readonly StagedPersonSelection[] = [],
): PersonSelectionSession {
  const snapshot = freezeUniqueSelections(initial)
  return Object.freeze({ initial: snapshot, staged: snapshot })
}

export function resetPersonSelectionSession(
  session: PersonSelectionSession,
): PersonSelectionSession {
  return Object.freeze({ initial: session.initial, staged: session.initial })
}

export function getStagedPersonSelection(
  session: PersonSelectionSession,
  key: PersonSelectionKey,
): StagedPersonSelection | null {
  const serialized = serializePersonSelectionKey(key)
  return session.staged.find((selection) => (
    serializePersonSelectionKey(selection.key) === serialized
  )) ?? null
}

export function isPersonSelected(
  session: PersonSelectionSession,
  key: PersonSelectionKey,
): boolean {
  return getStagedPersonSelection(session, key) !== null
}

export function getTotalSelectedCount(session: PersonSelectionSession): number {
  return session.staged.length
}

function eventIdsForSelections(
  selections: readonly StagedPersonSelection[],
): readonly string[] {
  return [...new Set(selections.flatMap((selection) => (
    isStagedEventPerson(selection) ? [selection.key.eventId] : []
  )))]
}

function findCrossEventBlock(
  session: PersonSelectionSession,
  additions: readonly StagedPersonSelection[],
  policy: CrossEventPolicy,
): Exclude<SelectionChangeResult, { accepted: true }> | null {
  if (policy.kind === 'allow') return null

  const attemptedEventIds = eventIdsForSelections(additions)
  if (attemptedEventIds.length === 0) return null

  const existingEventIds = eventIdsForSelections(session.staged)
  const combinedEventIds = [...new Set([...existingEventIds, ...attemptedEventIds])]
  if (combinedEventIds.length <= 1) return null

  return Object.freeze({
    accepted: false,
    reason: 'cross_event_blocked',
    blockingEventIds: Object.freeze(combinedEventIds),
    attemptedEventIds: Object.freeze([...attemptedEventIds]),
  })
}

function replaceOrAppendSelections(
  current: readonly StagedPersonSelection[],
  replacements: readonly StagedPersonSelection[],
): readonly StagedPersonSelection[] {
  const replacementByKey = new Map(replacements.map((selection) => [
    serializePersonSelectionKey(selection.key),
    selection,
  ]))
  const next = current.map((selection) => {
    const serialized = serializePersonSelectionKey(selection.key)
    const replacement = replacementByKey.get(serialized)
    if (!replacement) return selection
    replacementByKey.delete(serialized)
    return replacement
  })
  return [...next, ...replacementByKey.values()]
}

export function stagePersonSelection(
  session: PersonSelectionSession,
  selection: StagedPersonSelection,
  policy: CrossEventPolicy,
): SelectionChangeResult {
  const existing = getStagedPersonSelection(session, selection.key)
  const additions = existing ? [] : [selection]
  const block = findCrossEventBlock(session, additions, policy)
  if (block) return block

  return Object.freeze({
    accepted: true,
    session: withStagedSelections(
      session,
      replaceOrAppendSelections(session.staged, [selection]),
    ),
    addedCount: existing ? 0 : 1,
  })
}

export function removePersonSelection(
  session: PersonSelectionSession,
  key: PersonSelectionKey,
): PersonSelectionSession {
  const serialized = serializePersonSelectionKey(key)
  const staged = session.staged.filter((selection) => (
    serializePersonSelectionKey(selection.key) !== serialized
  ))
  return staged.length === session.staged.length
    ? session
    : withStagedSelections(session, staged)
}

export function removeEventSelections(
  session: PersonSelectionSession,
  eventId: string,
): PersonSelectionSession {
  const staged = session.staged.filter((selection) => (
    selection.key.source !== 'event' || selection.key.eventId !== eventId
  ))
  return staged.length === session.staged.length
    ? session
    : withStagedSelections(session, staged)
}

function uniqueEnabledCandidates(
  candidates: readonly SelectionCandidate[],
): readonly StagedPersonSelection[] {
  return freezeUniqueSelections(candidates.flatMap((candidate) => (
    candidate.disabled ? [] : [candidate.selection]
  )))
}

export function selectFilteredSelectable(
  session: PersonSelectionSession,
  candidates: readonly SelectionCandidate[],
  policy: CrossEventPolicy,
): SelectionChangeResult {
  const enabledSelections = uniqueEnabledCandidates(candidates)
  const additions = enabledSelections.filter((selection) => (
    !isPersonSelected(session, selection.key)
  ))
  const block = findCrossEventBlock(session, additions, policy)
  if (block) return block

  return Object.freeze({
    accepted: true,
    session: additions.length === 0 && enabledSelections.length === 0
      ? session
      : withStagedSelections(
        session,
        replaceOrAppendSelections(session.staged, enabledSelections),
      ),
    addedCount: additions.length,
  })
}

export function deselectFilteredSelectable(
  session: PersonSelectionSession,
  candidates: readonly SelectionCandidate[],
): PersonSelectionSession {
  const removableKeys = new Set(uniqueEnabledCandidates(candidates).map((selection) => (
    serializePersonSelectionKey(selection.key)
  )))
  if (removableKeys.size === 0) return session

  const staged = session.staged.filter((selection) => (
    !removableKeys.has(serializePersonSelectionKey(selection.key))
  ))
  return staged.length === session.staged.length
    ? session
    : withStagedSelections(session, staged)
}

export function getVisibleSelectionSummary(
  session: PersonSelectionSession,
  candidates: readonly SelectionCandidate[],
): VisibleSelectionSummary {
  const selectable = uniqueEnabledCandidates(candidates)
  const visibleSelectedCount = selectable.filter((selection) => (
    isPersonSelected(session, selection.key)
  )).length
  const visibleSelectableCount = selectable.length
  const checked = visibleSelectableCount > 0
    && visibleSelectedCount === visibleSelectableCount

  return Object.freeze({
    totalSelectedCount: getTotalSelectedCount(session),
    visibleSelectableCount,
    visibleSelectedCount,
    checked,
    indeterminate: visibleSelectedCount > 0 && !checked,
    action: checked ? 'deselect-all' : 'select-all',
  })
}

export function canConfirmPersonSelection(session: PersonSelectionSession): boolean {
  return session.staged.length > 0
    && session.staged.every((selection) => selection.state === 'valid')
}

export function getConfirmedPersonSelections(
  session: PersonSelectionSession,
): readonly StagedPersonSelection[] | null {
  if (!canConfirmPersonSelection(session)) return null
  return freezeUniqueSelections(session.staged)
}

export function markEventSelectionsNeedsRevalidation(
  session: PersonSelectionSession,
  eventId: string,
  observedRosterRevision: PersonSourceRevision,
): PersonSelectionSession {
  let changed = false
  const staged = session.staged.map((selection): StagedPersonSelection => {
    if (
      !isStagedEventPerson(selection)
      || selection.key.eventId !== eventId
      || compareRevision(observedRosterRevision, selection.selectedRosterRevision) <= 0
    ) {
      return selection
    }

    changed = true
    return {
      ...selection,
      selectedRosterRevision: observedRosterRevision,
      state: 'needs_revalidation',
    }
  })
  return changed ? withStagedSelections(session, staged) : session
}

export function markAllEventSelectionsNeedsRevalidation(
  session: PersonSelectionSession,
): PersonSelectionSession {
  let changed = false
  const staged = session.staged.map((selection): StagedPersonSelection => {
    if (!isStagedEventPerson(selection) || selection.state === 'needs_revalidation') {
      return selection
    }
    changed = true
    return { ...selection, state: 'needs_revalidation' }
  })
  return changed ? withStagedSelections(session, staged) : session
}

function newestKnownEventRevision(
  session: PersonSelectionSession,
  eventId: string,
): PersonSourceRevision | null {
  const revisions = session.staged.flatMap((selection) => (
    isStagedEventPerson(selection) && selection.key.eventId === eventId
      ? [selection.selectedRosterRevision]
      : []
  ))
  return revisions.reduce<PersonSourceRevision | null>((newest, revision) => (
    newest === null || compareRevision(revision, newest) > 0 ? revision : newest
  ), null)
}

export function reconcileEventSelections(
  session: PersonSelectionSession,
  roster: EventRosterSelectionSnapshot,
): PersonSelectionSession {
  const newestKnownRevision = newestKnownEventRevision(session, roster.eventId)
  if (newestKnownRevision !== null && compareRevision(roster.rosterRevision, newestKnownRevision) < 0) {
    return session
  }

  const peopleByRef = new Map(roster.people.map((person) => [person.personRef, person]))
  let changed = false
  const staged = session.staged.map((selection): StagedPersonSelection => {
    if (!isStagedEventPerson(selection) || selection.key.eventId !== roster.eventId) {
      return selection
    }

    changed = true
    const person = peopleByRef.get(selection.key.personRef)
    if (!person) {
      return {
        ...selection,
        selectedRosterRevision: roster.rosterRevision,
        state: 'removed',
      }
    }

    return {
      ...selection,
      selectedRosterRevision: roster.rosterRevision,
      safeDisplayName: person.safeDisplayName,
      participantKind: person.participantKind,
      position: person.position,
      state: 'valid',
    }
  })
  return changed ? withStagedSelections(session, staged) : session
}

export function markEventSelectionsRemoved(
  session: PersonSelectionSession,
  eventId: string,
  observedRosterRevision?: PersonSourceRevision,
): PersonSelectionSession {
  const newestKnownRevision = newestKnownEventRevision(session, eventId)
  if (
    observedRosterRevision !== undefined
    && newestKnownRevision !== null
    && compareRevision(observedRosterRevision, newestKnownRevision) < 0
  ) {
    return session
  }

  let changed = false
  const staged = session.staged.map((selection): StagedPersonSelection => {
    if (!isStagedEventPerson(selection) || selection.key.eventId !== eventId) {
      return selection
    }
    if (
      selection.state === 'removed'
      && (
        observedRosterRevision === undefined
        || compareRevision(observedRosterRevision, selection.selectedRosterRevision) === 0
      )
    ) {
      return selection
    }

    changed = true
    return {
      ...selection,
      selectedRosterRevision: observedRosterRevision
        ?? selection.selectedRosterRevision,
      state: 'removed',
    }
  })
  return changed ? withStagedSelections(session, staged) : session
}
