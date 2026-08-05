'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'
import {
  BOOKKEEPING_INPUT_VAT_DEDUCTIBILITY,
  BOOKKEEPING_REVIEW_STATES,
  type BookkeepingEntryType,
  type BookkeepingInputVatDeductibility,
  type BookkeepingReviewState,
  type BookkeepingVatTreatment,
} from '@/lib/bookkeeping/constants'
import { saveBookkeepingEntry } from '@/lib/bookkeeping/actions'
import { formatDateOnly } from '@/lib/date-format'
import { formatIskAmount, formatIskInput, formatIskInteger, parseIskAmount, sumIskAmounts } from '@/lib/bookkeeping/money'
import type { BookkeepingEntry, BookkeepingPeriod } from '@/lib/bookkeeping/types'
import {
  suggestVatBreakdownFromGross,
  suggestVatBreakdownFromNet,
  vatRateForTreatment,
} from '@/lib/bookkeeping/vat'
import { useBookkeepingTranslations } from './i18n.client'
import { useBookkeepingMutationRequestIds } from './request-id'
import {
  bookkeepingInputClass,
  bookkeepingLabelClass,
  bookkeepingPrimaryButtonClass,
  bookkeepingSecondaryButtonClass,
  bookkeepingSectionClass,
  bookkeepingTextareaClass,
  createBookkeepingRequestId,
} from './ui'

const SALE_CATEGORIES = ['service_sales', 'product_sales', 'other_income'] as const
const PURCHASE_CATEGORIES = [
  'purchased_services', 'marketing', 'software', 'telecom', 'travel', 'vehicle',
  'office', 'equipment', 'bank', 'payroll', 'taxes', 'other',
] as const
const DOCUMENT_TYPES = ['invoice', 'receipt', 'credit_note', 'customs_document', 'other'] as const

interface LineDraft {
  clientKey: string
  lineId: string | null
  categoryCode: string
  description: string
  vatTreatment: BookkeepingVatTreatment
  amountIncludesVat: boolean
  amountRaw: string
  grossRaw: string
  netRaw: string
  vatRaw: string
  inputVatDeductibility: BookkeepingInputVatDeductibility
  deductibleVatRaw: string
  manualVatOverride: boolean
  manualVatOverrideReason: string
  exemptTurnoverConfirmed: boolean
}

const SALE_TREATMENTS: BookkeepingVatTreatment[] = [
  'taxable_24', 'taxable_11', 'exempt_turnover', 'outside_scope', 'needs_review',
]
const PURCHASE_TREATMENTS: BookkeepingVatTreatment[] = [
  'taxable_24', 'taxable_11', 'no_vat', 'needs_review',
]

function isPurchase(type: BookkeepingEntryType): boolean {
  return type === 'purchase' || type === 'purchase_credit'
}

function blankLine(entryType: BookkeepingEntryType = 'sale'): LineDraft {
  return {
    clientKey: createBookkeepingRequestId(),
    lineId: null,
    categoryCode: '',
    description: '',
    vatTreatment: 'needs_review',
    amountIncludesVat: true,
    amountRaw: '',
    grossRaw: '',
    netRaw: '',
    vatRaw: '',
    inputVatDeductibility: isPurchase(entryType) ? 'needs_review' : 'not_applicable',
    deductibleVatRaw: '0',
    manualVatOverride: false,
    manualVatOverrideReason: '',
    exemptTurnoverConfirmed: false,
  }
}

function lineFromEntry(entry: BookkeepingEntry, index: number): LineDraft {
  const line = entry.lines[index]!
  return {
    clientKey: line.id,
    lineId: line.id,
    categoryCode: line.categoryCode ?? '',
    description: line.description ?? '',
    vatTreatment: line.vatTreatment,
    amountIncludesVat: line.amountIncludesVat,
    amountRaw: formatIskInteger(line.amountIncludesVat ? line.grossMinor : line.netMinor),
    grossRaw: formatIskInteger(line.grossMinor),
    netRaw: formatIskInteger(line.netMinor),
    vatRaw: formatIskInteger(line.vatMinor),
    inputVatDeductibility: line.inputVatDeductibility,
    deductibleVatRaw: formatIskInteger(line.deductibleVatMinor),
    manualVatOverride: line.manualVatOverride,
    manualVatOverrideReason: line.manualVatOverrideReason ?? '',
    exemptTurnoverConfirmed: line.exemptTurnoverConfirmed,
  }
}

