import 'server-only'
import { agentCollaborationDisabledResponse, authenticatedCollaborationClient, browserMutationRejectedResponse, privateJson, unavailableResponse } from '@/lib/agent-collaboration/http.server'
import { AgentCollaborationRepositoryError, revokeAgentConnector } from '@/lib/agent-collaboration/repository.server'
import { isUuid } from '@/lib/agent-collaboration/validation'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const disabled = agentCollaborationDisabledResponse()
  if (disabled) return disabled
  const rejected = browserMutationRejectedResponse(request)
  if (rejected) return rejected
  const auth = await authenticatedCollaborationClient()
  if (!auth.ok) return auth.response
  const { id } = await params
  if (!isUuid(id)) return privateJson({ error: 'invalid_request' }, 400)
  try {
    await revokeAgentConnector(auth.supabase, id)
    return privateJson({ ok: true })
  } catch (error) {
    if (error instanceof AgentCollaborationRepositoryError && error.kind === 'not_found') {
      return privateJson({ error: 'not_found' }, 404)
    }
    return unavailableResponse()
  }
}
