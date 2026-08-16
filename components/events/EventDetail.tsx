'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import type {
  EventDetailView,
  EventGuestAttendanceView,
  EventNewGuestInput,
  EventRosterGuestInput,
} from '@/lib/events/contracts'
import { eventExpensePath } from '@/lib/events/contracts'
import { saveEventRoster } from '@/lib/events/actions'
import { formatDateTime } from '@/lib/date-format'
import { createRequestId } from '@/components/expenses/ui'
import { EventParticipantPicker } from './EventParticipantPicker'
import { EventGuestAttendanceControl } from './EventGuestAttendanceControl'

type EditableGuest = {
  key: string
  label: string
  sourceKind: EventDetailView['guests'][number]['sourceKind']
  isTeskeidUser: boolean
  attendance?: EventGuestAttendanceView
  input: EventRosterGuestInput
}

const KNOWN_ERROR_CODES = new Set([
  'invalid_input',
  'not_allowed',
  'not_found',
  'conflict',
  'feature_disabled',
  'save_failed',
])

function editableGuests(event: EventDetailView): EditableGuest[] {
  return [...event.guests]
    .sort((left, right) => left.position - right.position)
    .map((guest) => ({
      key: guest.id,
      label: guest.email ?? guest.displayName,
      sourceKind: guest.sourceKind,
      isTeskeidUser: guest.isTeskeidUser,
      attendance: guest.attendance,
      input: { event_guest_id: guest.id },
    }))
}

function fingerprint(guests: EditableGuest[]): string {
  return JSON.stringify(guests.map((guest) => guest.input))
}

function rebaseGuestDraft(
  draft: EditableGuest[],
  canonicalGuests: EditableGuest[],
  baseGuestIds: ReadonlySet<string>,
): EditableGuest[] {
  const canonicalById = new Map(canonicalGuests.map((guest) => [guest.key, guest]))
  const reconciled = draft.flatMap((guest) => {
    if (!('event_guest_id' in guest.input)) return [guest]
    const canonical = canonicalById.get(guest.input.event_guest_id)
    return canonical ? [canonical] : []
  })
  const retainedIds = new Set(reconciled.flatMap((guest) => (
    'event_guest_id' in guest.input ? [guest.input.event_guest_id] : []
  )))
  const locallyRemovedIds = new Set([...baseGuestIds].filter((id) => !retainedIds.has(id)))
  reconciled.push(...canonicalGuests.filter((guest) => (
    !retainedIds.has(guest.key) && !locallyRemovedIds.has(guest.key)
  )))
  return reconciled
}

