import 'server-only'
import type { NextRequest } from 'next/server'
import { hashConnectorToken, readBearerToken } from '@/lib/agent-collaboration/crypto.server'
import { agentBridgeDisabledResponse, connectorUnauthorizedResponse, privateJson, readBoundedJson, unavailableResponse } from '@/lib/agent-collaboration/http.server'
import { AgentCollaborationRepositoryError, claimAgentRun } from '@/lib/agent-collaboration/repository.server'
import { connectorLeaseSchema } from '@/lib/agent-collaboration/validation'

export async function POST(request: NextRequest) {
  const disabled = agentBridgeDisabledResponse()
  if (disabled) return disabled
  const token = readBearerToken(request)
  if (!token) return connectorUnauthorizedResponse()
  const parsed = connectorLeaseSchema.safeParse(await readBoundedJson(request, 4 * 1024))
  if (!parsed.success) return privateJson({ error: 'invalid_request' }, 400)
  try {
    const run = await claimAgentRun({
      tokenHash: hashConnectorToken(token),
      leaseOwnerId: parsed.data.leaseOwnerId,
    })
    return privateJson({ run, pollAfterMs: run ? 0 : 3_000 })
  } catch (error) {
    if (error instanceof AgentCollaborationRepositoryError && (
      error.kind === 'unauthorized' || error.kind === 'not_found'
    )) return connectorUnauthorizedResponse()
    return unavailableResponse()
  }
}
