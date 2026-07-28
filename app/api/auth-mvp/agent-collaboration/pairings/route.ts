import 'server-only'
import type { NextRequest } from 'next/server'
import { generatePairingCode, hashPairingCode } from '@/lib/agent-collaboration/crypto.server'
import { agentCollaborationDisabledResponse, authenticatedCollaborationClient, browserMutationRejectedResponse, privateJson, readBoundedJson, unavailableResponse } from '@/lib/agent-collaboration/http.server'
import { bootstrapAgentCollaboration, createAgentPairing } from '@/lib/agent-collaboration/repository.server'
import { agentPairingSchema } from '@/lib/agent-collaboration/validation'

const PAIRING_TTL_MS = 10 * 60_000

export async function POST(request: NextRequest) {
  const disabled = agentCollaborationDisabledResponse()
  if (disabled) return disabled
  const rejected = browserMutationRejectedResponse(request)
  if (rejected) return rejected
  const auth = await authenticatedCollaborationClient()
  if (!auth.ok) return auth.response
  const parsed = agentPairingSchema.safeParse(await readBoundedJson(request, 4 * 1024))
  if (!parsed.success) return privateJson({ error: 'invalid_request' }, 400)

  try {
    const bootstrap = parsed.data.conversationId
      ? null
      : await bootstrapAgentCollaboration(auth.supabase)
    const conversationId = parsed.data.conversationId ?? bootstrap!.conversation.id
    const code = generatePairingCode()
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString()
    await createAgentPairing(auth.supabase, {
      conversationId,
      codeHash: hashPairingCode(code),
      expiresAt,
      displayName: parsed.data.displayName,
      providerKey: parsed.data.providerKey,
    })
    return privateJson({ code, expiresAt }, 201)
  } catch {
    return unavailableResponse()
  }
}
