'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { EventSummary } from '@/lib/events/contracts'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'

const STANDALONE_CONTEXT = 'standalone'

export function ExpenseEventContextChooser({
  events,
  eventsError = false,
}: {
  events: EventSummary[]
  eventsError?: boolean
}) {
  const t = useTranslations('teskeid.events')
  const router = useRouter()
  const navigatingRef = useRef(false)
  const [selectedContext, setSelectedContext] = useState(STANDALONE_CONTEXT)
  const [isNavigating, setIsNavigating] = useState(false)

  function continueToExpense() {
    if (navigatingRef.current) return
    navigatingRef.current = true
    setIsNavigating(true)
    const event = events.find((candidate) => candidate.id === selectedContext)
    router.push(event
      ? `/auth-mvp/utlagt-og-endurgreitt/hopar/${event.id}/nytt-utgjald`
      : '/auth-mvp/utlagt-og-endurgreitt/nytt?context=standalone')
  }

  function retryEvents() {
    if (navigatingRef.current) return
    navigatingRef.current = true
    setIsNavigating(true)
    router.refresh()
  }

  if (eventsError) {
    return (
      <section className="space-y-5" aria-labelledby="expense-context-heading">
        <h2 id="expense-context-heading" className="text-lg font-semibold">
          {t('contextChooser.title')}
        </h2>
        <p role="alert" className="text-sm leading-6 text-destructive">
          {t('contextChooser.loadError')}
        </p>
        <TeskeidActionButton
          type="button"
          variant="primary"
          pending={isNavigating}
          className="w-full"
          onClick={retryEvents}
        >
          {isNavigating ? t('contextChooser.retrying') : t('errors.retry')}
        </TeskeidActionButton>
      </section>
    )
  }

  return (
    <section className="space-y-6" aria-labelledby="expense-context-heading">
      <div>
        <h2 id="expense-context-heading" className="text-lg font-semibold">{t('contextChooser.title')}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('contextChooser.description')}</p>
      </div>

      <fieldset className="divide-y divide-border border-y border-border">
        <legend className="sr-only">{t('contextChooser.title')}</legend>
        <label className="flex min-h-16 cursor-pointer items-start gap-3 py-3">
          <input
            type="radio"
            name="expense-context"
            value={STANDALONE_CONTEXT}
            checked={selectedContext === STANDALONE_CONTEXT}
            disabled={isNavigating}
            onChange={() => setSelectedContext(STANDALONE_CONTEXT)}
            className="mt-1 size-5 shrink-0"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{t('contextChooser.standalone')}</span>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              {t('contextChooser.standaloneHint')}
            </span>
          </span>
        </label>

        {events.map((event) => (
          <label key={event.id} className="flex min-h-16 cursor-pointer items-start gap-3 py-3">
            <input
              type="radio"
              name="expense-context"
              value={event.id}
              checked={selectedContext === event.id}
              disabled={isNavigating}
              onChange={() => setSelectedContext(event.id)}
              className="mt-1 size-5 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-medium">{event.name}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                {t('contextChooser.eventHint', { name: event.name })}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('contextChooser.noEvents')}</p>
      ) : null}

      <TeskeidActionButton
        type="button"
        variant="primary"
        pending={isNavigating}
        className="w-full"
        onClick={continueToExpense}
      >
        {isNavigating ? t('contextChooser.continuing') : t('contextChooser.continue')}
      </TeskeidActionButton>
    </section>
  )
}
