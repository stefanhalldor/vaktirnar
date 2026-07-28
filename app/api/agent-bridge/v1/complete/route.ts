import 'server-only'
import type { NextRequest } from 'next/server'
import { hashConnectorToken, readBearerToken } from '@/lib/agent-collaboration/crypto.server'
import { agentBridgeDisabledResponse, connectorUnauthorizedResponse, privateJson, readBoundedJson, unavailableResponse } from '@/lib/agent-collaboration/http.server'
import { AgentCollaborationRepositoryError, completeAgentRun } from '@/lib/agent-collaboration/repository.server'
import { agentIdempotencyKeySchema, connectorCompleteSchema } from '@/lib/agent-collaboration/validation'

function idempotencyKey(request: NextRequest, runId: string): string | null {
  const supplied = request.headers.get('idempotency-key')
  if (supplied === null) return `run:${runId}:complete`
  const parsed = agentIdempotencyKeySchema.safeParse(supplied)
  return parsed.success ? parsed.data : null
}

export async function POST(request: NextRequest) {
  const disabled = agentBridgeDisabledResponse()
  if (disabled) return disabled
  const token = readBearerToken(request)
  if (!token) return connectorUnauthorizedResponse()
  const parsed = connectorCompleteSchema.safeParse(await readBoundedJson(request, 64 * 1024))
  if (!parsed.success) return privateJson({ error: 'invalid_request' }, 400)
  const requestIdempotencyKey = idempotencyKey(request, parsed.data.runId)
  if (!requestIdempotencyKey) return privateJson({ error: 'invalid_request' }, 400)
  try {
    const receipt = await completeAgentRun({
      tokenHash: hashConnectorToken(token),
      runId: parsed.data.runId,
      leaseId: parsed.data.leaseId,
      leaseOwnerId: parsed.data.leaseOwnerId,
      body: parsed.data.body,
      clientMessageId: parsed.data.runId,
      idempotencyKey: requestIdempotencyKey,
      agentSessionId: parsed.data.agentSessionId ?? null,
    })
    return privateJson(receipt)
  } catch (error) {
    if (error instanceof AgentCollaborationRepositoryError && (
      error.kind === 'unauthorized' || error.kind === 'not_found'
    )) return connectorUnauthorizedResponse()
    if (error instanceof AgentCollaborationRepositoryError && error.kind === 'conflict') {
      return privateJson({ error: 'idempotency_conflict' }, 409)
    }
    return unavailableResponse()
  }
}
