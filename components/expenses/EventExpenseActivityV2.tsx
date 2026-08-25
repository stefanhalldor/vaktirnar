'use client'

import Link from 'next/link'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { EventExpenseActivityV2View } from '@/lib/events/contracts'
import { EXPENSE_PAY_ALL_PATH } from '@/lib/events/contracts'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { useExpenseTranslations } from './i18n.client'
import { expensePrimaryButtonClass, expenseSecondaryButtonClass } from './ui'

export function EventExpenseActivityV2({
  view,
  canSettle,
}: {
  view: EventExpenseActivityV2View
  canSettle: boolean
}) {
  const t = useExpenseTranslations()
  const locale = useLocale()
  const router = useRouter()
  const retryingRef = useRef(false)
  const previousViewRef = useRef(view)
  const [isRetrying, setIsRetrying] = useState(false)
  useEffect(() => {
    if (previousViewRef.current === view) return
    previousViewRef.current = view
    retryingRef.current = false
    setIsRetrying(false)
  }, [view])

  if (view.status === 'none') return null
  const hasPositions = view.status === 'ready' && view.positions.length > 0

  return (
    <section className="min-w-0 space-y-4 border-y border-border py-5" aria-labelledby="event-expense-activity-v2-title">
      <h2 id="event-expense-activity-v2-title" className="text-base font-semibold">
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
        <ul className="divide-y divide-border border-y border-border">
          {view.expenses.map((expense, expenseIndex) => (
            <li
              key={`${expense.currency}:${expenseIndex}`}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-4"
            >
              <h3 className="min-w-0 break-words text-sm font-semibold">{expense.title}</h3>
              <strong className="shrink-0 text-right text-sm">
                {formatExpenseMinor(expense.totalMinor, expense.currency, locale)}
              </strong>
            </li>
          ))}
        </ul>
      )}

      {hasPositions ? (
        <section aria-labelledby="event-expense-position-v2-title" className="space-y-2">
          <h3 id="event-expense-position-v2-title" className="text-sm font-semibold">
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
      ) : null}

      {canSettle && hasPositions ? (
        <Link href={EXPENSE_PAY_ALL_PATH} className={`${expensePrimaryButtonClass} w-full`}>
          {t('eventActivity.settleAll')}
        </Link>
      ) : null}
    </section>
  )
}
