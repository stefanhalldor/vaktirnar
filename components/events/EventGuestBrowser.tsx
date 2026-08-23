'use client'

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { Check, ChevronLeft, Plus } from 'lucide-react'
import type {
  PersonSourceCursor,
  PersonSourceEventView,
  PersonSourcePageResult,
  PersonSourceRosterResult,
  PersonSourceRosterView,
} from '@/lib/events/person-source.presentation'
import {
  serializePersonSelectionKey,
  type EventPersonSelectionKey,
  type SelectionValidity,
} from '@/components/people/person-selection-state'
import { visibleEventBuiltInTags } from '@/components/events/EventPersonIdentity'

export type EagerEventGuestBrowserEvent = PersonSourceEventView & {
  people: PersonSourceRosterView['people']
}

export type EventGuestBrowserProvider =
  | {
      kind: 'cursor-lazy'
      providerKey: string
      loadPage: (input: { cursor: PersonSourceCursor | null }) => Promise<PersonSourcePageResult>
      loadRoster: (input: { eventId: string }) => Promise<PersonSourceRosterResult>
    }
  | {
      kind: 'bounded-eager'
      providerKey: string
      events: readonly EagerEventGuestBrowserEvent[]
      loadState:
        | { kind: 'ready' }
        | { kind: 'error'; retry: () => void }
    }

export type EventGuestBrowserNavigationResult =
  | { accepted: true }
  | { accepted: false; error: string }

export type EventGuestBrowserNavigation = {
  requestOpenEvent?: (event: PersonSourceEventView) => EventGuestBrowserNavigationResult
  requestLeaveEvent?: (eventId: string) => EventGuestBrowserNavigationResult
}

type CommandInteraction = {
  kind: 'command'
  completedKeys: ReadonlySet<string>
  activate: (key: EventPersonSelectionKey) => EventGuestBrowserNavigationResult
}

type SingleChoiceInteraction = {
  kind: 'single-choice'
  selectedKey: string | null
  toggle: (key: EventPersonSelectionKey) => void
}

type MultipleChoiceInteraction = {
  kind: 'multiple-choice'
  selectedKeys: ReadonlySet<string>
  bulkControls: true
  toggle: (key: EventPersonSelectionKey) => void
  selectVisible: (keys: readonly EventPersonSelectionKey[]) => void
  deselectVisible: (keys: readonly EventPersonSelectionKey[]) => void
}

export type EventGuestBrowserInteraction =
  | CommandInteraction
  | SingleChoiceInteraction
  | MultipleChoiceInteraction

export type EventGuestBrowserCopy = {
  eventSearchLabel: string
  eventSearchPlaceholder: string
  loadedSearchHint: string
  noLoadedResults: string
  noResults: string
  directoryLoading: string
  directoryLoadError: string
  loadMore: string
  loadingMore: string
  retry: string
  retrying: string
  selectedEvent: string
  backToEvents: string
  rosterLoading: string
  rosterLoadError: string
  rosterSearchLabel: string
  rosterSearchPlaceholder: string
  noPeople: string
  personFallback: (position: number) => string
  nameMissing?: string
  personCount: (count: number) => string
  selectAll: string
  deselectAll: string
  selectedSummary: (total: number) => string
  visibleSelectedSummary: (selected: number, visible: number) => string
  selectedReason: string
  staleReason: string
  removedReason: string
  transitionLoading: string
  nameRequiredReason?: string
  profileNameRequiredReason?: string
  notActiveReason?: string
  rsvpNoResponse?: string
  rsvpConsidering?: string
  rsvpAttending?: string
  rsvpNotAttending?: string
  privateNoteLabel?: string
  hiddenLabels?: (count: number) => string
  builtInTagLabel?: (tag: 'unclassified' | 'family' | 'friends' | 'recipients') => string
}

type PersonContext = {
  event: PersonSourceEventView
  person: PersonSourceRosterView['people'][number]
  key: EventPersonSelectionKey
}

type PageState = 'idle' | 'loading' | 'ready' | 'error'
type RosterState = 'idle' | 'loading' | 'ready' | 'error'
type FocusChannel = 'page' | 'roster' | 'navigation' | 'provider'
type FocusOwner = { channel: FocusChannel; token: number }

const inputClass = 'min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
const secondaryButtonClass = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-disabled:pointer-events-none aria-disabled:opacity-60'

function eventKey(eventId: string, personRef: string): EventPersonSelectionKey {
  return { source: 'event', eventId, personRef }
}

function compareRevision(left: number | string, right: number | string): number {
  const normalizedLeft = String(left).replace(/^0+(?=\d)/, '')
  const normalizedRight = String(right).replace(/^0+(?=\d)/, '')
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length < normalizedRight.length ? -1 : 1
  }
  return normalizedLeft.localeCompare(normalizedRight)
}

function rosterFromEagerEvent(event: EagerEventGuestBrowserEvent): PersonSourceRosterView {
  return {
    eventId: event.eventId,
    name: event.name,
    rosterRevision: event.rosterRevision,
    people: [...event.people],
  }
}

function eventView(event: EagerEventGuestBrowserEvent): PersonSourceEventView {
  return {
    eventId: event.eventId,
    name: event.name,
    rosterRevision: event.rosterRevision,
    activePersonCount: event.activePersonCount,
  }
}

function displayLabel(
  person: PersonSourceRosterView['people'][number],
  copy: EventGuestBrowserCopy,
): string {
  if (person.primaryLabel) return person.primaryLabel
  if (person.displayName) return person.displayName
  if (
    copy.nameMissing
    && (person.disabledReason === 'name_required' || person.disabledReason === 'profile_name_required')
  ) return copy.nameMissing
  return copy.personFallback(person.position + 1)
}

