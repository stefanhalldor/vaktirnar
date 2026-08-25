'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  attachExpenseToEvent,
  detachExpenseFromEvent,
  setExpenseEventVisibility,
} from '@/lib/expenses/actions'
import type { EventExpenseVisibility } from '@/lib/expenses/validation'
import type { ExpenseEventLinkManagementV2View } from '@/lib/events/contracts'
import { eventDetailPath } from '@/lib/events/contracts'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { TeskeidActionSheet } from '@/components/teskeid/TeskeidActionSheet'
import { useExpenseTranslations } from './i18n.client'

function requestId(): string {
  return globalThis.crypto.randomUUID()
}

function mutationRequestKey(...parts: Array<string | number | null>): string {
  return JSON.stringify(parts)
}

export function ExpenseEventLinkControl({
  expenseId,
  financialVersion,
  management,
  eventHref,
}: {
  expenseId: string
  financialVersion: number
  management: ExpenseEventLinkManagementV2View | null
  eventHref: string | null
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const [attachOpen, setAttachOpen] = useState(false)
  const [detachOpen, setDetachOpen] = useState(false)
  const [visibilityOpen, setVisibilityOpen] = useState(false)
  const [confirmingVisibility, setConfirmingVisibility] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState('')
  const [attachVisibility, setAttachVisibility] = useState<EventExpenseVisibility>('participants_only')
  const [editedVisibility, setEditedVisibility] = useState<EventExpenseVisibility>('participants_only')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isRefreshing, startRefresh] = useTransition()
  const attachRequestIds = useRef(new Map<string, string>())
  const visibilityRequestIds = useRef(new Map<string, string>())
  const detachRequestIds = useRef(new Map<string, string>())
  const selectedEvent = management?.eligibleEvents.find((event) => event.id === selectedEventId) ?? null
  const currentEvent = management?.currentEvent ?? null
  const currentEventId = currentEvent?.id ?? null
  const openHref = currentEvent?.canOpen ? eventDetailPath(currentEvent.id) : eventHref
  const currentEventLabel = currentEvent?.name ?? t('expense.linkedEventUnavailable')
  const visibilityChanged = Boolean(currentEvent && editedVisibility !== currentEvent.visibility)
  const promotingVisibility = editedVisibility === 'all_event'
  const isBusy = isPending || isRefreshing
  const componentIdentity = mutationRequestKey(expenseId, currentEventId)
  const previousComponentIdentity = useRef(componentIdentity)

  useEffect(() => {
    if (previousComponentIdentity.current === componentIdentity) return
    previousComponentIdentity.current = componentIdentity
    setAttachOpen(false)
    setDetachOpen(false)
    setVisibilityOpen(false)
    setConfirmingVisibility(false)
    setSelectedEventId('')
    setAttachVisibility('participants_only')
    setEditedVisibility('participants_only')
    setError(null)
    setStatus(null)
    attachRequestIds.current.clear()
    visibilityRequestIds.current.clear()
    detachRequestIds.current.clear()
  }, [componentIdentity])

  function actionErrorMessage(code: string, visibilityAction = false): string {
    return visibilityAction && code === 'conflict'
      ? t('eventVisibility.conflict')
      : t(`errors.${code}`)
  }

  function refresh() {
    startRefresh(() => router.refresh())
  }

  function resetAttachDraft() {
    setSelectedEventId('')
    setAttachVisibility('participants_only')
  }

  function attach() {
    if (!selectedEvent || isBusy) return
    setError(null)
    setStatus(null)
    const key = mutationRequestKey(
      expenseId,
      selectedEvent.id,
      attachVisibility,
      financialVersion,
      selectedEvent.rosterRevision,
    )
    const stableRequestId = attachRequestIds.current.get(key) ?? requestId()
    attachRequestIds.current.set(key, stableRequestId)
    startTransition(async () => {
      let result
      try {
        result = await attachExpenseToEvent({
          expense_id: expenseId,
          event_id: selectedEvent.id,
          expected_financial_version: financialVersion,
          expected_event_roster_revision: selectedEvent.rosterRevision,
          visibility: attachVisibility,
          request_id: stableRequestId,
        })
      } catch {
        setError(t('errors.save_failed'))
        return
      }
      if (!result.ok) {
        setError(actionErrorMessage(result.error))
        return
      }
      attachRequestIds.current.delete(key)
      setAttachOpen(false)
      resetAttachDraft()
      setStatus(t('expense.eventLinkUpdated'))
      refresh()
    })
  }

  function setVisibility() {
    if (!currentEvent || !visibilityChanged || isBusy) return
    setError(null)
    setStatus(null)
    const key = mutationRequestKey(
      expenseId,
      currentEvent.id,
      editedVisibility,
      currentEvent.linkRevision,
    )
    const stableRequestId = visibilityRequestIds.current.get(key) ?? requestId()
    visibilityRequestIds.current.set(key, stableRequestId)
    startTransition(async () => {
      let result
      try {
        result = await setExpenseEventVisibility({
          expense_id: expenseId,
          expected_event_id: currentEvent.id,
          expected_link_revision: currentEvent.linkRevision,
          visibility: editedVisibility,
          request_id: stableRequestId,
        })
      } catch {
        setError(t('errors.save_failed'))
        return
      }
      if (!result.ok) {
        setError(actionErrorMessage(result.error, true))
        return
      }
      visibilityRequestIds.current.delete(key)
      setConfirmingVisibility(false)
      setVisibilityOpen(false)
      setStatus(t('eventVisibility.updated'))
      refresh()
    })
  }

  function detach() {
    if (!currentEvent || isBusy) return
    setError(null)
    setStatus(null)
    const key = mutationRequestKey(expenseId, currentEvent.id, financialVersion)
    const stableRequestId = detachRequestIds.current.get(key) ?? requestId()
    detachRequestIds.current.set(key, stableRequestId)
    startTransition(async () => {
      let result
      try {
        result = await detachExpenseFromEvent({
          expense_id: expenseId,
          expected_event_id: currentEvent.id,
          expected_financial_version: financialVersion,
          request_id: stableRequestId,
        })
      } catch {
        setError(t('errors.save_failed'))
        return
      }
      if (!result.ok) {
        setError(actionErrorMessage(result.error))
        return
      }
      detachRequestIds.current.delete(key)
      setDetachOpen(false)
      setStatus(t('expense.eventLinkUpdated'))
      refresh()
    })
  }

  if (!currentEvent && !openHref && (!management || management.eligibleEvents.length === 0)) {
    return null
  }

  return (
    <section
      aria-labelledby="expense-event-link-title"
      aria-busy={isBusy}
      className="space-y-3 border-y border-border py-5"
    >
      {status ? <p role="status" className="text-sm text-muted-foreground">{status}</p> : null}
      <div>
        <h2 id="expense-event-link-title" className="text-sm font-semibold">
          {t('expense.eventLinkTitle')}
        </h2>
        {currentEvent ? (
          <>
            <p className="mt-1 break-words text-sm text-muted-foreground">{currentEventLabel}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">{t('eventVisibility.currentLabel')}: </span>
              {t(currentEvent.visibility === 'all_event'
                ? 'eventVisibility.allEvent'
                : 'eventVisibility.participantsOnly')}
            </p>
          </>
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
            if (isBusy) return
            setAttachOpen(open)
            setError(null)
            if (open) setStatus(null)
            if (!open) resetAttachDraft()
          }}
          trigger={(
            <TeskeidActionButton type="button" className="w-full" disabled={isBusy}>
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
                  disabled={isBusy}
                  onChange={() => {
                    setSelectedEventId(event.id)
                    setAttachVisibility('participants_only')
                    setError(null)
                  }}
                  className="size-5 shrink-0 accent-primary"
                />
                <span className="min-w-0 break-words">{event.name}</span>
              </label>
            ))}
          </fieldset>
          {selectedEvent ? (
            <fieldset className="space-y-3 border-t border-border pt-4">
              <legend className="text-sm font-semibold">{t('eventVisibility.legend')}</legend>
              <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border px-3 py-3 text-sm">
                <input
                  type="radio"
                  name={`expense-attach-visibility-${expenseId}`}
                  value="participants_only"
                  checked={attachVisibility === 'participants_only'}
                  disabled={isBusy}
                  onChange={() => setAttachVisibility('participants_only')}
                  className="mt-0.5 size-5 shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t('eventVisibility.participantsOnly')}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {t('eventVisibility.participantsOnlyHint')}
                  </span>
                </span>
              </label>
              <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border px-3 py-3 text-sm">
                <input
                  type="radio"
                  name={`expense-attach-visibility-${expenseId}`}
                  value="all_event"
                  checked={attachVisibility === 'all_event'}
                  disabled={isBusy}
                  onChange={() => setAttachVisibility('all_event')}
                  className="mt-0.5 size-5 shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t('eventVisibility.allEvent')}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {t('eventVisibility.allEventHint')}
                  </span>
                </span>
              </label>
              <p className="text-xs leading-5 text-muted-foreground">{t('eventVisibility.helper')}</p>
            </fieldset>
          ) : null}
          <TeskeidActionButton
            type="button"
            variant="primary"
            className="w-full"
            pending={isBusy}
            disabled={!selectedEvent}
            onClick={attach}
          >
            {isBusy ? t('expense.linkingEvent') : t('expense.confirmLinkEvent')}
          </TeskeidActionButton>
        </TeskeidActionSheet>
      ) : null}
      {currentEvent?.canOpen ? (
        <TeskeidActionSheet
          open={visibilityOpen}
          onOpenChange={(open) => {
            if (isBusy) return
            setVisibilityOpen(open)
            setError(null)
            if (open) setStatus(null)
            setConfirmingVisibility(false)
            if (open) setEditedVisibility(currentEvent.visibility)
          }}
          trigger={(
            <TeskeidActionButton type="button" className="w-full" disabled={isBusy}>
              {t('eventVisibility.editAction')}
            </TeskeidActionButton>
          )}
          title={confirmingVisibility
            ? t(promotingVisibility
              ? 'eventVisibility.promotionTitle'
              : 'eventVisibility.demotionTitle')
            : t('eventVisibility.editAction')}
          description={confirmingVisibility
            ? t(promotingVisibility
              ? 'eventVisibility.promotionBody'
              : 'eventVisibility.demotionBody')
            : t('eventVisibility.helper')}
          closeLabel={t('expense.eventLinkClose')}
        >
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {confirmingVisibility ? (
            <>
              <TeskeidActionButton
                type="button"
                variant="primary"
                className="w-full"
                pending={isBusy}
                onClick={setVisibility}
              >
                {isBusy
                  ? t('eventVisibility.saving')
                  : t(promotingVisibility
                    ? 'eventVisibility.promotionConfirm'
                    : 'eventVisibility.demotionConfirm')}
              </TeskeidActionButton>
              <TeskeidActionButton
                type="button"
                className="w-full"
                disabled={isBusy}
                onClick={() => {
                  setConfirmingVisibility(false)
                  setError(null)
                }}
              >
                {t('eventVisibility.cancel')}
              </TeskeidActionButton>
            </>
          ) : (
            <>
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">{t('eventVisibility.legend')}</legend>
                <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border px-3 py-3 text-sm">
                  <input
                    type="radio"
                    name={`expense-edit-visibility-${expenseId}`}
                    value="participants_only"
                    checked={editedVisibility === 'participants_only'}
                    disabled={isBusy}
                    onChange={() => setEditedVisibility('participants_only')}
                    className="mt-0.5 size-5 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t('eventVisibility.participantsOnly')}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {t('eventVisibility.participantsOnlyHint')}
                    </span>
                  </span>
                </label>
                <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border px-3 py-3 text-sm">
                  <input
                    type="radio"
                    name={`expense-edit-visibility-${expenseId}`}
                    value="all_event"
                    checked={editedVisibility === 'all_event'}
                    disabled={isBusy}
                    onChange={() => setEditedVisibility('all_event')}
                    className="mt-0.5 size-5 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t('eventVisibility.allEvent')}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {t('eventVisibility.allEventHint')}
                    </span>
                  </span>
                </label>
              </fieldset>
              <TeskeidActionButton
                type="button"
                variant="primary"
                className="w-full"
                disabled={!visibilityChanged}
                onClick={() => setConfirmingVisibility(true)}
              >
                {t('eventVisibility.save')}
              </TeskeidActionButton>
            </>
          )}
        </TeskeidActionSheet>
      ) : null}
      {currentEvent ? (
        <TeskeidActionSheet
          open={detachOpen}
          onOpenChange={(open) => {
            if (!isBusy) setDetachOpen(open)
            if (!open) setError(null)
            if (open) setStatus(null)
          }}
          trigger={(
            <TeskeidActionButton
              type="button"
              variant="danger"
              className="w-full"
              disabled={isBusy}
            >
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
            pending={isBusy}
            onClick={detach}
          >
            {isBusy ? t('expense.detachingEvent') : t('expense.confirmDetachEvent')}
          </TeskeidActionButton>
        </TeskeidActionSheet>
      ) : null}
    </section>
  )
}