function suggestedLine(line: LineDraft, entryType: BookkeepingEntryType): LineDraft {
  if (!line.amountRaw.trim()) {
    return { ...line, grossRaw: '', netRaw: '', vatRaw: '', deductibleVatRaw: '0' }
  }
  const amount = parseIskAmount(line.amountRaw)
  const rate = vatRateForTreatment(line.vatTreatment)
  const suggestion = rate === null
    ? { grossMinor: amount, netMinor: amount, vatMinor: 0 }
    : line.amountIncludesVat
      ? suggestVatBreakdownFromGross(amount, rate)
      : suggestVatBreakdownFromNet(amount, rate)
  const purchase = isPurchase(entryType)
  const inputVatDeductibility = rate === null
    ? 'not_applicable'
    : purchase
      ? (line.inputVatDeductibility === 'not_applicable' ? 'needs_review' : line.inputVatDeductibility)
      : 'not_applicable'
  const deductibleVatMinor = inputVatDeductibility === 'fully_deductible'
    ? suggestion.vatMinor
    : inputVatDeductibility === 'partially_deductible'
      ? Math.min(parseIskAmount(line.deductibleVatRaw, { allowZero: true }), Math.max(0, suggestion.vatMinor - 1))
      : 0
  return {
    ...line,
    grossRaw: formatIskInteger(suggestion.grossMinor),
    netRaw: formatIskInteger(suggestion.netMinor),
    vatRaw: formatIskInteger(suggestion.vatMinor),
    inputVatDeductibility,
    deductibleVatRaw: formatIskInteger(deductibleVatMinor),
  }
}

function syncManualAmounts(line: LineDraft): LineDraft {
  try {
    const net = parseIskAmount(line.netRaw, { allowZero: true })
    const vat = parseIskAmount(line.vatRaw, { allowZero: true })
    const gross = net + vat
    if (!Number.isSafeInteger(gross) || gross <= 0) return line
    return {
      ...line,
      grossRaw: formatIskInteger(gross),
      amountRaw: formatIskInteger(line.amountIncludesVat ? gross : net),
      deductibleVatRaw: line.inputVatDeductibility === 'fully_deductible'
        ? formatIskInteger(vat)
        : line.deductibleVatRaw,
    }
  } catch {
    return line
  }
}