export function EventGuestBrowser({
  provider,
  interaction,
  copy,
  initialEventId = null,
  navigation,
  totalSelectedCount,
  getEventDisabledReason,
  getDisabledReason,
  getSelectionValidity,
  onError,
  onEventsObserved,
  onDirectoryComplete,
  onRosterObserved,
  onRosterUnavailable,
  onAnnouncement,
  showPersonCount = true,
}: {
  provider: EventGuestBrowserProvider
  interaction: EventGuestBrowserInteraction
  copy: EventGuestBrowserCopy
  initialEventId?: string | null
  navigation?: EventGuestBrowserNavigation
  totalSelectedCount: number
  getEventDisabledReason?: (event: PersonSourceEventView) => string | null
  getDisabledReason?: (context: PersonContext) => string | null
  getSelectionValidity?: (key: EventPersonSelectionKey) => SelectionValidity | null
  onError?: (error: string | null) => void
  onEventsObserved?: (events: readonly PersonSourceEventView[]) => void
  onDirectoryComplete?: (events: readonly PersonSourceEventView[]) => void
  onRosterObserved?: (roster: PersonSourceRosterView) => void
  onRosterUnavailable?: (eventId: string) => void
  onAnnouncement?: (message: string) => void
  showPersonCount?: boolean
}) {
  const [loadedEvents, setLoadedEvents] = useState<PersonSourceEventView[]>([])
  const [nextCursor, setNextCursor] = useState<PersonSourceCursor | null>(null)
  const [pageState, setPageState] = useState<PageState>('idle')
  const [rosters, setRosters] = useState<Record<string, PersonSourceRosterView>>({})
  const [rosterStates, setRosterStates] = useState<Record<string, RosterState>>({})
  const [activeEventId, setActiveEventId] = useState<string | null>(initialEventId)
  const [eventSearch, setEventSearch] = useState('')
  const [rosterSearch, setRosterSearch] = useState('')
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState({ sequence: 0, message: '' })
  const [returnFocusEventId, setReturnFocusEventId] = useState<string | null>(null)
  const [retryingRosterId, setRetryingRosterId] = useState<string | null>(null)
  const [retryingPage, setRetryingPage] = useState(false)
  const [isEagerRetrying, startEagerRetry] = useTransition()
  const [eagerEventsSnapshot, setEagerEventsSnapshot] = useState<readonly EagerEventGuestBrowserEvent[]>(
    () => provider.kind === 'bounded-eager' ? provider.events : [],
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const activeViewRef = useRef<HTMLDivElement>(null)
  const rosterContentRef = useRef<HTMLDivElement>(null)
  const pageGenerationRef = useRef(0)
  const rosterGenerationRef = useRef(0)
  const mountedRef = useRef(false)
  const loadedEventsRef = useRef<PersonSourceEventView[]>([])
  const activeEventIdRef = useRef<string | null>(initialEventId)
  const initialLoadKeyRef = useRef<string | null>(null)
  const resetProviderIdentityRef = useRef<string | null>(null)
  const lifecycleRestartRef = useRef(false)
  const transitionBridgeRef = useRef<HTMLParagraphElement>(null)
  const eventListHeadingRef = useRef<HTMLHeadingElement>(null)
  const rosterSearchRef = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const masterCheckboxRef = useRef<HTMLInputElement>(null)
  const eventRowRefs = useRef(new Map<string, HTMLButtonElement>())
  const focusIntentRef = useRef<HTMLElement | null>(null)
  const focusSequenceRef = useRef(0)
  const focusOwnerRef = useRef<FocusOwner | null>(null)
  const providerResetFocusRef = useRef<{ channel: 'page' | 'roster'; token: number } | null>(null)
  const focusRosterOnReadyRef = useRef<number | null>(null)
  const focusDirectoryOnReadyRef = useRef<number | null>(null)
  const focusErrorOnReadyRef = useRef<number | null>(null)
  const returnFocusTokenRef = useRef<number | null>(null)
  const failedPageRequestRef = useRef<{
    cursor: PersonSourceCursor | null
    append: boolean
  } | null>(null)
  const lastPassiveAnnouncementRef = useRef('')
  const terminalDirectoryCompleteRef = useRef(false)
  const eagerEventsSnapshotRef = useRef(eagerEventsSnapshot)

  const availableEvents = useMemo(() => (
    provider.kind === 'bounded-eager'
      ? eagerEventsSnapshot.map(eventView)
      : loadedEvents
  ), [eagerEventsSnapshot, loadedEvents, provider.kind])

  const eagerActiveEvent = provider.kind === 'bounded-eager'
    ? eagerEventsSnapshot.find((event) => event.eventId === activeEventId) ?? null
    : null
  const viewActiveEventId = provider.kind === 'bounded-eager' && !eagerActiveEvent
    ? null
    : activeEventId
  const activeDirectoryEvent = viewActiveEventId === null
    ? null
    : availableEvents.find((event) => event.eventId === viewActiveEventId) ?? null
  const cachedActiveRoster = viewActiveEventId === null || provider.kind === 'bounded-eager'
    ? null
    : rosters[viewActiveEventId] ?? null
  const activeRoster = viewActiveEventId === null
    ? null
    : provider.kind === 'bounded-eager'
      ? (eagerActiveEvent ? rosterFromEagerEvent(eagerActiveEvent) : null)
      : cachedActiveRoster && (
        activeDirectoryEvent === null
        || compareRevision(cachedActiveRoster.rosterRevision, activeDirectoryEvent.rosterRevision) >= 0
      )
        ? cachedActiveRoster
        : null
  const activeEvent = viewActiveEventId === null
    ? null
    : activeDirectoryEvent
      ?? (activeRoster ? {
        eventId: activeRoster.eventId,
        name: activeRoster.name,
        rosterRevision: activeRoster.rosterRevision,
        activePersonCount: activeRoster.people.length,
      } : null)

  const normalizedEventSearch = eventSearch.trim().toLocaleLowerCase('is')
  const filteredEvents = availableEvents.filter((event) => (
    !normalizedEventSearch
    || event.name.toLocaleLowerCase('is').includes(normalizedEventSearch)
  ))
  const normalizedRosterSearch = rosterSearch.trim().toLocaleLowerCase('is')
  const filteredPeople = activeRoster?.people.filter((person) => {
    const label = displayLabel(person, copy)
    const aliases = [
      label,
      person.secondaryLabel,
      person.privateEmail,
      ...visibleEventBuiltInTags(person.builtInTags ?? [])
        .map((tag) => copy.builtInTagLabel?.(tag) ?? tag),
      ...(person.customLabels ?? []),
      person.privateNote,
    ].filter((value): value is string => Boolean(value))
    return !normalizedRosterSearch
      || aliases.some((value) => value.toLocaleLowerCase('is').includes(normalizedRosterSearch))
  }) ?? []

  function ownsFocusIntent(token: number | null): boolean {
    if (token === null || focusOwnerRef.current?.token !== token) return false
    const activeElement = document.activeElement
    return activeElement === transitionBridgeRef.current
      || activeElement === focusIntentRef.current
      || activeElement === retryRef.current
  }

  function isFocusOwner(token: number): boolean {
    return focusOwnerRef.current?.token === token
  }

  function beginFocusTransition(channel: FocusChannel, message: string): number {
    const token = ++focusSequenceRef.current
    focusOwnerRef.current = { channel, token }
    const bridge = transitionBridgeRef.current
    if (bridge) {
      bridge.focus()
      focusIntentRef.current = bridge
    }
    setTransitionMessage(message)
    return token
  }

  function claimCurrentFocus(channel: FocusChannel): number {
    const token = ++focusSequenceRef.current
    focusOwnerRef.current = { channel, token }
    focusIntentRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    return token
  }

  function finishFocusTransition(token: number) {
    if (focusOwnerRef.current?.token !== token) return
    focusOwnerRef.current = null
    focusIntentRef.current = null
    setTransitionMessage(null)
  }

  function announceSelection(message: string) {
    if (onAnnouncement) onAnnouncement(message)
    else setAnnouncement((current) => ({
      sequence: current.sequence + 1,
      message,
    }))
  }

  async function loadPage(
    cursor: PersonSourceCursor | null,
    append: boolean,
    moveFocus: boolean,
    preserveRetryFocus = false,
  ) {
    if (provider.kind !== 'cursor-lazy') return
    const requestGeneration = ++pageGenerationRef.current
    const focusToken = moveFocus
      ? preserveRetryFocus
        ? claimCurrentFocus('page')
        : beginFocusTransition('page', cursor ? copy.loadingMore : copy.directoryLoading)
      : null
    if (preserveRetryFocus) setRetryingPage(true)
    else setPageState('loading')
    let result: PersonSourcePageResult
    try {
      result = await provider.loadPage({ cursor })
    } catch {
      result = { ok: false, error: 'load_failed' }
    }
    if (!mountedRef.current || requestGeneration !== pageGenerationRef.current) return
    const providerFocus = providerResetFocusRef.current?.channel === 'page'
      ? providerResetFocusRef.current.token
      : null
    const completionFocusToken = focusToken ?? providerFocus
    if (providerFocus !== null) providerResetFocusRef.current = null
    if (!result.ok) {
      failedPageRequestRef.current = { cursor, append }
      setPageState('error')
      setRetryingPage(false)
      if (completionFocusToken !== null && ownsFocusIntent(completionFocusToken)) {
        if (preserveRetryFocus) finishFocusTransition(completionFocusToken)
        else focusErrorOnReadyRef.current = completionFocusToken
      } else if (completionFocusToken !== null && isFocusOwner(completionFocusToken)) {
        finishFocusTransition(completionFocusToken)
      }
      return
    }

    if (completionFocusToken !== null && ownsFocusIntent(completionFocusToken)) {
      focusDirectoryOnReadyRef.current = completionFocusToken
    } else if (completionFocusToken !== null && isFocusOwner(completionFocusToken)) {
      finishFocusTransition(completionFocusToken)
    }
    failedPageRequestRef.current = null
    const unique = new Map((append ? loadedEventsRef.current : []).map((event) => (
      [event.eventId, event]
    )))
    result.data.events.forEach((event) => unique.set(event.eventId, event))
    const nextEvents = [...unique.values()]
    loadedEventsRef.current = nextEvents
    setLoadedEvents(nextEvents)
    onEventsObserved?.(result.data.events)
    terminalDirectoryCompleteRef.current = result.data.nextCursor === null
    if (terminalDirectoryCompleteRef.current) {
      const activeId = activeEventIdRef.current
      if (activeId && !nextEvents.some((event) => event.eventId === activeId)) {
        rosterGenerationRef.current += 1
        setRetryingRosterId(null)
        setRosters((current) => {
          const next = { ...current }
          delete next[activeId]
          return next
        })
        setRosterStates((current) => ({ ...current, [activeId]: 'error' }))
        onRosterUnavailable?.(activeId)

        const currentOwner = focusOwnerRef.current
        const focusToken = currentOwner && ownsFocusIntent(currentOwner.token)
          ? currentOwner.token
          : rosterContentRef.current?.contains(document.activeElement)
            ? beginFocusTransition('page', copy.transitionLoading)
            : null
        if (focusToken !== null) focusErrorOnReadyRef.current = focusToken
      }
      onDirectoryComplete?.(nextEvents)
    }
    setNextCursor(result.data.nextCursor)
    setPageState('ready')
    setRetryingPage(false)
  }

  async function loadRoster(eventId: string, moveFocus: boolean, retrying = false) {
    if (provider.kind !== 'cursor-lazy') return
    const requestGeneration = ++rosterGenerationRef.current
    const focusToken = moveFocus
      ? beginFocusTransition('roster', copy.rosterLoading)
      : retrying
        ? claimCurrentFocus('roster')
        : null
    if (retrying) setRetryingRosterId(eventId)
    else setRosterStates((current) => ({ ...current, [eventId]: 'loading' }))
    let result: PersonSourceRosterResult
    try {
      result = await provider.loadRoster({ eventId })
    } catch {
      result = { ok: false, error: 'load_failed' }
    }
    if (
      !mountedRef.current
      || requestGeneration !== rosterGenerationRef.current
      || activeEventIdRef.current !== eventId
    ) return
    const providerFocus = providerResetFocusRef.current?.channel === 'roster'
      ? providerResetFocusRef.current.token
      : null
    const completionFocusToken = focusToken ?? providerFocus
    if (providerFocus !== null) providerResetFocusRef.current = null
    const unavailableByTerminalDirectory = result.ok
      && terminalDirectoryCompleteRef.current
      && !loadedEventsRef.current.some((event) => event.eventId === eventId)
    const expectedRevision = loadedEventsRef.current.find((event) => (
      event.eventId === eventId
    ))?.rosterRevision ?? null
    const staleRosterResult = result.ok
      && expectedRevision !== null
      && compareRevision(result.data.rosterRevision, expectedRevision) < 0
    if (!result.ok || unavailableByTerminalDirectory || staleRosterResult) {
      setRosterStates((current) => ({ ...current, [eventId]: 'error' }))
      setRetryingRosterId(null)
      if (unavailableByTerminalDirectory || (!result.ok && result.error === 'not_found')) {
        onRosterUnavailable?.(eventId)
      }
      if (completionFocusToken !== null && ownsFocusIntent(completionFocusToken)) {
        if (retrying) finishFocusTransition(completionFocusToken)
        else focusErrorOnReadyRef.current = completionFocusToken
      } else if (completionFocusToken !== null && isFocusOwner(completionFocusToken)) {
        finishFocusTransition(completionFocusToken)
      }
      return
    }
    if (completionFocusToken !== null && ownsFocusIntent(completionFocusToken)) {
      focusRosterOnReadyRef.current = completionFocusToken
    } else if (completionFocusToken !== null && isFocusOwner(completionFocusToken)) {
      finishFocusTransition(completionFocusToken)
    }
    setRosters((current) => ({ ...current, [eventId]: result.data }))
    setRosterStates((current) => ({ ...current, [eventId]: 'ready' }))
    setRetryingRosterId(null)
    onRosterObserved?.(result.data)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      pageGenerationRef.current += 1
      rosterGenerationRef.current += 1
      initialLoadKeyRef.current = null
      lifecycleRestartRef.current = true
    }
  }, [])

  const incomingEagerEvents = provider.kind === 'bounded-eager' ? provider.events : null
  useLayoutEffect(() => {
    if (incomingEagerEvents === null) {
      eagerEventsSnapshotRef.current = []
      setEagerEventsSnapshot([])
      return
    }
    if (eagerEventsSnapshotRef.current === incomingEagerEvents) return

    const activeId = activeEventIdRef.current
    const activeEventWillDisappear = activeId !== null
      && eagerEventsSnapshotRef.current.some((event) => event.eventId === activeId)
      && !incomingEagerEvents.some((event) => event.eventId === activeId)
    if (
      activeEventWillDisappear
      && activeViewRef.current?.contains(document.activeElement)
    ) {
      const token = beginFocusTransition('provider', copy.transitionLoading)
      focusDirectoryOnReadyRef.current = token
    }

    eagerEventsSnapshotRef.current = incomingEagerEvents
    setEagerEventsSnapshot(incomingEagerEvents)
    // The committed snapshot deliberately keeps the focused roster mounted until this layout handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy.transitionLoading, incomingEagerEvents])

  useEffect(() => {
    const providerIdentity = JSON.stringify([provider.kind, provider.providerKey])
    const providerChanged = resetProviderIdentityRef.current !== providerIdentity
      || lifecycleRestartRef.current
    lifecycleRestartRef.current = false
    resetProviderIdentityRef.current = providerIdentity
    if (!providerChanged && activeEventIdRef.current === initialEventId) return

    const focusedElement = document.activeElement
    const focusedInsideBrowser = focusedElement instanceof HTMLElement
      && rootRef.current?.contains(focusedElement)
    if (focusedInsideBrowser) {
      const channel = initialEventId === null ? 'page' : 'roster'
      const token = beginFocusTransition(
        'provider',
        channel === 'page' ? copy.directoryLoading : copy.rosterLoading,
      )
      providerResetFocusRef.current = { channel, token }
    } else {
      providerResetFocusRef.current = null
      focusOwnerRef.current = null
      focusIntentRef.current = null
    }
    pageGenerationRef.current += 1
    rosterGenerationRef.current += 1
    loadedEventsRef.current = []
    terminalDirectoryCompleteRef.current = false
    setLoadedEvents([])
    setNextCursor(null)
    setPageState(provider.kind === 'bounded-eager' ? 'ready' : 'idle')
    setRosters({})
    setRosterStates({})
    setRetryingRosterId(null)
    setRetryingPage(false)
    activeEventIdRef.current = initialEventId
    setActiveEventId(initialEventId)
    setEventSearch('')
    setRosterSearch('')
    if (!focusedInsideBrowser) setTransitionMessage(null)
    focusRosterOnReadyRef.current = null
    focusDirectoryOnReadyRef.current = null
    focusErrorOnReadyRef.current = null
    returnFocusTokenRef.current = null
    failedPageRequestRef.current = null
    initialLoadKeyRef.current = null
    if (focusedInsideBrowser && provider.kind === 'bounded-eager') {
      const token = providerResetFocusRef.current?.token ?? null
      providerResetFocusRef.current = null
      if (token !== null) {
        const nextEventExists = initialEventId !== null
          && eagerEventsSnapshotRef.current.some((event) => event.eventId === initialEventId)
        if (nextEventExists) focusRosterOnReadyRef.current = token
        else focusDirectoryOnReadyRef.current = token
      }
    }
  }, [
    copy.directoryLoading,
    copy.rosterLoading,
    initialEventId,
    provider.kind,
    provider.providerKey,
  ])

  useEffect(() => {
    if (provider.kind !== 'cursor-lazy' || initialLoadKeyRef.current === provider.providerKey) return
    initialLoadKeyRef.current = provider.providerKey
    void loadPage(null, false, false)
    // Loading is intentionally keyed only by providerKey; injected functions may be rebound per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.kind, provider.providerKey])

  useEffect(() => {
    if (
      provider.kind !== 'cursor-lazy'
      || activeEventId === null
      || activeRoster
      || rosterStates[activeEventId] === 'loading'
      || rosterStates[activeEventId] === 'error'
    ) return
    void loadRoster(activeEventId, false)
    // Exact event/provider state is the load authority.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEventId, activeRoster, provider.kind, provider.providerKey, rosterStates])

  const eagerEvents = provider.kind === 'bounded-eager' ? eagerEventsSnapshot : null
  useEffect(() => {
    if (!eagerEvents) return
    onEventsObserved?.(eagerEvents.map(eventView))
    const eagerEvent = eagerEvents.find((event) => event.eventId === activeEventIdRef.current)
    if (eagerEvent) onRosterObserved?.(rosterFromEagerEvent(eagerEvent))
  }, [eagerEvents, onEventsObserved, onRosterObserved])

  useLayoutEffect(() => {
    const token = focusRosterOnReadyRef.current
    if (!activeRoster || token === null) return
    focusRosterOnReadyRef.current = null
    if (!isFocusOwner(token)) return
    rosterSearchRef.current?.focus()
    finishFocusTransition(token)
  }, [activeRoster, provider.providerKey])

  useLayoutEffect(() => {
    const token = focusDirectoryOnReadyRef.current
    if (pageState !== 'ready' || token === null) return
    focusDirectoryOnReadyRef.current = null
    if (!isFocusOwner(token)) return
    eventListHeadingRef.current?.focus()
    finishFocusTransition(token)
  }, [loadedEvents.length, pageState, provider.providerKey, viewActiveEventId])

  useLayoutEffect(() => {
    const token = focusErrorOnReadyRef.current
    if (token === null || !errorRef.current) return
    focusErrorOnReadyRef.current = null
    if (!isFocusOwner(token)) return
    errorRef.current.focus()
    finishFocusTransition(token)
  }, [pageState, rosterStates, viewActiveEventId])

  useLayoutEffect(() => {
    if (activeEventId !== null || returnFocusEventId === null) return
    const token = returnFocusTokenRef.current
    returnFocusTokenRef.current = null
    const target = eventRowRefs.current.get(returnFocusEventId)
      ?? eventListHeadingRef.current
      ?? errorRef.current
    if (token !== null && isFocusOwner(token)) {
      target?.focus()
      finishFocusTransition(token)
    }
    setReturnFocusEventId(null)
  }, [activeEventId, returnFocusEventId])

  function openEvent(event: PersonSourceEventView) {
    const disabledReason = getEventDisabledReason?.(event) ?? null
    if (disabledReason) {
      onError?.(disabledReason)
      return
    }
    const result = navigation?.requestOpenEvent?.(event) ?? { accepted: true as const }
    if (!result.accepted) {
      onError?.(result.error)
      return
    }
    onError?.(null)
    const cachedRoster = provider.kind === 'cursor-lazy' ? rosters[event.eventId] : null
    const currentCachedRoster = cachedRoster
      && compareRevision(cachedRoster.rosterRevision, event.rosterRevision) >= 0
      ? cachedRoster
      : null
    const immediateFocusToken = provider.kind === 'bounded-eager' || currentCachedRoster
      ? beginFocusTransition('roster', copy.rosterLoading)
      : null
    if (immediateFocusToken !== null) focusRosterOnReadyRef.current = immediateFocusToken
    activeEventIdRef.current = event.eventId
    setActiveEventId(event.eventId)
    setRosterSearch('')
    if (provider.kind === 'bounded-eager') {
      const roster = eagerEventsSnapshot.find((candidate) => candidate.eventId === event.eventId)
      if (roster) onRosterObserved?.(rosterFromEagerEvent(roster))
    } else if (currentCachedRoster) {
      onRosterObserved?.(currentCachedRoster)
    } else {
      void loadRoster(event.eventId, true)
    }
  }

  function leaveEvent() {
    if (!activeEventId) return
    const leavingEventId = activeEventId
    const result = navigation?.requestLeaveEvent?.(leavingEventId) ?? { accepted: true as const }
    if (!result.accepted) {
      onError?.(result.error)
      return
    }
    onError?.(null)
    rosterGenerationRef.current += 1
    setRetryingRosterId(null)
    const focusToken = beginFocusTransition('navigation', copy.transitionLoading)
    returnFocusTokenRef.current = focusToken
    setReturnFocusEventId(leavingEventId)
    activeEventIdRef.current = null
    setActiveEventId(null)
    setRosterSearch('')
  }

  function retryDirectory() {
    if (isEagerRetrying || retryingPage) return
    focusIntentRef.current = retryRef.current
    if (provider.kind === 'bounded-eager') {
      if (provider.loadState.kind !== 'error') return
      startEagerRetry(() => {
        if (provider.loadState.kind === 'error') provider.loadState.retry()
      })
      return
    }
    const failedRequest = failedPageRequestRef.current ?? { cursor: null, append: false }
    void loadPage(failedRequest.cursor, failedRequest.append, true, true)
  }

  function retryRoster() {
    if (!activeEventId || provider.kind !== 'cursor-lazy') return
    void loadRoster(activeEventId, false, true)
  }

  const rosterRows = filteredPeople.map((person) => {
    const key = eventKey(activeRoster!.eventId, person.personRef)
    const serialized = serializePersonSelectionKey(key)
    const completed = interaction.kind === 'command' && interaction.completedKeys.has(serialized)
    const selectionValidity = getSelectionValidity?.(key) ?? null
    const stateReason = selectionValidity === 'needs_revalidation'
      ? copy.staleReason
      : selectionValidity === 'removed'
        ? copy.removedReason
        : null
    const capabilityReason = person.selectable === false
      ? person.disabledReason === 'profile_name_required'
        ? copy.profileNameRequiredReason ?? copy.removedReason
        : person.disabledReason === 'not_active'
          ? copy.notActiveReason ?? copy.removedReason
          : copy.nameRequiredReason ?? copy.removedReason
      : null
    const disabledReason = stateReason
      ?? getDisabledReason?.({ event: activeEvent!, person, key })
      ?? capabilityReason
      ?? (completed ? copy.selectedReason : null)
    const selected = interaction.kind === 'command'
      ? completed
      : interaction.kind === 'single-choice'
        ? interaction.selectedKey === serialized
        : interaction.selectedKeys.has(serialized)
    return { person, key, serialized, disabledReason, selected }
  })
  const selectableRows = rosterRows.filter((row) => (
    row.disabledReason === null && row.person.bulkEligible !== false
  ))
  const visibleSelectedRows = selectableRows.filter((row) => row.selected)
  const masterChecked = selectableRows.length > 0 && visibleSelectedRows.length === selectableRows.length
  const masterIndeterminate = visibleSelectedRows.length > 0 && !masterChecked

  useLayoutEffect(() => {
    if (masterCheckboxRef.current) masterCheckboxRef.current.indeterminate = masterIndeterminate
  }, [masterIndeterminate])

  function activateRow(row: typeof rosterRows[number]) {
    if (row.disabledReason) return
    onError?.(null)
    if (interaction.kind === 'command') {
      const result = interaction.activate(row.key)
      if (!result.accepted) {
        onError?.(result.error)
        return
      }
      announceSelection(copy.selectedSummary(totalSelectedCount + (row.selected ? 0 : 1)))
      return
    }
    interaction.toggle(row.key)
    const nextTotal = interaction.kind === 'single-choice'
      ? (row.selected ? 0 : 1)
      : totalSelectedCount + (row.selected ? -1 : 1)
    announceSelection(copy.selectedSummary(nextTotal))
  }

  function toggleAllVisible() {
    if (interaction.kind !== 'multiple-choice' || selectableRows.length === 0) return
    if (masterChecked) {
      interaction.deselectVisible(selectableRows.map((row) => row.key))
      announceSelection(copy.selectedSummary(totalSelectedCount - visibleSelectedRows.length))
    } else {
      interaction.selectVisible(selectableRows.map((row) => row.key))
      announceSelection(copy.selectedSummary(
        totalSelectedCount + selectableRows.length - visibleSelectedRows.length,
      ))
    }
  }

  const directoryFailed = provider.kind === 'bounded-eager'
    ? provider.loadState.kind === 'error'
    : pageState === 'error' && loadedEvents.length === 0
  const loadedDirectoryPageFailed = provider.kind === 'cursor-lazy'
    && pageState === 'error'
    && loadedEvents.length > 0
  const directoryLoading = provider.kind === 'cursor-lazy'
    && (pageState === 'idle' || (pageState === 'loading' && loadedEvents.length === 0))
  const passiveAnnouncement = transitionMessage
    ?? (directoryLoading ? copy.directoryLoading : null)
    ?? (viewActiveEventId !== null && !activeRoster ? copy.rosterLoading : null)
    ?? (!onAnnouncement ? announcement.message : '')

  useEffect(() => {
    if (!onAnnouncement) return
    if (!passiveAnnouncement) {
      lastPassiveAnnouncementRef.current = ''
      return
    }
    if (lastPassiveAnnouncementRef.current === passiveAnnouncement) return
    lastPassiveAnnouncementRef.current = passiveAnnouncement
    onAnnouncement(passiveAnnouncement)
  }, [onAnnouncement, passiveAnnouncement])

  return (
    <div ref={rootRef} className="space-y-4">
      <p
        ref={transitionBridgeRef}
        tabIndex={-1}
        className={transitionMessage
          ? 'rounded-xl bg-muted p-3 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          : 'sr-only'}
      >
        {transitionMessage ?? ''}
      </p>

      {viewActiveEventId === null && directoryFailed ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="space-y-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <p>{copy.directoryLoadError}</p>
          <button
            ref={retryRef}
            type="button"
            className={`${secondaryButtonClass} w-full`}
            aria-disabled={isEagerRetrying || retryingPage || undefined}
            onClick={retryDirectory}
          >
            {isEagerRetrying || retryingPage ? copy.retrying : copy.retry}
          </button>
        </div>
      ) : viewActiveEventId === null ? (
        <div className="space-y-4">
          <h3 ref={eventListHeadingRef} tabIndex={-1} className="sr-only">
            {copy.eventSearchLabel}
          </h3>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{copy.eventSearchLabel}</span>
            <input
              className={inputClass}
              value={eventSearch}
              onChange={(event) => setEventSearch(event.target.value)}
              placeholder={copy.eventSearchPlaceholder}
            />
          </label>
          {provider.kind === 'cursor-lazy' ? (
            <p className="text-xs leading-5 text-muted-foreground">{copy.loadedSearchHint}</p>
          ) : null}
          {directoryLoading ? (
            <p className="py-4 text-sm text-muted-foreground">{copy.directoryLoading}</p>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {filteredEvents.map((event, index) => {
                const disabledReason = getEventDisabledReason?.(event) ?? null
                const reasonId = disabledReason
                  ? `event-source-${index}-reason`
                  : undefined
                return (
                  <button
                    key={event.eventId}
                    ref={(node) => {
                      if (node) eventRowRefs.current.set(event.eventId, node)
                      else eventRowRefs.current.delete(event.eventId)
                    }}
                    type="button"
                    className={`flex min-h-14 w-full items-center justify-between gap-3 px-1 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${disabledReason ? 'cursor-not-allowed opacity-70' : 'hover:bg-muted'}`}
                    aria-disabled={Boolean(disabledReason) || undefined}
                    aria-describedby={reasonId}
                    onClick={() => openEvent(event)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium">{event.name}</span>
                      {showPersonCount ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {copy.personCount(event.activePersonCount)}
                        </span>
                      ) : null}
                      {disabledReason ? (
                        <span id={reasonId} className="mt-1 block break-words text-xs text-muted-foreground">
                          {disabledReason}
                        </span>
                      ) : null}
                    </span>
                    <Plus aria-hidden size={18} className="shrink-0 text-primary" />
                  </button>
                )
              })}
              {filteredEvents.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  {provider.kind === 'cursor-lazy' && nextCursor ? copy.noLoadedResults : copy.noResults}
                </p>
              ) : null}
            </div>
          )}
          {provider.kind === 'cursor-lazy' && nextCursor && !loadedDirectoryPageFailed ? (
            <button
              type="button"
              className={`${secondaryButtonClass} w-full`}
              aria-disabled={pageState === 'loading' || undefined}
              onClick={() => {
                if (pageState !== 'loading') void loadPage(nextCursor, true, true)
              }}
            >
              {pageState === 'loading' ? copy.loadingMore : copy.loadMore}
            </button>
          ) : null}
          {loadedDirectoryPageFailed ? (
            <div ref={errorRef} tabIndex={-1} role="alert" className="space-y-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <p>{copy.directoryLoadError}</p>
              <button
                ref={retryRef}
                type="button"
                className={`${secondaryButtonClass} w-full`}
                aria-disabled={retryingPage || undefined}
                onClick={retryDirectory}
              >
                {retryingPage ? copy.retrying : copy.retry}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div ref={activeViewRef} className="space-y-4">
          <div className="flex min-h-12 items-center gap-3 border-y border-border py-2">
            {activeEvent ? (
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted-foreground">{copy.selectedEvent}</span>
                <span className="block break-words text-sm font-medium">{activeEvent.name}</span>
              </span>
            ) : <span className="flex-1" aria-hidden />}
            <button
              type="button"
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={leaveEvent}
            >
              <ChevronLeft aria-hidden size={17} />
              {copy.backToEvents}
            </button>
          </div>

          <div ref={rosterContentRef} className="space-y-4">
            {rosterStates[viewActiveEventId!] === 'error' ? (
              <div ref={errorRef} tabIndex={-1} role="alert" className="space-y-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <p>{copy.rosterLoadError}</p>
                <button
                  ref={retryRef}
                  type="button"
                  className={`${secondaryButtonClass} w-full`}
                  aria-disabled={retryingRosterId === viewActiveEventId || undefined}
                  onClick={() => {
                    if (retryingRosterId !== viewActiveEventId) retryRoster()
                  }}
                >
                  {retryingRosterId === viewActiveEventId ? copy.retrying : copy.retry}
                </button>
              </div>
            ) : !activeRoster ? (
              <p className="py-4 text-sm text-muted-foreground">{copy.rosterLoading}</p>
            ) : (
              <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{copy.rosterSearchLabel}</span>
                <input
                  ref={rosterSearchRef}
                  className={inputClass}
                  value={rosterSearch}
                  onChange={(event) => setRosterSearch(event.target.value)}
                  placeholder={copy.rosterSearchPlaceholder}
                />
              </label>

              {interaction.kind === 'multiple-choice' ? (
                <label className={`flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 py-2 ${selectableRows.length === 0 ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted'}`}>
                  <input
                    ref={masterCheckboxRef}
                    type="checkbox"
                    checked={masterChecked}
                    disabled={selectableRows.length === 0}
                    aria-label={masterChecked ? copy.deselectAll : copy.selectAll}
                    className="size-5 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onChange={toggleAllVisible}
                  />
                  <span className="min-w-0 flex-1 break-words text-sm font-semibold">
                    {masterChecked ? copy.deselectAll : copy.selectAll}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {copy.visibleSelectedSummary(visibleSelectedRows.length, selectableRows.length)}
                  </span>
                </label>
              ) : null}

              {interaction.kind === 'command' ? null : (
                <p className="text-sm text-muted-foreground">{copy.selectedSummary(totalSelectedCount)}</p>
              )}
              <div
                className="divide-y divide-border border-y border-border"
                role={interaction.kind === 'single-choice' ? 'radiogroup' : undefined}
                aria-label={interaction.kind === 'single-choice' ? copy.rosterSearchLabel : undefined}
              >
                {rosterRows.map((row, index) => {
                  const label = displayLabel(row.person, copy)
                  const rsvpLabel = row.person.rsvpState === 'attending'
                    ? copy.rsvpAttending
                    : row.person.rsvpState === 'not_attending'
                      ? copy.rsvpNotAttending
                      : row.person.rsvpState === 'considering'
                        ? copy.rsvpConsidering
                      : row.person.rsvpState === 'no_response'
                        ? copy.rsvpNoResponse
                        : null
                  const reasonId = row.disabledReason
                    ? `event-person-${activeRoster.eventId}-${index}-reason`
                    : undefined
                  const content = (
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium">{label}</span>
                      {row.person.secondaryLabel && row.person.secondaryLabel !== label ? (
                        <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                          {row.person.secondaryLabel}
                        </span>
                      ) : null}
                      {row.person.privateEmail ? (
                        <span className="mt-0.5 block break-all text-xs text-muted-foreground">
                          {row.person.privateEmail}
                        </span>
                      ) : null}
                      {rsvpLabel ? (
                        <span className="mt-1 block text-xs font-medium text-muted-foreground">
                          {rsvpLabel}
                        </span>
                      ) : null}
                      {(row.person.builtInTags?.length || row.person.customLabels?.length) ? (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {[
                            ...visibleEventBuiltInTags(row.person.builtInTags ?? [])
                              .map((tag) => copy.builtInTagLabel?.(tag) ?? tag),
                            ...(row.person.customLabels ?? []),
                          ].map((tag, tagIndex) => (
                            <span key={`${tagIndex}:${tag}`} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                          {row.person.hiddenCustomLabelCount ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {copy.hiddenLabels?.(row.person.hiddenCustomLabelCount) ?? `+${row.person.hiddenCustomLabelCount}`}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                      {row.person.privateNote ? (
                        <span className="mt-1 block break-words text-xs text-muted-foreground">
                          {copy.privateNoteLabel ? `${copy.privateNoteLabel}: ` : ''}{row.person.privateNote}
                        </span>
                      ) : null}
                      {row.disabledReason ? (
                        <span id={reasonId} className="mt-1 block break-words text-xs text-muted-foreground">
                          {row.disabledReason}
                        </span>
                      ) : null}
                    </span>
                  )

                  if (interaction.kind === 'command') {
                    return (
                      <button
                        key={row.serialized}
                        type="button"
                        className={`flex min-h-14 w-full items-center justify-between gap-3 px-1 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${row.disabledReason ? 'cursor-not-allowed opacity-70' : 'hover:bg-muted'}`}
                        aria-disabled={Boolean(row.disabledReason) || undefined}
                        aria-label={label}
                        aria-describedby={reasonId}
                        onClick={() => activateRow(row)}
                      >
                        {content}
                        {row.selected
                          ? <Check aria-hidden size={18} className="shrink-0 text-primary" />
                          : <Plus aria-hidden size={18} className="shrink-0 text-primary" />}
                      </button>
                    )
                  }

                  return (
                    <label
                      key={row.serialized}
                      className={`flex min-h-14 w-full items-center justify-between gap-3 px-1 py-3 text-left ${row.disabledReason ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted'}`}
                    >
                      {content}
                      <input
                        type={interaction.kind === 'single-choice' ? 'radio' : 'checkbox'}
                        name={interaction.kind === 'single-choice' ? `event-people-${activeRoster.eventId}` : undefined}
                        checked={row.selected}
                        aria-disabled={Boolean(row.disabledReason) || undefined}
                        aria-label={label}
                        aria-describedby={reasonId}
                        className="size-5 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        onClick={(event) => {
                          if (row.disabledReason) event.preventDefault()
                        }}
                        onChange={() => activateRow(row)}
                      />
                    </label>
                  )
                })}
                {rosterRows.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">{copy.noPeople}</p>
                ) : null}
              </div>
              </>
            )}
          </div>
        </div>
      )}

      <p
        className="sr-only"
        role={onAnnouncement ? undefined : 'status'}
        aria-live={onAnnouncement ? undefined : 'polite'}
        aria-atomic={onAnnouncement ? undefined : 'true'}
      >
        <span key={`${announcement.sequence}:${passiveAnnouncement}`}>
          {passiveAnnouncement}
        </span>
      </p>
    </div>
  )
}
