import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdmin } from '@/lib/supabase/admin'
import type {
  AgentBootstrapDto,
  AgentClaimedRunDto,
  AgentConnectorDto,
  AgentPairingExchangeDto,
  AgentRunReceiptDto,
  AgentStoredMessageDto,
} from './types'

type RpcClient = Pick<SupabaseClient, 'rpc'>

export class AgentCollaborationRepositoryError extends Error {
  constructor(
    public readonly kind: 'not_found' | 'conflict' | 'rate_limited' | 'unauthorized' | 'unavailable',
  ) {
    super(`agent collaboration: ${kind}`)
  }
}

function firstOrSelf(value: unknown): any {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function valueOf(row: any, camel: string, snake: string): any {
  return row?.[camel] ?? row?.[snake]
}

function classifyRpcError(error: any): AgentCollaborationRepositoryError {
  if (error?.code === '23505') return new AgentCollaborationRepositoryError('conflict')
  if (error?.code === 'P0001') {
    if (error.message === 'agent_collaboration_unavailable') {
      return new AgentCollaborationRepositoryError('not_found')
    }
    if (['agent_pairing_unavailable', 'agent_connector_unavailable', 'agent_run_lease_unavailable'].includes(error.message)) {
      return new AgentCollaborationRepositoryError('unauthorized')
    }
    if (['agent_message_idempotency_conflict', 'agent_run_completion_conflict'].includes(error.message)) {
      return new AgentCollaborationRepositoryError('conflict')
    }
    if (['agent_rate_limited', 'agent_run_backlog_full'].includes(error.message)) {
      return new AgentCollaborationRepositoryError('rate_limited')
    }
  }
  if (error?.code === 'P0002' || error?.code === '42501') {
    return new AgentCollaborationRepositoryError('not_found')
  }
  return new AgentCollaborationRepositoryError('unavailable')
}

async function rpc(client: RpcClient, name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(name, args)
  if (error) {
    // Privacy-safe diagnostic: operation and Postgres code only. Never include
    // RPC args, message bodies, pairing values, tokens, or provider output.
    console.error('[agent-collaboration] rpc failed', { operation: name, code: error.code ?? 'unknown' })
    throw classifyRpcError(error)
  }
  return data
}

function mapConnector(row: any): AgentConnectorDto {
  return {
    id: String(row.id),
    providerKey: String(valueOf(row, 'providerKey', 'provider_key') ?? 'unknown'),
    displayName: String(valueOf(row, 'displayName', 'display_name') ?? 'Agent'),
    status: valueOf(row, 'status', 'status') === 'revoked' ? 'revoked' : 'active',
    lastSeenAt: valueOf(row, 'lastSeenAt', 'last_seen_at') ?? null,
    tokenExpiresAt: String(
      valueOf(row, 'tokenExpiresAt', 'token_expires_at')
      ?? row.expiresAt
      ?? row.expires_at
      ?? '',
    ),
  }
}

function mapMessage(row: any): AgentStoredMessageDto {
  return {
    id: String(row.id),
    conversationId: String(valueOf(row, 'conversationId', 'conversation_id')),
    body: String(row.body ?? ''),
    actorType: valueOf(row, 'actorType', 'actor_type'),
    authorName: valueOf(row, 'authorName', 'author_name') ?? null,
    createdAt: String(valueOf(row, 'createdAt', 'created_at')),
  }
}

export async function bootstrapAgentCollaboration(client: RpcClient): Promise<AgentBootstrapDto> {
  const raw = firstOrSelf(await rpc(client, 'teskeid_agent_bootstrap'))
  const conversation = raw?.conversation ?? {
    id: valueOf(raw, 'conversationId', 'conversation_id'),
    title: valueOf(raw, 'conversationTitle', 'conversation_title'),
  }
  if (!conversation?.id) throw new AgentCollaborationRepositoryError('unavailable')
  const connectorsRaw = raw?.connectors ?? []
  const latestRunRaw = valueOf(raw, 'latestRun', 'latest_run')
  const latestRunStatus = valueOf(latestRunRaw, 'status', 'status')
  return {
    conversation: {
      id: String(conversation.id),
      title: String(conversation.title ?? 'Vinnuspjall'),
    },
    connectors: Array.isArray(connectorsRaw) ? connectorsRaw.map(mapConnector) : [],
    unreadCount: Number(valueOf(raw, 'unreadCount', 'unread_count') ?? 0),
    latestRun: latestRunRaw?.id && ['queued', 'working', 'completed', 'failed'].includes(latestRunStatus)
      ? {
          id: String(latestRunRaw.id),
          status: latestRunStatus,
          failureCategory: latestRunStatus === 'failed'
            ? String(valueOf(latestRunRaw, 'failureCategory', 'failure_category') ?? 'runner_error')
            : null,
        }
      : null,
  }
}

export async function getAgentCollaborationSummary(client: RpcClient): Promise<{ unreadCount: number }> {
  const raw = firstOrSelf(await rpc(client, 'teskeid_agent_get_summary'))
  return { unreadCount: Math.max(0, Number(valueOf(raw, 'unreadCount', 'unread_count') ?? raw ?? 0)) }
}

export async function listAgentMessages(
  client: RpcClient,
  args: { conversationId: string; before?: string; beforeId?: string; limit: number },
): Promise<AgentStoredMessageDto[]> {
  const raw = await rpc(client, 'teskeid_agent_list_messages', {
    p_conversation_id: args.conversationId,
    p_before: args.before ?? null,
    p_before_id: args.beforeId ?? null,
    p_limit: args.limit,
  })
  const messages = (Array.isArray(raw) ? raw : []).map(mapMessage)
  return messages.sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt)
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id)
  })
}

