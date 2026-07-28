import 'server-only'
import { agentCollaborationDisabledResponse, authenticatedCollaborationClient, privateJson, unavailableResponse } from '@/lib/agent-collaboration/http.server'
import { bootstrapAgentCollaboration } from '@/lib/agent-collaboration/repository.server'

export async function GET() {
  const disabled = agentCollaborationDisabledResponse()
  if (disabled) return disabled
  const auth = await authenticatedCollaborationClient()
  if (!auth.ok) return auth.response
  try {
    return privateJson(await bootstrapAgentCollaboration(auth.supabase))
  } catch {
    return unavailableResponse()
  }
}
