import 'server-only'
import type { NextRequest } from 'next/server'
import { hashConnectorToken, readBearerToken } from '@/lib/agent-collaboration/crypto.server'
import { agentBridgeDisabledResponse, connectorUnauthorizedResponse, privateJson, readBoundedJson, unavailableResponse } from '@/lib/agent-collaboration/http.server'
import { AgentCollaborationRepositoryError, heartbeatAgentRun } from '@/lib/agent-collaboration/repository.server'
import { connectorHeartbeatSchema } from '@/lib/agent-collaboration/validation'

export async function POST(request: NextRequest) {
  const disabled = agentBridgeDisabledResponse()
  if (disabled) return disabled
  const token = readBearerToken(request)
  if (!token) return connectorUnauthorizedResponse()
  const parsed = connectorHeartbeatSchema.safeParse(await readBoundedJson(request, 4 * 1024))
  if (!parsed.success) return privateJson({ error: 'invalid_request' }, 400)
  try {
    const ok = await heartbeatAgentRun({
      tokenHash: hashConnectorToken(token),
      runId: parsed.data.runId,
      leaseId: parsed.data.leaseId,
      leaseOwnerId: parsed.data.leaseOwnerId,
    })
    return ok ? privateJson({ ok: true }) : connectorUnauthorizedResponse()
  } catch (error) {
    if (error instanceof AgentCollaborationRepositoryError && (
      error.kind === 'unauthorized' || error.kind === 'not_found'
    )) return connectorUnauthorizedResponse()
    return unavailableResponse()
  }
}
