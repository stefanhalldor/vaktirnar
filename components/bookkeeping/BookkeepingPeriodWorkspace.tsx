'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ChevronRight, LoaderCircle, Plus } from 'lucide-react'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'
import {
  recordBookkeepingFiling,
  recordBookkeepingPayment,
  reopenBookkeepingPeriod,
  setBookkeepingEntrySettlementState,
  setBookkeepingEntryReviewState,
  setBookkeepingPeriodReady,
  voidBookkeepingEntry,
} from '@/lib/bookkeeping/actions'
import type { BookkeepingActionResult } from '@/lib/bookkeeping/contracts'
import type { VatReportField } from '@/lib/bookkeeping/constants'
import { formatDateOnly } from '@/lib/date-format'
import { formatIskAmount, formatIskInteger, formatSignedIskInput, sumIskAmounts } from '@/lib/bookkeeping/money'
import type {
  BookkeepingEntry,
  BookkeepingFilingSnapshot,
  BookkeepingPeriodView,
} from '@/lib/bookkeeping/types'
import { useBookkeepingTranslations } from './i18n.client'
import { useBookkeepingMutationRequestIds } from './request-id'
import { BookkeepingReadinessPanel } from './BookkeepingReadinessPanel'
import { BookkeepingVatSummaryPanel } from './BookkeepingVatSummary'
import {
  bookkeepingInputClass,
  bookkeepingLabelClass,
  bookkeepingPrimaryButtonClass,
  bookkeepingSecondaryButtonClass,
  bookkeepingSectionClass,
  bookkeepingTextareaClass,
} from './ui'

type EntryFilter = 'all' | 'sales' | 'purchases' | 'review'
type PaymentState = BookkeepingFilingSnapshot['paymentState']

const ENTRY_FILTERS: readonly EntryFilter[] = [
  'all',
  'sales',
  'purchases',
  'review',
]

function isSale(entry: BookkeepingEntry): boolean {
  return entry.type === 'sale' || entry.type === 'sales_credit'
}

function isPurchase(entry: BookkeepingEntry): boolean {
  return entry.type === 'purchase' || entry.type === 'purchase_credit'
}

function settlementTextKind(entry: BookkeepingEntry): 'sale' | 'purchase' | 'credit' {
  if (entry.type === 'sale') return 'sale'
  if (entry.type === 'purchase') return 'purchase'
  return 'credit'
}

function matchesEntryFilter(entry: BookkeepingEntry, filter: EntryFilter): boolean {
  if (filter === 'sales') return isSale(entry)
  if (filter === 'purchases') return isPurchase(entry)
  if (filter === 'review') {
    return entry.voidedAt === null && entry.reviewState !== 'reviewed'
  }
  return true
}

function parseSignedIskInput(raw: string): number {
  const trimmed = raw.trim()
  const valid = /^-?\d+$/.test(trimmed)
    || /^-?\d{1,3}(?:\.\d{3})+$/.test(trimmed)
    || /^-?\d{1,3}(?:[ \u00a0\u202f]\d{3})+$/.test(trimmed)
  if (!valid) throw new TypeError('invalid_isk_amount')
  const normalized = trimmed.replace(/[.\s\u00a0\u202f]/g, '')
  if (!/^-?\d+$/.test(normalized)) throw new TypeError('invalid_isk_amount')
  const value = Number(normalized)
  if (!Number.isSafeInteger(value)) throw new TypeError('invalid_isk_amount')
  return value
}

function parsedSignedIskOrNull(raw: string): number | null {
  try {
    return parseSignedIskInput(raw)
  } catch {
    return null
  }
}

function entryGross(entry: BookkeepingEntry): number | null {
  try {
    return sumIskAmounts(entry.lines.map((line) => line.grossMinor))
  } catch {
    return null
  }
}

function entryVat(entry: BookkeepingEntry): number | null {
  try {
    return sumIskAmounts(entry.lines.map((line) => line.vatMinor))
  } catch {
    return null
  }
}

