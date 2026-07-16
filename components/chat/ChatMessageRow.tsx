'use client'

import type { ChatMessageKind, MessageDto } from '@/lib/chat/types'
import { formatChatTimestamp } from '@/lib/chat/format'

export type AugmentedChatMessage = MessageDto & { optimistic?: boolean; failed?: boolean }

interface ChatMessageRowProps {
  msg: AugmentedChatMessage
  deletedLabel: string
  kindLabels?: Partial<Record<ChatMessageKind, string>>
  /** Optional label shown before the timestamp — used in feed view to identify source. */
  targetName?: string
  locale: string
}

/**
 * Generic message row for teskeid_chat_messages-backed surfaces.
 * Handles deleted/hidden redaction, kind badges, optimistic/failed state.
 * Used in both per-thread panels and the cross-thread aggregated feed.
 */
export function ChatMessageRow({ msg, deletedLabel, kindLabels, targetName, locale }: ChatMessageRowProps) {
  const isRedacted = msg.isDeleted || msg.isHidden
  return (
    <div
      className={`flex flex-col gap-0.5 ${
        msg.optimistic ? 'opacity-60' : msg.failed ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        {targetName && (
          <span className="text-[10px] font-medium text-foreground">{targetName}</span>
        )}
        {msg.authorName && (
          <span className="text-[10px] text-muted-foreground">{msg.authorName}</span>
        )}
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {msg.optimistic ? '...' : formatChatTimestamp(msg.createdAt, locale)}
        </span>
        {msg.messageKind !== 'chat' && kindLabels?.[msg.messageKind] && (
          <span className="text-[9px] px-1 rounded bg-muted text-muted-foreground">
            {kindLabels[msg.messageKind]}
          </span>
        )}
      </div>
      {isRedacted ? (
        <span className="text-xs text-muted-foreground italic">{deletedLabel}</span>
      ) : (
        <span className="text-xs break-words">{msg.body}</span>
      )}
    </div>
  )
}
