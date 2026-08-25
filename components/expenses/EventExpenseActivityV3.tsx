'use client'

import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { EventExpenseActivityV3View } from '@/lib/events/contracts'
import { EXPENSE_PAY_ALL_PATH } from '@/lib/events/contracts'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { useExpenseTranslations } from './i18n.client'
import { expensePrimaryButtonClass, expenseSecondaryButtonClass } from './ui'

export function EventExpenseActivityV3({
  view,
  canSettle,
}: {
  view: EventExpenseActivityV3View
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
    <section className="min-w-0 space-y-4 border-y border-border py-5" aria-labelledby="event-expense-activity-v3-title">
      <h2 id="event-expense-activity-v3-title" className="text-base font-semibold">
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
            <li key={expense.detailHref ?? `${expense.currency}:${expenseIndex}`}>
              {expense.detailHref ? (
                <Link
                  href={expense.detailHref}
                  className="grid min-h-12 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-3 transition-colors hover:bg-muted/50 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <h3 className="min-w-0 break-words text-sm font-semibold">{expense.title}</h3>
                  <strong className="shrink-0 text-right text-sm">
                    {formatExpenseMinor(expense.totalMinor, expense.currency, locale)}
                  </strong>
                  <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
                </Link>
              ) : (
                <div className="grid min-h-12 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
                  <h3 className="min-w-0 break-words text-sm font-semibold">{expense.title}</h3>
                  <strong className="shrink-0 text-right text-sm">
                    {formatExpenseMinor(expense.totalMinor, expense.currency, locale)}
                  </strong>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {hasPositions ? (
        <section aria-labelledby="event-expense-position-v3-title" className="space-y-2">
          <h3 id="event-expense-position-v3-title" className="text-sm font-semibold">
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