function CheckboxRow({
  checked,
  disabled,
  onChange,
  children,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm leading-6">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-5 shrink-0 accent-primary"
      />
      <span>{children}</span>
    </label>
  )
}

export function BookkeepingPeriodWorkspace({ view }: { view: BookkeepingPeriodView }) {
  const t = useBookkeepingTranslations()
  const locale = useLocale()
  const router = useRouter()
  const requestIds = useBookkeepingMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [entryFilter, setEntryFilter] = useState<EntryFilter>('all')
  const [selectedField, setSelectedField] = useState<VatReportField | null>(null)
  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null)
  const [navigatingEntryId, setNavigatingEntryId] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [voidEntryId, setVoidEntryId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [liveFormConfirmed, setLiveFormConfirmed] = useState(false)
  const [submittedOn, setSubmittedOn] = useState('')
  const [reportedResultRaw, setReportedResultRaw] = useState(formatIskInteger(view.summary.fields.F))
  const [mismatchReason, setMismatchReason] = useState('')
  const [confirmationReference, setConfirmationReference] = useState('')
  const [filingNote, setFilingNote] = useState('')
  const [filingPaymentState, setFilingPaymentState] = useState<PaymentState>('unpaid')
  const [filingPaidOn, setFilingPaidOn] = useState('')
  const [reopenReason, setReopenReason] = useState('')
  const [paymentState, setPaymentState] = useState<PaymentState>(
    view.filing?.paymentState ?? 'unpaid',
  )
  const [paidOn, setPaidOn] = useState(view.filing?.paidOn ?? '')
  const previousPeriod = useRef({ id: view.period.id, state: view.period.state })
  const [isPending, startTransition] = useTransition()
  const [isNavigating, startNavigation] = useTransition()

  useEffect(() => {
    setPaymentState(view.filing?.paymentState ?? 'unpaid')
    setPaidOn(view.filing?.paidOn ?? '')
  }, [view.filing?.paidOn, view.filing?.paymentState])

  useEffect(() => {
    if (!view.period.liveFormCompared) setLiveFormConfirmed(false)
  }, [view.period.liveFormCompared, view.period.version])

  useEffect(() => {
    const previous = previousPeriod.current
    const editable = view.period.state === 'draft' || view.period.state === 'review'
    const becameReady = view.period.state === 'ready'
      && (previous.state === 'draft' || previous.state === 'review')
    if (previous.id !== view.period.id || editable || becameReady) {
      setSubmittedOn('')
      setReportedResultRaw(formatIskInteger(view.summary.fields.F))
      setMismatchReason('')
      setConfirmationReference('')
      setFilingNote('')
      setFilingPaymentState('unpaid')
      setFilingPaidOn('')
    }
    previousPeriod.current = { id: view.period.id, state: view.period.state }
  }, [view.period.id, view.period.state, view.period.version, view.summary.fields.F])

  const entriesLocked = view.period.state !== 'draft' && view.period.state !== 'review'
  const tracesForField = useMemo(
    () => selectedField ? view.summary.traces[selectedField] : [],
    [selectedField, view.summary.traces],
  )
  const tracedLinesByEntry = useMemo(() => {
    const result = new Map<string, Set<string>>()
    for (const trace of tracesForField) {
      const lineIds = result.get(trace.entryId) ?? new Set<string>()
      lineIds.add(trace.lineId)
      result.set(trace.entryId, lineIds)
    }
    return result
  }, [tracesForField])

  const visibleEntries = useMemo(() => {
    if (selectedField) {
      return view.entries.filter((entry) => tracedLinesByEntry.has(entry.id))
    }
    return view.entries.filter((entry) => matchesEntryFilter(entry, entryFilter))
  }, [entryFilter, selectedField, tracedLinesByEntry, view.entries])

  const entryFilterCounts = useMemo<Record<EntryFilter, number>>(() => {
    const counts: Record<EntryFilter, number> = {
      all: 0,
      sales: 0,
      purchases: 0,
      review: 0,
    }
    for (const entry of view.entries) {
      for (const filter of ENTRY_FILTERS) {
        if (matchesEntryFilter(entry, filter)) counts[filter] += 1
      }
    }
    return counts
  }, [view.entries])

  const blockersBeforeLiveComparison = view.readiness.blockers.filter(
    (blocker) => blocker.code !== 'live_form_not_compared',
  )
  const traceWarningCount = selectedField
    ? view.readiness.blockers.filter(
        (blocker) => blocker.entryId && tracedLinesByEntry.has(blocker.entryId),
      ).length
    : 0
  const reportedResult = parsedSignedIskOrNull(reportedResultRaw)
  const resultMismatch = reportedResult !== null && reportedResult !== view.summary.fields.F
  const mutationBusy = isPending || pendingAction !== null
  const navigationBusy = isNavigating || navigatingEntryId !== null

  function focusError(message: string) {
    setActionError(message)
    queueMicrotask(() => alertRef.current?.focus())
  }

  function runMutation(
    actionKey: string,
    semanticPayload: Record<string, unknown>,
    operation: (input: unknown) => Promise<BookkeepingActionResult<unknown>>,
  ) {
    setActionError(null)
    setPendingAction(actionKey)
    startTransition(async () => {
      try {
        const result = await operation({
          request_id: requestIds.forPayload(semanticPayload),
          ...semanticPayload,
        })
        if (!result.ok) {
          setPendingAction(null)
          focusError(t(`errors.${result.error.code}`))
          return
        }
        requestIds.succeeded(semanticPayload)
        router.refresh()
        setPendingAction(null)
      } catch {
        setPendingAction(null)
        focusError(t('errors.unexpected_error'))
      }
    })
  }

  function selectTraceField(field: VatReportField) {
    setFocusedEntryId(null)
    setSelectedField((current) => current === field ? null : field)
  }

  function selectFilter(filter: EntryFilter) {
    setSelectedField(null)
    setFocusedEntryId(null)
    setEntryFilter(filter)
  }

  function selectReadinessEntry(entryId: string) {
    setSelectedField(null)
    setEntryFilter('all')
    setFocusedEntryId(entryId)
    queueMicrotask(() => {
      document.getElementById(`bookkeeping-entry-${entryId}`)?.scrollIntoView({ block: 'center' })
    })
  }

  function navigateToEntry(entryId: string | 'new') {
    setNavigatingEntryId(entryId)
    const href = entryId === 'new'
      ? `/auth-mvp/bokhaldid/timabil/${view.period.id}/faerslur/ny`
      : `/auth-mvp/bokhaldid/timabil/${view.period.id}/faerslur/${entryId}/breyta`
    startNavigation(() => router.push(href))
  }

  function submitFiling(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    let parsedResult: number
    try {
      parsedResult = parseSignedIskInput(reportedResultRaw)
    } catch {
      focusError(t('errors.invalid_input'))
      return
    }
    if (parsedResult !== view.summary.fields.F && !mismatchReason.trim()) {
      focusError(t('errors.invalid_input'))
      return
    }
    if (filingPaymentState === 'paid' && !filingPaidOn) {
      focusError(t('errors.invalid_input'))
      return
    }

    runMutation('filing', {
      entity_id: view.entity.id,
      period_id: view.period.id,
      expected_version: view.period.version,
      submitted_on: submittedOn,
      due_on: view.period.dueOn,
      fields: { ...view.summary.fields },
      reported_result_minor: parsedResult,
      result_mismatch_reason: parsedResult === view.summary.fields.F
        ? null
        : mismatchReason.trim(),
      confirmation_reference: confirmationReference.trim() || null,
      note: filingNote.trim() || null,
      payment_state: filingPaymentState,
      paid_on: filingPaymentState === 'paid' ? filingPaidOn : null,
    }, recordBookkeepingFiling)
  }

  function renderReopenForm() {
    return (
      <form
        className={`${bookkeepingSectionClass} space-y-4`}
        onSubmit={(event) => {
          event.preventDefault()
          if (!reopenReason.trim()) return
          runMutation('reopen', {
            entity_id: view.entity.id,
            period_id: view.period.id,
            expected_version: view.period.version,
            reason: reopenReason.trim(),
          }, reopenBookkeepingPeriod)
        }}
      >
        <div>
          <label htmlFor="bookkeeping-reopen-reason" className={bookkeepingLabelClass}>
            {t('period.reopenReason')}
          </label>
          <textarea
            id="bookkeeping-reopen-reason"
            value={reopenReason}
            onChange={(event) => setReopenReason(event.target.value)}
            maxLength={1000}
            disabled={mutationBusy}
            required
            className={bookkeepingTextareaClass}
          />
        </div>
        <button
          type="submit"
          disabled={mutationBusy || !reopenReason.trim()}
          className={`${bookkeepingSecondaryButtonClass} w-full`}
        >
          {pendingAction === 'reopen' ? t('period.reopening') : t('period.reopen')}
        </button>
      </form>
    )
  }

  function renderPeriodActions() {
    if (view.period.state === 'draft' || view.period.state === 'review') {
      return (
        <section className={`${bookkeepingSectionClass} space-y-4`} aria-labelledby="bookkeeping-ready-action-title">
          <h2 id="bookkeeping-ready-action-title" className="text-base font-semibold">
            {t('period.markReady')}
          </h2>
          <CheckboxRow
            checked={liveFormConfirmed}
            disabled={mutationBusy}
            onChange={setLiveFormConfirmed}
          >
            {t('period.liveFormConfirmed')}
          </CheckboxRow>
          <button
            type="button"
            disabled={mutationBusy || !liveFormConfirmed || blockersBeforeLiveComparison.length > 0}
            onClick={() => runMutation('ready', {
              entity_id: view.entity.id,
              period_id: view.period.id,
              expected_version: view.period.version,
              live_form_confirmed: true,
            }, setBookkeepingPeriodReady)}
            className={`${bookkeepingPrimaryButtonClass} w-full`}
          >
            {pendingAction === 'ready' ? t('period.markingReady') : t('period.markReady')}
          </button>
        </section>
      )
    }

    if (view.period.state === 'ready') {
      const filingValid = Boolean(
        submittedOn
          && reportedResult !== null
          && (!resultMismatch || mismatchReason.trim())
          && (filingPaymentState !== 'paid' || filingPaidOn),
      )
      return (
        <div className="space-y-4">
          <form
            onSubmit={submitFiling}
            className={`${bookkeepingSectionClass} space-y-4`}
            aria-labelledby="bookkeeping-filing-title"
          >
          <h2 id="bookkeeping-filing-title" className="text-base font-semibold">{t('filing.title')}</h2>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <TeskeidDateField
              label={t('filing.submittedOn')}
              value={submittedOn}
              onChange={setSubmittedOn}
              placeholder={t('common.datePlaceholder')}
              disabled={mutationBusy}
              required
            />
            <TeskeidDateField
              label={t('periodForm.dueOn')}
              value={view.period.dueOn ?? ''}
              onChange={() => undefined}
              placeholder={t('common.datePlaceholder')}
              disabled
            />
          </div>
          <div>
            <label htmlFor="bookkeeping-reported-result" className={bookkeepingLabelClass}>
              {t('filing.recordedResult')}
            </label>
            <input
              id="bookkeeping-reported-result"
              value={reportedResultRaw}
              onChange={(event) => setReportedResultRaw(formatSignedIskInput(event.target.value))}
              inputMode="text"
              pattern="-?[0-9.]*"
              disabled={mutationBusy}
              required
              className={bookkeepingInputClass}
            />
          </div>
          {resultMismatch ? (
            <div className="space-y-3 rounded-xl border border-amber-300/70 bg-amber-50 p-3">
              <p className="text-sm leading-6 text-amber-950">{t('filing.mismatchWarning')}</p>
              <div>
                <label htmlFor="bookkeeping-mismatch-reason" className={bookkeepingLabelClass}>
                  {t('filing.mismatchReason')}
                </label>
                <textarea
                  id="bookkeeping-mismatch-reason"
                  value={mismatchReason}
                  onChange={(event) => setMismatchReason(event.target.value)}
                  maxLength={1000}
                  disabled={mutationBusy}
                  required
                  className={bookkeepingTextareaClass}
                />
              </div>
            </div>
          ) : null}
          <div>
            <label htmlFor="bookkeeping-confirmation-reference" className={bookkeepingLabelClass}>
              {t('filing.confirmationReference')} ({t('common.optional')})
            </label>
            <input
              id="bookkeeping-confirmation-reference"
              value={confirmationReference}
              onChange={(event) => setConfirmationReference(event.target.value)}
              maxLength={200}
              disabled={mutationBusy}
              className={bookkeepingInputClass}
            />
          </div>
          <div>
            <label htmlFor="bookkeeping-filing-payment-state" className={bookkeepingLabelClass}>
              {t('common.status')}
            </label>
            <select
              id="bookkeeping-filing-payment-state"
              value={filingPaymentState}
              onChange={(event) => {
                const state = event.target.value as PaymentState
                setFilingPaymentState(state)
                if (state !== 'paid') setFilingPaidOn('')
              }}
              disabled={mutationBusy}
              className={bookkeepingInputClass}
            >
              {(['unpaid', 'paid', 'credit'] as const).map((state) => (
                <option key={state} value={state}>{t(`filing.${state}`)}</option>
              ))}
            </select>
          </div>
          {filingPaymentState === 'paid' ? (
            <TeskeidDateField
              label={t('filing.paidOn')}
              value={filingPaidOn}
              onChange={setFilingPaidOn}
              placeholder={t('common.datePlaceholder')}
              disabled={mutationBusy}
              required
            />
          ) : null}
          <div>
            <label htmlFor="bookkeeping-filing-note" className={bookkeepingLabelClass}>
              {t('filing.note')} ({t('common.optional')})
            </label>
            <textarea
              id="bookkeeping-filing-note"
              value={filingNote}
              onChange={(event) => setFilingNote(event.target.value)}
              maxLength={1000}
              disabled={mutationBusy}
              className={bookkeepingTextareaClass}
            />
          </div>
          <button
            type="submit"
            disabled={mutationBusy || !filingValid}
            className={`${bookkeepingPrimaryButtonClass} w-full`}
          >
            {pendingAction === 'filing' ? t('filing.submitting') : t('filing.submit')}
          </button>
          </form>
          {renderReopenForm()}
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <section className={`${bookkeepingSectionClass} space-y-3`}>
          <p className="text-sm leading-6 text-muted-foreground">{t('period.submittedLocked')}</p>
          {view.filing ? (
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 border-y border-border py-3 text-sm">
              <dt className="text-muted-foreground">{t('filing.submittedOn')}</dt>
              <dd className="text-right">{formatDateOnly(view.filing.submittedOn, locale)}</dd>
              <dt className="text-muted-foreground">{t('filing.recordedResult')}</dt>
              <dd className="text-right tabular-nums">{formatIskAmount(view.filing.reportedResultMinor)}</dd>
              <dt className="text-muted-foreground">{t('common.status')}</dt>
              <dd className="text-right">{t(`filing.${view.filing.paymentState}`)}</dd>
            </dl>
          ) : null}
        </section>

        {view.filing ? (
          <form
            className={`${bookkeepingSectionClass} space-y-4`}
            onSubmit={(event) => {
              event.preventDefault()
              if (paymentState === 'paid' && !paidOn) {
                focusError(t('errors.invalid_input'))
                return
              }
              runMutation('payment', {
                entity_id: view.entity.id,
                period_id: view.period.id,
                expected_version: view.period.version,
                payment_state: paymentState,
                paid_on: paymentState === 'paid' ? paidOn : null,
              }, recordBookkeepingPayment)
            }}
          >
            <h2 className="text-base font-semibold">{t('period.recordPayment')}</h2>
            <div>
              <label htmlFor="bookkeeping-payment-state" className={bookkeepingLabelClass}>
                {t('common.status')}
              </label>
              <select
                id="bookkeeping-payment-state"
                value={paymentState}
                onChange={(event) => {
                  const state = event.target.value as PaymentState
                  setPaymentState(state)
                  if (state !== 'paid') setPaidOn('')
                }}
                disabled={mutationBusy}
                className={bookkeepingInputClass}
              >
                {(['unpaid', 'paid', 'credit'] as const).map((state) => (
                  <option key={state} value={state}>{t(`filing.${state}`)}</option>
                ))}
              </select>
            </div>
            {paymentState === 'paid' ? (
              <TeskeidDateField
                label={t('filing.paidOn')}
                value={paidOn}
                onChange={setPaidOn}
                placeholder={t('common.datePlaceholder')}
                disabled={mutationBusy}
                required
              />
            ) : null}
            <button
              type="submit"
              disabled={mutationBusy || (paymentState === 'paid' && !paidOn)}
              className={`${bookkeepingPrimaryButtonClass} w-full`}
            >
              {pendingAction === 'payment' ? t('period.recordingPayment') : t('period.recordPayment')}
            </button>
          </form>
        ) : null}

        {renderReopenForm()}
      </div>
    )
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
        <section className={`${bookkeepingSectionClass} space-y-4`} aria-labelledby="bookkeeping-period-summary-title">
          <div>
            <h2 id="bookkeeping-period-summary-title" className="text-base font-semibold">
              {view.entity.displayName}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDateOnly(view.period.startsOn, locale)} – {formatDateOnly(view.period.endsOn, locale)}
            </p>
          </div>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 border-y border-border py-3 text-sm">
            <dt className="text-muted-foreground">{t('periodForm.registration')}</dt>
            <dd className="text-right">{view.registration.vatNumber}</dd>
            <dt className="text-muted-foreground">{t('common.status')}</dt>
            <dd className="text-right">{t(`periodStates.${view.period.state}`)}</dd>
            {view.period.dueOn ? (
              <>
                <dt className="text-muted-foreground">{t('periodForm.dueOn')}</dt>
                <dd className="text-right">{formatDateOnly(view.period.dueOn, locale)}</dd>
              </>
            ) : null}
          </dl>
          {!entriesLocked ? (
            <button
              type="button"
              disabled={navigationBusy || mutationBusy}
              aria-busy={navigatingEntryId === 'new'}
              onClick={() => navigateToEntry('new')}
              className={`${bookkeepingPrimaryButtonClass} w-full`}
            >
              {navigatingEntryId === 'new'
                ? <LoaderCircle aria-hidden size={17} className="mr-2 animate-spin" />
                : <Plus aria-hidden size={17} className="mr-2" />}
              {t('period.addEntry')}
            </button>
          ) : null}
        </section>

        {actionError ? (
          <p
            ref={alertRef}
            tabIndex={-1}
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {actionError}
          </p>
        ) : null}

        {renderPeriodActions()}

        <BookkeepingReadinessPanel
          readiness={view.readiness}
          onSelectEntry={selectReadinessEntry}
        />
      </div>

      <aside className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <BookkeepingVatSummaryPanel
          summary={view.summary}
          selectedField={selectedField}
          onSelectField={selectTraceField}
        />
        <button
          type="button"
          aria-label={`F ${t('vat.F')}`}
          aria-pressed={selectedField === 'F'}
          onClick={() => selectTraceField('F')}
          className={`${bookkeepingSecondaryButtonClass} w-full ${selectedField === 'F' ? 'border-primary bg-primary/5' : ''}`}
        >
          <span className="mr-2 inline-flex size-7 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">F</span>
          {t('vat.traceCount', { count: view.summary.traces.F.length })}
        </button>
      </aside>

      <section className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2" aria-labelledby="bookkeeping-entries-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="bookkeeping-entries-title" className="text-base font-semibold">{t('period.entries')}</h2>
            {selectedField ? (
              <>
                <p className="mt-1 text-xs text-primary">{selectedField}: {t(`vat.${selectedField}`)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('vat.traceSummary', {
                    count: tracedLinesByEntry.size,
                    amount: formatIskAmount(view.summary.fields[selectedField]),
                    warnings: traceWarningCount,
                  })}
                </p>
              </>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t('period.entries')}>
          {ENTRY_FILTERS.map((filter) => {
            const active = !selectedField && entryFilter === filter
            const label = t(`period.filter${filter[0].toUpperCase()}${filter.slice(1)}`)
            return (
              <button
                key={filter}
                type="button"
                aria-label={`${label} ${entryFilterCounts[filter]}`}
                aria-pressed={active}
                onClick={() => selectFilter(filter)}
                className={`inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-2 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3 sm:text-sm ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:bg-muted'}`}
              >
                <span>{label}</span>
                <span
                  className={`inline-flex min-w-5 items-center justify-center rounded-full px-1 py-0.5 text-xs leading-none tabular-nums ${active ? 'bg-primary-foreground/15' : 'bg-muted text-muted-foreground'}`}
                >
                  {entryFilterCounts[filter]}
                </span>
              </button>
            )
          })}
        </div>

        {visibleEntries.length === 0 ? (
          <p className="border-y border-border py-6 text-center text-sm text-muted-foreground">
            {selectedField ? t('vat.traceEmpty') : t('period.empty')}
          </p>
        ) : (
          <div className="space-y-4">
            {visibleEntries.map((entry) => {
              const tracedLineIds = tracedLinesByEntry.get(entry.id) ?? new Set<string>()
              const traced = selectedField !== null && tracedLinesByEntry.has(entry.id)
              const focused = focusedEntryId === entry.id
              const voided = entry.voidedAt !== null
              const reviewAction = entry.reviewState === 'reviewed' ? 'needs_review' : 'reviewed'
              const grossAmount = entryGross(entry)
              const vatAmount = entryVat(entry)
              const settlementKind = settlementTextKind(entry)
              const settlementAction = entry.settlementState === 'settled' ? 'open' : 'settled'
              return (
                <article
                  key={entry.id}
                  id={`bookkeeping-entry-${entry.id}`}
                  data-entry-id={entry.id}
                  data-trace-highlight={traced ? 'true' : undefined}
                  className={`${bookkeepingSectionClass} space-y-4 ${traced ? 'border-primary ring-1 ring-primary/30' : ''} ${focused ? 'ring-2 ring-amber-500/60' : ''} ${voided ? 'opacity-70' : ''}`}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold">{entry.description}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(`entryTypes.${entry.type}`)} · {formatDateOnly(entry.reportingDate, locale)}
                      </p>
                      {entry.counterparty ? (
                        <p className="mt-1 break-words text-xs text-muted-foreground">{entry.counterparty}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 space-y-1 text-right text-xs font-medium text-muted-foreground">
                      <span className="block">{voided ? t('period.voided') : t(`reviewStates.${entry.reviewState}`)}</span>
                      {!voided ? <span className="block text-foreground">{t(`entrySettlement.${settlementKind}.${entry.settlementState}`)}</span> : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-y border-border py-3 text-sm">
                    <div>
                      <span className="block text-xs text-muted-foreground">{t('entryForm.gross')}</span>
                      <strong className="tabular-nums">{grossAmount === null ? '—' : formatIskAmount(grossAmount)}</strong>
                    </div>
                    <div>
                      <span className="block text-xs text-muted-foreground">{t('entryForm.vat')}</span>
                      <strong className="tabular-nums">{vatAmount === null ? '—' : formatIskAmount(vatAmount)}</strong>
                    </div>
                  </div>

                  <div className="space-y-2" aria-label={t('entryForm.lines')}>
                    {entry.lines.map((line) => {
                      const highlighted = tracedLineIds.has(line.id)
                      return (
                        <div
                          key={line.id}
                          data-line-id={line.id}
                          data-trace-highlight={highlighted ? 'true' : undefined}
                          className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-border py-2 text-xs first:border-t-0 ${highlighted ? '-mx-2 rounded-lg bg-primary/10 px-2 ring-1 ring-primary/20' : ''}`}
                        >
                          <span className="min-w-0 break-words">
                            {line.description || t(`vatTreatments.${line.vatTreatment}`)}
                          </span>
                          <span className="tabular-nums text-muted-foreground">{formatIskAmount(line.grossMinor)}</span>
                        </div>
                      )
                    })}
                  </div>

                  {!entriesLocked && !voided ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={navigationBusy || mutationBusy}
                        aria-busy={navigatingEntryId === entry.id}
                        onClick={() => navigateToEntry(entry.id)}
                        className={bookkeepingSecondaryButtonClass}
                      >
                        {navigatingEntryId === entry.id ? (
                          <LoaderCircle aria-hidden size={17} className="mr-2 animate-spin" />
                        ) : null}
                        {t('period.editEntry')}
                      </button>
                      <button
                        type="button"
                        disabled={mutationBusy || navigationBusy}
                        onClick={() => runMutation(`review-${entry.id}`, {
                          entity_id: view.entity.id,
                          entry_id: entry.id,
                          expected_version: entry.version,
                          review_state: reviewAction,
                        }, setBookkeepingEntryReviewState)}
                        className={bookkeepingSecondaryButtonClass}
                      >
                        {pendingAction === `review-${entry.id}`
                          ? t('common.saving')
                          : t(reviewAction === 'reviewed' ? 'period.markReviewed' : 'period.markNeedsReview')}
                      </button>
                      <button
                        type="button"
                        disabled={mutationBusy || navigationBusy}
                        onClick={() => {
                          setVoidEntryId((current) => current === entry.id ? null : entry.id)
                          if (voidEntryId !== entry.id) setVoidReason('')
                        }}
                        className={`${bookkeepingSecondaryButtonClass} text-destructive sm:col-span-2`}
                      >
                        {t('period.voidEntry')}
                      </button>
                    </div>
                  ) : null}

                  {!voided ? (
                    <button
                      type="button"
                      disabled={mutationBusy || navigationBusy}
                      onClick={() => runMutation(`settlement-${entry.id}`, {
                        entity_id: view.entity.id,
                        entry_id: entry.id,
                        expected_settlement_version: entry.settlementVersion,
                        settlement_state: settlementAction,
                      }, setBookkeepingEntrySettlementState)}
                      className={`${bookkeepingSecondaryButtonClass} w-full`}
                    >
                      {pendingAction === `settlement-${entry.id}`
                        ? t('entrySettlement.saving')
                        : t(`entrySettlement.${settlementKind}.${settlementAction === 'settled' ? 'markSettled' : 'markOpen'}`)}
                    </button>
                  ) : null}

                  {voidEntryId === entry.id && !entriesLocked && !voided ? (
                    <form
                      className="space-y-3 border-t border-destructive/20 pt-4"
                      onSubmit={(event) => {
                        event.preventDefault()
                        if (!voidReason.trim()) return
                        runMutation(`void-${entry.id}`, {
                          entity_id: view.entity.id,
                          entry_id: entry.id,
                          expected_version: entry.version,
                          reason: voidReason.trim(),
                        }, voidBookkeepingEntry)
                      }}
                    >
                      <p className="text-sm leading-6 text-destructive">{t('period.voidConfirm')}</p>
                      <div>
                        <label htmlFor={`void-reason-${entry.id}`} className={bookkeepingLabelClass}>
                          {t('period.voidReason')}
                        </label>
                        <textarea
                          id={`void-reason-${entry.id}`}
                          value={voidReason}
                          onChange={(event) => setVoidReason(event.target.value)}
                          maxLength={1000}
                          disabled={mutationBusy}
                          required
                          className={bookkeepingTextareaClass}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={mutationBusy}
                          onClick={() => setVoidEntryId(null)}
                          className={bookkeepingSecondaryButtonClass}
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="submit"
                          disabled={mutationBusy || !voidReason.trim()}
                          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-destructive/40 px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
                        >
                          {pendingAction === `void-${entry.id}` ? t('period.voiding') : t('period.voidEntry')}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
