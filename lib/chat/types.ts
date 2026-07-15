export type ChatDomain = 'weather'
export type ChatTargetType = 'vedurstofan_station'
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
}

export interface CreateMessageInput {
  body: string
  messageKind: ChatMessageKind
}

export interface ReportMessageInput {
  reason: string
  body?: string
}
