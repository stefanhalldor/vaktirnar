'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, RefreshCw } from 'lucide-react'

import type { ExpenseContextDraftListView } from '@/lib/expenses/unconfirmed-publication'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { useExpenseTranslations } from './i18n.client'

function formatDraftDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

export function ExpenseContextDraftList({
  view,
  locale,
}: {
  view: ExpenseContextDraftListView
  locale: string
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const [retryPending, setRetryPending] = useState(false)

  if (view.status === 'ready' && view.items.length === 0) return null

  return (
    <section className="space-y-3" aria-labelledby="expense-context-drafts-title">
      <div>
        <h2 id="expense-context-drafts-title" className="text-base font-semibold">
          {t('contextDrafts.heading')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('contextDrafts.helper')}</p>
      </div>

      {view.status === 'unavailable' ? (
        <div className="border-y border-border py-4">
          <p className="text-sm text-muted-foreground">{t('contextDrafts.unavailable')}</p>
          <button
            type="button"
            disabled={retryPending}
            className="mt-3 inline-flex min-h-10 min-w-32 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
            onClick={() => {
              if (retryPending) return
              setRetryPending(true)
              router.refresh()
            }}
          >
            <RefreshCw aria-hidden size={16} className={retryPending ? 'animate-spin' : undefined} />
            {t(retryPending ? 'contextDrafts.retrying' : 'contextDrafts.retry')}
          </button>
          <span className="sr-only" role="status" aria-live="polite">
            {retryPending ? t('contextDrafts.retrying') : ''}
          </span>
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {view.items.map((item, index) => {
            const content = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold">{item.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t(`contextDrafts.lifecycle.${item.lifecycleState}`)}
                  </span>
                  <span className="mt-1 block text-sm">
                    {formatExpenseMinor(item.totalMinor, item.currency, locale)}
                    {' · '}
                    {formatDraftDate(item.incurredOn, locale)}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t(`contextDrafts.allocation.${item.allocationState}`)}
                  </span>
                </span>
                {item.detailHref ? (
                  <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
                ) : null}
              </>
            )
            return item.detailHref ? (
              <Link
                key={`${item.lifecycleState}-${item.detailHref}`}
                href={item.detailHref}
                className="flex min-h-14 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {content}
              </Link>
            ) : (
              <div
                key={`${item.lifecycleState}-${item.title}-${item.incurredOn}-${index}`}
                className="flex min-h-14 items-center gap-3 py-3"
              >
                {content}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
