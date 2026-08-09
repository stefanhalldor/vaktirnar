import { NextRequest, NextResponse } from 'next/server'
import { requireKvissCreatorApi } from '@/lib/kviss/access.server'
import { creatorMutationSchema } from '@/lib/kviss/validation'
import {
  applyKvissHostCommand,
  archiveKvissQuestion,
  createKvissSession,
  getSessionTopicForAuthor,
  loadKvissAuthoring,
  saveKvissTemplate,
  upsertKvissQuestion,
} from '@/lib/kviss/repository.server'
import { createBroadcastTopic } from '@/lib/kviss/security.server'
import { notifyKvissInvalidation } from '@/lib/kviss/realtime.server'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  const access = await requireKvissCreatorApi()
  if (!access.ok) return NextResponse.json({ error: 'not_found' }, { status: access.status, headers: NO_STORE })
  try {
    return NextResponse.json(await loadKvissAuthoring(access.spaceId), { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireKvissCreatorApi()
  if (!access.ok) return NextResponse.json({ error: 'not_found' }, { status: access.status, headers: NO_STORE })
  if (Number(request.headers.get('content-length') ?? 0) > 128_000) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 413, headers: NO_STORE })
  }
  const parsed = creatorMutationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE })
  try {
    if (parsed.data.action === 'upsertQuestion') {
      const data = await upsertKvissQuestion(access.user.id, access.spaceId, parsed.data.question)
      return NextResponse.json({ data }, { headers: NO_STORE })
    }
    if (parsed.data.action === 'archiveQuestion') {
      await archiveKvissQuestion(access.user.id, access.spaceId, parsed.data.questionId, parsed.data.expectedRevision)
      return NextResponse.json({ data: null }, { headers: NO_STORE })
    }
    if (parsed.data.action === 'saveTemplate') {
      const data = await saveKvissTemplate(access.user.id, access.spaceId, parsed.data)
      return NextResponse.json({ data }, { headers: NO_STORE })
    }
    if (parsed.data.action === 'createSession') {
      const data = await createKvissSession(
        access.user.id, access.spaceId, parsed.data.templateId,
        parsed.data.password, createBroadcastTopic(),
      )
      return NextResponse.json({ data }, { headers: NO_STORE })
    }
    const revision = await applyKvissHostCommand(access.user.id, parsed.data)
    const topic = await getSessionTopicForAuthor(access.user.id, parsed.data.sessionId)
    await notifyKvissInvalidation(topic, revision)
    return NextResponse.json({ revision }, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const status = message.includes('revision_conflict') ? 409 : message.includes('not_found') ? 404 : 400
    return NextResponse.json({ error: status === 409 ? 'conflict' : 'invalid_request' }, { status, headers: NO_STORE })
  }
}
