'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'
import { TeskeidTimeField } from '@/components/teskeid/TeskeidTimeField'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import type { EventNewGuestV2 } from '@/lib/events/participant-identity-v2.contracts'
import { eventDetailPath } from '@/lib/events/contracts'
import { createEventV2 } from '@/lib/events/participant-identity-v2.actions'
import {
  createRequestId,
  expenseInputClass,
  expenseLabelClass,
  expenseTextareaClass,
} from '@/components/expenses/ui'
import { EventParticipantPicker } from './EventParticipantPicker'

type SelectedEventGuest = {
  key: string
  label: string
  input: EventNewGuestV2
}

type CreateReceipt = {
  destination: string
  invitationCount: number
  deliveredCount: number
  deliveryIssue: boolean
}

const KNOWN_ERROR_CODES = new Set([
  'invalid_input',
  'not_allowed',
  'not_found',
  'conflict',
  'feature_disabled',
  'save_failed',
])

function sourceTranslationKey(input: EventNewGuestV2) {
  if (input.source_kind === 'relationship') return 'create.teskeidParticipant' as const
  if (input.source_kind === 'manual_email') return 'create.emailParticipant' as const
  return 'create.guestParticipant' as const
}

export function EventCreateForm({
  options,
  optionsError,
}: {
  options: ExpenseParticipantOption[]
  optionsError: boolean
}) {
  const t = useTranslations('teskeid.events')
  const router = useRouter()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const submissionRef = useRef<{ fingerprint: string; requestId: string } | null>(null)
  const submittingRef = useRef(false)
  const receiptNavigationRef = useRef(false)
  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [description, setDescription] = useState('')
  const [agenda, setAgenda] = useState('')
  const [guests, setGuests] = useState<SelectedEventGuest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [receipt, setReceipt] = useState<CreateReceipt | null>(null)

  const atGuestLimit = guests.length >= 49
  const excludedRelationshipIds = guests.flatMap((guest) => (
    guest.input.source_kind === 'relationship' ? [guest.input.relationship_id] : []
  ))

  function addKnown(option: ExpenseParticipantOption): boolean {
    if (atGuestLimit || excludedRelationshipIds.includes(option.relationshipId)) return false
    setGuests((current) => [...current, {
      key: `relationship:${option.relationshipId}`,
      label: option.pickerLabel,
      input: { source_kind: 'relationship', relationship_id: option.relationshipId },
    }])
    return true
  }

  function addManual(input: EventNewGuestV2, label: string): boolean {
    if (atGuestLimit || input.source_kind === 'relationship') return false
    if (
      input.source_kind === 'manual_email'
      && guests.some((guest) => (
        guest.input.source_kind === 'manual_email' && guest.input.email === input.email
      ))
    ) return false
    setGuests((current) => [...current, {
      key: `${input.source_kind}:${createRequestId()}`,
      label,
      input,
    }])
    return true
  }

  function requestIdFor(payload: {
    name: string
    guests: EventNewGuestV2[]
    event_date: string | null
    event_time: string | null
    description: string
    agenda: string
  }): string {
    const fingerprint = JSON.stringify(payload)
    if (submissionRef.current?.fingerprint !== fingerprint) {
      submissionRef.current = { fingerprint, requestId: createRequestId() }
    }
    return submissionRef.current.requestId
  }

  async function submit() {
    if (submittingRef.current) return
    const normalizedName = name.trim().normalize('NFC')
    const timingIncomplete = Boolean(eventDate) !== Boolean(eventTime)
    if (!normalizedName || timingIncomplete) return

    const payload = {
      name: normalizedName,
      guests: guests.map((guest) => guest.input),
      event_date: eventDate || null,
      event_time: eventTime || null,
      description,
      agenda,
    }
    const requestId = requestIdFor(payload)
    submittingRef.current = true
    setIsSubmitting(true)
    setError(null)

    let result: Awaited<ReturnType<typeof createEventV2>>
    try {
      result = await createEventV2({ ...payload, request_id: requestId })
    } catch {
      setError(t('errors.save_failed'))
      submittingRef.current = false
      setIsSubmitting(false)
      queueMicrotask(() => alertRef.current?.focus())
      return
    }
    if (!result.ok) {
      const errorCode = KNOWN_ERROR_CODES.has(result.error) ? result.error : 'save_failed'
      setError(t(`errors.${errorCode}`))
      submittingRef.current = false
      setIsSubmitting(false)
      queueMicrotask(() => alertRef.current?.focus())
      return
    }

    const destinationPath = eventDetailPath(result.data.eventId)
    if (result.data.invitationCount > 0) {
      setReceipt({
        destination: destinationPath,
        invitationCount: result.data.invitationCount,
        deliveredCount: result.data.deliveredCount,
        deliveryIssue: result.data.deliveryIssue,
      })
      setIsSubmitting(false)
      return
    }
    router.push(destinationPath)
    router.refresh()
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit()
  }

  const timingIncomplete = Boolean(eventDate) !== Boolean(eventTime)

  if (receipt) {
    return (
      <section className="space-y-4 border-y border-border py-5" aria-labelledby="event-created-heading">
        <h2 id="event-created-heading" className="text-base font-semibold">
          {t('create.createdTitle')}
        </h2>
        <div role="status" className="space-y-2 text-sm leading-6 text-muted-foreground">
          <p>{t('create.createdWithInvitations')}</p>
        </div>
        <TeskeidActionButton
          type="button"
          variant="primary"
          pending={isSubmitting}
          disabled={isSubmitting}
          className="w-full"
          onClick={() => {
            if (receiptNavigationRef.current || isSubmitting) return
            receiptNavigationRef.current = true
            setIsSubmitting(true)
            router.push(receipt.destination)
            router.refresh()
          }}
        >
          {isSubmitting ? t('create.continuing') : t('create.continueToDetail')}
        </TeskeidActionButton>
      </section>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error ? (
        <p
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <section className="space-y-4 border-y border-border py-5" aria-labelledby="event-details-heading">
        <div>
          <h2 id="event-details-heading" className="text-sm font-semibold">{t('create.details')}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('create.detailsHint')}</p>
        </div>
        <label>
          <span className={expenseLabelClass}>{t('create.name')}</span>
          <input
            className={expenseInputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
            required
            disabled={isSubmitting}
            placeholder={t('create.namePlaceholder')}
          />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TeskeidDateField
            label={t('create.date')}
            placeholder={t('create.datePlaceholder')}
            value={eventDate}
            onChange={setEventDate}
            disabled={isSubmitting}
          />
          <TeskeidTimeField
            label={t('create.time')}
            hourLabel={t('create.hour')}
            minuteLabel={t('create.minute')}
            value={eventTime}
            onChange={setEventTime}
            disabled={isSubmitting}
          />
        </div>
        {timingIncomplete ? (
          <p role="alert" className="text-sm text-destructive">{t('create.dateTimePair')}</p>
        ) : null}
        <label>
          <span className={expenseLabelClass}>{t('create.description')}</span>
          <textarea
            className={expenseTextareaClass}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            disabled={isSubmitting}
            placeholder={t('create.descriptionPlaceholder')}
          />
        </label>
        <label>
          <span className={expenseLabelClass}>{t('create.agenda')}</span>
          <textarea
            className={`${expenseTextareaClass} min-h-32`}
            value={agenda}
            onChange={(event) => setAgenda(event.target.value)}
            maxLength={4000}
            disabled={isSubmitting}
            placeholder={t('create.agendaPlaceholder')}
          />
        </label>
      </section>

      <TeskeidActionButton
        type="submit"
        variant="primary"
        pending={isSubmitting}
        disabled={!name.trim() || timingIncomplete}
        className="w-full"
      >
        {isSubmitting ? t('create.creating') : t('create.createOnly')}
      </TeskeidActionButton>

      <section className="space-y-4 border-y border-border py-5" aria-labelledby="event-participants-heading">
        <div>
          <h2 id="event-participants-heading" className="text-sm font-semibold">{t('create.participants')}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('create.participantsHint')}</p>
        </div>

        {guests.length > 0 ? (
          <div className="divide-y divide-border border-y border-border">
            {guests.map((guest) => (
              <div key={guest.key} className="flex min-h-14 items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block break-all text-sm font-medium">{guest.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(sourceTranslationKey(guest.input))}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={t('create.removeParticipant', { name: guest.label })}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
                  disabled={isSubmitting}
                  onClick={() => setGuests((current) => current.filter((item) => item.key !== guest.key))}
                >
                  <X aria-hidden size={18} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('create.noParticipants')}</p>
        )}

        {atGuestLimit ? (
          <p role="status" className="text-sm text-muted-foreground">{t('create.participantLimit')}</p>
        ) : null}
        <EventParticipantPicker
          options={options}
          excludedRelationshipIds={excludedRelationshipIds}
          optionsError={optionsError}
          disabled={isSubmitting || atGuestLimit}
          onAddKnown={addKnown}
          onAddManual={addManual}
        />
      </section>
    </form>
  )
}
