'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import type { ExpenseSettlementTransferView } from '@/lib/expenses/contracts'
import type { ExpenseMemberRepaymentStatus } from '@/lib/expenses/repayment-status'
import { formatExpenseMinor, formatExpenseMinorForCopy } from '@/lib/expenses/input-money'
import { ExpensePaymentDetails } from './ExpensePaymentDetails'
import { ExpenseRepaymentReportForm } from './ExpenseRepaymentReportForm'
import { ExpenseRepaymentStatusLines } from './ExpenseRepaymentStatusLines'
import { useExpenseTranslations } from './i18n.client'

type SettlementCategory = 'outstanding' | 'completed' | 'credit'
type SettlementFilter = SettlementCategory | 'reported'

export interface ExpenseSettlementParticipantRow {
  id: string
  name: string
  isSelf: boolean
  currency: string
  shareAmountMinor: number | null
  paymentAmountMinor: number | null
  category: SettlementCategory
  repaymentStatus?: ExpenseMemberRepaymentStatus
  repaymentId: string | null
  reportTransfer: ExpenseSettlementTransferView | null
}

const FILTERS: SettlementFilter[] = ['outstanding', 'reported', 'completed', 'credit']

function matchesFilter(row: ExpenseSettlementParticipantRow, filter: SettlementFilter): boolean {
  return filter === 'reported'
    ? (row.repaymentStatus?.reportedAmountMinor ?? 0) > 0
    : row.category === filter
}

export function ExpenseSettlementParticipantList({
  rows,
  groupId,
  initialDate,
}: {
  rows: ExpenseSettlementParticipantRow[]
  groupId: string
  initialDate: string
}) {
  const t = useExpenseTranslations()
  const [filter, setFilter] = useState<SettlementFilter | null>(null)
  const visibleRows = filter ? rows.filter((row) => matchesFilter(row, filter)) : rows

  return (
    <div className="space-y-3">
      <div
        role="group"
        className="grid grid-cols-2 gap-2"
        aria-label={t('expense.settlementFilters.label')}
      >
        {FILTERS.map((candidate) => {
          const active = filter === candidate
          const count = rows.filter((row) => matchesFilter(row, candidate)).length
          return (
            <button
              key={candidate}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(active ? null : candidate)}
              className={`min-h-11 rounded-xl border px-2 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground'}`}
            >
              <span className="break-words">{t(`expense.settlementFilters.${candidate}`)}</span>{' '}
              <span className={`ml-1 inline-flex min-w-5 justify-center rounded-full px-1.5 py-0.5 text-[11px] ${active
                ? 'bg-white/15 text-primary-foreground'
                : 'bg-muted text-muted-foreground'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      <div
        role="list"
        aria-label={t('expense.settlementParticipants')}
        className="divide-y divide-border border-y border-border"
      >
        {visibleRows.map((row) => (
          <div role="listitem" key={row.id} className="min-h-14 py-3 text-sm">
            <p className="break-words font-medium">
              {row.name}{row.isSelf ? ` ${t('expenseForm.youSuffix')}` : ''}
            </p>
            {row.shareAmountMinor !== null ? (
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {t('expenseForm.participantShare', {
                  amount: formatExpenseMinor(row.shareAmountMinor, row.currency),
                })}
              </p>
            ) : null}
            {row.paymentAmountMinor !== null ? (
              <p className="mt-0.5 flex items-start gap-1.5 text-xs leading-5 text-emerald-700">
                <CheckCircle2 aria-hidden size={15} className="mt-0.5 shrink-0" />
                <span>{t('expenseForm.paidAtPurchase', {
                  amount: formatExpenseMinor(row.paymentAmountMinor, row.currency),
                })}</span>
              </p>
            ) : null}
            {row.repaymentId && (
              (row.repaymentStatus?.reportedAmountMinor ?? 0) > 0
              || (row.repaymentStatus?.confirmedAmountMinor ?? 0) > 0
            ) ? (
              <Link
                href={`/auth-mvp/utlagt-og-endurgreitt/endurgreidslur/${row.repaymentId}`}
                className="mt-1 flex min-h-11 items-center gap-2 rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <span className="min-w-0 flex-1 space-y-1">
                  <ExpenseRepaymentStatusLines status={row.repaymentStatus} />
                </span>
                <ChevronRight aria-hidden size={17} className="shrink-0 text-muted-foreground" />
              </Link>
            ) : (row.repaymentStatus?.reportedAmountMinor ?? 0) > 0
              || (row.repaymentStatus?.confirmedAmountMinor ?? 0) > 0 ? (
                <div className="mt-0.5 space-y-1">
                  <ExpenseRepaymentStatusLines status={row.repaymentStatus} />
                </div>
              ) : null}
            {row.reportTransfer ? (
              <details className="mt-2 border-t border-border pt-2">
                <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                  {t('repayment.report')}
                </summary>
                <div className="space-y-4 pb-1 pt-2">
                  <p className="text-xs leading-5 text-muted-foreground">{t('repayment.payBeforeReport')}</p>
                  <ExpensePaymentDetails
                    snapshot={row.reportTransfer.paymentInstruction}
                    mode="current"
                    amount={{
                      display: formatExpenseMinor(row.reportTransfer.amountMinor, row.reportTransfer.currency),
                      copy: formatExpenseMinorForCopy(row.reportTransfer.amountMinor, row.reportTransfer.currency),
                    }}
                  />
                  <ExpenseRepaymentReportForm
                    groupId={groupId}
                    transfer={row.reportTransfer}
                    initialDate={initialDate}
                  />
                </div>
              </details>
            ) : null}
          </div>
        ))}
      </div>
      {visibleRows.length === 0 ? (
        <p role="status" className="py-1 text-sm text-muted-foreground">
          {t('expense.settlementFilters.empty')}
        </p>
      ) : null}
    </div>
  )
}
