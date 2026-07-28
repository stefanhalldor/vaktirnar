import 'server-only'
import type { NextRequest } from 'next/server'
import { agentCollaborationDisabledResponse, authenticatedCollaborationClient, browserMutationRejectedResponse, privateJson, readBoundedJson, unavailableResponse } from '@/lib/agent-collaboration/http.server'
import { AgentCollaborationRepositoryError, markAgentConversationRead } from '@/lib/agent-collaboration/repository.server'
import { agentReadSchema } from '@/lib/agent-collaboration/validation'

export async function POST(request: NextRequest) {
  const disabled = agentCollaborationDisabledResponse()
  if (disabled) return disabled
  const rejected = browserMutationRejectedResponse(request)
  if (rejected) return rejected
  const auth = await authenticatedCollaborationClient()
  if (!auth.ok) return auth.response
  const parsed = agentReadSchema.safeParse(await readBoundedJson(request, 4 * 1024))
  if (!parsed.success) return privateJson({ error: 'invalid_request' }, 400)
  try {
    await markAgentConversationRead(
      auth.supabase,
      parsed.data.conversationId,
      parsed.data.lastReadMessageId,
    )
    return privateJson({ ok: true })
  } catch (error) {
    if (error instanceof AgentCollaborationRepositoryError && error.kind === 'not_found') {
      return privateJson({ error: 'not_found' }, 404)
    }
    return unavailableResponse()
  }
}
