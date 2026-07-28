import type { MessageDto } from '@/lib/chat/types'

export const AGENT_COLLABORATION_MODE = 'read_only_reply' as const

export type AgentCollaborationMode = typeof AGENT_COLLABORATION_MODE
export type AgentActorType = 'user' | 'agent' | 'system'
export type AgentConnectorStatus = 'active' | 'revoked'
export type AgentRunStatus = 'queued' | 'working' | 'completed' | 'failed'

export interface AgentConversationDto {
  id: string
  title: string
}

export interface AgentConnectorDto {
  id: string
  providerKey: string
  displayName: string
  status: AgentConnectorStatus
  lastSeenAt: string | null
  tokenExpiresAt: string
}

export interface AgentBootstrapDto {
  conversation: AgentConversationDto
  connectors: AgentConnectorDto[]
  unreadCount: number
  latestRun: {
    id: string
    status: AgentRunStatus
    failureCategory: string | null
  } | null
}

export interface AgentStoredMessageDto {
  id: string
  conversationId: string
  body: string
  actorType: AgentActorType
  authorName: string | null
  createdAt: string
}

/**
 * The generic chat panel still consumes the weather-era MessageDto shape.
 * Keep that presentation mapping at the HTTP boundary so the new persistence
 * model never pretends that an agent is an auth.users row.
 */
export function toScopedChatMessage(message: AgentStoredMessageDto): MessageDto {
  return {
    id: message.id,
    threadId: message.conversationId,
    body: message.body,
    messageKind: 'chat',
    createdAt: message.createdAt,
    isDeleted: false,
    isHidden: false,
    authorName: message.authorName,
  }
}

export interface AgentClaimedRunDto {
  id: string
  leaseId: string
  conversationId: string
  prompt: string
  mode: AgentCollaborationMode
  createdAt: string
  agentSessionId: string | null
}

export interface AgentPairingExchangeDto {
  connectorId: string
  providerKey: string
  displayName: string
  tokenExpiresAt: string
}

export interface AgentRunReceiptDto {
  ok: true
  messageId?: string
}
