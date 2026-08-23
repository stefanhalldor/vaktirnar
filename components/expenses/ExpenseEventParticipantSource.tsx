'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  EventGuestBrowser,
  type EagerEventGuestBrowserEvent,
  type EventGuestBrowserCopy,
} from '@/components/events/EventGuestBrowser'
import {
  serializePersonSelectionKey,
  type EventPersonSelectionKey,
} from '@/components/people/person-selection-state'
import type { EventExpenseSourceView } from '@/lib/events/contracts'
import type { LegacyExpenseEventSourceV2 } from '@/lib/events/legacy-expense-event-source-v2.contracts'
import type { RelationshipPartyPickerSelectionResult } from '@/components/tengsl/RelationshipPartyPicker'
import { useExpenseTranslations } from './i18n.client'

function safeLegacyDisplayName(
  guest: EventExpenseSourceView['guests'][number],
): string | null {
  if (guest.sourceKind === 'manual_email' || guest.displayName.includes('@')) return null
  return guest.displayName
}

function mapLegacyEvent(event: EventExpenseSourceView): EagerEventGuestBrowserEvent {
  return {
    eventId: event.id,
    name: event.name,
    rosterRevision: event.rosterRevision,
    activePersonCount: event.guests.length,
    people: event.guests.map((guest, position) => ({
      personRef: guest.id,
      participantKind: guest.participantKind ?? 'guest',
      displayName: safeLegacyDisplayName(guest),
      position,
      isSelf: guest.participantKind === 'organizer' && event.viewerRole === 'owner',
    })),
  }
}

function mapPresentationEvent(event: LegacyExpenseEventSourceV2): EagerEventGuestBrowserEvent {
  return {
    eventId: event.eventId,
    name: event.name,
    rosterRevision: event.rosterRevision,
    activePersonCount: event.people.length,
    people: event.people.map((person) => ({
      personRef: person.legacyPersonRef,
      participantKind: person.participantKind,
      displayName: person.shared.displayName,
      position: person.position,
      isSelf: person.participantKind === 'organizer' && event.viewerRole === 'attendee',
      ...(person.viewerPrivate?.alias ? { primaryLabel: person.viewerPrivate.alias } : {}),
      ...(person.viewerPrivate?.alias && person.shared.displayName
        ? { secondaryLabel: person.shared.displayName }
        : {}),
      ...(person.viewerPrivate?.email ? { privateEmail: person.viewerPrivate.email } : {}),
      ...(person.viewerPrivate
        ? {
            builtInTags: person.viewerPrivate.builtInTags,
            customLabels: person.viewerPrivate.customLabels,
            hiddenCustomLabelCount: person.viewerPrivate.hiddenCustomLabelCount,
            ...(person.viewerPrivate.note ? { privateNote: person.viewerPrivate.note } : {}),
          }
        : {}),
      selectable: person.shared.selectable,
      disabledReason: person.shared.disabledReason,
    })),
  }
}

