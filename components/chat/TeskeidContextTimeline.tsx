import type { ReactNode } from 'react'

export type TeskeidContextTimelineOrder = 'ascending' | 'descending'

export interface TeskeidContextTimelineEvent {
  id: string
  createdAt: string
  content: ReactNode
}

export const teskeidContextTimelineItemClass = 'border-b border-border py-3 first:pt-0'

export function sortTeskeidContextTimelineEvents(
  events: readonly TeskeidContextTimelineEvent[],
  order: TeskeidContextTimelineOrder = 'ascending',
): TeskeidContextTimelineEvent[] {
  const direction = order === 'ascending' ? 1 : -1
  return [...events].sort((left, right) => {
    const byTime = left.createdAt.localeCompare(right.createdAt)
    return byTime !== 0 ? direction * byTime : direction * left.id.localeCompare(right.id)
  })
}

export function TeskeidContextEventList({
  events,
  order = 'ascending',
  emptyLabel,
}: {
  events: readonly TeskeidContextTimelineEvent[]
  order?: TeskeidContextTimelineOrder
  emptyLabel?: string
}) {
  if (events.length === 0) {
    return emptyLabel ? <p className="text-sm text-muted-foreground">{emptyLabel}</p> : null
  }

  return (
    <div>
      {sortTeskeidContextTimelineEvents(events, order).map((event) => (
        <div key={event.id} className={teskeidContextTimelineItemClass}>
          {event.content}
        </div>
      ))}
    </div>
  )
}

/**
 * Shared visual shell for a Teskeið context's system history and conversation.
 * Domain adapters provide the event stream and the generic chat panel.
 */
export function TeskeidContextTimeline({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby="teskeid-context-timeline-title" className="space-y-4 rounded-xl bg-muted/60 p-4">
      <h2 id="teskeid-context-timeline-title" className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  )
}
