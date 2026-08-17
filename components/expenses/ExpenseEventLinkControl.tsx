'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { attachExpenseToEvent, detachExpenseFromEvent } from '@/lib/expenses/actions'
import type { ExpenseEventLinkManagementView } from '@/lib/events/contracts'
import { eventDetailPath } from '@/lib/events/contracts'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { TeskeidActionSheet } from '@/components/teskeid/TeskeidActionSheet'
import { useExpenseTranslations } from './i18n.client'

function requestId(): string {
  return globalThis.crypto.randomUUID()
}

export function ExpenseEventLinkControl({
  expenseId,
  financialVersion,
  management,
  eventHref,
}: {
  expenseId: string
  financialVersion: number
  management: ExpenseEventLinkManagementView | null
  eventHref: string | null
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const [attachOpen, setAttachOpen] = useState(false)
  const [detachOpen, setDetachOpen] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const attachRequestIds = useRef(new Map<string, string>())
  const detachRequestId = useRef<string | null>(null)
  const selectedEvent = management?.eligibleEvents.find((event) => event.id === selectedEventId) ?? null
  const currentEvent = management?.currentEvent ?? null
  const openHref = currentEvent?.canOpen ? eventDetailPath(currentEvent.id) : eventHref
  const currentEventLabel = currentEvent?.name ?? t('expense.linkedEventUnavailable')

  function attach() {
    if (!selectedEvent || isPending) return
    setError(null)
    const stableRequestId = attachRequestIds.current.get(selectedEvent.id) ?? requestId()
    attachRequestIds.current.set(selectedEvent.id, stableRequestId)
    startTransition(async () => {
      const result = await attachExpenseToEvent({
        expense_id: expenseId,
        event_id: selectedEvent.id,
        expected_financial_version: financialVersion,
        expected_event_roster_revision: selectedEvent.rosterRevision,
        request_id: stableRequestId,
      })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        return
      }
      attachRequestIds.current.delete(selectedEvent.id)
      setAttachOpen(false)
      router.refresh()
    })
  }

  function detach() {
    if (!currentEvent || isPending) return
    setError(null)
    detachRequestId.current ??= requestId()
    startTransition(async () => {
      const result = await detachExpenseFromEvent({
        expense_id: expenseId,
        expected_event_id: currentEvent.id,
        expected_financial_version: financialVersion,
        request_id: detachRequestId.current,
      })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        return
      }
      detachRequestId.current = null
      setDetachOpen(false)
      router.refresh()
    })
  }

  if (!currentEvent && !openHref && (!management || management.eligibleEvents.length === 0)) {
    return null
  }

  return (
    <section aria-labelledby="expense-event-link-title" className="space-y-3 border-y border-border py-5">
      <div>
        <h2 id="expense-event-link-title" className="text-sm font-semibold">
          {t('expense.eventLinkTitle')}
        </h2>
        {currentEvent ? (
          <p className="mt-1 break-words text-sm text-muted-foreground">{currentEventLabel}</p>
        ) : null}
      </div>
      {openHref ? (
        <Link
          href={openHref}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {t('expense.openEvent')}
        </Link>
      ) : null}
      {!currentEvent && management && management.eligibleEvents.length > 0 ? (
        <TeskeidActionSheet
          open={attachOpen}
          onOpenChange={(open) => {
            if (!isPending) setAttachOpen(open)
            if (!open) setError(null)
          }}
          trigger={(
            <TeskeidActionButton type="button" className="w-full">
              {t('expense.linkToEvent')}
            </TeskeidActionButton>
          )}
          title={t('expense.linkToEvent')}
          description={t('expense.linkToEventDescription')}
          closeLabel={t('expense.eventLinkClose')}
        >
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">{t('expense.chooseEvent')}</legend>
            {management.eligibleEvents.map((event) => (
              <label key={event.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                <input
                  type="radio"
                  name={`expense-event-${expenseId}`}
                  value={event.id}
                  checked={selectedEventId === event.id}
                  disabled={isPending}
                  onChange={() => {
                    setSelectedEventId(event.id)
                    setError(null)
                  }}
                  className="size-5 shrink-0 accent-primary"
                />
                <span className="min-w-0 break-words">{event.name}</span>
              </label>
            ))}
          </fieldset>
          <div className="rounded-xl bg-muted px-3 py-3 text-xs leading-5 text-muted-foreground">
            <p>{t('expense.linkDisclosureVisibility')}</p>
            <p className="mt-1">{t('expense.linkDisclosureParticipants')}</p>
            <p className="mt-1">{t('expense.linkDisclosureOrganizer')}</p>
          </div>
          <TeskeidActionButton
            type="button"
            variant="primary"
            className="w-full"
            pending={isPending}
            disabled={!selectedEvent}
            onClick={attach}
          >
            {isPending ? t('expense.linkingEvent') : t('expense.confirmLinkEvent')}
          </TeskeidActionButton>
        </TeskeidActionSheet>
      ) : null}
      {currentEvent ? (
        <TeskeidActionSheet
          open={detachOpen}
          onOpenChange={(open) => {
            if (!isPending) setDetachOpen(open)
            if (!open) setError(null)
          }}
          trigger={(
            <TeskeidActionButton type="button" variant="danger" className="w-full">
              {t('expense.detachEvent')}
            </TeskeidActionButton>
          )}
          title={t('expense.detachEvent')}
          description={t('expense.detachEventDescription', { event: currentEventLabel })}
          closeLabel={t('expense.eventLinkClose')}
        >
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <p className="text-sm leading-6 text-muted-foreground">
            {t('expense.detachEventKeepsParticipants')}
          </p>
          <TeskeidActionButton
            type="button"
            variant="danger"
            className="w-full"
            pending={isPending}
            onClick={detach}
          >
            {isPending ? t('expense.detachingEvent') : t('expense.confirmDetachEvent')}
          </TeskeidActionButton>
        </TeskeidActionSheet>
      ) : null}
    </section>
  )
}