export async function sendAgentUserMessage(
  client: RpcClient,
  args: { conversationId: string; body: string; clientMessageId: string; idempotencyKey: string },
): Promise<AgentStoredMessageDto> {
  const raw = firstOrSelf(await rpc(client, 'teskeid_agent_send_message', {
    p_conversation_id: args.conversationId,
    p_body: args.body,
    p_client_message_id: args.clientMessageId,
    p_idempotency_key: args.idempotencyKey,
  }))
  if (!raw?.id) throw new AgentCollaborationRepositoryError('unavailable')
  return mapMessage(raw)
}

export async function markAgentConversationRead(
  client: RpcClient,
  conversationId: string,
  lastReadMessageId: string,
): Promise<void> {
  await rpc(client, 'teskeid_agent_mark_read', {
    p_conversation_id: conversationId,
    p_last_read_message_id: lastReadMessageId,
  })
}

export async function createAgentPairing(
  client: RpcClient,
  args: {
    conversationId: string
    codeHash: string
    expiresAt: string
    displayName: string
    providerKey: string
  },
): Promise<void> {
  await rpc(client, 'teskeid_agent_create_pairing', {
    p_conversation_id: args.conversationId,
    p_code_hash: args.codeHash,
    p_expires_at: args.expiresAt,
    p_connector_name: args.displayName,
    p_provider_type: args.providerKey,
  })
}

export async function revokeAgentConnector(client: RpcClient, connectorId: string): Promise<void> {
  await rpc(client, 'teskeid_agent_revoke_connector', { p_connector_id: connectorId })
}

