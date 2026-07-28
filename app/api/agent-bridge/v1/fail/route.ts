import 'server-only'
import type { NextRequest } from 'next/server'
import { hashConnectorToken, readBearerToken } from '@/lib/agent-collaboration/crypto.server'
import { agentBridgeDisabledResponse, connectorUnauthorizedResponse, privateJson, readBoundedJson, unavailableResponse } from '@/lib/agent-collaboration/http.server'
import { AgentCollaborationRepositoryError, failAgentRun } from '@/lib/agent-collaboration/repository.server'
import { agentIdempotencyKeySchema, connectorFailSchema } from '@/lib/agent-collaboration/validation'

function idempotencyKey(request: NextRequest, runId: string, leaseId: string): string | null {
  const supplied = request.headers.get('idempotency-key')
  if (supplied === null) return `run:${runId}:${leaseId}:fail`
  const parsed = agentIdempotencyKeySchema.safeParse(supplied)
  return parsed.success ? parsed.data : null
}

export async function POST(request: NextRequest) {
  const disabled = agentBridgeDisabledResponse()
  if (disabled) return disabled
  const token = readBearerToken(request)
  if (!token) return connectorUnauthorizedResponse()
  const parsed = connectorFailSchema.safeParse(await readBoundedJson(request, 4 * 1024))
  if (!parsed.success) return privateJson({ error: 'invalid_request' }, 400)
  const requestIdempotencyKey = idempotencyKey(request, parsed.data.runId, parsed.data.leaseId)
  if (!requestIdempotencyKey) return privateJson({ error: 'invalid_request' }, 400)
  try {
    return privateJson(await failAgentRun({
      tokenHash: hashConnectorToken(token),
      runId: parsed.data.runId,
      leaseId: parsed.data.leaseId,
      leaseOwnerId: parsed.data.leaseOwnerId,
      failureCategory: parsed.data.failureCategory,
      idempotencyKey: requestIdempotencyKey,
      retryable: parsed.data.retryable,
    }))
  } catch (error) {
    if (error instanceof AgentCollaborationRepositoryError && (
      error.kind === 'unauthorized' || error.kind === 'not_found'
    )) return connectorUnauthorizedResponse()
    return unavailableResponse()
  }
}
