'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react'
import { useTranslations } from 'next-intl'
import {
  RelationshipPartyPicker,
  type RelationshipPartyPickerCopy,
  type RelationshipPartyPickerSelectionResult,
  type RelationshipPartyPickerSource,
} from '@/components/tengsl/RelationshipPartyPicker'
import {
  EventGuestBrowser,
  type EventGuestBrowserCopy,
  type EventGuestBrowserInteraction,
  type EventGuestBrowserProvider,
} from '@/components/events/EventGuestBrowser'
import {
  canConfirmPersonSelection,
  createPersonSelectionSession,
  deselectFilteredSelectable,
  getConfirmedPersonSelections,
  getStagedPersonSelection,
  getTotalSelectedCount,
  isPersonSelected,
  markAllEventSelectionsNeedsRevalidation,
  markEventSelectionsRemoved,
  markEventSelectionsNeedsRevalidation,
  reconcileEventSelections,
  removeEventSelections,
  removePersonSelection,
  selectFilteredSelectable,
  serializePersonSelectionKey,
  stagePersonSelection,
  type CrossEventPolicy,
  type EventPersonSelectionKey,
  type PersonSelectionKey,
  type PersonSelectionSession,
  type SelectionCandidate,
  type StagedEventPerson,
  type StagedManualPerson,
  type StagedPersonSelection,
  type StagedRelationshipPerson,
} from './person-selection-state'
import {
  loadEventPersonSourcePage,
  loadEventPersonSourceRoster,
} from '@/lib/events/person-source.actions'
import type { PersonSourceRosterView } from '@/lib/events/person-source.presentation'

const unsafeControls = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const simpleEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export type TeskeidPersonPickerRelationship = {
  relationshipId: string
  displayName: string
  secondaryLabel?: string | null
  searchAliases?: string[]
  customLabels?: Array<{ id: string; name: string }>
  disabledReason?: string | null
}

export type TeskeidPersonPickerMode =
  | { kind: 'single'; presentation: 'close-on-select' | 'confirm' }
  | { kind: 'multiple' }

export type TeskeidPersonPickerDestinationCopy = {
  triggerLabel: string
  title: string
  description: string
  closeLabel: string
}

type CursorEventGuestBrowserProvider = Extract<EventGuestBrowserProvider, { kind: 'cursor-lazy' }>

function defaultEventProvider(): CursorEventGuestBrowserProvider {
  return {
    kind: 'cursor-lazy',
    providerKey: 'sql153-event-person-source-v3',
    loadPage: loadEventPersonSourcePage,
    loadRoster: loadEventPersonSourceRoster,
  }
}

function parseManualSelection(
  value: string,
  draftRef: string,
): StagedManualPerson | null {
  const normalized = value.trim().normalize('NFC')
  if (!normalized || unsafeControls.test(normalized)) return null
  if (normalized.includes('@')) {
    const email = normalized.toLocaleLowerCase('en-US')
    if (email.length > 320 || !simpleEmail.test(email)) return null
    return {
      key: { source: 'manual', draftRef },
      safeDisplayName: email,
      value: { kind: 'email', recipientEmail: email },
      state: 'valid',
    }
  }
  if (normalized.length > 120) return null
  return {
    key: { source: 'manual', draftRef },
    safeDisplayName: normalized,
    value: { kind: 'name', displayName: normalized },
    state: 'valid',
  }
}

function selectionLabel(
  selection: StagedPersonSelection,
  eventFallback: (position: number) => string,
): string {
  if ('selectedRosterRevision' in selection) {
    return selection.safeDisplayName ?? eventFallback(selection.position + 1)
  }
  return selection.safeDisplayName ?? eventFallback(1)
}