export function EventDetail({
  event,
  options,
  optionsError,
  canUseExpenses,
  financialPanel,
}: {
  event: EventDetailView
  options: ExpenseParticipantOption[]
  optionsError: boolean
  canUseExpenses: boolean
  /** Phase B owner-safe preview seam; event CRUD never depends on this panel. */
  financialPanel?: ReactNode
}) {
  const t = useTranslations('teskeid.events')
  const locale = useLocale()
  const router = useRouter()
  const initialGuests = useMemo(() => editableGuests(event), [event])
  const [guests, setGuests] = useState(initialGuests)
  const [baseRevision, setBaseRevision] = useState(event.rosterRevision)
  const [savedFingerprint, setSavedFingerprint] = useState(() => fingerprint(initialGuests))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saveDelivery, setSaveDelivery] = useState<{
    invitationCount: number
    deliveredCount: number
    deliveryIssue: boolean
  } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [attendancePendingCount, setAttendancePendingCount] = useState(0)
  const [awaitingRefresh, setAwaitingRefresh] = useState(false)
  const [refreshingConflict, setRefreshingConflict] = useState(false)
  const submissionRef = useRef<{ fingerprint: string; requestId: string } | null>(null)
  const submittingRef = useRef(false)
  const conflictDraftRef = useRef<EditableGuest[] | null>(null)
  const guestsRef = useRef(initialGuests)
  const savedFingerprintRef = useRef(fingerprint(initialGuests))
  const conflictRefreshRef = useRef(false)
  const successfulSaveRevisionRef = useRef<number | null>(null)
  const previousEventRef = useRef(event)
  const baseEventIdRef = useRef(event.id)
  const baseGuestIdsRef = useRef(new Set(initialGuests.map((guest) => guest.key)))
  const attendancePendingGuestsRef = useRef(new Set<string>())

  useEffect(() => {
    const receivedFreshProps = previousEventRef.current !== event
    previousEventRef.current = event
    const sameEvent = event.id === baseEventIdRef.current
    const completedSaveRefresh = sameEvent
      && successfulSaveRevisionRef.current !== null
      && event.rosterRevision >= successfulSaveRevisionRef.current
    if (sameEvent && event.rosterRevision === baseRevision && !completedSaveRefresh) {
      if (receivedFreshProps) {
        const canonicalById = new Map(editableGuests(event).map((guest) => [guest.key, guest]))
        const refreshedGuests = guestsRef.current.map((guest) => {
          if (!('event_guest_id' in guest.input)) return guest
          const canonical = canonicalById.get(guest.input.event_guest_id)
          return canonical ?? guest
        })
        guestsRef.current = refreshedGuests
        setGuests(refreshedGuests)
      }
      // A semantic conflict such as a duplicate guest can leave the canonical
      // revision unchanged. A completed refresh must still release the form;
      // the local draft remains visible and editable for correction.
      if (receivedFreshProps && conflictRefreshRef.current) {
        conflictRefreshRef.current = false
        conflictDraftRef.current = null
        setRefreshingConflict(false)
      }
      return
    }
    const nextGuests = editableGuests(event)
    const unsavedDraft = sameEvent && fingerprint(guestsRef.current) !== savedFingerprintRef.current
      ? guestsRef.current
      : null
    const draft = sameEvent && !completedSaveRefresh
      ? conflictDraftRef.current ?? unsavedDraft
      : null
    const displayedGuests = draft
      ? rebaseGuestDraft(draft, nextGuests, baseGuestIdsRef.current)
      : nextGuests
    guestsRef.current = displayedGuests
    setGuests(displayedGuests)
    if (draft) {
      conflictDraftRef.current = null
      setError(null)
    }
    conflictRefreshRef.current = false
    successfulSaveRevisionRef.current = null
    setRefreshingConflict(false)
    setBaseRevision(event.rosterRevision)
    const nextSavedFingerprint = fingerprint(nextGuests)
    savedFingerprintRef.current = nextSavedFingerprint
    setSavedFingerprint(nextSavedFingerprint)
    baseEventIdRef.current = event.id
    baseGuestIdsRef.current = new Set(nextGuests.map((guest) => guest.key))
    setAwaitingRefresh(false)
    submissionRef.current = null
  }, [baseRevision, event])

  const currentFingerprint = fingerprint(guests)
  const dirty = currentFingerprint !== savedFingerprint
  const attendancePending = attendancePendingCount > 0
  const formBusy = isSubmitting || awaitingRefresh || refreshingConflict || attendancePending
  const atGuestLimit = guests.length >= 49
  const excludedRelationshipIds = guests.flatMap((guest) => (
    'source_kind' in guest.input && guest.input.source_kind === 'relationship'
      ? [guest.input.relationship_id]
      : []
  ))

  function updateGuests(update: (current: EditableGuest[]) => EditableGuest[]) {
    setGuests((current) => {
      const next = update(current)
      guestsRef.current = next
      return next
    })
  }

  function setGuestAttendancePending(guestId: string, pending: boolean) {
    if (pending) attendancePendingGuestsRef.current.add(guestId)
    else attendancePendingGuestsRef.current.delete(guestId)
    setAttendancePendingCount(attendancePendingGuestsRef.current.size)
  }

  function addKnown(option: ExpenseParticipantOption): boolean {
    if (
      atGuestLimit
      || awaitingRefresh
      || refreshingConflict
      || attendancePending
      || excludedRelationshipIds.includes(option.relationshipId)
    ) return false
    setSaved(false)
    setError(null)
    updateGuests((current) => [...current, {
      key: `relationship:${createRequestId()}`,
      label: option.pickerLabel,
      sourceKind: 'relationship',
      isTeskeidUser: true,
      input: { source_kind: 'relationship', relationship_id: option.relationshipId },
    }])
    return true
  }

  function addManual(input: EventNewGuestInput, label: string): boolean {
    if (
      atGuestLimit
      || awaitingRefresh
      || refreshingConflict
      || attendancePending
      || input.source_kind === 'relationship'
    ) return false
    if (
      input.source_kind === 'manual_email'
      && guests.some((guest) => (
        'source_kind' in guest.input
        && guest.input.source_kind === 'manual_email'
        && guest.input.email === input.email
      ))
    ) return false
    setSaved(false)
    setError(null)
    updateGuests((current) => [...current, {
      key: `${input.source_kind}:${createRequestId()}`,
      label,
      sourceKind: input.source_kind,
      isTeskeidUser: false,
      input,
    }])
    return true
  }

  function requestIdFor(): string {
    const saveFingerprint = JSON.stringify({
      event_id: event.id,
      expected_roster_revision: baseRevision,
      guests: guests.map((guest) => guest.input),
    })
    if (submissionRef.current?.fingerprint !== saveFingerprint) {
      submissionRef.current = { fingerprint: saveFingerprint, requestId: createRequestId() }
    }
    return submissionRef.current.requestId
  }

  async function submitRoster(eventObject: React.FormEvent<HTMLFormElement>) {
    eventObject.preventDefault()
    if (!dirty || submittingRef.current || awaitingRefresh || attendancePendingGuestsRef.current.size > 0) return
    submittingRef.current = true
    setIsSubmitting(true)
    setSaved(false)
    setSaveDelivery(null)
    setError(null)

    let result: Awaited<ReturnType<typeof saveEventRoster>>
    try {
      result = await saveEventRoster({
        event_id: event.id,
        request_id: requestIdFor(),
        expected_roster_revision: baseRevision,
        guests: guests.map((guest) => guest.input),
      })
    } catch {
      result = { ok: false, error: 'save_failed' }
    }
    submittingRef.current = false
    setIsSubmitting(false)
    if (!result.ok) {
      const errorCode = KNOWN_ERROR_CODES.has(result.error) ? result.error : 'save_failed'
      setError(t(`errors.${errorCode}`))
      if (errorCode === 'conflict') {
        conflictDraftRef.current = guests
        conflictRefreshRef.current = true
        setRefreshingConflict(true)
        router.refresh()
      }
      return
    }

    setSaved(true)
    setSaveDelivery({
      invitationCount: result.data.invitationCount,
      deliveredCount: result.data.deliveredCount,
      deliveryIssue: result.data.deliveryIssue,
    })
    successfulSaveRevisionRef.current = result.data.rosterRevision
    setAwaitingRefresh(true)
    router.refresh()
  }

  function sourceLabel(sourceKind: EditableGuest['sourceKind']): string {
    if (sourceKind === 'relationship') return t('detail.teskeidParticipant')
    if (sourceKind === 'manual_email') return t('detail.emailParticipant')
    return t('detail.guestParticipant')
  }

  return (
    <div className="space-y-8">
      <section className="border-y border-border py-4">
        <p className="text-xs text-muted-foreground">
          {t('detail.createdAt', { date: formatDateTime(event.createdAt, locale) })}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('detail.privateRosterHint')}</p>
      </section>

      {canUseExpenses ? (
        <Link
          href={eventExpensePath(event.id)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus aria-hidden size={18} />
          {t('detail.addExpense')}
        </Link>
      ) : null}

      {canUseExpenses ? financialPanel : null}

      <form onSubmit={submitRoster} className="space-y-4" aria-labelledby="event-roster-heading">
        <div>
          <h2 id="event-roster-heading" className="text-sm font-semibold">{t('detail.participants')}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('detail.editRosterHint')}</p>
        </div>

        {error ? (
          <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        ) : null}
        {saved ? (
          <div role="status" className="space-y-1 text-sm text-muted-foreground">
            <p>{saveDelivery?.deliveryIssue
              ? t('detail.rosterSavedWithDeliveryIssue')
              : saveDelivery && saveDelivery.invitationCount > 0
                ? t('detail.rosterSavedWithInvitations')
                : t('detail.rosterSaved')}</p>
            {saveDelivery && saveDelivery.invitationCount > 0 ? (
              <p>{t('detail.invitationDeliverySummary', {
                sentCount: saveDelivery.deliveredCount,
                pendingCount: saveDelivery.invitationCount - saveDelivery.deliveredCount,
              })}</p>
            ) : null}
          </div>
        ) : null}

        {guests.length === 0 ? (
          <p className="border-y border-border py-4 text-sm text-muted-foreground">{t('detail.noParticipants')}</p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {guests.map((guest) => (
              <div key={guest.key} className="min-w-0 py-3">
                <div className="flex min-h-11 items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block break-all text-sm font-medium">{guest.label}</span>
                    <span className="block text-xs text-muted-foreground">{sourceLabel(guest.sourceKind)}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={t('detail.removeParticipant', { name: guest.label })}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
                    disabled={formBusy}
                    onClick={() => {
                      setSaved(false)
                      setSaveDelivery(null)
                      setError(null)
                      updateGuests((current) => current.filter((item) => item.key !== guest.key))
                    }}
                  >
                    <X aria-hidden size={18} />
                  </button>
                </div>
                {'event_guest_id' in guest.input && guest.attendance ? (
                  <div className="mt-2 border-l-2 border-border pl-3">
                    <EventGuestAttendanceControl
                      eventId={event.id}
                      eventGuestId={guest.input.event_guest_id}
                      rosterRevision={baseRevision}
                      partyLabel={guest.label}
                      sourceKind={guest.sourceKind}
                      isTeskeidUser={guest.isTeskeidUser}
                      attendance={guest.attendance}
                      disabled={formBusy}
                      onPendingChange={(pending) => setGuestAttendancePending(guest.key, pending)}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {atGuestLimit ? (
          <p role="status" className="text-sm text-muted-foreground">{t('detail.participantLimit')}</p>
        ) : null}
        <EventParticipantPicker
          options={options}
          excludedRelationshipIds={excludedRelationshipIds}
          optionsError={optionsError}
          disabled={formBusy || atGuestLimit}
          onAddKnown={addKnown}
          onAddManual={addManual}
        />
        {dirty ? <p className="text-xs text-muted-foreground">{t('detail.unsavedRosterHint')}</p> : null}
        <TeskeidActionButton
          type="submit"
          variant="primary"
          pending={isSubmitting || awaitingRefresh || refreshingConflict}
          disabled={!dirty || awaitingRefresh || refreshingConflict || attendancePending}
          className="w-full"
        >
          {isSubmitting || awaitingRefresh || refreshingConflict
            ? t('detail.savingRoster')
            : t('detail.saveRoster')}
        </TeskeidActionButton>
      </form>

    </div>
  )
}
