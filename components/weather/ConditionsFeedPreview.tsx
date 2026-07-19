'use client'

import { useState } from 'react'
import { useLocale } from 'next-intl'
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import { ChatMessageRow } from '@/components/chat/ChatMessageRow'
import type { ChatMessageKind, ConditionFeedTarget, ConditionFeedPreviewItemDto } from '@/lib/chat/types'

export interface ConditionsFeedPreviewProps {
  /** Title shown above the feed rows. If empty or omitted, the title row is hidden. */
  title?: string
  items: ConditionFeedPreviewItemDto[]
  loading?: boolean
  emptyLabel?: string
  /**
   * 'hide'    — render nothing when no items and not loading (default for public overview).
   * 'message' — show emptyLabel when no items (default).
   */
  emptyBehavior?: 'hide' | 'message'
  /** Called when user clicks a target name. Names are buttons when this is set. */
  onSelectTarget?: (target: ConditionFeedTarget) => void
  /**
   * Returns the href for the "view more" link beneath each target's message.
   * If absent, no view-more link is rendered.
   */
  targetHref?: (target: ConditionFeedTarget) => string
  /** Label for the "view more" link. Required when targetHref is set. */
  viewMoreLabel?: string
  deletedLabel: string
  kindLabels?: Partial<Record<ChatMessageKind, string>>
  /**
   * When true, renders as a collapsible drawer (toggle button header + body).
   * emptyBehavior='hide' + empty → still returns null (no empty drawer shell).
   */
  collapsible?: boolean
  /** Initial open state when collapsible=true. Defaults to true. */
  defaultOpen?: boolean
  /**
   * Number of items that arrived after the user last acknowledged the feed.
   * Shown as a badge in the collapsed header when drawer is closed.
   * Cleared by calling acknowledgeCurrentItems (passed via onOpen).
   */
  newSinceOpenCount?: number
  /** Pre-formatted label for the new-since-open badge (e.g. "3 ný síðan þú opnaðir síðuna"). */
  newSinceOpenLabel?: string
  /**
   * Called when the collapsible drawer is opened.
   * Use this to call acknowledgeCurrentItems from the parent hook.
   */
  onOpen?: () => void
  /**
   * Called whenever the collapsible drawer toggles, with the new open state.
   * Use this to track open state in the parent when `isOpen` must be passed
   * to `useFeedLoader` / `useConditionsFeedPreview` for auto-ack while open.
   */
  onToggle?: (isOpen: boolean) => void
}

export function ConditionsFeedPreview({
  title,
  items,
  loading = false,
  emptyLabel,
  emptyBehavior = 'message',
  onSelectTarget,
  targetHref,
  viewMoreLabel,
  deletedLabel,
  kindLabels,
  collapsible = false,
  defaultOpen = true,
  newSinceOpenCount = 0,
  newSinceOpenLabel,
  onOpen,
  onToggle,
}: ConditionsFeedPreviewProps) {
  const locale = useLocale()
  const [open, setOpen] = useState(defaultOpen)

  // For 'hide': suppress entirely when no items (including during loading — avoids layout shift).
  if (items.length === 0 && emptyBehavior === 'hide') return null

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next) onOpen?.()
    onToggle?.(next)
  }

  // Badge shows whenever drawer is closed and there are unacknowledged new items.
  const showBadge = !open && newSinceOpenCount > 0 && !!newSinceOpenLabel

  const feedContent = loading ? null : items.length === 0 ? (
    emptyLabel ? <p className="text-xs text-muted-foreground">{emptyLabel}</p> : null
  ) : (
    <div className="flex flex-col divide-y divide-border/60">
      {items.map(item => (
        <div key={`${item.targetType}:${item.targetId}`} className="py-2.5 first:pt-0 last:pb-0">
          {onSelectTarget ? (
            <button
              type="button"
              onClick={() => onSelectTarget(item)}
              className="mb-1 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors text-left"
            >
              {item.targetName}
            </button>
          ) : (
            <p className="mb-1 text-sm font-medium text-foreground">{item.targetName}</p>
          )}
          <div className="border-l border-border/60 pl-3">
            <ChatMessageRow
              msg={item.latestMessage}
              deletedLabel={deletedLabel}
              kindLabels={kindLabels}
              locale={locale}
            />
            {targetHref && viewMoreLabel && (
              <a
                href={targetHref(item)}
                className="mt-1 block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {viewMoreLabel}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  )

  if (collapsible) {
    return (
      <div className="border border-border rounded-xl px-3 py-3 flex flex-col gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={handleToggle}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="flex items-center gap-1.5 text-sm font-medium min-w-0">
            <MessageSquare className="w-4 h-4 shrink-0" aria-hidden />
            <span className="truncate">{title}</span>
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {showBadge && (
              <span className="text-[10px] font-semibold text-muted-foreground">
                {newSinceOpenLabel}
              </span>
            )}
            {open
              ? <ChevronUp size={14} className="text-muted-foreground" aria-hidden />
              : <ChevronDown size={14} className="text-muted-foreground" aria-hidden />
            }
          </span>
        </button>
        {open && feedContent}
      </div>
    )
  }

  return (
    <div className="border border-border rounded-xl px-3 py-3 flex flex-col gap-2">
      {title && (
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <MessageSquare className="w-4 h-4 shrink-0" aria-hidden />
          <span>{title}</span>
        </div>
      )}
      {feedContent}
    </div>
  )
}
