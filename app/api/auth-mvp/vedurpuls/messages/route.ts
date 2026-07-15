import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkChatAccess } from '@/lib/chat/access.server'
import { chatAccessError, isValidUuid, isValidTimestampCursor, WEATHER_PULSE_SCOPE } from '@/lib/chat/api.server'
import { assertThreadScope, listMessages, postMessage } from '@/lib/chat/repository.server'
import type { ChatMessageKind } from '@/lib/chat/types'

const USER_ALLOWED_KINDS: ChatMessageKind[] = ['chat', 'field_report', 'measurement_report']

/**
 * GET /api/auth-mvp/vedurpuls/messages?threadId=&limit=&before=
 *
 * Lists messages for a Veðurstofan station thread, oldest first.
 * Scope-checked: threadId must belong to domain=weather, targetType=vedurstofan_station.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const access = await checkChatAccess(user)
  if (access !== 'allowed') return chatAccessError(access)

  const { searchParams } = request.nextUrl
  const threadId = searchParams.get('threadId')
  if (!isValidUuid(threadId)) {
    return NextResponse.json({ error: 'threadId must be a valid UUID' }, { status: 400 })
  }

  const limitParam = parseInt(searchParams.get('limit') ?? '50', 10)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50

  const beforeRaw = searchParams.get('before')
  if (beforeRaw !== null && !isValidTimestampCursor(beforeRaw)) {
    return NextResponse.json({ error: 'before must be a valid timestamp' }, { status: 400 })
  }
  const before = beforeRaw ?? undefined

  try {
    await assertThreadScope(threadId, WEATHER_PULSE_SCOPE)
    const messages = await listMessages(threadId, { limit, before })
    return NextResponse.json(messages)
  } catch (err) {
    if (err instanceof Error && err.message === 'chat: not found') {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'messages unavailable' }, { status: 500 })
  }
}

/**
 * POST /api/auth-mvp/vedurpuls/messages
 * Body: { threadId: string, body: string, messageKind?: ChatMessageKind }
 *
 * Posts a message to a Veðurstofan station thread.
 * Scope-checked: threadId must belong to domain=weather, targetType=vedurstofan_station.
 * - messageKind defaults to 'chat' when omitted.
 * - 'system' and unknown kinds return 400.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const access = await checkChatAccess(user)
  if (access !== 'allowed') return chatAccessError(access)

  const body = await request.json().catch(() => null)
  const { threadId, body: msgBody, messageKind } = body ?? {}

  if (!isValidUuid(threadId)) {
    return NextResponse.json({ error: 'threadId must be a valid UUID' }, { status: 400 })
  }
  if (typeof msgBody !== 'string' || msgBody.trim().length === 0) {
    return NextResponse.json({ error: 'body required' }, { status: 400 })
  }
  if (msgBody.length > 1000) {
    return NextResponse.json({ error: 'body too long' }, { status: 400 })
  }

  let kind: ChatMessageKind = 'chat'
  if (messageKind !== undefined && messageKind !== null) {
    if (!USER_ALLOWED_KINDS.includes(messageKind)) {
      return NextResponse.json({ error: 'invalid messageKind' }, { status: 400 })
    }
    kind = messageKind
  }

  try {
    await assertThreadScope(threadId, WEATHER_PULSE_SCOPE)
    const message = await postMessage(threadId, user!.id, { body: msgBody, messageKind: kind })
    return NextResponse.json(message, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'chat: not found') {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'message send failed' }, { status: 500 })
  }
}
