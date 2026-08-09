import { NextRequest, NextResponse } from 'next/server'
import { joinCodeSchema, publicChatSchema } from '@/lib/kviss/validation'
import { loadParticipantProjection, sendKvissMessage } from '@/lib/kviss/repository.server'
import { assertSameOriginMutation, digestParticipantCapability, readCapabilityCookie } from '@/lib/kviss/security.server'
import { notifyKvissInvalidation } from '@/lib/kviss/realtime.server'

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' }
  const code = joinCodeSchema.safeParse(request.nextUrl.searchParams.get('code'))
  if (process.env.KVISS_ENABLED !== 'true' || !code.success) return NextResponse.json({ error: 'not_found' }, { status: 404, headers })
  const token = readCapabilityCookie(request, code.data)
  if (!token) return NextResponse.json({ error: 'not_joined' }, { status: 401, headers })
  const projection = await loadParticipantProjection(digestParticipantCapability(token), code.data)
  if (!projection) return NextResponse.json({ error: 'not_joined' }, { status: 401, headers })
  return NextResponse.json({ messages: projection.chat }, { headers })
}

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (process.env.KVISS_ENABLED !== 'true' || !assertSameOriginMutation(request)) return NextResponse.json({ error: 'not_found' }, { status: 404, headers })
  if (Number(request.headers.get('content-length') ?? 0) > 4_096) return NextResponse.json({ error: 'invalid_request' }, { status: 413, headers })
  const parsed = publicChatSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers })
  const token = readCapabilityCookie(request, parsed.data.code)
  if (!token) return NextResponse.json({ error: 'not_joined' }, { status: 401, headers })
  const digest = digestParticipantCapability(token)
  try {
    await sendKvissMessage(digest, parsed.data.body, parsed.data.clientMessageId)
    const projection = await loadParticipantProjection(digest, parsed.data.code)
    await notifyKvissInvalidation(projection?.realtimeTopic ?? null, projection?.revision)
    return NextResponse.json({ ok: true }, { headers })
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers })
  }
}
