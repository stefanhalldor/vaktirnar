'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'
import { TeskeidTimeField } from '@/components/teskeid/TeskeidTimeField'
import { createRequestId, expenseLabelClass, expenseTextareaClass } from '@/components/expenses/ui'
import { saveEventDetails } from '@/lib/events/actions'
import type { EventDetailsView } from '@/lib/events/contracts'

const KNOWN_ERROR_CODES = new Set([
  'invalid_input',
  'not_allowed',
  'not_found',
  'conflict',
  'feature_disabled',
  'save_failed',
])

type Draft = {
  event_date: string
  event_time: string
  description: string
  agenda: string
}

function draftFrom(details: EventDetailsView): Draft {
  return {
    event_date: details.eventDate ?? '',
    event_time: details.eventTime ?? '',
    description: details.description ?? '',
    agenda: details.agenda ?? '',
  }
}

function fingerprint(draft: Draft): string {
  return JSON.stringify(draft)
}

export function EventDetailsEditor({ details }: { details: EventDetailsView }) {
  const t = useTranslations('teskeid.events')
  const router = useRouter()
  const [draft, setDraft] = useState(() => draftFrom(details))
  const [savedFingerprint, setSavedFingerprint] = useState(() => fingerprint(draftFrom(details)))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [awaitingRefresh, setAwaitingRefresh] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submissionRef = useRef<{ fingerprint: string; requestId: string } | null>(null)
  const submittingRef = useRef(false)
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    const next = draftFrom(details)
    setDraft(next)
    setSavedFingerprint(fingerprint(next))
    setAwaitingRefresh(false)
    submissionRef.current = null
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    }
  }, [details])

  const currentFingerprint = fingerprint(draft)
  const dirty = currentFingerprint !== savedFingerprint
  const timingIncomplete = Boolean(draft.event_date) !== Boolean(draft.event_time)
  const busy = isSubmitting || awaitingRefresh

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setSaved(false)
    setError(null)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dirty || timingIncomplete || submittingRef.current || awaitingRefresh) return
    if (submissionRef.current?.fingerprint !== currentFingerprint) {
      submissionRef.current = { fingerprint: currentFingerprint, requestId: createRequestId() }
    }
    submittingRef.current = true
    setIsSubmitting(true)
    setSaved(false)
    setError(null)
    let result: Awaited<ReturnType<typeof saveEventDetails>>
    try {
      result = await saveEventDetails({
        event_id: details.eventId,
        request_id: submissionRef.current.requestId,
        event_date: draft.event_date || null,
        event_time: draft.event_time || null,
        description: draft.description,
        agenda: draft.agenda,
      })
    } catch {
      result = { ok: false, error: 'save_failed' }
    }
    submittingRef.current = false
    setIsSubmitting(false)
    if (!result.ok) {
      const code = KNOWN_ERROR_CODES.has(result.error) ? result.error : 'save_failed'
      setError(t(`errors.${code}`))
      return
    }
    setSaved(true)
    setSavedFingerprint(currentFingerprint)
    setAwaitingRefresh(true)
    router.refresh()
    refreshTimeoutRef.current = setTimeout(() => setAwaitingRefresh(false), 10_000)
  }

  return (
    <form onSubmit={submit} className="space-y-4 border-y border-border py-5" aria-labelledby="event-details-editor-heading">
      <div>
        <h2 id="event-details-editor-heading" className="text-sm font-semibold">{t('detail.details')}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('detail.detailsHint')}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TeskeidDateField
          label={t('create.date')}
          placeholder={t('create.datePlaceholder')}
          value={draft.event_date}
          disabled={busy}
          onChange={(value) => update('event_date', value)}
        />
        <TeskeidTimeField
          label={t('create.time')}
          hourLabel={t('create.hour')}
          minuteLabel={t('create.minute')}
          value={draft.event_time}
          disabled={busy}
          onChange={(value) => update('event_time', value)}
        />
      </div>
      {timingIncomplete ? (
        <p role="alert" className="text-sm text-destructive">{t('create.dateTimePair')}</p>
      ) : null}
      <label>
        <span className={expenseLabelClass}>{t('create.description')}</span>
        <textarea
          className={expenseTextareaClass}
          maxLength={2000}
          value={draft.description}
          disabled={busy}
          placeholder={t('create.descriptionPlaceholder')}
          onChange={(event) => update('description', event.target.value)}
        />
      </label>
      <label>
        <span className={expenseLabelClass}>{t('create.agenda')}</span>
        <textarea
          className={`${expenseTextareaClass} min-h-32`}
          maxLength={4000}
          value={draft.agenda}
          disabled={busy}
          placeholder={t('create.agendaPlaceholder')}
          onChange={(event) => update('agenda', event.target.value)}
        />
      </label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p role="status" className="text-sm text-muted-foreground">{t('detail.detailsSaved')}</p> : null}
      <TeskeidActionButton
        type="submit"
        variant="primary"
        pending={busy}
        disabled={!dirty || timingIncomplete || busy}
        className="w-full"
      >
        {busy ? t('detail.savingDetails') : t('detail.saveDetails')}
      </TeskeidActionButton>
    </form>
  )
}
