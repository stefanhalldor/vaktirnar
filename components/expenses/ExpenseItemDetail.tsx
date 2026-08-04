import Link from 'next/link'
import type { ExpenseGroupView, ExpenseItemView } from '@/lib/expenses/contracts'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { getExpenseTranslations } from './i18n.server'
import { ExpenseItemActions } from './ExpenseItemActions'

export async function ExpenseItemDetail({
  group,
  expense,
}: {
  group: ExpenseGroupView
  expense: ExpenseItemView
}) {
  const t = await getExpenseTranslations()
  const canCancel = expense.status === 'active'
    && group.status === 'active'
    && (expense.createdBySelf || group.canManage)

  return (
    <div className="space-y-8">
      <section className="space-y-3 border-y border-border py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{expense.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{expense.incurredOn}</p>
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

      <Link
        href={`/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}`}
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {t('expense.openGroup')}
      </Link>

      {canCancel ? <ExpenseItemActions expenseId={expense.id} /> : null}
    </div>
  )
}
