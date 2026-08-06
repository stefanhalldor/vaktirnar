'use client'

import { useLocale } from 'next-intl'
import { CheckCircle2, Clock3 } from 'lucide-react'
import { formatDateTime } from '@/lib/date-format'
import type { ExpenseMemberRepaymentStatus } from '@/lib/expenses/repayment-status'
import { useExpenseTranslations } from './i18n.client'

/** Shared status presentation for every expense surface showing repayments. */
export function ExpenseRepaymentStatusLines({
  status,
}: {
  status: ExpenseMemberRepaymentStatus | undefined
}) {
  const t = useExpenseTranslations()
  const locale = useLocale()
  const hasReported = (status?.reportedAmountMinor ?? 0) > 0
  const hasConfirmed = (status?.confirmedAmountMinor ?? 0) > 0

  return (
    <>
      {hasReported && status?.latestReportedAt ? (
        <span className="flex items-start gap-1.5 text-xs leading-5 text-amber-800">
          <Clock3 aria-hidden size={15} className="mt-0.5 shrink-0" />
          <span>{t('repayment.reportedAt', {
            date: formatDateTime(status.latestReportedAt, locale),
          })}</span>
        </span>
      ) : null}
      {hasConfirmed && status?.latestConfirmedReportAt ? (
        <span className="flex items-start gap-1.5 text-xs leading-5 text-emerald-700">
          <CheckCircle2 aria-hidden size={15} className="mt-0.5 shrink-0" />
          <span>{t('repayment.confirmedReportedAt', {
            date: formatDateTime(status.latestConfirmedReportAt, locale),
          })}</span>
        </span>
      ) : null}
    </>
  )
}
