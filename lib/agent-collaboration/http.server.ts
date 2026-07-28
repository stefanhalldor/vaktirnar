import 'server-only'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { hasAgentCollaborationBetaAccess } from './access.server'

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
}

export function privateJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS })
}

export type AuthenticatedCollaborationClient =
  | {
      ok: true
      supabase: Awaited<ReturnType<typeof createClient>>
      user: User
    }
  | { ok: false; response: NextResponse }

export async function authenticatedCollaborationClient(): Promise<AuthenticatedCollaborationClient> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id || !user.email) {
    return { ok: false, response: privateJson({ error: 'unauthorized' }, 401) }
  }
  if (!await hasAgentCollaborationBetaAccess(user.email)) {
    return { ok: false, response: privateJson({ error: 'not_found' }, 404) }
  }
  return { ok: true, supabase, user }
}

export function unavailableResponse(): NextResponse {
  return privateJson({ error: 'collaboration_unavailable' }, 503)
}

export function connectorUnauthorizedResponse(): NextResponse {
  return privateJson({ error: 'connector_unauthorized' }, 401)
}

export function agentCollaborationDisabledResponse(): NextResponse | null {
  return process.env.AUTH_MVP_ENABLED === 'true'
    && process.env.AGENT_COLLABORATION_ENABLED === 'true'
    ? null
    : privateJson({ error: 'not_found' }, 404)
}

// Bridge and browser surfaces intentionally share the same fail-closed switch.
// Keeping the alias makes it hard for a future bridge route to accidentally
// depend on the broader AUTH_MVP flag alone.
export const agentBridgeDisabledResponse = agentCollaborationDisabledResponse

export function browserMutationRejectedResponse(request: Request): NextResponse | null {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return privateJson({ error: 'forbidden' }, 403)
  }

  const origin = request.headers.get('origin')
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return privateJson({ error: 'forbidden' }, 403)
      }
    } catch {
      return privateJson({ error: 'forbidden' }, 403)
    }
  }

  if (request.method !== 'DELETE') {
    const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
    if (!contentType.startsWith('application/json')) {
      return privateJson({ error: 'unsupported_media_type' }, 415)
    }
  }

  return null
}

export async function readBoundedJson(request: Request, maxBytes = 16 * 1024): Promise<unknown | null> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) return null
  if (!request.body) return {}

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        return null
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return text.trim() ? JSON.parse(text) : {}
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}
