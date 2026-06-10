'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, X } from 'lucide-react'
import type { RecentEventDisplay } from '@/lib/recent-events/types'
import { ackRecentEvents } from './actions'

export interface RecentLabels {
  recent: string
  markAllRead: string
  markOneRead: string
  done: string
  noRecent: string
  viewItem: string
  closeDrawer: string
}

interface Props {
  rows: RecentEventDisplay[]
  displayLocale: string
  labels: RecentLabels
}

export function RecentSection({ rows, labels }: Props) {
  const router = useRouter()
  const [ackedIds, setAckedIds] = useState<Set<number>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [drawerEvent, setDrawerEvent] = useState<RecentEventDisplay | null>(null)

  const displayedRows = rows.filter((r) => !ackedIds.has(r.id))

  function handleMarkAll() {
    const allIds = rows.map((r) => r.id)
    setAckedIds(new Set(allIds))
    startTransition(async () => {
      const result = await ackRecentEvents({ event_ids: allIds })
      if (result.ok) {
        router.refresh()
      } else {
        setAckedIds(new Set())
      }
    })
  }

  function handleMarkOne(event: RecentEventDisplay) {
    setAckedIds((prev) => new Set([...prev, event.id]))
    setDrawerEvent(null)
    startTransition(async () => {
      const result = await ackRecentEvents({ event_ids: [event.id] })
      if (result.ok) {
        router.refresh()
      } else {
        setAckedIds((prev) => {
          const next = new Set(prev)
          next.delete(event.id)
          return next
        })
      }
    })
  }

  if (displayedRows.length === 0) {
    return (
      <section>
        <div
          role="status"
          className="flex items-center gap-3 py-5 px-4 bg-card border border-border rounded-xl"
        >
          <CheckCircle2 size={20} className="text-primary shrink-0" aria-hidden />
          <p className="text-sm font-medium text-foreground">{labels.done}</p>
        </div>
      </section>
    )
  }

  return (
    <>
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground">{labels.recent}</h2>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={isPending}
            className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
          >
            {labels.markAllRead}
          </button>
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div
            data-testid="recent-list"
            className={`flex flex-col divide-y divide-border${displayedRows.length > 5 ? ' max-h-72 overflow-y-auto' : ''}`}
          >
            {displayedRows.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => setDrawerEvent(event)}
                className="w-full flex items-center px-4 min-h-[48px] hover:bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset text-left"
              >
                <p className="text-sm font-medium text-foreground py-3 truncate">{event.label}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {drawerEvent && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex flex-col justify-end"
          onClick={() => setDrawerEvent(null)}
        >
          <div
            data-testid="recent-drawer"
            className="bg-card border-t border-border rounded-t-2xl px-4 pt-4 pb-8 flex flex-col gap-4 max-w-lg mx-auto w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-base font-medium text-foreground">{drawerEvent.label}</p>
                {drawerEvent.detailLines?.map((line, i) => (
                  <p key={i} className="text-sm text-muted-foreground break-words">{line}</p>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setDrawerEvent(null)}
                aria-label={labels.closeDrawer}
                className="shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
              >
                <X size={20} aria-hidden />
              </button>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleMarkOne(drawerEvent)}
                disabled={isPending}
                className="flex-1 inline-flex items-center justify-center h-10 px-4 rounded-xl border border-border bg-card text-sm font-medium text-foreground hover:bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {labels.markOneRead}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
