'use client'

import Link from 'next/link'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import type { EventExpenseActivityView } from '@/lib/events/contracts'
import { EXPENSE_PAY_ALL_PATH } from '@/lib/events/contracts'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { useExpenseTranslations } from './i18n.client'
import { expensePrimaryButtonClass, expenseSecondaryButtonClass } from './ui'

export function EventExpenseActivity({ view }: { view: EventExpenseActivityView }) {
  const t = useExpenseTranslations()
  const locale = useLocale()
  const router = useRouter()
  const retryingRef = useRef(false)
  const [isRetrying, setIsRetrying] = useState(false)

  if (view.status === 'none') return null

  return (
    <section className="min-w-0 space-y-4 border-y border-border py-5" aria-labelledby="event-expense-activity-title">
      <h2 id="event-expense-activity-title" className="text-base font-semibold">
        {t('eventActivity.title')}
      </h2>

      {view.status === 'unavailable' ? (
        <div className="space-y-3 rounded-xl bg-amber-50 p-3 text-amber-950">
          <p role="status" className="text-sm leading-6">{t('eventActivity.unavailable')}</p>
          <button
            type="button"
            className={`${expenseSecondaryButtonClass} w-full`}
            disabled={isRetrying}
            onClick={() => {
              if (retryingRef.current) return
              retryingRef.current = true
              setIsRetrying(true)
              router.refresh()
            }}
          >
            {isRetrying ? t('eventActivity.retrying') : t('eventActivity.retry')}
          </button>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border border-y border-border">
            {view.expenses.map((expense, expenseIndex) => (
              <li key={`${expense.currency}:${expenseIndex}`} className="min-w-0 space-y-3 py-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold">{expense.title}</h3>
                    {expense.description ? (
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                        {expense.description}
                      </p>
                    ) : null}
                  </div>
                  <strong className="shrink-0 text-right text-sm">
                    {formatExpenseMinor(expense.totalMinor, expense.currency, locale)}
                  </strong>
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    {t(expense.payers.length === 1
                      ? 'eventActivity.payer'
                      : 'eventActivity.payers')}
                  </p>
                  <ul className="divide-y divide-border/70">
                    {expense.payers.map((payer, payerIndex) => (
                      <li
                        key={payerIndex}
                        className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 text-sm"
                      >
                        <span className="min-w-0 break-words">
                          {payer.displayName ?? t('eventActivity.genericPayer')}
                        </span>
                        <span className="shrink-0 font-medium">
                          {formatExpenseMinor(payer.amountMinor, expense.currency, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>

          <section aria-labelledby="event-expense-position-title" className="space-y-2">
            <h3 id="event-expense-position-title" className="text-sm font-semibold">
              {t('eventActivity.yourPosition')}
            </h3>
            <div className="divide-y divide-border border-y border-border">
              {view.positions.map((position) => (
                <p key={position.currency} className="min-h-12 py-3 text-sm leading-6">
                  {position.state === 'pending'
                    ? t('eventActivity.positionPending', { currency: position.currency })
                    : position.state === 'zero'
                      ? t('eventActivity.positionZero', { currency: position.currency })
                      : t(
                        position.state === 'owes'
                          ? 'eventActivity.positionOwes'
                          : 'eventActivity.positionOwed',
                        {
                          amount: formatExpenseMinor(position.amountMinor, position.currency, locale),
                        },
                      )}
                </p>
              ))}
            </div>
          </section>
        </>
      )}

      <Link href={EXPENSE_PAY_ALL_PATH} className={`${expensePrimaryButtonClass} w-full`}>
        {t('eventActivity.settleAll')}
      </Link>
    </section>
  )
}
