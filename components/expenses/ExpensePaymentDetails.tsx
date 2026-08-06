'use client'

import { useState } from 'react'
import type { ExpensePaymentSnapshotView } from '@/lib/expenses/contracts'
import { PAYMENT_DETAIL_KEYS_BY_KIND } from '@/lib/expenses/payment-detail-policy'
import { useExpenseTranslations } from './i18n.client'
import { expenseSecondaryButtonClass } from './ui'

export function ExpensePaymentDetails({
  snapshot,
  mode,
  amount,
}: {
  snapshot: ExpensePaymentSnapshotView | null
  mode: 'current' | 'snapshot'
  amount?: { display: string; copy: string }
}) {
  const t = useExpenseTranslations()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)

  if (!snapshot && !amount) {
    return (
      <p className="border-y border-border py-4 text-sm text-muted-foreground">
        {t(mode === 'current' ? 'repayment.currentPaymentDetailsHidden' : 'repayment.paymentDetailsHidden')}
      </p>
    )
  }

  async function copyValue(key: string, value: string) {
    setCopyFailed(false)
    try {
      if (!navigator.clipboard) throw new Error('clipboard_unavailable')
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <div className="space-y-3 border-y border-border py-4 text-sm">
      {snapshot ? <p className="font-semibold">{snapshot.title === 'payment_profile_v2' ? t('preferences.title') : snapshot.title}</p> : null}
      <dl className="divide-y divide-border">
        {amount ? <div className="grid gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center"><dt className="text-muted-foreground">{t('common.amount')}</dt><dd className="min-w-0 break-words font-semibold sm:text-right">{amount.display}</dd><dd><button type="button" className={`${expenseSecondaryButtonClass} w-full px-3 sm:w-auto`} onClick={() => copyValue('amount', amount.copy)} aria-label={t('repayment.copyValue', { label: t('common.amount') })}>{copiedKey === 'amount' ? t('repayment.copied') : t('repayment.copy')}</button></dd></div> : null}
        {snapshot ? PAYMENT_DETAIL_KEYS_BY_KIND[snapshot.kind].flatMap((key) => {
          const value = snapshot.details[key]
          if (!value) return []
          const label = t(`preferences.${key}`)
          return [
            <div key={key} className="grid gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words sm:text-right">
                {key === 'paymentLink' ? (
                  <a href={value} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
                    {value}
                  </a>
                ) : value}
              </dd>
              <dd>
                <button
                  type="button"
                  className={`${expenseSecondaryButtonClass} w-full px-3 sm:w-auto`}
                  onClick={() => copyValue(key, value)}
                  aria-label={t('repayment.copyValue', { label })}
                >
                  {copiedKey === key ? t('repayment.copied') : t('repayment.copy')}
                </button>
              </dd>
            </div>,
          ]
        }) : null}
      </dl>
      {!snapshot ? <p className="text-sm text-muted-foreground">{t('repayment.currentPaymentDetailsHidden')}</p> : null}
      {copyFailed ? <p role="alert" className="text-xs text-destructive">{t('repayment.copyFailed')}</p> : null}
      {snapshot ? <p className="text-xs leading-5 text-muted-foreground">
        {t(mode === 'current' ? 'repayment.currentPaymentDetailsHint' : 'preferences.snapshotHint')}
      </p> : null}
    </div>
  )
}
