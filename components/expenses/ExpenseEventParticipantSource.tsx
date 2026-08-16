'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, Plus } from 'lucide-react'
import type { EventExpenseSourceView } from '@/lib/events/contracts'
import type { RelationshipPartyPickerSelectionResult } from '@/components/tengsl/RelationshipPartyPicker'
import { useExpenseTranslations } from './i18n.client'
import { expenseInputClass, expenseSecondaryButtonClass } from './ui'

export function ExpenseEventParticipantSource({
  events,
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
  const router = useRouter()
  const [isRetrying, startRetry] = useTransition()
  const [eventSearch, setEventSearch] = useState('')
  const [guestSearch, setGuestSearch] = useState('')
  const [browsingEventId, setBrowsingEventId] = useState<string | null>(selectedEventId)
  const selectedGuestIds = useMemo(() => new Set(selectedEventGuestIds), [selectedEventGuestIds])
  const activeEvent = events.find((event) => event.id === (selectedEventId ?? browsingEventId)) ?? null
  const normalizedEventSearch = eventSearch.trim().toLocaleLowerCase('is')
  const filteredEvents = events.filter((event) => (
    !normalizedEventSearch || event.name.toLocaleLowerCase('is').includes(normalizedEventSearch)
  ))
  const normalizedGuestSearch = guestSearch.trim().toLocaleLowerCase('is')
  const filteredGuests = activeEvent?.guests.filter((guest) => (
    !normalizedGuestSearch || guest.displayName.toLocaleLowerCase('is').includes(normalizedGuestSearch)
  )) ?? []

  function chooseEvent(event: EventExpenseSourceView) {
    const result = onSelectEvent(event)
    if (!result.accepted) {
      setPickerError(result.error ?? null)
      return
    }
    setPickerError(null)
    setBrowsingEventId(event.id)
    setGuestSearch('')
  }

  function chooseDifferentEvent() {
    onClearEvent()
    setPickerError(null)
    setBrowsingEventId(null)
    setGuestSearch('')
  }

  if (eventsError && !activeEvent) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm leading-6 text-destructive">
          {t('expenseForm.eventSourceLoadError')}
        </p>
        <button
          type="button"
          className={`${expenseSecondaryButtonClass} w-full`}
          disabled={isRetrying}
          onClick={() => startRetry(() => router.refresh())}
        >
          {isRetrying ? t('expenseForm.eventSourceRetrying') : t('expenseForm.eventSourceRetry')}
        </button>
      </div>
    )
  }

  if (!activeEvent) {
    return (
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t('expenseForm.eventSearchLabel')}</span>
          <input
            className={expenseInputClass}
            value={eventSearch}
            onChange={(event) => setEventSearch(event.target.value)}
            placeholder={t('expenseForm.eventSearchPlaceholder')}
          />
        </label>
        <div className="max-h-[40dvh] divide-y divide-border overflow-y-auto border-y border-border">
          {filteredEvents.map((event) => (
            <button
              key={event.id}
              type="button"
              className="flex min-h-14 w-full items-center justify-between gap-3 px-1 py-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() => chooseEvent(event)}
            >
              <span className="min-w-0 break-words font-medium">{event.name}</span>
              <Plus aria-hidden size={18} className="shrink-0 text-primary" />
            </button>
          ))}
          {filteredEvents.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t('expenseForm.noEventResults')}</p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex min-h-12 items-center gap-3 border-y border-border py-2">
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">{t('expenseForm.selectedEvent')}</span>
          <span className="block break-words text-sm font-medium">{activeEvent.name}</span>
        </span>
        <button
          type="button"
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={chooseDifferentEvent}
        >
          <ChevronLeft aria-hidden size={17} />
          {selectedGuestIds.size > 0
            ? t('expenseForm.clearEventSelection')
            : t('expenseForm.changeEvent')}
        </button>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('expenseForm.eventGuestSearchLabel')}</span>
        <input
          className={expenseInputClass}
          value={guestSearch}
          onChange={(event) => setGuestSearch(event.target.value)}
          placeholder={t('expenseForm.eventGuestSearchPlaceholder')}
        />
      </label>
      <div className="max-h-[40dvh] divide-y divide-border overflow-y-auto border-y border-border">
        {filteredGuests.map((guest) => {
          const selected = selectedGuestIds.has(guest.id)
          return (
            <button
              key={guest.id}
              type="button"
              className="flex min-h-14 w-full items-center justify-between gap-3 px-1 py-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:opacity-70"
              disabled={selected}
              onClick={() => completeSelection({
                ...onAddEventGuest(activeEvent, guest),
                behavior: 'stay-open',
              })}
            >
              <span className="min-w-0 break-words font-medium">{guest.displayName}</span>
              {selected
                ? <Check aria-hidden size={18} className="shrink-0 text-primary" />
                : <Plus aria-hidden size={18} className="shrink-0 text-primary" />}
            </button>
          )
        })}
        {filteredGuests.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{t('expenseForm.noEventGuestResults')}</p>
        ) : null}
      </div>
    </div>
  )
}