function eventSelection(
  key: EventPersonSelectionKey,
  roster: PersonSourceRosterView,
): StagedEventPerson | null {
  const person = roster.people.find((candidate) => candidate.personRef === key.personRef)
  if (!person) return null
  return {
    key,
    selectedRosterRevision: roster.rosterRevision,
    safeDisplayName: person.displayName,
    participantKind: person.participantKind,
    position: person.position,
    state: 'valid',
  }
}

export function TeskeidPersonPicker({
  relationships,
  relationshipsError = false,
  mode,
  crossEventPolicy = { kind: 'allow' },
  initialSelections = [],
  disabledReasons,
  destinationCopy,
  disabled = false,
  initialSourceId = 'relationships',
  eventProvider,
  triggerRef,
  onConfirm,
}: {
  relationships: readonly TeskeidPersonPickerRelationship[]
  relationshipsError?: boolean
  mode: TeskeidPersonPickerMode
  crossEventPolicy?: CrossEventPolicy
  initialSelections?: readonly StagedPersonSelection[]
  disabledReasons?: ReadonlyMap<string, string>
  destinationCopy: TeskeidPersonPickerDestinationCopy
  disabled?: boolean
  initialSourceId?: 'relationships' | 'events' | 'manual'
  eventProvider?: CursorEventGuestBrowserProvider
  triggerRef?: Ref<HTMLButtonElement>
  onConfirm: (selection: readonly StagedPersonSelection[]) => void
}) {
  const commonT = useTranslations('teskeid.peoplePicker')
  const eventT = useTranslations('teskeid.events.personPicker')
  const [session, setSession] = useState<PersonSelectionSession>(() => (
    markAllEventSelectionsNeedsRevalidation(createPersonSelectionSession(initialSelections))
  ))
  const [statusAnnouncement, setStatusAnnouncement] = useState({
    sequence: 0,
    message: '',
  })
  const rosterByEventRef = useRef(new Map<string, PersonSourceRosterView>())
  const pendingConfirmationRef = useRef<readonly StagedPersonSelection[] | null>(null)
  const manualDraftSequenceRef = useRef(0)
  const provider = useMemo(() => eventProvider ?? defaultEventProvider(), [eventProvider])
  const providerKeyRef = useRef(provider.providerKey)
  const totalSelectedCount = getTotalSelectedCount(session)

  const announce = useCallback((message: string) => {
    setStatusAnnouncement((current) => ({
      sequence: current.sequence + 1,
      message,
    }))
  }, [])

  function announceSession(nextSession: PersonSelectionSession) {
    announce(commonT('selectedCount', { count: getTotalSelectedCount(nextSession) }))
  }

  useEffect(() => {
    if (providerKeyRef.current === provider.providerKey) return
    providerKeyRef.current = provider.providerKey
    rosterByEventRef.current.clear()
    setSession((current) => markAllEventSelectionsNeedsRevalidation(current))
  }, [provider.providerKey])

  const pickerCopy: RelationshipPartyPickerCopy = {
    triggerLabel: destinationCopy.triggerLabel,
    title: destinationCopy.title,
    description: destinationCopy.description,
    closeLabel: destinationCopy.closeLabel,
    sourceLabel: commonT('sourceLabel'),
    searchLabel: commonT('relationshipSearchLabel'),
    searchPlaceholder: commonT('relationshipSearchPlaceholder'),
    filterLabel: commonT('relationshipFilterLabel'),
    allFilterLabel: commonT('relationshipAllFilter'),
    noResultsLabel: commonT('relationshipEmpty'),
    loadErrorLabel: commonT('relationshipLoadError'),
  }

  const eventCopy: EventGuestBrowserCopy = {
    eventSearchLabel: eventT('eventSearchLabel'),
    eventSearchPlaceholder: eventT('eventSearchPlaceholder'),
    loadedSearchHint: eventT('loadedSearchHint'),
    noLoadedResults: eventT('noLoadedResults'),
    noResults: eventT('noResults'),
    directoryLoading: eventT('directoryLoading'),
    directoryLoadError: eventT('directoryLoadError'),
    loadMore: eventT('loadMore'),
    loadingMore: eventT('loadingMore'),
    retry: eventT('retry'),
    retrying: eventT('retrying'),
    selectedEvent: eventT('selectedEvent'),
    backToEvents: eventT('backToEvents'),
    rosterLoading: eventT('rosterLoading'),
    rosterLoadError: eventT('rosterLoadError'),
    rosterSearchLabel: eventT('rosterSearchLabel'),
    rosterSearchPlaceholder: eventT('rosterSearchPlaceholder'),
    noPeople: eventT('noPeople'),
    personFallback: (position) => eventT('personFallback', { position }),
    nameMissing: eventT('nameMissing'),
    personCount: (count) => eventT('personCount', { count }),
    selectAll: eventT('selectAll'),
    deselectAll: eventT('deselectAll'),
    selectedSummary: (total) => eventT('selectedSummary', { total }),
    visibleSelectedSummary: (selected, visible) => eventT('visibleSelectedSummary', {
      selected,
      visible,
    }),
    selectedReason: eventT('selectedReason'),
    staleReason: eventT('staleReason'),
    removedReason: eventT('removedReason'),
    transitionLoading: eventT('transitionLoading'),
    nameRequiredReason: eventT('nameRequiredReason'),
    profileNameRequiredReason: eventT('profileNameRequiredReason'),
    notActiveReason: eventT('notActiveReason'),
    rsvpNoResponse: eventT('rsvp.noResponse'),
    rsvpConsidering: eventT('rsvp.considering'),
    rsvpAttending: eventT('rsvp.attending'),
    rsvpNotAttending: eventT('rsvp.notAttending'),
    privateNoteLabel: eventT('privateNoteLabel'),
    hiddenLabels: (count) => eventT('hiddenLabels', { count }),
    builtInTagLabel: (tag) => eventT(`tags.${tag}`),
  }

  function replaceForSingle(selection: StagedPersonSelection): PersonSelectionSession {
    return createPersonSelectionSession([selection])
  }

  function stageSelection(
    selection: StagedPersonSelection,
  ): { accepted: true; session: PersonSelectionSession } | { accepted: false; error: string } {
    if (mode.kind === 'single') {
      const next = replaceForSingle(selection)
      setSession(next)
      return { accepted: true, session: next }
    }
    const result = stagePersonSelection(session, selection, crossEventPolicy)
    if (!result.accepted) return { accepted: false, error: eventT('switchBlocked') }
    setSession(result.session)
    return { accepted: true, session: result.session }
  }

  function prepareClose(nextSession: PersonSelectionSession): RelationshipPartyPickerSelectionResult {
    const confirmed = getConfirmedPersonSelections(nextSession)
    if (!confirmed) return { accepted: false, error: commonT('invalidSelection') }
    pendingConfirmationRef.current = confirmed
    return { accepted: true }
  }

  function selectRelationship(relationshipId: string): RelationshipPartyPickerSelectionResult {
    const relationship = relationships.find((candidate) => (
      candidate.relationshipId === relationshipId
    ))
    if (!relationship) return { accepted: false, error: commonT('relationshipLoadError') }
    const key = { source: 'relationship' as const, relationshipId }
    if (disabledReasons?.has(serializePersonSelectionKey(key)) || relationship.disabledReason) {
      return { accepted: false, error: relationship.disabledReason ?? disabledReasons?.get(serializePersonSelectionKey(key)) }
    }
    if (mode.kind === 'multiple' && isPersonSelected(session, key)) {
      const next = removePersonSelection(session, key)
      setSession(next)
      announceSession(next)
      return { accepted: true, behavior: 'stay-open' }
    }
    const staged: StagedRelationshipPerson = {
      key,
      safeDisplayName: relationship.displayName,
      state: 'valid',
    }
    const result = stageSelection(staged)
    if (!result.accepted) return result
    announceSession(result.session)
    return mode.kind === 'single' && mode.presentation === 'close-on-select'
      ? prepareClose(result.session)
      : { accepted: true, behavior: 'stay-open' }
  }

  function selectManual(value: string): RelationshipPartyPickerSelectionResult {
    manualDraftSequenceRef.current += 1
    const staged = parseManualSelection(value, `manual-${manualDraftSequenceRef.current}`)
    if (!staged) return { accepted: false, error: commonT('manualInvalid') }
    const result = stageSelection(staged)
    if (!result.accepted) return result
    announceSession(result.session)
    return mode.kind === 'single' && mode.presentation === 'close-on-select'
      ? prepareClose(result.session)
      : { accepted: true, behavior: 'stay-open' }
  }

  function stagedEventForKey(key: EventPersonSelectionKey): StagedEventPerson | null {
    const roster = rosterByEventRef.current.get(key.eventId)
    return roster ? eventSelection(key, roster) : null
  }

  function selectEventKey(key: EventPersonSelectionKey): RelationshipPartyPickerSelectionResult {
    if (disabledReasons?.has(serializePersonSelectionKey(key))) {
      return { accepted: false, error: disabledReasons.get(serializePersonSelectionKey(key)) }
    }
    if (mode.kind === 'multiple' && isPersonSelected(session, key)) {
      const next = removePersonSelection(session, key)
      setSession(next)
      announceSession(next)
      return { accepted: true, behavior: 'stay-open' }
    }
    const staged = stagedEventForKey(key)
    if (!staged) return { accepted: false, error: eventT('rosterLoadError') }
    const result = stageSelection(staged)
    if (!result.accepted) return result
    return mode.kind === 'single' && mode.presentation === 'close-on-select'
      ? prepareClose(result.session)
      : { accepted: true, behavior: 'stay-open' }
  }

  const observeEvents = useCallback((events: readonly { eventId: string; rosterRevision: number | string }[]) => {
    setSession((current) => events.reduce((next, event) => (
      markEventSelectionsNeedsRevalidation(next, event.eventId, event.rosterRevision)
    ), current))
  }, [])

  const observeRoster = useCallback((roster: PersonSourceRosterView) => {
    rosterByEventRef.current.set(roster.eventId, roster)
    setSession((current) => reconcileEventSelections(current, {
      eventId: roster.eventId,
      rosterRevision: roster.rosterRevision,
      people: roster.people.map((person) => ({
        personRef: person.personRef,
        participantKind: person.participantKind,
        safeDisplayName: person.displayName,
        position: person.position,
      })),
    }))
  }, [])

  const observeRosterUnavailable = useCallback((eventId: string) => {
    rosterByEventRef.current.delete(eventId)
    setSession((current) => markEventSelectionsRemoved(current, eventId))
  }, [])

  const observeDirectoryComplete = useCallback((events: readonly { eventId: string }[]) => {
    const availableEventIds = new Set(events.map((event) => event.eventId))
    setSession((current) => current.staged.reduce((next, selection) => (
      selection.key.source === 'event' && !availableEventIds.has(selection.key.eventId)
        ? markEventSelectionsRemoved(next, selection.key.eventId)
        : next
    ), current))
  }, [])

  const selectedEventKeys = new Set(session.staged.flatMap((selection) => (
    selection.key.source === 'event'
      ? [serializePersonSelectionKey(selection.key)]
      : []
  )))
  const selectedSingleEventKey = session.staged.find((selection) => (
    selection.key.source === 'event'
  ))?.key
  const selectedSingleSerialized = selectedSingleEventKey?.source === 'event'
    ? serializePersonSelectionKey(selectedSingleEventKey)
    : null

  function eventSwitchBlockReason(eventId: string): string | null {
    if (crossEventPolicy.kind !== 'single-event') return null
    const selectedEventIds = new Set(session.staged.flatMap((selection) => (
      selection.key.source === 'event' ? [selection.key.eventId] : []
    )))
    return selectedEventIds.size === 0 || selectedEventIds.has(eventId)
      ? null
      : eventT('switchBlocked')
  }

  function bulkCandidates(keys: readonly EventPersonSelectionKey[]): SelectionCandidate[] {
    return keys.flatMap((key) => {
      const staged = stagedEventForKey(key)
      return staged ? [{
        selection: staged,
        disabled: disabledReasons?.has(serializePersonSelectionKey(key)) ?? false,
      }] : []
    })
  }

  function eventInteraction(
    completeSelection: (result: RelationshipPartyPickerSelectionResult) => void,
  ): EventGuestBrowserInteraction {
    if (mode.kind === 'single' && mode.presentation === 'close-on-select') {
      return {
        kind: 'command',
        completedKeys: selectedEventKeys,
        activate: (key) => {
          const result = selectEventKey(key)
          completeSelection(result)
          return result.accepted
            ? { accepted: true }
            : { accepted: false, error: result.error ?? eventT('rosterLoadError') }
        },
      }
    }
    if (mode.kind === 'single') {
      return {
        kind: 'single-choice',
        selectedKey: selectedSingleSerialized,
        toggle: (key) => {
          selectEventKey(key)
        },
      }
    }
    return {
      kind: 'multiple-choice',
      selectedKeys: selectedEventKeys,
      bulkControls: true,
      toggle: (key) => {
        selectEventKey(key)
      },
      selectVisible: (keys) => {
        const result = selectFilteredSelectable(session, bulkCandidates(keys), crossEventPolicy)
        if (result.accepted) setSession(result.session)
      },
      deselectVisible: (keys) => {
        setSession(deselectFilteredSelectable(session, bulkCandidates(keys)))
      },
    }
  }

  const sources: RelationshipPartyPickerSource[] = [
    {
      id: 'relationships',
      label: commonT('relationships'),
      type: 'options',
      optionControl: mode.kind === 'single' && mode.presentation === 'close-on-select'
        ? 'action'
        : mode.kind === 'single'
          ? 'radio'
          : 'checkbox',
      options: relationships.map((relationship) => {
        const key = { source: 'relationship' as const, relationshipId: relationship.relationshipId }
        return {
          id: relationship.relationshipId,
          primaryLabel: relationship.displayName,
          secondaryLabel: relationship.secondaryLabel,
          searchAliases: relationship.searchAliases,
          customLabels: relationship.customLabels,
          selected: isPersonSelected(session, key),
          disabledReason: relationship.disabledReason
            ?? disabledReasons?.get(serializePersonSelectionKey(key)),
        }
      }),
      optionsError: relationshipsError,
      loadErrorLabel: commonT('relationshipLoadError'),
      searchLabel: commonT('relationshipSearchLabel'),
      searchPlaceholder: commonT('relationshipSearchPlaceholder'),
      filterLabel: commonT('relationshipFilterLabel'),
      allFilterLabel: commonT('relationshipAllFilter'),
      noResultsLabel: commonT('relationshipEmpty'),
      onSelectOption: selectRelationship,
    },
    {
      id: 'events',
      label: commonT('events'),
      type: 'custom',
      render: ({ completeSelection, setError }) => (
        <EventGuestBrowser
          provider={provider}
          interaction={eventInteraction(completeSelection)}
          copy={eventCopy}
          totalSelectedCount={totalSelectedCount}
          getEventDisabledReason={(event) => eventSwitchBlockReason(event.eventId)}
          navigation={{
            requestOpenEvent: (event) => {
              const error = eventSwitchBlockReason(event.eventId)
              return error ? { accepted: false, error } : { accepted: true }
            },
          }}
          getDisabledReason={({ key }) => (
            disabledReasons?.get(serializePersonSelectionKey(key)) ?? null
          )}
          getSelectionValidity={(key) => getStagedPersonSelection(session, key)?.state ?? null}
          onError={setError}
          onEventsObserved={observeEvents}
          onDirectoryComplete={observeDirectoryComplete}
          onRosterObserved={observeRoster}
          onRosterUnavailable={observeRosterUnavailable}
          onAnnouncement={announce}
        />
      ),
    },
    {
      id: 'manual',
      label: commonT('manual'),
      type: 'manual',
      inputLabel: commonT('manualLabel'),
      inputPlaceholder: commonT('manualPlaceholder'),
      hint: commonT('manualHint'),
      submitLabel: commonT('manualSubmit'),
      inputMaxLength: 320,
      onSelect: selectManual,
    },
  ]

  function confirm(
    completeSelection: (result: RelationshipPartyPickerSelectionResult) => void,
    setError: (error: string | null) => void,
  ) {
    const confirmed = getConfirmedPersonSelections(session)
    if (!confirmed) {
      setError(commonT('invalidSelection'))
      return
    }
    pendingConfirmationRef.current = confirmed
    completeSelection({ accepted: true })
  }

  return (
    <RelationshipPartyPicker
      disabled={disabled}
      sources={sources}
      initialSourceId={initialSourceId}
      triggerRef={triggerRef}
      copy={pickerCopy}
      onOpen={() => {
        pendingConfirmationRef.current = null
        rosterByEventRef.current.clear()
        setSession(markAllEventSelectionsNeedsRevalidation(
          createPersonSelectionSession(initialSelections),
        ))
        setStatusAnnouncement((current) => ({ sequence: current.sequence + 1, message: '' }))
      }}
      onDismiss={() => {
        pendingConfirmationRef.current = null
        rosterByEventRef.current.clear()
        setSession(markAllEventSelectionsNeedsRevalidation(
          createPersonSelectionSession(initialSelections),
        ))
      }}
      onSelectionClosed={() => {
        const confirmed = pendingConfirmationRef.current
        pendingConfirmationRef.current = null
        if (confirmed) onConfirm(confirmed)
      }}
      statusAnnouncement={statusAnnouncement}
      renderFooter={mode.kind === 'single' && mode.presentation === 'close-on-select'
        ? undefined
        : ({ completeSelection, setError }) => (
          <div className="mt-5 space-y-3 border-t border-border pt-4">
            <p className="text-sm font-medium">{commonT('selectedCount', { count: totalSelectedCount })}</p>
            {session.staged.length > 0 ? (
              <div className="divide-y divide-border rounded-xl border border-border">
                {session.staged.map((selection) => {
                  const name = selectionLabel(selection, eventCopy.personFallback)
                  const invalidReason = selection.state === 'needs_revalidation'
                    ? eventCopy.staleReason
                    : selection.state === 'removed'
                      ? eventCopy.removedReason
                      : null
                  return (
                    <div key={serializePersonSelectionKey(selection.key)} className="flex min-h-11 items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm">{name}</span>
                        {invalidReason ? <span className="block text-xs text-destructive">{invalidReason}</span> : null}
                      </span>
                      <button
                        type="button"
                        className="inline-flex min-h-10 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={commonT('removeSelection', { name })}
                        onClick={() => {
                          const next = removePersonSelection(session, selection.key)
                          setSession(next)
                          announceSession(next)
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : null}
            {crossEventPolicy.kind === 'single-event' && session.staged.some((selection) => (
              selection.key.source === 'event'
            )) ? (
              <button
                type="button"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  const eventId = session.staged.find((selection) => (
                    selection.key.source === 'event'
                  ))?.key
                  if (eventId?.source === 'event') {
                    const next = removeEventSelections(session, eventId.eventId)
                    setSession(next)
                    announceSession(next)
                  }
                }}
              >
                {commonT('clearEventSelection')}
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
              disabled={!canConfirmPersonSelection(session)}
              onClick={() => confirm(completeSelection, setError)}
            >
              {commonT('continue')}
            </button>
          </div>
        )}
    />
  )
}