export async function exchangeAgentPairing(args: {
  codeHash: string
  tokenHash: string
  providerKey: string
}): Promise<AgentPairingExchangeDto> {
  const raw = firstOrSelf(await rpc(getAdmin(), 'teskeid_agent_exchange_pairing', {
    p_code_hash: args.codeHash,
    p_token_hash: args.tokenHash,
    p_provider_type: args.providerKey,
  }))
  if (!raw) throw new AgentCollaborationRepositoryError('unauthorized')
  const connectorId = valueOf(raw, 'connectorId', 'connector_id') ?? raw.id
  const tokenExpiresAt = valueOf(raw, 'tokenExpiresAt', 'token_expires_at')
  if (!connectorId || !tokenExpiresAt) throw new AgentCollaborationRepositoryError('unauthorized')
  return {
    connectorId: String(connectorId),
    providerKey: String(valueOf(raw, 'providerKey', 'provider_key') ?? 'unknown'),
    displayName: String(valueOf(raw, 'displayName', 'display_name') ?? 'Agent'),
    tokenExpiresAt: String(tokenExpiresAt),
  }
}

export async function claimAgentRun(args: {
  tokenHash: string
  leaseOwnerId: string
}): Promise<AgentClaimedRunDto | null> {
  const raw = firstOrSelf(await rpc(getAdmin(), 'teskeid_agent_claim_run', {
    p_token_hash: args.tokenHash,
    p_lease_owner_id: args.leaseOwnerId,
    p_lease_seconds: 60,
  }))
  if (!raw) return null
  const id = valueOf(raw, 'id', 'run_id')
  const leaseId = valueOf(raw, 'leaseId', 'lease_id')
  if (!id || !leaseId) return null
  return {
    id: String(id),
    leaseId: String(leaseId),
    conversationId: String(valueOf(raw, 'conversationId', 'conversation_id')),
    prompt: String(raw.prompt ?? raw.body ?? ''),
    mode: 'read_only_reply',
    createdAt: String(valueOf(raw, 'createdAt', 'created_at')),
    agentSessionId: valueOf(raw, 'agentSessionId', 'agent_session_id') ?? null,
  }
}

export async function heartbeatAgentRun(args: {
  tokenHash: string
  runId: string
  leaseId: string
  leaseOwnerId: string
}): Promise<boolean> {
  const raw = firstOrSelf(await rpc(getAdmin(), 'teskeid_agent_heartbeat_run', {
    p_token_hash: args.tokenHash,
    p_run_id: args.runId,
    p_lease_id: args.leaseId,
    p_lease_owner_id: args.leaseOwnerId,
    p_lease_seconds: 60,
  }))
  return raw === true || raw?.ok === true
}

export async function completeAgentRun(args: {
  tokenHash: string
  runId: string
  leaseId: string
  leaseOwnerId: string
  body: string
  clientMessageId: string
  idempotencyKey: string
  agentSessionId?: string | null
}): Promise<AgentRunReceiptDto> {
  const raw = firstOrSelf(await rpc(getAdmin(), 'teskeid_agent_complete_run', {
    p_token_hash: args.tokenHash,
    p_run_id: args.runId,
    p_lease_id: args.leaseId,
    p_lease_owner_id: args.leaseOwnerId,
    p_reply_body: args.body,
    p_client_message_id: args.clientMessageId,
    p_idempotency_key: args.idempotencyKey,
    p_agent_session_id: args.agentSessionId ?? null,
  }))
  if (raw === false || raw === null) throw new AgentCollaborationRepositoryError('unauthorized')
  return { ok: true, messageId: valueOf(raw, 'messageId', 'message_id') ?? undefined }
}

export async function failAgentRun(args: {
  tokenHash: string
  runId: string
  leaseId: string
  leaseOwnerId: string
  failureCategory: string
  idempotencyKey: string
  retryable: boolean
}): Promise<AgentRunReceiptDto> {
  const raw = firstOrSelf(await rpc(getAdmin(), 'teskeid_agent_fail_run', {
    p_token_hash: args.tokenHash,
    p_run_id: args.runId,
    p_lease_id: args.leaseId,
    p_lease_owner_id: args.leaseOwnerId,
    p_failure_category: args.failureCategory,
    p_failure_idempotency_key: args.idempotencyKey,
    p_retryable: args.retryable,
  }))
  if (raw === false || raw === null) throw new AgentCollaborationRepositoryError('unauthorized')
  return { ok: true }
}
