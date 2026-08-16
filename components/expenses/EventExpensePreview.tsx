'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { EventExpensePreviewView } from '@/lib/events/contracts'
import { eventSettlementPreviewPath } from '@/lib/events/contracts'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { useExpenseTranslations } from './i18n.client'
import { expenseSecondaryButtonClass } from './ui'

export function EventExpensePreview({
  eventName,
  preview,
  showSettlementLink = false,
  showGlobalSettlementNotice = false,
}: {
  eventName: string
  preview: EventExpensePreviewView
  showSettlementLink?: boolean
  showGlobalSettlementNotice?: boolean
}) {
  const t = useExpenseTranslations()
  const locale = useLocale()
  const router = useRouter()
  const retryingRef = useRef(false)
  const previousPreviewRef = useRef(preview)
  const [isRetrying, setIsRetrying] = useState(false)
  useEffect(() => {
    if (previousPreviewRef.current === preview) return
    previousPreviewRef.current = preview
    retryingRef.current = false
    setIsRetrying(false)
  }, [preview])
  const showLink = showSettlementLink
    && preview.status !== 'unavailable'
    && preview.taggedExpenseCount > 0

  return (
    <section className="space-y-4 border-y border-border py-5" aria-labelledby="event-expense-preview-heading">
      <div className="space-y-1">
        <h2 id="event-expense-preview-heading" className="text-base font-semibold">
          {t('eventPreview.title')}
        </h2>
        <p className="break-words text-sm text-muted-foreground">
          {t('eventPreview.forEvent', { event: eventName })}
        </p>
      </div>

      {preview.status === 'unavailable' ? (
        <div className="space-y-3 rounded-xl bg-amber-50 p-3 text-amber-900">
          <p role="status" className="text-sm leading-6">
            {t('eventPreview.unavailable')}
          </p>
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
            {isRetrying ? t('eventPreview.retrying') : t('eventPreview.retry')}
          </button>
        </div>
      ) : preview.status === 'none_tagged' ? (
        <p className="text-sm leading-6 text-muted-foreground">{t('eventPreview.noneTagged')}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('eventPreview.taggedCount', { count: preview.taggedExpenseCount })}
          </p>
          <div className="divide-y divide-border border-y border-border">
            {preview.currencies.map((currency) => (
              <section key={currency.currency} className="space-y-3 py-4" aria-label={currency.currency}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{currency.currency}</h3>
                  <span className="text-xs font-medium text-muted-foreground">
                    {t(`eventPreview.states.${currency.state}`)}
                  </span>
                </div>

                {currency.transfers.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t('eventPreview.planTitle')}
                    </p>
                    <ul className="space-y-2">
                      {currency.transfers.map((transfer, index) => (
                        <li
                          key={`${transfer.fromPartyId}:${transfer.toPartyId}:${index}`}
                          className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-sm"
                        >
                          <span className="min-w-0 break-words">
                            {t('eventPreview.transfer', {
                              from: transfer.fromDisplayName,
                              to: transfer.toDisplayName,
                            })}
                          </span>
                          <span className="shrink-0 font-medium">
                            {formatExpenseMinor(transfer.amountMinor, currency.currency, locale)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {currency.pendingRepaymentCount > 0 ? (
                  <p className="text-sm leading-6 text-amber-900">
                    {t('eventPreview.pendingRepayments', { count: currency.pendingRepaymentCount })}
                  </p>
                ) : null}

                {currency.blocked.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t('eventPreview.blockedTitle')}</p>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {currency.blocked.map((party) => (
                        <li key={party.partyId} className="break-words">
                          {t('eventPreview.blockedParty', { name: party.displayName })}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      )}

      {showLink ? (
        <Link
          href={eventSettlementPreviewPath(preview.eventId)}
          className={`${expenseSecondaryButtonClass} w-full`}
        >
          {t('eventPreview.settlementLink')}
        </Link>
      ) : null}

      {showGlobalSettlementNotice ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {t('eventPreview.globalSettlementNotice')}
        </p>
      ) : null}
    </section>
  )
}