function CheckboxRow({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: React.ReactNode
  disabled?: boolean
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

export function BookkeepingEntryForm({
  entityId,
  registrationId,
  period,
  initialDate,
  entry,
}: {
  entityId: string
  registrationId: string
  period: BookkeepingPeriod
  initialDate: string
  entry?: BookkeepingEntry
}) {
  const t = useBookkeepingTranslations()
  const locale = useLocale()
  const router = useRouter()
  const requestIds = useBookkeepingMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const saveAndNextIntent = useRef(false)
  const [entryType, setEntryType] = useState<BookkeepingEntryType>(entry?.type ?? 'sale')
  const [documentDate, setDocumentDate] = useState(entry?.documentDate ?? initialDate)
  const [reportingDate, setReportingDate] = useState(entry?.reportingDate ?? initialDate)
  const [dateSyncPrompt, setDateSyncPrompt] = useState<{
    target: 'document' | 'reporting'
    nextDate: string
  } | null>(null)
  const [counterparty, setCounterparty] = useState(entry?.counterparty ?? '')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [documentType, setDocumentType] = useState(entry?.documentType ?? 'invoice')
  const [documentReference, setDocumentReference] = useState(entry?.documentReference ?? '')
  const [duplicateReferenceConfirmed, setDuplicateReferenceConfirmed] = useState(entry?.duplicateReferenceConfirmed ?? false)
  const [reviewState, setReviewState] = useState<BookkeepingReviewState>(entry?.reviewState ?? 'unreviewed')
  const [originalDocumentPreserved, setOriginalDocumentPreserved] = useState(entry?.evidence.originalDocumentPreserved ?? false)
  const [businessPurposeConfirmed, setBusinessPurposeConfirmed] = useState(entry?.evidence.businessPurposeConfirmed ?? false)
  const [sellerVatRegistrationConfirmed, setSellerVatRegistrationConfirmed] = useState(entry?.evidence.sellerVatRegistrationConfirmed ?? false)
  const [foreignService, setForeignService] = useState(
    entry ? entry.specialCases.foreignService !== 'not_applicable' : false,
  )
  const [importedGoods, setImportedGoods] = useState(
    entry ? entry.specialCases.import !== 'not_applicable' : false,
  )
  const [mixedUse, setMixedUse] = useState(
    entry ? entry.specialCases.mixedUse !== 'not_applicable' : false,
  )
  const [uncertainDeductibility, setUncertainDeductibility] = useState(
    entry ? entry.specialCases.uncertainDeductibility !== 'not_applicable' : false,
  )
  const [specialCaseResolved, setSpecialCaseResolved] = useState(Boolean(entry && [
    entry.specialCases.foreignService,
    entry.specialCases.import,
    entry.specialCases.mixedUse,
    entry.specialCases.uncertainDeductibility,
  ].filter((value) => value !== 'not_applicable').every((value) => value === 'resolved')))
  const [specialCaseResolutionNote, setSpecialCaseResolutionNote] = useState(entry?.specialCaseResolutionNote ?? '')
  const [note, setNote] = useState(entry?.note ?? '')
  const [lines, setLines] = useState<LineDraft[]>(entry?.lines.length
    ? entry.lines.map((_, index) => lineFromEntry(entry, index))
    : [blankLine(entry?.type ?? 'sale')])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isNavigating, startNavigation] = useTransition()

  const purchase = isPurchase(entryType)
  const periodHref = `/auth-mvp/bokhaldid/timabil/${period.id}`
  const selectedSpecialCase = foreignService || importedGoods || mixedUse || uncertainDeductibility
  const categories = purchase ? PURCHASE_CATEGORIES : SALE_CATEGORIES
  const treatments = purchase ? PURCHASE_TREATMENTS : SALE_TREATMENTS
  const locked = period.state !== 'draft' && period.state !== 'review'

  const grossTotal = useMemo(() => {
    try {
      return sumIskAmounts(lines.map((line) => {
        try { return parseIskAmount(line.grossRaw, { allowZero: true }) } catch { return 0 }
      }))
    } catch {
      return null
    }
  }, [lines])

  function updateLine(clientKey: string, update: (line: LineDraft) => LineDraft) {
    setLines((current) => current.map((line) => line.clientKey === clientKey ? update(line) : line))
  }

  function changeEntryType(next: BookkeepingEntryType) {
    setEntryType(next)
    setLines((current) => current.map((line) => {
      const allowed = isPurchase(next) ? PURCHASE_TREATMENTS : SALE_TREATMENTS
      const vatTreatment = allowed.includes(line.vatTreatment) ? line.vatTreatment : 'needs_review'
      return suggestedLine({
        ...line,
        vatTreatment,
        inputVatDeductibility: isPurchase(next) ? 'needs_review' : 'not_applicable',
        deductibleVatRaw: '0',
      }, next)
    }))
  }

  function changeDocumentDate(next: string) {
    const previous = documentDate
    setDocumentDate(next)
    const canSyncReporting = next >= period.startsOn && next <= period.endsOn
    setDateSyncPrompt(
      next && next !== previous && reportingDate === previous && canSyncReporting
        ? { target: 'reporting', nextDate: next }
        : null,
    )
  }

  function changeReportingDate(next: string) {
    const previous = reportingDate
    setReportingDate(next)
    setDateSyncPrompt(
      next && next !== previous && documentDate === previous
        ? { target: 'document', nextDate: next }
        : null,
    )
  }

  function acceptDateSync() {
    if (!dateSyncPrompt) return
    if (dateSyncPrompt.target === 'reporting') setReportingDate(dateSyncPrompt.nextDate)
    else setDocumentDate(dateSyncPrompt.nextDate)
    setDateSyncPrompt(null)
  }

  function resetForNext() {
    setCounterparty('')
    setDescription('')
    setDocumentReference('')
    setDuplicateReferenceConfirmed(false)
    setReviewState('unreviewed')
    setOriginalDocumentPreserved(false)
    setBusinessPurposeConfirmed(false)
    setSellerVatRegistrationConfirmed(false)
    setForeignService(false)
    setImportedGoods(false)
    setMixedUse(false)
    setUncertainDeductibility(false)
    setSpecialCaseResolved(false)
    setSpecialCaseResolutionNote('')
    setNote('')
    setLines([blankLine(entryType)])
  }

  function submit(saveAndNext: boolean) {
    setError(null)
    let parsedLines
    try {
      parsedLines = lines.map((line) => ({
        client_key: line.clientKey,
        line_id: line.lineId,
        category_code: line.categoryCode || null,
        description: line.description || null,
        vat_treatment: line.vatTreatment,
        currency: 'ISK' as const,
        amount_includes_vat: line.amountIncludesVat,
        gross_minor: parseIskAmount(line.grossRaw),
        net_minor: parseIskAmount(line.netRaw, { allowZero: true }),
        vat_minor: parseIskAmount(line.vatRaw, { allowZero: true }),
        input_vat_deductibility: line.inputVatDeductibility,
        deductible_vat_minor: parseIskAmount(line.deductibleVatRaw, { allowZero: true }),
        manual_vat_override: line.manualVatOverride,
        manual_vat_override_reason: line.manualVatOverrideReason || null,
        exempt_turnover_confirmed: line.exemptTurnoverConfirmed,
      }))
    } catch {
      setError(t('errors.invalid_input'))
      queueMicrotask(() => alertRef.current?.focus())
      return
    }

    const caseState = (selected: boolean) => selected
      ? (specialCaseResolved ? 'resolved' as const : 'unresolved' as const)
      : 'not_applicable' as const
    const semanticPayload = {
      entity_id: entityId,
      vat_registration_id: registrationId,
      period_id: period.id,
      entry_id: entry?.id ?? null,
      expected_version: entry?.version ?? null,
      type: entryType,
      document_date: documentDate,
      reporting_date: reportingDate,
      counterparty: counterparty || null,
      description,
      document_type: documentType || null,
      document_reference: documentReference || null,
      duplicate_reference_confirmed: duplicateReferenceConfirmed,
      currency: 'ISK' as const,
      source_type: 'manual' as const,
      source_id: null,
      source_reference: null,
      review_state: reviewState,
      original_document_preserved: purchase ? originalDocumentPreserved : false,
      business_purpose_confirmed: purchase ? businessPurposeConfirmed : false,
      seller_vat_registration_confirmed: purchase ? sellerVatRegistrationConfirmed : null,
      special_cases: {
        foreign_service: caseState(foreignService),
        import: caseState(importedGoods),
        mixed_use: caseState(mixedUse),
        uncertain_deductibility: caseState(uncertainDeductibility),
      },
      special_case_resolution_note: specialCaseResolutionNote || null,
      note: note || null,
      lines: parsedLines,
    }
    const payload = {
      request_id: requestIds.forPayload(semanticPayload),
      ...semanticPayload,
    }

    startTransition(async () => {
      try {
        const result = await saveBookkeepingEntry(payload)
        if (!result.ok) {
          setError(t(`errors.${result.error.code}`))
          queueMicrotask(() => alertRef.current?.focus())
          return
        }
        requestIds.succeeded(semanticPayload)
        if (saveAndNext && !entry) {
          resetForNext()
          window.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }
        startNavigation(() => router.push(periodHref))
      } catch {
        setError(t('errors.unexpected_error'))
        queueMicrotask(() => alertRef.current?.focus())
      }
    })
  }

  return (
    <form
      className="space-y-6"
      onInvalid={() => { saveAndNextIntent.current = false }}
      onSubmit={(event) => {
        event.preventDefault()
        const saveAndNext = saveAndNextIntent.current
        saveAndNextIntent.current = false
        submit(saveAndNext)
      }}
    >
      {error ? (
        <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className={`${bookkeepingSectionClass} space-y-4`}>
        <div>
          <label className={bookkeepingLabelClass} htmlFor="bookkeeping-entry-type">{t('entryForm.type')}</label>
          <select
            id="bookkeeping-entry-type"
            value={entryType}
            disabled={locked || isPending}
            onChange={(event) => changeEntryType(event.target.value as BookkeepingEntryType)}
            className={bookkeepingInputClass}
          >
            {(['sale', 'purchase', 'sales_credit', 'purchase_credit'] as const).map((type) => (
              <option key={type} value={type}>{t(`entryTypes.${type}`)}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TeskeidDateField label={t('entryForm.documentDate')} value={documentDate} onChange={changeDocumentDate} placeholder={t('common.datePlaceholder')} required disabled={locked || isPending} />
          <TeskeidDateField label={t('entryForm.reportingDate')} value={reportingDate} onChange={changeReportingDate} placeholder={t('common.datePlaceholder')} min={period.startsOn} max={period.endsOn} required disabled={locked || isPending} />
        </div>
        {dateSyncPrompt ? (
          <div role="status" className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm leading-6">
            <p>{t(
              dateSyncPrompt.target === 'reporting'
                ? 'entryForm.syncReportingDatePrompt'
                : 'entryForm.syncDocumentDatePrompt',
              { date: formatDateOnly(dateSyncPrompt.nextDate, locale) },
            )}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={isPending} onClick={() => setDateSyncPrompt(null)} className={bookkeepingSecondaryButtonClass}>{t('entryForm.keepDate')}</button>
              <button type="button" disabled={isPending} onClick={acceptDateSync} className={bookkeepingPrimaryButtonClass}>{t('entryForm.syncDate')}</button>
            </div>
          </div>
        ) : null}
        <div>
          <label className={bookkeepingLabelClass} htmlFor="bookkeeping-counterparty">{t('entryForm.counterparty')}</label>
          <input id="bookkeeping-counterparty" value={counterparty} maxLength={200} disabled={locked || isPending} onChange={(event) => setCounterparty(event.target.value)} className={bookkeepingInputClass} placeholder={t('entryForm.counterpartyPlaceholder')} />
        </div>
        <div>
          <label className={bookkeepingLabelClass} htmlFor="bookkeeping-description">{t('entryForm.description')}</label>
          <input id="bookkeeping-description" value={description} maxLength={500} required disabled={locked || isPending} onChange={(event) => setDescription(event.target.value)} className={bookkeepingInputClass} placeholder={t('entryForm.descriptionPlaceholder')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={bookkeepingLabelClass} htmlFor="bookkeeping-document-type">{t('entryForm.documentType')}</label>
            <select id="bookkeeping-document-type" value={documentType} disabled={locked || isPending} onChange={(event) => setDocumentType(event.target.value)} className={bookkeepingInputClass}>
              {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{t(`documentTypes.${type}`)}</option>)}
            </select>
          </div>
          <div>
            <label className={bookkeepingLabelClass} htmlFor="bookkeeping-document-reference">{t('entryForm.documentReference')}</label>
            <input id="bookkeeping-document-reference" value={documentReference} maxLength={160} disabled={locked || isPending} onChange={(event) => setDocumentReference(event.target.value)} className={bookkeepingInputClass} placeholder={t('entryForm.documentReferencePlaceholder')} />
          </div>
        </div>
        <CheckboxRow checked={duplicateReferenceConfirmed} disabled={locked || isPending} onChange={setDuplicateReferenceConfirmed}>
          {t('entryForm.duplicateReferenceConfirmed')}
        </CheckboxRow>
        <div>
          <label className={bookkeepingLabelClass} htmlFor="bookkeeping-review-state">{t('entryForm.reviewState')}</label>
          <select id="bookkeeping-review-state" value={reviewState} disabled={locked || isPending} onChange={(event) => setReviewState(event.target.value as BookkeepingReviewState)} className={bookkeepingInputClass}>
            {BOOKKEEPING_REVIEW_STATES.map((state) => <option key={state} value={state}>{t(`reviewStates.${state}`)}</option>)}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">{t('entryForm.source')}</p>
      </section>

      <section className="space-y-4" aria-labelledby="bookkeeping-lines-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="bookkeeping-lines-title" className="text-base font-semibold">{t('entryForm.lines')}</h2>
          <span className="text-sm tabular-nums text-muted-foreground">{grossTotal !== null && grossTotal > 0 ? formatIskAmount(grossTotal) : ''}</span>
        </div>
        {lines.map((line, index) => (
          <div key={line.clientKey} className={`${bookkeepingSectionClass} space-y-4`}>
            <div className="flex min-h-10 items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{t('entryForm.line', { number: index + 1 })}</h3>
              {lines.length > 1 ? (
                <button type="button" disabled={locked || isPending} aria-label={t('entryForm.removeLine', { number: index + 1 })} onClick={() => setLines((current) => current.filter((item) => item.clientKey !== line.clientKey))} className="inline-flex size-10 items-center justify-center rounded-xl text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Trash2 aria-hidden size={17} />
                </button>
              ) : null}
            </div>
            <div>
              <label className={bookkeepingLabelClass} htmlFor={`category-${line.clientKey}`}>{t('entryForm.category')}</label>
              <select id={`category-${line.clientKey}`} value={line.categoryCode} disabled={locked || isPending} onChange={(event) => updateLine(line.clientKey, (current) => ({ ...current, categoryCode: event.target.value }))} className={bookkeepingInputClass}>
                <option value="">{t('common.optional')}</option>
                {categories.map((category) => <option key={category} value={category}>{t(`categories.${category}`)}</option>)}
              </select>
            </div>
            <div>
              <label className={bookkeepingLabelClass} htmlFor={`line-description-${line.clientKey}`}>{t('entryForm.lineDescription')}</label>
              <input id={`line-description-${line.clientKey}`} value={line.description} maxLength={500} disabled={locked || isPending} onChange={(event) => updateLine(line.clientKey, (current) => ({ ...current, description: event.target.value }))} className={bookkeepingInputClass} />
            </div>
            <div>
              <label className={bookkeepingLabelClass} htmlFor={`vat-treatment-${line.clientKey}`}>{t('entryForm.vatTreatment')}</label>
              <select
                id={`vat-treatment-${line.clientKey}`}
                value={line.vatTreatment}
                disabled={locked || isPending}
                onChange={(event) => updateLine(line.clientKey, (current) => suggestedLine({
                  ...current,
                  vatTreatment: event.target.value as BookkeepingVatTreatment,
                  manualVatOverride: false,
                  manualVatOverrideReason: '',
                  exemptTurnoverConfirmed: false,
                }, entryType))}
                className={bookkeepingInputClass}
              >
                {treatments.map((treatment) => <option key={treatment} value={treatment}>{t(`vatTreatments.${treatment}`)}</option>)}
              </select>
            </div>
            <CheckboxRow checked={line.amountIncludesVat} disabled={locked || isPending || vatRateForTreatment(line.vatTreatment) === null} onChange={(checked) => updateLine(line.clientKey, (current) => suggestedLine({ ...current, amountIncludesVat: checked, manualVatOverride: false, manualVatOverrideReason: '' }, entryType))}>
              {t('entryForm.amountIncludesVat')}
            </CheckboxRow>
            <div>
              <label className={bookkeepingLabelClass} htmlFor={`amount-${line.clientKey}`}>{t('entryForm.amount')}</label>
              <input
                id={`amount-${line.clientKey}`}
                inputMode="numeric"
                pattern="[0-9.]*"
                value={line.amountRaw}
                required
                disabled={locked || isPending}
                onChange={(event) => updateLine(line.clientKey, (current) => {
                  const next = { ...current, amountRaw: formatIskInput(event.target.value), manualVatOverride: false, manualVatOverrideReason: '' }
                  try { return suggestedLine(next, entryType) } catch { return { ...next, grossRaw: '', netRaw: '', vatRaw: '', deductibleVatRaw: '0' } }
                })}
                className={bookkeepingInputClass}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 border-y border-border py-3 text-sm">
              <div className="min-w-0"><span className="block text-xs text-muted-foreground">{t('entryForm.gross')}</span><strong className="break-all tabular-nums">{line.grossRaw || '—'}</strong></div>
              <div className="min-w-0"><span className="block text-xs text-muted-foreground">{t('entryForm.net')}</span><strong className="break-all tabular-nums">{line.netRaw || '—'}</strong></div>
              <div className="min-w-0"><span className="block text-xs text-muted-foreground">{t('entryForm.vat')}</span><strong className="break-all tabular-nums">{line.vatRaw || '—'}</strong></div>
            </div>
            {vatRateForTreatment(line.vatTreatment) !== null ? (
              <>
                <CheckboxRow checked={line.manualVatOverride} disabled={locked || isPending} onChange={(checked) => updateLine(line.clientKey, (current) => checked ? { ...current, manualVatOverride: true } : suggestedLine({ ...current, manualVatOverride: false, manualVatOverrideReason: '' }, entryType))}>
                  {t('entryForm.manualOverride')}
                </CheckboxRow>
                {line.manualVatOverride ? (
                  <div className="space-y-4 border-l-2 border-primary/30 pl-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={bookkeepingLabelClass} htmlFor={`net-${line.clientKey}`}>{t('entryForm.net')}</label><input id={`net-${line.clientKey}`} inputMode="numeric" pattern="[0-9.]*" value={line.netRaw} disabled={locked || isPending} onChange={(event) => updateLine(line.clientKey, (current) => syncManualAmounts({ ...current, netRaw: formatIskInput(event.target.value) }))} className={bookkeepingInputClass} /></div>
                      <div><label className={bookkeepingLabelClass} htmlFor={`vat-${line.clientKey}`}>{t('entryForm.vat')}</label><input id={`vat-${line.clientKey}`} inputMode="numeric" pattern="[0-9.]*" value={line.vatRaw} disabled={locked || isPending} onChange={(event) => updateLine(line.clientKey, (current) => syncManualAmounts({ ...current, vatRaw: formatIskInput(event.target.value) }))} className={bookkeepingInputClass} /></div>
                    </div>
                    <div><label className={bookkeepingLabelClass} htmlFor={`override-${line.clientKey}`}>{t('entryForm.overrideReason')}</label><textarea id={`override-${line.clientKey}`} value={line.manualVatOverrideReason} maxLength={500} required disabled={locked || isPending} onChange={(event) => updateLine(line.clientKey, (current) => ({ ...current, manualVatOverrideReason: event.target.value }))} className={bookkeepingTextareaClass} /></div>
                  </div>
                ) : null}
              </>
            ) : null}
            {purchase ? (
              <div className="space-y-3">
                <div><label className={bookkeepingLabelClass} htmlFor={`deductibility-${line.clientKey}`}>{t('entryForm.deductibility')}</label><select id={`deductibility-${line.clientKey}`} value={line.inputVatDeductibility} disabled={locked || isPending || vatRateForTreatment(line.vatTreatment) === null} onChange={(event) => updateLine(line.clientKey, (current) => {
                  const inputVatDeductibility = event.target.value as BookkeepingInputVatDeductibility
                  return { ...current, inputVatDeductibility, deductibleVatRaw: inputVatDeductibility === 'fully_deductible' ? current.vatRaw || '0' : '0' }
                })} className={bookkeepingInputClass}>{BOOKKEEPING_INPUT_VAT_DEDUCTIBILITY.map((value) => <option key={value} value={value}>{t(`deductibility.${value}`)}</option>)}</select></div>
                {line.inputVatDeductibility === 'partially_deductible' ? <div><label className={bookkeepingLabelClass} htmlFor={`deductible-vat-${line.clientKey}`}>{t('entryForm.deductibleVat')}</label><input id={`deductible-vat-${line.clientKey}`} inputMode="numeric" pattern="[0-9.]*" value={line.deductibleVatRaw} disabled={locked || isPending} onChange={(event) => updateLine(line.clientKey, (current) => ({ ...current, deductibleVatRaw: formatIskInput(event.target.value) }))} className={bookkeepingInputClass} /></div> : null}
              </div>
            ) : null}
            {line.vatTreatment === 'exempt_turnover' ? <CheckboxRow checked={line.exemptTurnoverConfirmed} disabled={locked || isPending} onChange={(checked) => updateLine(line.clientKey, (current) => ({ ...current, exemptTurnoverConfirmed: checked }))}>{t('entryForm.exemptConfirmed')}</CheckboxRow> : null}
            <p className="text-xs leading-5 text-muted-foreground">{t('entryForm.calculationHint')}</p>
          </div>
        ))}
        <button type="button" disabled={locked || isPending || lines.length >= 50} onClick={() => setLines((current) => [...current, blankLine(entryType)])} className={`${bookkeepingSecondaryButtonClass} w-full`}><Plus aria-hidden size={17} className="mr-2" />{t('entryForm.addLine')}</button>
      </section>

      {purchase ? (
        <section className={`${bookkeepingSectionClass} space-y-2`} aria-labelledby="bookkeeping-evidence-title">
          <h2 id="bookkeeping-evidence-title" className="text-base font-semibold">{t('entryForm.evidenceTitle')}</h2>
          <CheckboxRow checked={originalDocumentPreserved} disabled={locked || isPending} onChange={setOriginalDocumentPreserved}>{t('entryForm.documentRetained')}</CheckboxRow>
          <CheckboxRow checked={businessPurposeConfirmed} disabled={locked || isPending} onChange={setBusinessPurposeConfirmed}>{t('entryForm.businessPurpose')}</CheckboxRow>
          <CheckboxRow checked={sellerVatRegistrationConfirmed} disabled={locked || isPending} onChange={setSellerVatRegistrationConfirmed}>{t('entryForm.sellerVatRegistered')}</CheckboxRow>
        </section>
      ) : null}

      <section className={`${bookkeepingSectionClass} space-y-2`} aria-labelledby="bookkeeping-special-cases-title">
        <h2 id="bookkeeping-special-cases-title" className="text-base font-semibold">{t('entryForm.specialCasesTitle')}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{t('entryForm.specialCaseHint')}</p>
        <CheckboxRow checked={foreignService} disabled={locked || isPending} onChange={setForeignService}>{t('entryForm.foreignService')}</CheckboxRow>
        <CheckboxRow checked={importedGoods} disabled={locked || isPending} onChange={setImportedGoods}>{t('entryForm.importedGoods')}</CheckboxRow>
        <CheckboxRow checked={mixedUse} disabled={locked || isPending} onChange={setMixedUse}>{t('entryForm.mixedUse')}</CheckboxRow>
        <CheckboxRow checked={uncertainDeductibility} disabled={locked || isPending} onChange={setUncertainDeductibility}>{t('entryForm.uncertainDeductibility')}</CheckboxRow>
        {selectedSpecialCase ? (
          <>
            <CheckboxRow checked={specialCaseResolved} disabled={locked || isPending} onChange={setSpecialCaseResolved}>{t('entryForm.specialCaseResolved')}</CheckboxRow>
            {specialCaseResolved ? <div><label className={bookkeepingLabelClass} htmlFor="bookkeeping-special-case-note">{t('entryForm.specialCaseResolutionNote')}</label><textarea id="bookkeeping-special-case-note" value={specialCaseResolutionNote} maxLength={1000} required disabled={locked || isPending} onChange={(event) => setSpecialCaseResolutionNote(event.target.value)} className={bookkeepingTextareaClass} /></div> : null}
          </>
        ) : null}
      </section>

      <div>
        <label className={bookkeepingLabelClass} htmlFor="bookkeeping-note">{t('common.note')} ({t('common.optional')})</label>
        <textarea id="bookkeeping-note" value={note} maxLength={2000} disabled={locked || isPending} onChange={(event) => setNote(event.target.value)} className={bookkeepingTextareaClass} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button type="submit" onClick={() => { saveAndNextIntent.current = false }} disabled={locked || isPending || isNavigating} className={bookkeepingPrimaryButtonClass}>{isPending || isNavigating ? t('entryForm.saving') : t(entry ? 'entryForm.update' : 'entryForm.create')}</button>
        {!entry ? <button type="submit" disabled={locked || isPending || isNavigating} onClick={() => { saveAndNextIntent.current = true }} className={bookkeepingSecondaryButtonClass}>{t('entryForm.saveAndNext')}</button> : null}
        <button type="button" disabled={isPending || isNavigating} onClick={() => startNavigation(() => router.push(periodHref))} className={`${bookkeepingSecondaryButtonClass} sm:col-span-2`}>{isNavigating ? t('period.openingPeriod') : t('common.cancel')}</button>
      </div>
    </form>
  )
}
