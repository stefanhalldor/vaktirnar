'use client'

import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react'
import type {
  BookkeepingPeriodReadiness,
  BookkeepingReadinessBlocker,
  BookkeepingReadinessBlockerCode,
} from '@/lib/bookkeeping/readiness'
import { useBookkeepingTranslations } from './i18n.client'
import { bookkeepingSectionClass } from './ui'

function groupedBlockers(blockers: readonly BookkeepingReadinessBlocker[]) {
  const groups = new Map<BookkeepingReadinessBlockerCode, BookkeepingReadinessBlocker[]>()
  for (const blocker of blockers) {
    groups.set(blocker.code, [...(groups.get(blocker.code) ?? []), blocker])
  }
  return [...groups.entries()]
}

export function BookkeepingReadinessPanel({
  readiness,
  onSelectEntry,
}: {
  readiness: BookkeepingPeriodReadiness
  onSelectEntry?: (entryId: string) => void
}) {
  const t = useBookkeepingTranslations()

  return (
    <section className={`${bookkeepingSectionClass} space-y-3`} aria-labelledby="bookkeeping-readiness-title">
      <div className="flex items-start gap-3">
        {readiness.isReady ? (
          <CheckCircle2 aria-hidden size={20} className="mt-0.5 shrink-0 text-emerald-700" />
        ) : (
          <AlertTriangle aria-hidden size={20} className="mt-0.5 shrink-0 text-amber-700" />
        )}
        <div>
          <h2 id="bookkeeping-readiness-title" className="text-sm font-semibold">
            {t('readiness.title')}
          </h2>
          <p className={`mt-1 text-sm ${readiness.isReady ? 'text-emerald-800' : 'text-amber-900'}`}>
            {t(readiness.isReady ? 'readiness.ready' : 'readiness.notReady')}
          </p>
        </div>
      </div>

      {!readiness.isReady ? (
        <ul className="divide-y divide-border border-y border-border">
          {groupedBlockers(readiness.blockers).map(([code, items]) => {
            const entryId = items.find((item) => item.entryId)?.entryId
            const content = (
              <>
                <span className="min-w-0 flex-1 text-sm leading-5">{t(`readiness.${code}`)}</span>
                {items.length > 1 ? <span className="shrink-0 text-xs text-muted-foreground">×{items.length}</span> : null}
                {entryId && onSelectEntry ? <ChevronRight aria-hidden size={16} className="shrink-0 text-muted-foreground" /> : null}
              </>
            )
            return (
              <li key={code}>
                {entryId && onSelectEntry ? (
                  <button
                    type="button"
                    onClick={() => onSelectEntry(entryId)}
                    className="flex min-h-11 w-full items-center gap-2 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex min-h-11 items-center gap-2 py-2.5">{content}</div>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
