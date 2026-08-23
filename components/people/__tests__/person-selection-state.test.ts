import { describe, expect, it } from 'vitest'
import {
  canConfirmPersonSelection,
  createPersonSelectionSession,
  deselectFilteredSelectable,
  getConfirmedPersonSelections,
  getStagedPersonSelection,
  getTotalSelectedCount,
  getVisibleSelectionSummary,
  isPersonSelected,
  markAllEventSelectionsNeedsRevalidation,
  markEventSelectionsNeedsRevalidation,
  markEventSelectionsRemoved,
  personSelectionKeysEqual,
  reconcileEventSelections,
  removeEventSelections,
  removePersonSelection,
  resetPersonSelectionSession,
  selectFilteredSelectable,
  serializePersonSelectionKey,
  stagePersonSelection,
  type CrossEventPolicy,
  type PersonSelectionSession,
  type SelectionChangeResult,
  type StagedEventPerson,
  type StagedManualPerson,
  type StagedPersonSelection,
  type StagedRelationshipPerson,
} from '../person-selection-state'

const ALLOW_CROSS_EVENT: CrossEventPolicy = { kind: 'allow' }
const SINGLE_EVENT: CrossEventPolicy = {
  kind: 'single-event',
  switchBehavior: 'block-until-clear',
}

function relationship(
  relationshipId: string,
  safeDisplayName = relationshipId,
): StagedRelationshipPerson {
  return {
    key: { source: 'relationship', relationshipId },
    safeDisplayName,
    state: 'valid',
  }
}

function eventPerson(
  eventId: string,
  personRef: string,
  overrides: Partial<Omit<StagedEventPerson, 'key'>> = {},
): StagedEventPerson {
  return {
    key: { source: 'event', eventId, personRef },
    selectedRosterRevision: 1,
    safeDisplayName: personRef,
    participantKind: 'guest',
    position: 1,
    state: 'valid',
    ...overrides,
  }
}

function manual(
  draftRef: string,
  safeDisplayName = draftRef,
): StagedManualPerson {
  return {
    key: { source: 'manual', draftRef },
    safeDisplayName,
    value: { kind: 'name', displayName: safeDisplayName },
    state: 'valid',
  }
}

function accepted(result: SelectionChangeResult): PersonSelectionSession {
  expect(result.accepted).toBe(true)
  if (!result.accepted) throw new Error(result.reason)
  return result.session
}

describe('canonical person selection keys', () => {
  it('serializes structured keys without delimiter or source collisions', () => {
    const keys = [
      { source: 'relationship', relationshipId: 'event:a:b' } as const,
      { source: 'event', eventId: 'a', personRef: 'b:c' } as const,
      { source: 'event', eventId: 'a:b', personRef: 'c' } as const,
      { source: 'manual', draftRef: 'event:a:b:c' } as const,
      { source: 'event', eventId: '["a"]', personRef: '","b"' } as const,
    ]

    const serialized = keys.map(serializePersonSelectionKey)
    expect(new Set(serialized).size).toBe(keys.length)
    expect(serialized[1]).toBe('["event","a","b:c"]')
  })

  it('uses both eventId and opaque personRef for Event equality', () => {
    expect(personSelectionKeysEqual(
      { source: 'event', eventId: 'event-a', personRef: 'person-1' },
      { source: 'event', eventId: 'event-a', personRef: 'person-1' },
    )).toBe(true)
    expect(personSelectionKeysEqual(
      { source: 'event', eventId: 'event-a', personRef: 'person-1' },
      { source: 'event', eventId: 'event-b', personRef: 'person-1' },
    )).toBe(false)
    expect(personSelectionKeysEqual(
      { source: 'relationship', relationshipId: 'person-1' },
      { source: 'manual', draftRef: 'person-1' },
    )).toBe(false)
  })
})

