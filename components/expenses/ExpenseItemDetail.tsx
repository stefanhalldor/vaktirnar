import Link from 'next/link'
import { getLocale } from 'next-intl/server'
import { formatDateOnly } from '@/lib/date-format'
import type { ExpenseGroupView, ExpenseItemView } from '@/lib/expenses/contracts'
import { calculateExpenseBalances, simplifySettlement } from '@/lib/expenses/balances'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { getExpenseTranslations } from './i18n.server'
import { ExpenseItemActions } from './ExpenseItemActions'
import { ExpenseFlowNav } from './ExpenseFlowNav'

export async function ExpenseItemDetail({
  group,
  expense,
}: {
  group: ExpenseGroupView
  expense: ExpenseItemView
}) {
  const [t, locale] = await Promise.all([getExpenseTranslations(), getLocale()])
  const hasLockedRepayment = group.repayments.some(
    (repayment) => repayment.status === 'reported' || repayment.status === 'confirmed',
  )
  const canEdit = expense.status === 'active'
    && group.status === 'active'
    && !hasLockedRepayment
    && (expense.createdBySelf || group.canManage)
  const canCancel = canEdit
  const balances = calculateExpenseBalances({
    expenseId: expense.id,
    totalMinor: expense.totalMinor,
    currency: expense.currency,
    payments: expense.payments.map((payment) => ({
      payerId: payment.memberId,
      amountMinor: payment.amountMinor,
      currency: expense.currency,
    })),
    shares: expense.shares.map((share) => ({
      participantId: share.memberId,
      amountMinor: share.amountMinor,
      currency: expense.currency,
    })),
  })
  const settlement = simplifySettlement(balances)
  const displayName = new Map([
    ...expense.payments.map((payment) => [payment.memberId, payment.displayName] as const),
    ...expense.shares.map((share) => [share.memberId, share.displayName] as const),
  ])

  return (
    <div className="space-y-8">
      <ExpenseFlowNav context="saved" expenseId={expense.id} canEdit={canEdit} />
      <section className="space-y-3 border-y border-border py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{expense.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{formatDateOnly(expense.incurredOn, locale)}</p>
          </div>
          <strong className="shrink-0 text-lg">{formatExpenseMinor(expense.totalMinor, expense.currency)}</strong>
        </div>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-y-2">
          <dt className="text-muted-foreground">{t('common.status')}</dt>
          <dd className="mb-1 break-words sm:mb-0 sm:text-right">{t(expense.status === 'cancelled' ? 'expense.cancelled' : 'expense.active')}</dd>
          <dt className="text-muted-foreground">{t('expense.splitMethod')}</dt>
          <dd className="mb-1 break-words sm:mb-0 sm:text-right">{t(`splitMethods.${expense.splitMethod}`)}</dd>
          {expense.category ? (
            <>
              <dt className="text-muted-foreground">{t('expenseForm.category')}</dt>
              <dd className="break-words sm:text-right">{t(`categories.${expense.category}`)}</dd>
            </>
          ) : null}
        </dl>
        {expense.note ? <p className="whitespace-pre-wrap break-words text-sm leading-6">{expense.note}</p> : null}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">{t('expense.paid')}</h2>
        <div className="divide-y divide-border border-y border-border">
          {expense.payments.map((payment) => (
            <div key={payment.memberId} className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm">
              <span className="min-w-0 truncate">{payment.displayName}</span>
              <strong className="shrink-0">{formatExpenseMinor(payment.amountMinor, expense.currency)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">{t('expense.shares')}</h2>
        <div className="divide-y divide-border border-y border-border">
          {expense.shares.map((share) => (
            <div key={share.memberId} className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm">
              <span className="min-w-0 truncate">{share.displayName}</span>
              <strong className="shrink-0">{formatExpenseMinor(share.amountMinor, expense.currency)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">{t('expenseForm.previewNet')}</h2>
        <div className="divide-y divide-border border-y border-border">
          {balances.map((balance) => (
            <div key={balance.partyId} className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm">
              <span className="min-w-0 truncate">
                {t(balance.amountMinor > 0
                  ? 'expenseForm.previewIsOwed'
                  : balance.amountMinor < 0
                    ? 'expenseForm.previewOwesBalance'
                    : 'expenseForm.previewEven', {
                  name: displayName.get(balance.partyId) ?? balance.partyId,
                })}
              </span>
              <strong className={`shrink-0 ${balance.amountMinor < 0 ? 'text-destructive' : 'text-primary'}`}>
                {formatExpenseMinor(Math.abs(balance.amountMinor), expense.currency)}
              </strong>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">{t('expenseForm.previewSettlement')}</h2>
        {settlement.length > 0 ? (
          <div className="divide-y divide-border border-y border-border">
            {settlement.map((transfer) => (
              <div key={`${transfer.fromPartyId}:${transfer.toPartyId}`} className="grid min-h-11 items-center gap-1 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                <span>{t('expenseForm.previewOwes', {
                  from: displayName.get(transfer.fromPartyId) ?? transfer.fromPartyId,
                  to: displayName.get(transfer.toPartyId) ?? transfer.toPartyId,
                })}</span>
                <strong className="shrink-0">{formatExpenseMinor(transfer.amountMinor, expense.currency)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="border-y border-border py-4 text-sm text-muted-foreground">
            {t('expenseForm.previewSettled')}
          </p>
        )}
      </section>

      <Link
        href={`/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}`}
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {t('expense.openGroup')}
      </Link>

      {canEdit || canCancel ? (
        <ExpenseItemActions expenseId={expense.id} canEdit={canEdit} canCancel={canCancel} />
      ) : null}
    </div>
  )
}
