'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createRequestId } from '@/components/expenses/ui'
import { setEventRsvpV3Action } from '@/lib/events/participant-identity-v3.actions'
import {
  EventV3PrivateNoteInputSchema,
  type EventV3RsvpState,
} from '@/lib/events/participant-identity-v3.contracts'

const RSVP_STATES: readonly EventV3RsvpState[] = [
  'no_response', 'considering', 'attending', 'not_attending',
]

export function EventRsvpControl({
  eventId,
  eventGuestId,
  identityGeneration,
  rsvpState,
  decisionVersion,
  privateNote,
}: {
  eventId: string
  eventGuestId: string
  identityGeneration: string
  rsvpState: EventV3RsvpState
  decisionVersion: string
  privateNote?: string
}) {
  const t = useTranslations('teskeid.events')
  const router = useRouter()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const inFlightRef = useRef(false)
  const requestRef = useRef<{ key: string; id: string } | null>(null)
  const [selectedState, setSelectedState] = useState<EventV3RsvpState>(rsvpState)
  const [note, setNote] = useState(privateNote ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    setSelectedState(rsvpState)
    setNote(privateNote ?? '')
    setStatusMessage(null)
    requestRef.current = null
  }, [decisionVersion, privateNote, rsvpState])

  useEffect(() => {
    if (error) alertRef.current?.focus()
  }, [error])

  const parsedNote = useMemo(
    () => selectedState === 'considering'
      ? EventV3PrivateNoteInputSchema.safeParse(note)
      : EventV3PrivateNoteInputSchema.safeParse(null),
    [note, selectedState],
  )
  const normalizedNote = parsedNote.success ? parsedNote.data : null
  const dirty = selectedState !== rsvpState
    || (selectedState === 'considering' && normalizedNote !== (privateNote ?? null))

  function labelKey(state: EventV3RsvpState) {
    if (state === 'no_response') return 'noResponse'
    if (state === 'not_attending') return 'notAttending'
    return state
  }

  async function save() {
    if (inFlightRef.current || !dirty) return
    if (!parsedNote.success) {
      setError(t('rsvp.noteInvalid'))
      return
    }
    const privateNoteInput = selectedState === 'considering' ? parsedNote.data : null
    const requestKey = JSON.stringify({
      eventId, eventGuestId, identityGeneration, decisionVersion, selectedState, privateNoteInput,
    })
    if (requestRef.current?.key !== requestKey) {
      requestRef.current = { key: requestKey, id: createRequestId() }
    }
    inFlightRef.current = true
    setPending(true)
    setError(null)
    setStatusMessage(null)
    try {
      const result = await setEventRsvpV3Action({
        event_id: eventId,
        event_guest_id: eventGuestId,
        identity_generation: identityGeneration,
        rsvp_state: selectedState,
        private_note: privateNoteInput,
        expected_decision_version: decisionVersion,
        request_id: requestRef.current.id,
      })
      if (!result.ok) {
        setError(t(result.error === 'conflict' ? 'rsvp.conflict' : `errors.${result.error}`))
        if (result.error === 'conflict' || result.error === 'not_found') router.refresh()
        return
      }
      requestRef.current = null
      setStatusMessage(t('rsvp.saved'))
      router.refresh()
    } catch {
      setError(t('rsvp.saveError'))
    } finally {
      inFlightRef.current = false
      setPending(false)
    }
  }

  return (
    <section className="space-y-4 border-y border-border py-4" aria-labelledby="event-rsvp-heading">
      <div>
        <h2 id="event-rsvp-heading" className="text-sm font-semibold">{t('rsvp.title')}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('rsvp.hint')}</p>
      </div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('rsvp.title')}>
        {RSVP_STATES.map((state) => (
          <label
            key={state}
            className={`relative flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-semibold ${pending ? 'cursor-not-allowed opacity-60' : ''} ${selectedState === state ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}
          >
            <input
              type="radio"
              name="event-rsvp-state"
              value={state}
              checked={selectedState === state}
              disabled={pending}
              onChange={() => { setSelectedState(state); setError(null); setStatusMessage(null) }}
              className="peer sr-only"
            />
            <span className="absolute inset-0 rounded-xl peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2" />
            <span className="relative">{t(`rsvp.${labelKey(state)}`)}</span>
          </label>
        ))}
      </div>

      {selectedState === 'considering' ? (
        <div className="space-y-2">
          <label htmlFor="event-rsvp-private-note" className="block text-sm font-medium">
            {t('rsvp.noteLabel')}
          </label>
          <textarea
            id="event-rsvp-private-note"
            value={note}
            disabled={pending}
            rows={3}
            aria-describedby={`event-rsvp-private-note-hint event-rsvp-private-note-count${!parsedNote.success ? ' event-rsvp-private-note-error' : ''}`}
            aria-invalid={!parsedNote.success || undefined}
            onChange={(event) => { setNote(event.target.value); setError(null); setStatusMessage(null) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault()
            }}
            className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-base leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            placeholder={t('rsvp.notePlaceholder')}
          />
          <div className="flex items-start justify-between gap-3 text-xs leading-5 text-muted-foreground">
            <p id="event-rsvp-private-note-hint" className="min-w-0">{t('rsvp.noteHint')}</p>
            <span id="event-rsvp-private-note-count" className="shrink-0">
              {t('rsvp.noteCount', { count: Array.from(note.trim().normalize('NFC')).length })}
            </span>
          </div>
          {!parsedNote.success ? (
            <p id="event-rsvp-private-note-error" role="alert" className="text-sm text-destructive">
              {t('rsvp.noteInvalid')}
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        disabled={pending || !dirty || !parsedNote.success}
        onClick={() => void save()}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
      >
        {pending ? t('rsvp.saving') : t('rsvp.save')}
      </button>
      <p role="status" aria-live="polite" className="sr-only">
        {pending ? t('rsvp.saving') : statusMessage}
      </p>
      {error ? <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
  )
}
