'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { ackAllRecentEvents, ackRecentEvents } from '@/app/auth-mvp/heim/actions'
import type { RecentEventDisplay, RecentEventSource } from '@/lib/recent-events/types'
import { RECENT_EVENTS_CHANGED_EVENT } from '@/lib/recent-events/launcher'

export interface RecentLabels {
  recent: string
  markAllRead: string
  markOneRead: string
  viewItem: string
  closeDrawer: string
}

interface Props {
  rows: RecentEventDisplay[]
  labels: RecentLabels
  source?: RecentEventSource
  className?: string
}

function announceRead(sources: readonly RecentEventSource[], all: boolean) {
  window.dispatchEvent(new CustomEvent(RECENT_EVENTS_CHANGED_EVENT, { detail: { sources, all } }))
}

export function RecentEventsSection({ rows, labels, source, className }: Props) {
  const router = useRouter()
  const [ackedIds, setAckedIds] = useState<Set<number>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [drawerEvent, setDrawerEvent] = useState<RecentEventDisplay | null>(null)
  const displayedRows = rows.filter((row) => !ackedIds.has(row.id))

  function handleMarkAll() {
    setAckedIds(new Set(rows.map((row) => row.id)))
    startTransition(async () => {
      const result = await ackAllRecentEvents(source)
      if (result.ok) {
        announceRead(source ? [source] : [...new Set(rows.map((row) => row.source))], true)
        router.refresh()
      } else {
        setAckedIds(new Set())
      }
    })
  }

  function handleMarkOne(event: RecentEventDisplay) {
    setAckedIds((previous) => new Set([...previous, event.id]))
    setDrawerEvent(null)
    startTransition(async () => {
      const result = await ackRecentEvents({ event_ids: [event.id] })
      if (result.ok) {
        announceRead([event.source], false)
        router.refresh()
      } else {
        setAckedIds((previous) => {
          const next = new Set(previous)
          next.delete(event.id)
          return next
        })
      }
    })
  }

  if (displayedRows.length === 0) return null

  return (
    <>
      <section className={className}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">{labels.recent}</h2>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={isPending}
            className="min-h-10 rounded-lg px-2 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
          >
            {labels.markAllRead}
          </button>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div
            data-testid="recent-list"
            className={`flex flex-col divide-y divide-border${displayedRows.length > 5 ? ' max-h-72 overflow-y-auto' : ''}`}
          >
            {displayedRows.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => setDrawerEvent(event)}
                className="flex min-h-12 w-full items-center px-4 text-left transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <div className="flex min-w-0 flex-col py-3">
                  <p className="truncate text-sm font-medium text-foreground">{event.label}</p>
                  {event.occurredAtLabel ? (
                    <p className="truncate text-xs text-muted-foreground">{event.occurredAtLabel}</p>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {drawerEvent ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={() => setDrawerEvent(null)}>
          <div
            data-testid="recent-drawer"
            className="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-t-2xl border-t border-border bg-card px-4 pb-8 pt-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="break-words text-base font-medium text-foreground">{drawerEvent.label}</p>
                {drawerEvent.occurredAtLabel ? <p className="text-xs text-muted-foreground">{drawerEvent.occurredAtLabel}</p> : null}
                {drawerEvent.detailLines?.map((line, index) => (
                  <p key={index} className="break-words text-sm text-muted-foreground">{line}</p>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setDrawerEvent(null)}
                aria-label={labels.closeDrawer}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={20} aria-hidden />
              </button>
            </div>
            <div className="flex gap-3">
              {drawerEvent.viewHref && !drawerEvent.isDeleted ? (
                <Link
                  href={drawerEvent.viewHref}
                  onClick={() => {
                    setAckedIds((previous) => new Set([...previous, drawerEvent.id]))
                    announceRead([drawerEvent.source], false)
                    void ackRecentEvents({ event_ids: [drawerEvent.id] })
                  }}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {labels.viewItem}
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => handleMarkOne(drawerEvent)}
                disabled={isPending}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {labels.markOneRead}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