describe('person selection sessions', () => {
  it('deduplicates exact keys, keeps the latest metadata and resets to the initial snapshot', () => {
    const session = createPersonSelectionSession([
      relationship('relationship-1', 'Gamalt heiti'),
      relationship('relationship-1', 'Nýtt heiti'),
    ])

    expect(getTotalSelectedCount(session)).toBe(1)
    expect(getStagedPersonSelection(session, {
      source: 'relationship',
      relationshipId: 'relationship-1',
    })).toMatchObject({ safeDisplayName: 'Nýtt heiti' })

    const changed = accepted(stagePersonSelection(
      session,
      manual('manual-1', 'Gestur'),
      ALLOW_CROSS_EVENT,
    ))
    expect(getTotalSelectedCount(changed)).toBe(2)
    expect(getTotalSelectedCount(session)).toBe(1)

    const reset = resetPersonSelectionSession(changed)
    expect(getTotalSelectedCount(reset)).toBe(1)
    expect(isPersonSelected(reset, { source: 'manual', draftRef: 'manual-1' })).toBe(false)
  })

  it('replaces exact-key metadata without duplicating the selection', () => {
    const original = createPersonSelectionSession([
      eventPerson('event-a', 'person-1', { safeDisplayName: 'Gamalt' }),
    ])
    const result = stagePersonSelection(
      original,
      eventPerson('event-a', 'person-1', { safeDisplayName: 'Nýtt' }),
      SINGLE_EVENT,
    )

    expect(result).toMatchObject({ accepted: true, addedCount: 0 })
    const changed = accepted(result)
    expect(getTotalSelectedCount(changed)).toBe(1)
    expect(getStagedPersonSelection(changed, {
      source: 'event',
      eventId: 'event-a',
      personRef: 'person-1',
    })).toMatchObject({ safeDisplayName: 'Nýtt' })
  })

  it('removes one exact key or all staged refs from one Event only', () => {
    const session = createPersonSelectionSession([
      relationship('relationship-1'),
      eventPerson('event-a', 'person-1'),
      eventPerson('event-a', 'person-2'),
      eventPerson('event-b', 'person-1'),
    ])

    const removedOne = removePersonSelection(session, {
      source: 'event', eventId: 'event-a', personRef: 'person-1',
    })
    expect(getTotalSelectedCount(removedOne)).toBe(3)
    expect(isPersonSelected(removedOne, {
      source: 'event', eventId: 'event-b', personRef: 'person-1',
    })).toBe(true)

    const clearedEvent = removeEventSelections(removedOne, 'event-a')
    expect(clearedEvent.staged.map((selection) => selection.key)).toEqual([
      { source: 'relationship', relationshipId: 'relationship-1' },
      { source: 'event', eventId: 'event-b', personRef: 'person-1' },
    ])
    expect(removeEventSelections(clearedEvent, 'missing-event')).toBe(clearedEvent)
  })

  it('returns an immutable confirmed snapshot only when non-empty and fully valid', () => {
    const empty = createPersonSelectionSession()
    expect(canConfirmPersonSelection(empty)).toBe(false)
    expect(getConfirmedPersonSelections(empty)).toBeNull()

    const valid = createPersonSelectionSession([
      relationship('relationship-1'),
      manual('manual-1'),
    ])
    const confirmed = getConfirmedPersonSelections(valid)
    expect(confirmed).not.toBeNull()
    expect(Object.isFrozen(confirmed)).toBe(true)
    expect(Object.isFrozen(confirmed?.[0])).toBe(true)
    expect(Object.isFrozen(confirmed?.[0]?.key)).toBe(true)
    expect(Object.isFrozen((confirmed?.[1] as StagedManualPerson).value)).toBe(true)

    const stale = createPersonSelectionSession([
      eventPerson('event-a', 'person-1', { state: 'needs_revalidation' }),
    ])
    expect(canConfirmPersonSelection(stale)).toBe(false)
    expect(getConfirmedPersonSelections(stale)).toBeNull()
  })
})

