'use client'

import { useState } from 'react'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import type { LoanItem } from '@/lib/loans/types'
import {
  RECENT_READ_COOKIE,
  parseRecentReadCookie,
  serializeRecentReadKeys,
  writeRecentReadCookie,
} from '@/lib/loans/recent-read'

export interface RecentRow {
  loan: LoanItem
  key: string
}

function isOverdue(item: LoanItem): boolean {
  if (!item.due_at || item.returned_at) return false
  return item.due_at < new Date().toISOString().slice(0, 10)
}

function formatDate(dateStr: string, displayLocale: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(displayLocale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export interface RecentLabels {
  recent: string
  markRead: string
  done: string
  noRecent: string
  lent: string
  borrowed: string
  overdue: string
}

interface Props {
  rows: RecentRow[]
  initialRead: boolean
  displayLocale: string
  labels: RecentLabels
}

export function RecentSection({ rows, initialRead, displayLocale, labels }: Props) {
  const [isRead, setIsRead] = useState(initialRead)

  function handleMarkRead() {
    setIsRead(true)
    const currentValue =
      document.cookie
        .split(';')
        .find((c) => c.trim().startsWith(RECENT_READ_COOKIE + '='))
        ?.split('=')
        .slice(1)
        .join('=')
        .trim() ?? null
    const existing = parseRecentReadCookie(currentValue)
    const newKeys = rows.map((r) => r.key)
    writeRecentReadCookie(serializeRecentReadKeys(existing, newKeys))
  }

  if (rows.length === 0) {
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

  if (isRead) {
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
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-muted-foreground">{labels.recent}</h2>
        <button
          type="button"
          onClick={handleMarkRead}
          className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          {labels.markRead}
        </button>
      </div>
      <div className="flex flex-col divide-y divide-border bg-card border border-border rounded-xl overflow-hidden">
        {rows.map(({ loan: item }) => {
          const overdue = isOverdue(item)
          return (
            <div key={item.id} className="flex items-center gap-3 px-4 min-h-[48px]">
              <div className="flex-1 min-w-0 py-3">
                <p
                  className={`text-sm font-medium leading-tight truncate ${
                    item.returned_at ? 'text-muted-foreground line-through' : 'text-foreground'
                  }`}
                >
                  {item.item_name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.my_role === 'lender' ? labels.lent : labels.borrowed}
                  {item.other_display_name ? ` · ${item.other_display_name}` : ''}
                </p>
              </div>
              <div className="shrink-0 py-3">
                {overdue ? (
                  <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                    <AlertTriangle size={12} aria-hidden />
                    {labels.overdue}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {formatDate(item.loaned_at, displayLocale)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
