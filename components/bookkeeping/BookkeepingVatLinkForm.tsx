'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'
import {
  linkBookkeepingTransactionToVatEntry,
  previewBookkeepingTransactionVatLink,
} from '@/lib/bookkeeping/actions'
import type { BookkeepingEntryType, BookkeepingVatTreatment } from '@/lib/bookkeeping/constants'
import { formatDateOnly } from '@/lib/date-format'
import { formatIskAmount, formatIskInteger } from '@/lib/bookkeeping/money'
import type { BookkeepingTransaction } from '@/lib/bookkeeping/types'
import { suggestVatBreakdownFromGross } from '@/lib/bookkeeping/vat'
import { useBookkeepingTranslations } from './i18n.client'
import {
  bookkeepingInputClass, bookkeepingLabelClass, bookkeepingPrimaryButtonClass,
  bookkeepingSecondaryButtonClass, bookkeepingSectionClass, createBookkeepingRequestId,
} from './ui'

export interface VatLinkPeriodOption {
  id: string
  registrationId: string
  startsOn: string
  endsOn: string
  label: string
}

interface Preview {
  before: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F', number>
  after: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F', number>
  blockerCountBefore: number
  blockerCountAfter: number
}

export function BookkeepingVatLinkForm({
  transaction,
  periods,
}: {
  transaction: BookkeepingTransaction
  periods: readonly VatLinkPeriodOption[]
}) {
  const t = useBookkeepingTranslations()
  const locale = useLocale()
  const router = useRouter()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [periodId, setPeriodId] = useState(periods[0]?.id ?? '')
  const selectedPeriod = periods.find((period) => period.id === periodId)
  const initialType: BookkeepingEntryType = transaction.direction === 'inflow' ? 'sale' : 'purchase'
  const [entryType, setEntryType] = useState<BookkeepingEntryType>(initialType)
  const [reportingDate, setReportingDate] = useState(transaction.documentDate ?? periods[0]?.startsOn ?? '')
  const [vatTreatment, setVatTreatment] = useState<BookkeepingVatTreatment>('needs_review')
  const [reviewed, setReviewed] = useState(false)
  const [documentRetained, setDocumentRetained] = useState(transaction.attachments.length > 0)
  const [businessPurpose, setBusinessPurpose] = useState(false)
  const [sellerVatRegistered, setSellerVatRegistered] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [pendingPayload, setPendingPayload] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const gross = transaction.grossMinor ?? 0
  const treatmentRate = vatTreatment === 'taxable_24' ? 24 : vatTreatment === 'taxable_11' ? 11 : null
  const amounts = useMemo(() => treatmentRate === null
    ? { grossMinor: gross, netMinor: gross, vatMinor: 0 }
    : suggestVatBreakdownFromGross(gross, treatmentRate), [gross, treatmentRate])
  const purchase = entryType === 'purchase' || entryType === 'purchase_credit'

  function buildPayload() {
    if (!selectedPeriod || gross <= 0 || !reportingDate) throw new Error('invalid')
    const inputDeductibility = purchase && treatmentRate !== null
      ? (businessPurpose && sellerVatRegistered ? 'fully_deductible' as const : 'needs_review' as const)
      : 'not_applicable' as const
    return {
      transaction_id: transaction.id,
      expected_transaction_version: transaction.version,
      entry: {
        request_id: createBookkeepingRequestId(), entity_id: transaction.entityId,
        vat_registration_id: selectedPeriod.registrationId, period_id: selectedPeriod.id,
        entry_id: null, expected_version: null, type: entryType,
        document_date: transaction.documentDate ?? reportingDate, reporting_date: reportingDate,
        counterparty: transaction.counterparty, description: transaction.description || t('ledger.untitled'),
        document_type: transaction.attachments.length ? 'receipt' : 'other', document_reference: null,
        duplicate_reference_confirmed: false, currency: 'ISK' as const,
        source_type: 'manual' as const, source_id: null, source_reference: null,
        review_state: reviewed ? 'reviewed' as const : 'unreviewed' as const,
        original_document_preserved: purchase ? documentRetained : false,
        business_purpose_confirmed: purchase ? businessPurpose : false,
        seller_vat_registration_confirmed: purchase ? sellerVatRegistered : null,
        special_cases: { foreign_service: 'not_applicable' as const, import: 'not_applicable' as const, mixed_use: 'not_applicable' as const, uncertain_deductibility: 'not_applicable' as const },
        special_case_resolution_note: null, note: null,
        lines: [{
          client_key: createBookkeepingRequestId(), line_id: null, category_code: transaction.roughCategory,
          description: null, vat_treatment: vatTreatment, currency: 'ISK' as const,
          amount_includes_vat: true, gross_minor: amounts.grossMinor,
          net_minor: amounts.netMinor, vat_minor: amounts.vatMinor,
          input_vat_deductibility: inputDeductibility,
          deductible_vat_minor: inputDeductibility === 'fully_deductible' ? amounts.vatMinor : 0,
          manual_vat_override: false, manual_vat_override_reason: null,
          exempt_turnover_confirmed: false,
        }],
      },
    }
  }

  function requestPreview() {
    setError(null)
    startTransition(async () => {
      try {
        const payload = buildPayload()
        const result = await previewBookkeepingTransactionVatLink(payload)
        if (!result.ok) { setError(t(`errors.${result.error.code}`)); return }
        setPendingPayload(payload); setPreview(result.data)
      } catch { setError(t('errors.invalid_input')); queueMicrotask(() => alertRef.current?.focus()) }
    })
  }

  function confirm() {
    if (!pendingPayload) return
    startTransition(async () => {
      const result = await linkBookkeepingTransactionToVatEntry(pendingPayload)
      if (!result.ok) { setPreview(null); setError(t(`errors.${result.error.code}`)); return }
      router.push(`/auth-mvp/bokhaldid/timabil/${result.data.periodId}`); router.refresh()
    })
  }

  if (!periods.length) return <section className={bookkeepingSectionClass}><p className="text-sm leading-6">{t('ledger.vatLink.noPeriods')}</p></section>

  return (
    <div className="space-y-5">
      {error ? <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
      <section className={`${bookkeepingSectionClass} space-y-4`}>
        <div><label className={bookkeepingLabelClass} htmlFor="vat-link-period">{t('ledger.vatLink.period')}</label><select id="vat-link-period" value={periodId} disabled={isPending} onChange={(event) => { setPeriodId(event.target.value); const period = periods.find((candidate) => candidate.id === event.target.value); if (period && (reportingDate < period.startsOn || reportingDate > period.endsOn)) setReportingDate(period.startsOn) }} className={bookkeepingInputClass}>{periods.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}</select></div>
        <div><label className={bookkeepingLabelClass} htmlFor="vat-link-type">{t('entryForm.type')}</label><select id="vat-link-type" value={entryType} disabled={isPending} onChange={(event) => setEntryType(event.target.value as BookkeepingEntryType)} className={bookkeepingInputClass}>{(['sale','purchase','sales_credit','purchase_credit'] as const).map((type) => <option key={type} value={type}>{t(`entryTypes.${type}`)}</option>)}</select></div>
        <TeskeidDateField label={t('entryForm.reportingDate')} value={reportingDate} onChange={setReportingDate} placeholder={t('common.datePlaceholder')} min={selectedPeriod?.startsOn} max={selectedPeriod?.endsOn} required disabled={isPending} />
        <div><label className={bookkeepingLabelClass} htmlFor="vat-link-treatment">{t('entryForm.vatTreatment')}</label><select id="vat-link-treatment" value={vatTreatment} disabled={isPending} onChange={(event) => setVatTreatment(event.target.value as BookkeepingVatTreatment)} className={bookkeepingInputClass}>{(['taxable_24','taxable_11', purchase ? 'no_vat' : 'outside_scope','needs_review'] as const).map((value) => <option key={value} value={value}>{t(`vatTreatments.${value}`)}</option>)}</select></div>
        <div className="grid grid-cols-3 gap-2 border-y border-border py-3 text-sm"><div><span className="block text-xs text-muted-foreground">{t('entryForm.gross')}</span><strong>{formatIskAmount(amounts.grossMinor)}</strong></div><div><span className="block text-xs text-muted-foreground">{t('entryForm.net')}</span><strong>{formatIskAmount(amounts.netMinor)}</strong></div><div><span className="block text-xs text-muted-foreground">{t('entryForm.vat')}</span><strong>{formatIskAmount(amounts.vatMinor)}</strong></div></div>
        {purchase ? <div className="space-y-2"><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5" checked={documentRetained} onChange={(event) => setDocumentRetained(event.target.checked)} />{t('entryForm.documentRetained')}</label><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5" checked={businessPurpose} onChange={(event) => setBusinessPurpose(event.target.checked)} />{t('entryForm.businessPurpose')}</label><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5" checked={sellerVatRegistered} onChange={(event) => setSellerVatRegistered(event.target.checked)} />{t('entryForm.sellerVatRegistered')}</label></div> : null}
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />{t('ledger.vatLink.reviewed')}</label>
      </section>
      {preview ? <section className={`${bookkeepingSectionClass} space-y-4`} aria-live="polite"><h2 className="text-base font-semibold">{t('ledger.vatLink.preview')}</h2><div className="overflow-x-auto"><table className="w-full min-w-[18rem] text-sm"><thead><tr><th className="py-2 text-left">{t('ledger.vatLink.field')}</th><th className="py-2 text-right">{t('ledger.vatLink.before')}</th><th className="py-2 text-right">{t('ledger.vatLink.after')}</th></tr></thead><tbody>{(['A','B','C','D','E','F'] as const).map((field) => <tr key={field} className="border-t border-border"><th className="py-2 text-left">{field}</th><td className="py-2 text-right tabular-nums">{formatIskAmount(preview.before[field])}</td><td className="py-2 text-right tabular-nums">{formatIskAmount(preview.after[field])}</td></tr>)}</tbody></table></div><p className="text-xs text-muted-foreground">{t('ledger.vatLink.blockers', { before: preview.blockerCountBefore, after: preview.blockerCountAfter })}</p><div className="grid grid-cols-2 gap-2"><button type="button" disabled={isPending} onClick={() => setPreview(null)} className={bookkeepingSecondaryButtonClass}>{t('common.cancel')}</button><button type="button" disabled={isPending} onClick={confirm} className={bookkeepingPrimaryButtonClass}>{isPending ? t('common.saving') : t('ledger.vatLink.confirm')}</button></div></section> : <button type="button" disabled={isPending} onClick={requestPreview} className={`${bookkeepingPrimaryButtonClass} w-full`}>{isPending ? t('ledger.vatLink.previewing') : t('ledger.vatLink.showPreview')}</button>}
      <p className="text-xs leading-5 text-muted-foreground">{t('ledger.vatLink.safety')}</p>
    </div>
  )
}