describe('cross-Event selection policy', () => {
  it('allows exact selections from multiple Events when the destination policy allows it', () => {
    const first = accepted(stagePersonSelection(
      createPersonSelectionSession(),
      eventPerson('event-a', 'person-1'),
      ALLOW_CROSS_EVENT,
    ))
    const second = accepted(stagePersonSelection(
      first,
      eventPerson('event-b', 'person-2'),
      ALLOW_CROSS_EVENT,
    ))

    expect(second.staged.map((selection) => selection.key)).toEqual([
      { source: 'event', eventId: 'event-a', personRef: 'person-1' },
      { source: 'event', eventId: 'event-b', personRef: 'person-2' },
    ])
  })

  it('blocks a second Event atomically under single-event policy without affecting other sources', () => {
    const session = createPersonSelectionSession([
      relationship('relationship-1'),
      eventPerson('event-a', 'person-1'),
    ])
    const blocked = stagePersonSelection(
      session,
      eventPerson('event-b', 'person-2'),
      SINGLE_EVENT,
    )

    expect(blocked).toEqual({
      accepted: false,
      reason: 'cross_event_blocked',
      blockingEventIds: ['event-a', 'event-b'],
      attemptedEventIds: ['event-b'],
    })
    expect(getTotalSelectedCount(session)).toBe(2)

    const withManual = accepted(stagePersonSelection(
      session,
      manual('manual-1'),
      SINGLE_EVENT,
    ))
    expect(getTotalSelectedCount(withManual)).toBe(3)

    const cleared = removeEventSelections(withManual, 'event-a')
    const switched = accepted(stagePersonSelection(
      cleared,
      eventPerson('event-b', 'person-2'),
      SINGLE_EVENT,
    ))
    expect(isPersonSelected(switched, {
      source: 'event', eventId: 'event-b', personRef: 'person-2',
    })).toBe(true)
  })

  it('blocks a mixed-Event bulk selection as one operation', () => {
    const session = createPersonSelectionSession()
    const result = selectFilteredSelectable(session, [
      { selection: eventPerson('event-a', 'person-1') },
      { selection: eventPerson('event-b', 'person-2') },
    ], SINGLE_EVENT)

    expect(result).toMatchObject({
      accepted: false,
      reason: 'cross_event_blocked',
      blockingEventIds: ['event-a', 'event-b'],
    })
    expect(getTotalSelectedCount(session)).toBe(0)
  })
})

describe('filtered selectable set algebra and counts', () => {
  it('unions only filtered enabled rows while preserving hidden selections', () => {
    const hidden = relationship('relationship-hidden')
    const session = createPersonSelectionSession([hidden])
    const visible = eventPerson('event-a', 'person-1', { safeDisplayName: 'Fyrra heiti' })
    const visibleLatest = eventPerson('event-a', 'person-1', { safeDisplayName: 'Nýjasta heiti' })
    const disabled = eventPerson('event-a', 'person-2')
    const result = selectFilteredSelectable(session, [
      { selection: visible },
      { selection: disabled, disabled: true },
      { selection: visibleLatest },
    ], SINGLE_EVENT)

    expect(result).toMatchObject({ accepted: true, addedCount: 1 })
    const changed = accepted(result)
    expect(getTotalSelectedCount(changed)).toBe(2)
    expect(isPersonSelected(changed, hidden.key)).toBe(true)
    expect(isPersonSelected(changed, disabled.key)).toBe(false)
    expect(getStagedPersonSelection(changed, visible.key)).toMatchObject({
      safeDisplayName: 'Nýjasta heiti',
    })
  })

  it('subtracts only current filtered selectable rows and preserves hidden and disabled rows', () => {
    const hidden = relationship('relationship-hidden')
    const visible = eventPerson('event-a', 'person-1')
    const disabled = eventPerson('event-a', 'person-2')
    const otherEvent = eventPerson('event-b', 'person-3')
    const session = createPersonSelectionSession([hidden, visible, disabled, otherEvent])

    const changed = deselectFilteredSelectable(session, [
      { selection: visible },
      { selection: disabled, disabled: true },
    ])

    expect(changed.staged.map((selection) => selection.key)).toEqual([
      hidden.key,
      disabled.key,
      otherEvent.key,
    ])
  })

  it('keeps total and visible selected counts distinct and exposes mixed/master state', () => {
    const hidden = relationship('relationship-hidden')
    const selectedVisible = eventPerson('event-a', 'person-1')
    const unselectedVisible = eventPerson('event-a', 'person-2')
    const disabledVisible = eventPerson('event-a', 'person-3')
    const session = createPersonSelectionSession([hidden, selectedVisible])
    const candidates = [
      { selection: selectedVisible },
      { selection: unselectedVisible },
      { selection: disabledVisible, disabled: true },
    ]

    expect(getVisibleSelectionSummary(session, candidates)).toEqual({
      totalSelectedCount: 2,
      visibleSelectableCount: 2,
      visibleSelectedCount: 1,
      checked: false,
      indeterminate: true,
      action: 'select-all',
    })

    const allVisible = accepted(selectFilteredSelectable(
      session,
      candidates,
      SINGLE_EVENT,
    ))
    expect(getVisibleSelectionSummary(allVisible, candidates)).toMatchObject({
      totalSelectedCount: 3,
      visibleSelectableCount: 2,
      visibleSelectedCount: 2,
      checked: true,
      indeterminate: false,
      action: 'deselect-all',
    })
  })

  it('treats zero selectable rows as an accepted no-op with an unchecked master state', () => {
    const session = createPersonSelectionSession([relationship('hidden')])
    const candidates = [
      { selection: eventPerson('event-a', 'disabled'), disabled: true },
    ]
    const result = selectFilteredSelectable(session, candidates, SINGLE_EVENT)

    expect(result).toMatchObject({ accepted: true, addedCount: 0 })
    expect(accepted(result)).toBe(session)
    expect(deselectFilteredSelectable(session, candidates)).toBe(session)
    expect(getVisibleSelectionSummary(session, candidates)).toEqual({
      totalSelectedCount: 1,
      visibleSelectableCount: 0,
      visibleSelectedCount: 0,
      checked: false,
      indeterminate: false,
      action: 'select-all',
    })
  })
})

