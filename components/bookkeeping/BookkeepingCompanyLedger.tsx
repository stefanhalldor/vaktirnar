'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, FileText, Plus } from 'lucide-react'
import { useLocale } from 'next-intl'
import { formatDateOnly } from '@/lib/date-format'
import { formatIskAmount } from '@/lib/bookkeeping/money'
import type { BookkeepingCompanyLedgerView, BookkeepingTransaction } from '@/lib/bookkeeping/types'
import { useBookkeepingTranslations } from './i18n.client'
import { bookkeepingPrimaryButtonClass, bookkeepingSectionClass } from './ui'

type Filter = 'all' | 'unclassified' | 'inflow' | 'outflow' | 'review' | 'not_vat' | 'linked' | 'voided'
const LEDGER_FILTERS: readonly Filter[] = [
  'all', 'unclassified', 'inflow', 'outflow', 'review', 'not_vat', 'linked', 'voided',
]

function matches(transaction: BookkeepingTransaction, filter: Filter): boolean {
  if (filter === 'all') return true
  if (transaction.state === 'voided') return filter === 'voided'
  if (filter === 'unclassified') return !transaction.direction || transaction.vatDisposition === 'unclassified'
  if (filter === 'inflow' || filter === 'outflow') return transaction.direction === filter
  if (filter === 'review') return transaction.state !== 'reviewed'
  if (filter === 'not_vat') return transaction.vatDisposition === 'not_applicable'
  if (filter === 'voided') return false
  return transaction.vatDisposition === 'linked'
}

export function BookkeepingCompanyLedger({ ledger }: { ledger: BookkeepingCompanyLedgerView }) {
  const t = useBookkeepingTranslations()
  const locale = useLocale()
  const [filter, setFilter] = useState<Filter>('all')
  const counts = useMemo(() => Object.fromEntries(
    LEDGER_FILTERS.map((candidate) => [candidate, ledger.transactions.filter((tx) => matches(tx, candidate)).length]),
  ) as Record<Filter, number>, [ledger.transactions])
  const visible = ledger.transactions.filter((tx) => matches(tx, filter))
  const baseHref = `/auth-mvp/bokhaldid/einingar/${ledger.entity.id}/faerslur`

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2">
        <Link href={`${baseHref}/ny`} className={`${bookkeepingPrimaryButtonClass} col-span-2 sm:col-span-1`}><Plus aria-hidden size={17} className="mr-2" />{t('ledger.new')}</Link>
        <Link href={`${baseHref}/ny#upload`} className={`${bookkeepingPrimaryButtonClass} col-span-2 sm:col-span-1`}><FileText aria-hidden size={17} className="mr-2" />{t('ledger.upload.action')}</Link>
      </div>
      <div className="flex snap-x gap-2 overflow-x-auto pb-1" role="group" aria-label={t('ledger.filters.title')}>
        {LEDGER_FILTERS.map((candidate) => (
          <button key={candidate} type="button" onClick={() => setFilter(candidate)} aria-pressed={filter === candidate} className={`min-h-10 shrink-0 snap-start rounded-full border px-3 text-sm ${filter === candidate ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}>
            {t(`ledger.filters.${candidate}`)} <span className="ml-1 tabular-nums opacity-75">{counts[candidate]}</span>
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <section className={bookkeepingSectionClass}><p className="text-sm leading-6 text-muted-foreground">{t('ledger.empty')}</p></section>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {visible.map((transaction) => (
            <Link key={transaction.id} href={`${baseHref}/${transaction.id}`} className="flex min-h-20 items-center gap-3 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{transaction.description || transaction.attachments[0]?.filename || t('ledger.untitled')}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {transaction.documentDate ? formatDateOnly(transaction.documentDate, locale) : t('ledger.noDate')}
                  {transaction.counterparty ? ` · ${transaction.counterparty}` : ''}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{t(`ledger.states.${transaction.state}`)} · {t(`ledger.vat.${transaction.vatDisposition}`)}</span>
              </span>
              {transaction.grossMinor !== null ? <strong className="shrink-0 text-sm tabular-nums">{formatIskAmount(transaction.grossMinor)}</strong> : null}
              <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
