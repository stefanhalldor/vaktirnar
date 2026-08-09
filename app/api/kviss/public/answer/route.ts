import { NextRequest, NextResponse } from 'next/server'
import { publicAnswerSchema } from '@/lib/kviss/validation'
import { answerKviss, loadParticipantProjection, resolveParticipantSelection } from '@/lib/kviss/repository.server'
import { assertSameOriginMutation, digestParticipantCapability, readCapabilityCookie } from '@/lib/kviss/security.server'
import { notifyKvissInvalidation } from '@/lib/kviss/realtime.server'

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (process.env.KVISS_ENABLED !== 'true' || !assertSameOriginMutation(request)) return NextResponse.json({ error: 'not_found' }, { status: 404, headers })
  if (Number(request.headers.get('content-length') ?? 0) > 2_048) return NextResponse.json({ error: 'invalid_request' }, { status: 413, headers })
  const parsed = publicAnswerSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers })
  const token = readCapabilityCookie(request, parsed.data.code)
  if (!token) return NextResponse.json({ error: 'not_joined' }, { status: 401, headers })
  const digest = digestParticipantCapability(token)
  const originalOption = await resolveParticipantSelection(digest, parsed.data.questionId, parsed.data.selectedOption)
  if (originalOption === null) return NextResponse.json({ error: 'not_joined' }, { status: 401, headers })
  try {
    await answerKviss(digest, parsed.data.questionId, originalOption, parsed.data.commandId)
    const projection = await loadParticipantProjection(digest, parsed.data.code)
    await notifyKvissInvalidation(projection?.realtimeTopic ?? null, projection?.revision)
    return NextResponse.json({ ok: true }, { headers })
  } catch (error) {
    const conflict = error instanceof Error && (error.message.includes('locked') || error.message.includes('duplicate'))
    return NextResponse.json({ error: conflict ? 'answer_locked' : 'invalid_request' }, { status: conflict ? 409 : 400, headers })
  }
}
