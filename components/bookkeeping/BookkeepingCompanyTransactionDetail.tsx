'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import { formatDateOnly } from '@/lib/date-format'
import { markBookkeepingTransactionNotVat, voidBookkeepingCompanyTransaction } from '@/lib/bookkeeping/actions'
import { formatIskAmount } from '@/lib/bookkeeping/money'
import type { BookkeepingCompanyTransactionView } from '@/lib/bookkeeping/types'
import { useBookkeepingTranslations } from './i18n.client'
import { BookkeepingAttachmentUpload } from './BookkeepingAttachmentUpload'
import { BookkeepingCompanyTransactionForm } from './BookkeepingCompanyTransactionForm'
import { bookkeepingPrimaryButtonClass, bookkeepingSecondaryButtonClass, bookkeepingSectionClass, createBookkeepingRequestId } from './ui'

export function BookkeepingCompanyTransactionDetail({ view }: { view: BookkeepingCompanyTransactionView }) {
  const { transaction } = view
  const t = useBookkeepingTranslations()
  const locale = useLocale()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const base = `/auth-mvp/bokhaldid/einingar/${transaction.entityId}/faerslur`

  function setVatDisposition(vatDisposition: 'unclassified' | 'not_applicable') {
    setError(null)
    startTransition(async () => {
      const result = await markBookkeepingTransactionNotVat({
        request_id: createBookkeepingRequestId(),
        transaction_id: transaction.id,
        expected_version: transaction.version,
        vat_disposition: vatDisposition,
      })
      if (!result.ok) { setError(t(`errors.${result.error.code}`)); return }
      window.location.reload()
    })
  }

  function voidTransaction() {
    if (!window.confirm(t('ledger.voidConfirm'))) return
    startTransition(async () => {
      const result = await voidBookkeepingCompanyTransaction({
        request_id: createBookkeepingRequestId(), transaction_id: transaction.id,
        expected_version: transaction.version, reason: t('ledger.voidReasonDefault'),
      })
      if (!result.ok) { setError(t(`errors.${result.error.code}`)); return }
      window.location.assign(base)
    })
  }

  return (
    <div className="space-y-6">
      <section className={`${bookkeepingSectionClass} space-y-4`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="break-words text-lg font-semibold">{transaction.description || t('ledger.untitled')}</h2><p className="mt-1 text-sm text-muted-foreground">{t(`ledger.states.${transaction.state}`)}</p></div>
          {transaction.grossMinor !== null ? <strong className="shrink-0 text-lg tabular-nums">{formatIskAmount(transaction.grossMinor)}</strong> : null}
        </div>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 border-y border-border py-4 text-sm">
          <dt className="text-muted-foreground">{t('ledger.form.direction')}</dt><dd>{transaction.direction ? t(`ledger.directions.${transaction.direction}`) : t('ledger.unclassified')}</dd>
          <dt className="text-muted-foreground">{t('ledger.form.documentDate')}</dt><dd>{transaction.documentDate ? formatDateOnly(transaction.documentDate, locale) : '—'}</dd>
          <dt className="text-muted-foreground">{t('ledger.form.counterparty')}</dt><dd className="max-w-48 break-words text-right">{transaction.counterparty || '—'}</dd>
          <dt className="text-muted-foreground">{t('ledger.form.counterpartyKind')}</dt><dd>{transaction.counterpartyKind ? t(`ledger.counterpartyKinds.${transaction.counterpartyKind}`) : '—'}</dd>
          <dt className="text-muted-foreground">VSK</dt><dd>{t(`ledger.vat.${transaction.vatDisposition}`)}</dd>
        </dl>
        {transaction.vatLink?.hasDrift ? <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{t('ledger.vatDrift')}</p> : null}
        {transaction.attachments.length ? (
          <div><h3 className="text-sm font-semibold">{t('ledger.attachments')}</h3><div className="mt-2 divide-y divide-border border-y border-border">{transaction.attachments.map((attachment) => <a key={attachment.id} href={`/api/bookkeeping/attachments/${attachment.id}`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm text-primary"><span className="min-w-0 truncate">{attachment.filename || t('ledger.attachment')}</span><span>{t('common.open')}</span></a>)}</div></div>
        ) : null}
      </section>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {transaction.state !== 'voided' && transaction.vatDisposition === 'unclassified' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Link href={`${base}/${transaction.id}/vsk`} className={bookkeepingPrimaryButtonClass}>{t('ledger.addToVat')}</Link>
          <button type="button" disabled={isPending} onClick={() => setVatDisposition('not_applicable')} className={bookkeepingSecondaryButtonClass}>{isPending ? t('common.saving') : t('ledger.markNotVat')}</button>
        </div>
      ) : transaction.state !== 'voided' && transaction.vatDisposition === 'not_applicable' ? <button type="button" disabled={isPending} onClick={() => setVatDisposition('unclassified')} className={`${bookkeepingSecondaryButtonClass} w-full`}>{t('ledger.reopenVatClassification')}</button> : transaction.vatLink ? <Link href={`/auth-mvp/bokhaldid/timabil/${transaction.vatLink.periodId}`} className={`${bookkeepingPrimaryButtonClass} w-full`}>{t('ledger.openVatPeriod')}</Link> : null}

      {transaction.state !== 'voided' ? <details className={bookkeepingSectionClass}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-primary">{t('ledger.edit')}</summary>
        <div className="pt-5"><BookkeepingCompanyTransactionForm entityId={transaction.entityId} transaction={transaction} /></div>
      </details> : null}
      {transaction.state !== 'voided' ? <BookkeepingAttachmentUpload entityId={transaction.entityId} transactionId={transaction.id} /> : null}
      <section className={bookkeepingSectionClass}>
        <h2 className="text-base font-semibold">{t('ledger.history')}</h2>
        <ol className="mt-3 divide-y divide-border border-y border-border">{view.revisions.map((revision) => <li key={revision.version} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm"><span>{t(`ledger.operations.${revision.operation}`)}</span><span className="text-xs text-muted-foreground">v{revision.version}</span></li>)}</ol>
      </section>
      {transaction.state !== 'voided' && transaction.vatDisposition !== 'linked' ? <button type="button" disabled={isPending} onClick={voidTransaction} className="min-h-11 w-full rounded-xl border border-destructive/40 px-4 text-sm font-semibold text-destructive">{t('ledger.void')}</button> : null}
    </div>
  )
}
