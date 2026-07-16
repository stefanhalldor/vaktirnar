'use client'

import type { ChatMessageKind } from '@/lib/chat/types'
import { ChatMessageRow, type AugmentedChatMessage } from './ChatMessageRow'

interface ChatPreviewListProps {
  messages: AugmentedChatMessage[]
  emptyLabel: string
  deletedLabel: string
  kindLabels?: Partial<Record<ChatMessageKind, string>>
  /** Suppresses empty label until first load completes — prevents empty flash during fetch. */
  loaded: boolean
  locale: string
}

/**
 * Read-only preview of the latest N messages in a chat thread.
 * Used in card/summary contexts where the full ScopedChatPanel (with input) is not appropriate.
 */
export function ChatPreviewList({
  messages,
  emptyLabel,
  deletedLabel,
  kindLabels,
  loaded,
  locale,
}: ChatPreviewListProps) {
  if (!loaded) return null
  if (messages.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {messages.map(msg => (
        <ChatMessageRow
          key={msg.id}
          msg={msg}
          deletedLabel={deletedLabel}
          kindLabels={kindLabels}
          locale={locale}
        />
      ))}
    </div>
  )
}
