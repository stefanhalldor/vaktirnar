'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import { createEvent } from '@/lib/events/actions'
import { createRequestId, expenseInputClass, expenseLabelClass } from '@/components/expenses/ui'
import { EventParticipantPicker } from './EventParticipantPicker'

type EventParticipantInput =
  | { type: 'guest'; display_name: string }
  | { type: 'relationship'; relationship_id: string }

type SelectedEventParticipant = {
  key: string
  label: string
  source: 'guest' | 'relationship'
  input: EventParticipantInput
}

type CreateDestination = 'detail' | 'expense'

const KNOWN_ERROR_CODES = new Set([
  'invalid_input',
  'not_allowed',
  'not_found',
  'conflict',
  'feature_disabled',
  'save_failed',
])

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
  const [name, setName] = useState('')
  const [participants, setParticipants] = useState<SelectedEventParticipant[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const atParticipantLimit = participants.length >= 49
  const excludedRelationshipIds = participants.flatMap((participant) => (
    participant.input.type === 'relationship' ? [participant.input.relationship_id] : []
  ))

  function addKnown(option: ExpenseParticipantOption): boolean {
    if (atParticipantLimit || excludedRelationshipIds.includes(option.relationshipId)) return false
    setParticipants((current) => [...current, {
      key: `relationship:${option.relationshipId}`,
      label: option.pickerLabel,
      source: 'relationship',
      input: { type: 'relationship', relationship_id: option.relationshipId },
    }])
    return true
  }

  function addGuest(displayName: string): boolean {
    if (atParticipantLimit) return false
    setParticipants((current) => [...current, {
      key: `guest:${createRequestId()}`,
      label: displayName,
      source: 'guest',
      input: { type: 'guest', display_name: displayName },
    }])
    return true
  }

  function requestIdFor(payload: { name: string; participants: EventParticipantInput[] }): string {
    const fingerprint = JSON.stringify(payload)
    if (submissionRef.current?.fingerprint !== fingerprint) {
      submissionRef.current = { fingerprint, requestId: createRequestId() }
    }
    return submissionRef.current.requestId
  }

  async function submit(destination: CreateDestination) {
    if (submittingRef.current) return
    const normalizedName = name.trim().normalize('NFC')
    if (!normalizedName) return

    const payload = {
      name: normalizedName,
      participants: participants.map((participant) => participant.input),
    }
    const requestId = requestIdFor(payload)
    submittingRef.current = true
    setIsSubmitting(true)
    setError(null)

    let result: Awaited<ReturnType<typeof createEvent>>
    try {
      result = await createEvent({ ...payload, request_id: requestId })
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

    const href = destination === 'expense'
      ? `/auth-mvp/utlagt-og-endurgreitt/hopar/${result.data.eventId}/nytt-utgjald`
      : `/auth-mvp/vidburdir/${result.data.eventId}`
    router.push(href)
    router.refresh()
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    void submit(submitter?.value === 'detail' ? 'detail' : 'expense')
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
      </section>

      <section className="space-y-4 border-y border-border py-5" aria-labelledby="event-participants-heading">
        <div>
          <h2 id="event-participants-heading" className="text-sm font-semibold">{t('create.participants')}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('create.participantsHint')}</p>
        </div>

        {participants.length > 0 ? (
          <div className="divide-y divide-border border-y border-border">
            {participants.map((participant) => (
              <div key={participant.key} className="flex min-h-14 items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">{participant.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(participant.source === 'relationship'
                      ? 'create.teskeidParticipant'
                      : 'create.guestParticipant')}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={t('create.removeParticipant', { name: participant.label })}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
                  disabled={isSubmitting}
                  onClick={() => setParticipants((current) => current.filter((item) => item.key !== participant.key))}
                >
                  <X aria-hidden size={18} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('create.noParticipants')}</p>
        )}

        {atParticipantLimit ? (
          <p role="status" className="text-sm text-muted-foreground">{t('create.participantLimit')}</p>
        ) : null}
        <EventParticipantPicker
          options={options}
          excludedRelationshipIds={excludedRelationshipIds}
          optionsError={optionsError}
          disabled={isSubmitting || atParticipantLimit}
          onAddKnown={addKnown}
          onAddGuest={addGuest}
        />
        <p className="text-xs leading-5 text-muted-foreground">{t('create.frozenRosterHint')}</p>
      </section>

      <div className="grid gap-3">
        <TeskeidActionButton
          type="submit"
          name="destination"
          value="expense"
          variant="primary"
          pending={isSubmitting}
          disabled={!name.trim()}
          className="w-full"
        >
          {isSubmitting ? t('create.creating') : t('create.createAndExpense')}
        </TeskeidActionButton>
        <TeskeidActionButton
          type="submit"
          name="destination"
          value="detail"
          variant="secondary"
          pending={isSubmitting}
          disabled={!name.trim()}
          className="w-full"
        >
          {isSubmitting ? t('create.creating') : t('create.createOnly')}
        </TeskeidActionButton>
      </div>
    </form>
  )
}