export function ExpenseEventParticipantSource({
  events,
  presentationEvents,
  eventsError = false,
  selectedEventId,
  selectedEventGuestIds,
  onSelectEvent,
  onClearEvent,
  onAddEventGuest,
  completeSelection,
  setPickerError,
}: {
  events: EventExpenseSourceView[]
  presentationEvents?: LegacyExpenseEventSourceV2[]
  eventsError?: boolean
  selectedEventId: string | null
  selectedEventGuestIds: string[]
  onSelectEvent: (event: EventExpenseSourceView) => RelationshipPartyPickerSelectionResult
  onClearEvent: () => void
  onAddEventGuest: (
    event: EventExpenseSourceView,
    guest: EventExpenseSourceView['guests'][number],
  ) => RelationshipPartyPickerSelectionResult
  completeSelection: (result: RelationshipPartyPickerSelectionResult) => void
  setPickerError: (error: string | null) => void
}) {
  const t = useExpenseTranslations()
  const personT = useTranslations('teskeid.events.personPicker')
  const router = useRouter()
  const mappedEvents = useMemo(() => (
    presentationEvents?.map(mapPresentationEvent) ?? events.map(mapLegacyEvent)
  ), [events, presentationEvents])
  const completedKeys = useMemo(() => {
    const keys = new Set(selectedEventGuestIds.map((personRef) => (
      serializePersonSelectionKey({
        source: 'event',
        eventId: selectedEventId ?? '',
        personRef,
      })
    )))
    events.filter((event) => event.viewerRole === 'owner').forEach((event) => {
      event.guests
        .filter((guest) => guest.participantKind === 'organizer')
        .forEach((guest) => keys.add(serializePersonSelectionKey({
          source: 'event',
          eventId: event.id,
          personRef: guest.id,
        })))
    })
    return keys
  }, [events, selectedEventGuestIds, selectedEventId])

  const copy: EventGuestBrowserCopy = {
    eventSearchLabel: t('expenseForm.eventSearchLabel'),
    eventSearchPlaceholder: t('expenseForm.eventSearchPlaceholder'),
    loadedSearchHint: personT('loadedSearchHint'),
    noLoadedResults: personT('noLoadedResults'),
    noResults: t('expenseForm.noEventResults'),
    directoryLoading: personT('directoryLoading'),
    directoryLoadError: t('expenseForm.eventSourceLoadError'),
    loadMore: personT('loadMore'),
    loadingMore: personT('loadingMore'),
    retry: t('expenseForm.eventSourceRetry'),
    retrying: t('expenseForm.eventSourceRetrying'),
    selectedEvent: t('expenseForm.selectedEvent'),
    backToEvents: selectedEventGuestIds.length > 0
      ? t('expenseForm.clearEventSelection')
      : t('expenseForm.changeEvent'),
    rosterLoading: personT('rosterLoading'),
    rosterLoadError: personT('rosterLoadError'),
    rosterSearchLabel: t('expenseForm.eventGuestSearchLabel'),
    rosterSearchPlaceholder: t('expenseForm.eventGuestSearchPlaceholder'),
    noPeople: t('expenseForm.noEventGuestResults'),
    personFallback: (position) => personT('personFallback', { position }),
    nameMissing: personT('nameMissing'),
    personCount: (count) => personT('personCount', { count }),
    selectAll: personT('selectAll'),
    deselectAll: personT('deselectAll'),
    selectedSummary: (total) => personT('selectedSummary', { total }),
    visibleSelectedSummary: (selected, visible) => personT('visibleSelectedSummary', {
      selected,
      visible,
    }),
    selectedReason: personT('selectedReason'),
    staleReason: personT('staleReason'),
    removedReason: personT('removedReason'),
    transitionLoading: personT('transitionLoading'),
    nameRequiredReason: personT('nameRequiredReason'),
    profileNameRequiredReason: personT('profileNameRequiredReason'),
    notActiveReason: personT('notActiveReason'),
    privateNoteLabel: personT('privateNoteLabel'),
    hiddenLabels: (count) => personT('hiddenLabels', { count }),
    builtInTagLabel: (tag) => personT(`tags.${tag}`),
  }

  function exactEvent(key: EventPersonSelectionKey): EventExpenseSourceView | null {
    return events.find((event) => event.id === key.eventId) ?? null
  }

  return (
    <EventGuestBrowser
      provider={{
        kind: 'bounded-eager',
        providerKey: presentationEvents
          ? 'expense-event-source-sql149-labels-v2'
          : 'expense-event-source-v1',
        events: mappedEvents,
        loadState: eventsError
          ? { kind: 'error', retry: () => router.refresh() }
          : { kind: 'ready' },
      }}
      interaction={{
        kind: 'command',
        completedKeys,
        activate: (key) => {
          const event = exactEvent(key)
          const guest = event?.guests.find((candidate) => candidate.id === key.personRef)
          if (!event || !guest) {
            return { accepted: false, error: t('expenseForm.eventSourceLoadError') }
          }
          const result = onAddEventGuest(event, guest)
          completeSelection({ ...result, behavior: 'stay-open' })
          return result.accepted
            ? { accepted: true }
            : { accepted: false, error: result.error ?? t('expenseForm.eventSourceLoadError') }
        },
      }}
      copy={copy}
      initialEventId={selectedEventId}
      navigation={{
        requestOpenEvent: (eventView) => {
          const event = events.find((candidate) => candidate.id === eventView.eventId)
          if (!event) return { accepted: false, error: t('expenseForm.eventSourceLoadError') }
          const result = onSelectEvent(event)
          return result.accepted
            ? { accepted: true }
            : { accepted: false, error: result.error ?? t('expenseForm.eventSourceLoadError') }
        },
        requestLeaveEvent: () => {
          onClearEvent()
          return { accepted: true }
        },
      }}
      totalSelectedCount={selectedEventGuestIds.length}
      onError={setPickerError}
      showPersonCount={false}
    />
  )
}
