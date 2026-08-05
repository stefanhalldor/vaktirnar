'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'
import { saveBookkeepingCompanyTransaction } from '@/lib/bookkeeping/actions'
import { formatIskInput, formatIskInteger, parseIskAmount } from '@/lib/bookkeeping/money'
import type { BookkeepingTransaction } from '@/lib/bookkeeping/types'
import { useBookkeepingTranslations } from './i18n.client'
import { useBookkeepingMutationRequestIds } from './request-id'
import {
  bookkeepingInputClass,
  bookkeepingLabelClass,
  bookkeepingPrimaryButtonClass,
  bookkeepingSecondaryButtonClass,
  bookkeepingSectionClass,
  bookkeepingTextareaClass,
} from './ui'

export function BookkeepingCompanyTransactionForm({
  entityId,
  transaction,
}: {
  entityId: string
  transaction?: BookkeepingTransaction
}) {
  const t = useBookkeepingTranslations()
  const router = useRouter()
  const requestIds = useBookkeepingMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [state, setState] = useState<'inbox' | 'draft' | 'reviewed'>(
    transaction?.state === 'draft' || transaction?.state === 'reviewed' ? transaction.state : 'inbox',
  )
  const [direction, setDirection] = useState(transaction?.direction ?? '')
  const [documentDate, setDocumentDate] = useState(transaction?.documentDate ?? '')
  const [paymentDate, setPaymentDate] = useState(transaction?.paymentDate ?? '')
  const [counterparty, setCounterparty] = useState(transaction?.counterparty ?? '')
  const [counterpartyKind, setCounterpartyKind] = useState(transaction?.counterpartyKind ?? '')
  const [description, setDescription] = useState(transaction?.description ?? '')
  const [grossRaw, setGrossRaw] = useState(
    transaction?.grossMinor === null || transaction?.grossMinor === undefined
      ? ''
      : formatIskInteger(transaction.grossMinor),
  )
  const [roughCategory, setRoughCategory] = useState(transaction?.roughCategory ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const ledgerHref = `/auth-mvp/bokhaldid/einingar/${entityId}/faerslur`

  function submit() {
    let grossMinor: number | null = null
    try {
      grossMinor = grossRaw.trim() ? parseIskAmount(grossRaw) : null
    } catch {
      setError(t('errors.invalid_input'))
      queueMicrotask(() => alertRef.current?.focus())
      return
    }
    const semanticPayload = {
      entity_id: entityId,
      transaction_id: transaction?.id ?? null,
      expected_version: transaction?.version ?? null,
      state,
      direction: direction || null,
      document_date: documentDate || null,
      payment_date: paymentDate || null,
      counterparty: counterparty || null,
      counterparty_kind: counterpartyKind || null,
      description: description || null,
      gross_minor: grossMinor,
      currency: 'ISK' as const,
      rough_category: roughCategory || null,
    }
    const payload = { request_id: requestIds.forPayload(semanticPayload), ...semanticPayload }
    setError(null)
    startTransition(async () => {
      const result = await saveBookkeepingCompanyTransaction(payload)
      if (!result.ok) {
        setError(t(`errors.${result.error.code}`))
        queueMicrotask(() => alertRef.current?.focus())
        return
      }
      requestIds.succeeded(semanticPayload)
      router.push(`${ledgerHref}/${result.data.transactionId}`)
      router.refresh()
    })
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => { event.preventDefault(); submit() }}
    >
      {error ? <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
      <section className={`${bookkeepingSectionClass} space-y-4`}>
        <div>
          <label className={bookkeepingLabelClass} htmlFor="ledger-description">{t('ledger.form.description')}</label>
          <textarea id="ledger-description" required={!transaction} maxLength={500} value={description} disabled={isPending} onChange={(event) => setDescription(event.target.value)} className={bookkeepingTextareaClass} placeholder={t('ledger.form.descriptionPlaceholder')} />
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('ledger.form.descriptionHint')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={bookkeepingLabelClass} htmlFor="ledger-direction">{t('ledger.form.direction')}</label>
            <select id="ledger-direction" value={direction} disabled={isPending} onChange={(event) => setDirection(event.target.value as typeof direction)} className={bookkeepingInputClass}>
              <option value="">{t('ledger.unclassified')}</option>
              <option value="inflow">{t('ledger.directions.inflow')}</option>
              <option value="outflow">{t('ledger.directions.outflow')}</option>
            </select>
          </div>
          <div>
            <label className={bookkeepingLabelClass} htmlFor="ledger-state">{t('ledger.form.state')}</label>
            <select id="ledger-state" value={state} disabled={isPending} onChange={(event) => setState(event.target.value as typeof state)} className={bookkeepingInputClass}>
              <option value="inbox">{t('ledger.states.inbox')}</option>
              <option value="draft">{t('ledger.states.draft')}</option>
              <option value="reviewed">{t('ledger.states.reviewed')}</option>
            </select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TeskeidDateField label={t('ledger.form.documentDate')} value={documentDate} onChange={setDocumentDate} placeholder={t('common.datePlaceholder')} disabled={isPending} />
          <TeskeidDateField label={t('ledger.form.paymentDate')} value={paymentDate} onChange={setPaymentDate} placeholder={t('common.datePlaceholder')} disabled={isPending} />
        </div>
        <div>
          <label className={bookkeepingLabelClass} htmlFor="ledger-counterparty">{t('ledger.form.counterparty')}</label>
          <input id="ledger-counterparty" maxLength={200} value={counterparty} disabled={isPending} onChange={(event) => setCounterparty(event.target.value)} className={bookkeepingInputClass} />
        </div>
        <div>
          <label className={bookkeepingLabelClass} htmlFor="ledger-counterparty-kind">{t('ledger.form.counterpartyKind')}</label>
          <select id="ledger-counterparty-kind" value={counterpartyKind} disabled={isPending} onChange={(event) => setCounterpartyKind(event.target.value as typeof counterpartyKind)} className={bookkeepingInputClass}>
            <option value="">{t('common.optional')}</option>
            <option value="individual">{t('ledger.counterpartyKinds.individual')}</option>
            <option value="company">{t('ledger.counterpartyKinds.company')}</option>
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={bookkeepingLabelClass} htmlFor="ledger-amount">{t('ledger.form.amount')}</label>
            <input id="ledger-amount" inputMode="numeric" pattern="[0-9.]*" value={grossRaw} disabled={isPending} onChange={(event) => setGrossRaw(formatIskInput(event.target.value))} className={bookkeepingInputClass} placeholder="0" />
          </div>
          <div>
            <label className={bookkeepingLabelClass} htmlFor="ledger-category">{t('ledger.form.roughCategory')}</label>
            <input id="ledger-category" maxLength={80} value={roughCategory} disabled={isPending} onChange={(event) => setRoughCategory(event.target.value)} className={bookkeepingInputClass} />
          </div>
        </div>
      </section>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="submit" disabled={isPending} className={bookkeepingPrimaryButtonClass}>{isPending ? t('common.saving') : t('common.save')}</button>
        <button type="button" disabled={isPending} onClick={() => router.push(transaction ? `${ledgerHref}/${transaction.id}` : ledgerHref)} className={bookkeepingSecondaryButtonClass}>{t('common.cancel')}</button>
      </div>
    </form>
  )
}
