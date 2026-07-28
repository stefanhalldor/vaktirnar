import 'server-only'
import type { NextRequest } from 'next/server'
import {
  generateConnectorToken,
  hashConnectorToken,
  hashPairingCode,
} from '@/lib/agent-collaboration/crypto.server'
import { agentBridgeDisabledResponse, connectorUnauthorizedResponse, privateJson, readBoundedJson, unavailableResponse } from '@/lib/agent-collaboration/http.server'
import { allowPairingAttempt } from '@/lib/agent-collaboration/pair-rate-limit.server'
import { AgentCollaborationRepositoryError, exchangeAgentPairing } from '@/lib/agent-collaboration/repository.server'
import { connectorPairSchema } from '@/lib/agent-collaboration/validation'

function requestIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')?.trim()
    ?? ''
}

export async function POST(request: NextRequest) {
  const disabled = agentBridgeDisabledResponse()
  if (disabled) return disabled
  if (!allowPairingAttempt(requestIp(request))) return privateJson({ error: 'rate_limited' }, 429)
  const parsed = connectorPairSchema.safeParse(await readBoundedJson(request, 4 * 1024))
  if (!parsed.success) return privateJson({ error: 'invalid_request' }, 400)

  const accessToken = generateConnectorToken()
  try {
    const connector = await exchangeAgentPairing({
      codeHash: hashPairingCode(parsed.data.code),
      tokenHash: hashConnectorToken(accessToken),
      providerKey: parsed.data.provider,
    })
    return privateJson({
      accessToken,
      connectorId: connector.connectorId,
      providerKey: connector.providerKey,
      displayName: connector.displayName,
      tokenExpiresAt: connector.tokenExpiresAt,
      pollIntervalMs: 3_000,
    })
  } catch (error) {
    if (error instanceof AgentCollaborationRepositoryError && (
      error.kind === 'unauthorized' || error.kind === 'not_found'
    )) return connectorUnauthorizedResponse()
    return unavailableResponse()
  }
}
