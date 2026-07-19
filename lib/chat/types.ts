export type ChatDomain = 'weather'
export type ChatTargetType = 'vedurstofan_station' | 'vegagerdin_station'
export type ChatMessageKind = 'chat' | 'field_report' | 'measurement_report' | 'system'

/** The stable target a chat thread is scoped to. */
export interface ChatThreadTarget {
  domain: ChatDomain
  targetType: ChatTargetType
  targetId: string
  provider?: string
  targetName: string
  lat?: number | null
  lon?: number | null
}

/** Full thread row — internal use only. */
export interface ChatThread {
  id: string
  domain: ChatDomain
  targetType: ChatTargetType
  targetId: string
  provider: string | null
  targetName: string
  lat: number | null
  lon: number | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  lastMessageAt: string | null
  messageCount: number
  isArchived: boolean
}

/**
 * Thread DTO returned to clients.
 * No user emails, no private data, no route metadata.
 */
export interface ThreadDto {
  id: string
  domain: ChatDomain
  targetType: ChatTargetType
  targetId: string
  targetName: string
  lat: number | null
  lon: number | null
  lastMessageAt: string | null
  messageCount: number
}

/**
 * Lightweight summary for station cards and route summaries.
 * Used for "X with new pulse" affordances without loading full thread.
 */
export interface ThreadSummaryDto {
  threadId: string
  targetId: string
  messageCount: number
  lastMessageAt: string | null
  /** Unread count for the requesting user. 0 if userId not provided. */
  unreadCount: number
  hasUnread: boolean
}

/**
 * Message DTO returned to clients.
 * body is empty string if message is deleted or hidden.
 * userId is never included — no email exposed.
 */
export interface MessageDto {
  id: string
  threadId: string
  body: string
  messageKind: ChatMessageKind
  createdAt: string
  isDeleted: boolean
  isHidden: boolean
  authorName: string | null
}

/**
 * Message DTO for the aggregated cross-thread feed.
 * Includes target metadata from the thread so the UI can show which station
 * each message came from without a second request.
 */
export interface FeedMessageDto {
  id: string
  threadId: string
  body: string
  messageKind: ChatMessageKind
  createdAt: string
  isDeleted: boolean
  isHidden: boolean
  authorName: string | null
  target: {
    domain: ChatDomain
    targetType: ChatTargetType
    targetId: string
    targetName: string
    provider: string | null
  }
}

/**
 * The stable target identity carried by a conditions feed item.
 * Used as callback argument so callers don't have to reconstruct target info.
 */
export interface ConditionFeedTarget {
  targetType: ChatTargetType
  targetId: string
  targetName: string
  provider: string | null
}

/**
 * Preview DTO for the public conditions feed.
 * One entry per target (station or future context) — only the latest visible message.
 * Safe for public consumption: no user IDs, no emails.
 */
export interface ConditionFeedPreviewItemDto extends ConditionFeedTarget {
  latestMessage: MessageDto
  latestAt: string
}


export interface CreateMessageInput {
  body: string
  messageKind: ChatMessageKind
}

export interface ReportMessageInput {
  reason: string
  body?: string
}
