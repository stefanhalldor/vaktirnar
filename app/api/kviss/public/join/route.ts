import { NextRequest, NextResponse } from 'next/server'
import { publicJoinSchema } from '@/lib/kviss/validation'
import { getSessionTopicAfterJoin, joinKviss } from '@/lib/kviss/repository.server'
import { notifyKvissInvalidation } from '@/lib/kviss/realtime.server'
import {
  assertSameOriginMutation,
  createParticipantCapability,
  scopedJoinAttemptHash,
  setCapabilityCookie,
} from '@/lib/kviss/security.server'

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (process.env.KVISS_ENABLED !== 'true') return NextResponse.json({ error: 'not_found' }, { status: 404, headers })
  if (!assertSameOriginMutation(request)) return NextResponse.json({ error: 'invalid_request' }, { status: 403, headers })
  if (Number(request.headers.get('content-length') ?? 0) > 2_048) return NextResponse.json({ error: 'invalid_request' }, { status: 413, headers })
  const parsed = publicJoinSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'join_failed' }, { status: 400, headers })
  try {
    const capability = createParticipantCapability()
    const joined = await joinKviss({
      ...parsed.data, capabilityDigest: capability.digest,
      actorScopeHash: scopedJoinAttemptHash(request, parsed.data.code),
    })
    const response = NextResponse.json({ joinCode: joined.joinCode }, { headers })
    setCapabilityCookie(response, joined.joinCode, capability.token)
    const topic = await getSessionTopicAfterJoin(joined.sessionId)
    await notifyKvissInvalidation(topic)
    return response
  } catch (error) {
    const rateLimited = error instanceof Error && error.message.includes('rate_limited')
    return NextResponse.json(
      { error: rateLimited ? 'rate_limited' : 'join_failed' },
      { status: rateLimited ? 429 : 400, headers: rateLimited ? { ...headers, 'Retry-After': '900' } : headers },
    )
  }
}
