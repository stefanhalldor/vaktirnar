import 'server-only'
import type { NextRequest } from 'next/server'
import { agentCollaborationDisabledResponse, authenticatedCollaborationClient, browserMutationRejectedResponse, privateJson, readBoundedJson, unavailableResponse } from '@/lib/agent-collaboration/http.server'
import {
  AgentCollaborationRepositoryError,
  listAgentMessages,
  sendAgentUserMessage,
} from '@/lib/agent-collaboration/repository.server'
import { toScopedChatMessage } from '@/lib/agent-collaboration/types'
import { agentMessageSchema, isIsoTimestamp, isUuid, parsePageLimit } from '@/lib/agent-collaboration/validation'

export async function GET(request: NextRequest) {
  const disabled = agentCollaborationDisabledResponse()
  if (disabled) return disabled
  const auth = await authenticatedCollaborationClient()
  if (!auth.ok) return auth.response

  const conversationId = request.nextUrl.searchParams.get('conversationId')
  const before = request.nextUrl.searchParams.get('before')
  const beforeId = request.nextUrl.searchParams.get('beforeId')
  if (!isUuid(conversationId)) return privateJson({ error: 'invalid_request' }, 400)
  if ((before === null) !== (beforeId === null)) return privateJson({ error: 'invalid_cursor' }, 400)
  if (before !== null && (!isIsoTimestamp(before) || !isUuid(beforeId))) {
    return privateJson({ error: 'invalid_cursor' }, 400)
  }

  try {
    const rows = await listAgentMessages(auth.supabase, {
      conversationId,
      before: before ?? undefined,
      beforeId: beforeId ?? undefined,
      limit: parsePageLimit(request.nextUrl.searchParams.get('limit')),
    })
    return privateJson(rows.map(toScopedChatMessage))
  } catch (error) {
    if (error instanceof AgentCollaborationRepositoryError && error.kind === 'not_found') {
      return privateJson({ error: 'not_found' }, 404)
    }
    return unavailableResponse()
  }
}

export async function POST(request: NextRequest) {
  const disabled = agentCollaborationDisabledResponse()
  if (disabled) return disabled
  const rejected = browserMutationRejectedResponse(request)
  if (rejected) return rejected
  const auth = await authenticatedCollaborationClient()
  if (!auth.ok) return auth.response
  const parsed = agentMessageSchema.safeParse(await readBoundedJson(request, 20 * 1024))
  if (!parsed.success) return privateJson({ error: 'invalid_request' }, 400)

  try {
    const message = await sendAgentUserMessage(auth.supabase, parsed.data)
    return privateJson(toScopedChatMessage(message), 201)
  } catch (error) {
    if (error instanceof AgentCollaborationRepositoryError && error.kind === 'not_found') {
      return privateJson({ error: 'not_found' }, 404)
    }
    if (error instanceof AgentCollaborationRepositoryError && error.kind === 'conflict') {
      return privateJson({ error: 'idempotency_conflict' }, 409)
    }
    if (error instanceof AgentCollaborationRepositoryError && error.kind === 'rate_limited') {
      return privateJson({ error: 'rate_limited' }, 429)
    }
    return unavailableResponse()
  }
}
