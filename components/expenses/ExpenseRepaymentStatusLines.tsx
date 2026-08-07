'use client'

import { useLocale } from 'next-intl'
import { CheckCircle2, Clock3 } from 'lucide-react'
import { formatDateTime } from '@/lib/date-format'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import type { ExpenseMemberRepaymentStatus } from '@/lib/expenses/repayment-status'
import { useExpenseTranslations } from './i18n.client'

/** Shared status presentation for every expense surface showing repayments. */
export function ExpenseRepaymentStatusLines({
  status,
  currency,
  remainingAmountMinor,
  showReported = true,
}: {
  status: ExpenseMemberRepaymentStatus | undefined
  currency?: string
  remainingAmountMinor?: number
  showReported?: boolean
}) {
  const t = useExpenseTranslations()
  const locale = useLocale()
  const hasReported = (status?.reportedAmountMinor ?? 0) > 0
  const hasConfirmed = (status?.confirmedAmountMinor ?? 0) > 0

  return (
    <>
      {showReported && hasReported && status?.latestReportedAt ? (
        <span className="flex items-start gap-1.5 text-xs leading-5 text-amber-800">
          <Clock3 aria-hidden size={15} className="mt-0.5 shrink-0" />
          <span>{t(currency ? 'repayment.reportedAmountAt' : 'repayment.reportedAt', {
            amount: currency ? formatExpenseMinor(status.reportedAmountMinor, currency, locale) : '',
            date: formatDateTime(status.latestReportedAt, locale),
          })}</span>
        </span>
      ) : null}
      {hasConfirmed && status?.latestConfirmedReportAt ? (
        <>
          {currency && typeof remainingAmountMinor === 'number' && remainingAmountMinor > 0 ? (
            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
              {t('repayment.partiallyPaid')}
            </span>
          ) : null}
          <span className="flex items-start gap-1.5 text-xs leading-5 text-emerald-700">
            <CheckCircle2 aria-hidden size={15} className="mt-0.5 shrink-0" />
            <span>{t(currency ? 'repayment.confirmedAmountAt' : 'repayment.confirmedReportedAt', {
              amount: currency ? formatExpenseMinor(status.confirmedAmountMinor, currency, locale) : '',
              date: formatDateTime(status.latestConfirmedReportAt, locale),
            })}</span>
          </span>
          {currency && typeof remainingAmountMinor === 'number' && remainingAmountMinor > 0 ? (
            <span className="block text-xs leading-5 text-foreground">
              {t('repayment.remainingAmount', {
                amount: formatExpenseMinor(remainingAmountMinor, currency, locale),
              })}
            </span>
          ) : null}
        </>
      ) : null}
    </>
  )
}
