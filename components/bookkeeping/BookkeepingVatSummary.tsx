'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { VAT_REPORT_FIELDS, type VatReportField } from '@/lib/bookkeeping/constants'
import { formatIskAmount, formatIskForCopy } from '@/lib/bookkeeping/money'
import type { BookkeepingVatSummary } from '@/lib/bookkeeping/types'
import { formatVatSummaryForCopy } from '@/lib/bookkeeping/vat'
import { useBookkeepingTranslations } from './i18n.client'
import { bookkeepingSecondaryButtonClass, bookkeepingSectionClass } from './ui'

interface BookkeepingVatSummaryProps {
  summary: BookkeepingVatSummary
  selectedField?: VatReportField | null
  onSelectField?: (field: VatReportField) => void
}

export function BookkeepingVatSummaryPanel({
  summary,
  selectedField,
  onSelectField,
}: BookkeepingVatSummaryProps) {
  const t = useBookkeepingTranslations()
  const [copied, setCopied] = useState<string | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)

  async function copyValue(key: string, value: string) {
    setCopyFailed(false)
    try {
      if (!navigator.clipboard) throw new Error('clipboard_unavailable')
      await navigator.clipboard.writeText(value)
      setCopied(key)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <section className={`${bookkeepingSectionClass} space-y-4`} aria-labelledby="vat-return-title">
      <div>
        <h2 id="vat-return-title" className="text-base font-semibold">{t('vat.title')}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('vat.help')}</p>
      </div>

      <dl className="divide-y divide-border border-y border-border">
        {VAT_REPORT_FIELDS.map((field) => {
          const traceCount = summary.traces[field].length
          const selectable = field !== 'F' && Boolean(onSelectField)
          return (
            <div
              key={field}
              className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 py-3 ${selectedField === field ? 'bg-primary/5' : ''}`}
            >
              <div className="min-w-0">
                <dt className="flex min-w-0 items-start gap-2">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {field}
                  </span>
                  <span className="min-w-0 text-sm font-medium leading-5">{t(`vat.${field}`)}</span>
                </dt>
                <dd className="mt-1 pl-9 text-base font-semibold tabular-nums">
                  {formatIskAmount(summary.fields[field])}
                </dd>
                {selectable ? (
                  <button
                    type="button"
                    onClick={() => onSelectField?.(field)}
                    className="ml-9 mt-1 inline-flex min-h-10 items-center text-left text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t('vat.traceCount', { count: traceCount })}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                aria-label={`${t('common.copy')} ${field}`}
                onClick={() => copyValue(field, formatIskForCopy(summary.fields[field]))}
                className="inline-flex size-11 items-center justify-center self-start rounded-xl border border-border text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copied === field ? <Check aria-hidden size={17} /> : <Copy aria-hidden size={17} />}
              </button>
            </div>
          )
        })}
      </dl>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span>{t('vat.output24')}</span><span className="text-right tabular-nums">{formatIskAmount(summary.outputVat24Minor)}</span>
        <span>{t('vat.output11')}</span><span className="text-right tabular-nums">{formatIskAmount(summary.outputVat11Minor)}</span>
        <span>{t('vat.input24')}</span><span className="text-right tabular-nums">{formatIskAmount(summary.inputVat24Minor)}</span>
        <span>{t('vat.input11')}</span><span className="text-right tabular-nums">{formatIskAmount(summary.inputVat11Minor)}</span>
      </div>

      <button
        type="button"
        onClick={() => copyValue('all', formatVatSummaryForCopy(summary))}
        className={`${bookkeepingSecondaryButtonClass} w-full`}
      >
        {copied === 'all' ? <Check aria-hidden size={17} className="mr-2" /> : <Copy aria-hidden size={17} className="mr-2" />}
        {copied === 'all' ? t('common.copied') : t('vat.copyAll')}
      </button>
      {copyFailed ? <p role="alert" className="text-sm text-destructive">{t('common.copyFailed')}</p> : null}
      <p className="text-xs leading-5 text-muted-foreground">{t('vat.finalHint')}</p>
    </section>
  )
}