describe('Event roster validity lifecycle', () => {
  it('invalidates every staged Event ref when its authority provider changes', () => {
    const session = createPersonSelectionSession([
      eventPerson('event-a', 'person-1'),
      eventPerson('event-b', 'person-2', { state: 'removed' }),
      relationship('relationship-1'),
    ])

    const invalidated = markAllEventSelectionsNeedsRevalidation(session)

    expect(invalidated.staged.map((selection) => selection.state)).toEqual([
      'needs_revalidation',
      'needs_revalidation',
      'valid',
    ])
    expect(markAllEventSelectionsNeedsRevalidation(invalidated)).toBe(invalidated)
  })

  it('marks only refs from an Event with a newer observed revision as needing revalidation', () => {
    const session = createPersonSelectionSession([
      eventPerson('event-a', 'person-1', { selectedRosterRevision: 2 }),
      eventPerson('event-b', 'person-2', { selectedRosterRevision: 5 }),
      relationship('relationship-1'),
    ])

    const stale = markEventSelectionsNeedsRevalidation(session, 'event-a', 4)
    expect(getStagedPersonSelection(stale, {
      source: 'event', eventId: 'event-a', personRef: 'person-1',
    })).toMatchObject({
      selectedRosterRevision: 4,
      state: 'needs_revalidation',
    })
    expect(getStagedPersonSelection(stale, {
      source: 'event', eventId: 'event-b', personRef: 'person-2',
    })).toMatchObject({ selectedRosterRevision: 5, state: 'valid' })
    expect(markEventSelectionsNeedsRevalidation(stale, 'event-a', 4)).toBe(stale)
    expect(markEventSelectionsNeedsRevalidation(stale, 'event-a', 3)).toBe(stale)
  })

  it('revalidates exact refs with authoritative metadata and marks missing refs removed', () => {
    const first = eventPerson('event-a', 'person-1', {
      selectedRosterRevision: 2,
      safeDisplayName: 'Sama heiti',
      state: 'needs_revalidation',
    })
    const missing = eventPerson('event-a', 'person-2', {
      selectedRosterRevision: 2,
      safeDisplayName: 'Sama heiti',
      state: 'needs_revalidation',
    })
    const otherEvent = eventPerson('event-b', 'person-1')
    const session = createPersonSelectionSession([first, missing, otherEvent])
    const reconciled = reconcileEventSelections(session, {
      eventId: 'event-a',
      rosterRevision: 3,
      people: [{
        personRef: 'person-1',
        participantKind: 'organizer',
        safeDisplayName: 'Nýtt öruggt heiti',
        position: 7,
      }],
    })

    expect(getStagedPersonSelection(reconciled, first.key)).toMatchObject({
      selectedRosterRevision: 3,
      safeDisplayName: 'Nýtt öruggt heiti',
      participantKind: 'organizer',
      position: 7,
      state: 'valid',
    })
    expect(getStagedPersonSelection(reconciled, missing.key)).toMatchObject({
      selectedRosterRevision: 3,
      safeDisplayName: 'Sama heiti',
      state: 'removed',
    })
    expect(getStagedPersonSelection(reconciled, otherEvent.key)).toMatchObject({
      state: 'valid',
    })
    expect(canConfirmPersonSelection(reconciled)).toBe(false)
  })

  it('can restore a removed exact ref but never replaces it by label or position', () => {
    const removed = eventPerson('event-a', 'opaque-ref', {
      selectedRosterRevision: 3,
      safeDisplayName: 'Sama heiti',
      position: 2,
      state: 'removed',
    })
    const session = createPersonSelectionSession([removed])

    const stillRemoved = reconcileEventSelections(session, {
      eventId: 'event-a',
      rosterRevision: 4,
      people: [{
        personRef: 'different-ref',
        participantKind: 'guest',
        safeDisplayName: 'Sama heiti',
        position: 2,
      }],
    })
    expect(getStagedPersonSelection(stillRemoved, removed.key)).toMatchObject({
      state: 'removed',
      selectedRosterRevision: 4,
    })

    const restored = reconcileEventSelections(stillRemoved, {
      eventId: 'event-a',
      rosterRevision: 5,
      people: [{
        personRef: 'opaque-ref',
        participantKind: 'guest',
        safeDisplayName: null,
        position: 9,
      }],
    })
    expect(getStagedPersonSelection(restored, removed.key)).toMatchObject({
      state: 'valid',
      selectedRosterRevision: 5,
      safeDisplayName: null,
      position: 9,
    })
  })

  it('ignores older roster snapshots and older inaccessible results', () => {
    const required = createPersonSelectionSession([
      eventPerson('event-a', 'person-1', {
        selectedRosterRevision: 6,
        state: 'needs_revalidation',
      }),
    ])

    const oldRoster = reconcileEventSelections(required, {
      eventId: 'event-a',
      rosterRevision: 5,
      people: [{
        personRef: 'person-1',
        participantKind: 'guest',
        safeDisplayName: 'Gamalt svar',
        position: 1,
      }],
    })
    expect(oldRoster).toBe(required)
    expect(markEventSelectionsRemoved(required, 'event-a', 5)).toBe(required)

    const removed = markEventSelectionsRemoved(required, 'event-a', 6)
    expect(getStagedPersonSelection(removed, {
      source: 'event', eventId: 'event-a', personRef: 'person-1',
    })).toMatchObject({ state: 'removed', selectedRosterRevision: 6 })
  })

  it('marks every exact staged ref for an inaccessible Event as removed and preserves others', () => {
    const eventA1 = eventPerson('event-a', 'person-1')
    const eventA2 = eventPerson('event-a', 'person-2')
    const eventB = eventPerson('event-b', 'person-1')
    const session = createPersonSelectionSession([
      eventA1,
      eventA2,
      eventB,
      relationship('relationship-1'),
    ])
    const removed = markEventSelectionsRemoved(session, 'event-a')

    expect(getStagedPersonSelection(removed, eventA1.key)).toMatchObject({ state: 'removed' })
    expect(getStagedPersonSelection(removed, eventA2.key)).toMatchObject({ state: 'removed' })
    expect(getStagedPersonSelection(removed, eventB.key)).toMatchObject({ state: 'valid' })
    expect(getTotalSelectedCount(removed)).toBe(4)
  })
})

describe('input immutability', () => {
  it('does not mutate caller-owned selection objects or prior sessions', () => {
    const source = eventPerson('event-a', 'person-1')
    const input: StagedPersonSelection[] = [source]
    const session = createPersonSelectionSession(input)
    input.length = 0

    const changed = markEventSelectionsNeedsRevalidation(session, 'event-a', 2)
    expect(session.staged).toHaveLength(1)
    expect(session.staged[0]).toMatchObject({ state: 'valid', selectedRosterRevision: 1 })
    expect(changed.staged[0]).toMatchObject({
      state: 'needs_revalidation',
      selectedRosterRevision: 2,
    })
    expect(source).toMatchObject({ state: 'valid', selectedRosterRevision: 1 })
  })
})
