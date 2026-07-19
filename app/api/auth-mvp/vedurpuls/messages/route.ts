import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkChatAccess } from '@/lib/chat/access.server'
import { chatAccessError, isValidUuid, isValidTimestampCursor, WEATHER_PULSE_DOMAIN, WEATHER_PULSE_ALL_TARGET_TYPES, WEATHER_PULSE_PRIMARY_TARGET_TYPES } from '@/lib/chat/api.server'
import { listMessages, postMessage, getThreadProvider } from '@/lib/chat/repository.server'
import type { ChatMessageKind } from '@/lib/chat/types'

const USER_ALLOWED_KINDS: ChatMessageKind[] = ['chat', 'field_report', 'measurement_report']

/**
 * GET /api/auth-mvp/vedurpuls/messages?threadId=&limit=&before=
 *
 * Lists messages for a Veðurpúls thread, oldest first.
 * Scope-checked: threadId must belong to domain=weather and any weather pulse target type
 * (ALL_TARGET_TYPES). Legacy Veðurstofan threads remain readable alongside Vegagerðin threads.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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
    // Scope first: validate domain + target_type before any access response.
    // Out-of-scope or missing threads return 404 without revealing provider info.
    const provider = await getThreadProvider(threadId, { domain: WEATHER_PULSE_DOMAIN, targetTypes: WEATHER_PULSE_ALL_TARGET_TYPES })
    if (!provider) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }

    const access = await checkChatAccess(user, { provider })
    if (access !== 'allowed') return chatAccessError(access)

    const messages = await listMessages(threadId, { limit, before })
    return NextResponse.json(messages)
  } catch {
    return NextResponse.json({ error: 'messages unavailable' }, { status: 500 })
  }
}

/**
 * POST /api/auth-mvp/vedurpuls/messages
 * Body: { threadId: string, body: string, messageKind?: ChatMessageKind }
 *
 * Posts a message to a Veðurpúls thread.
 * Scope-checked: threadId must belong to domain=weather and PRIMARY_TARGET_TYPES only
 * (vegagerdin_station). Legacy Veðurstofan threads are read-only — POST is rejected with 404.
 * - messageKind defaults to 'chat' when omitted.
 * - 'system' and unknown kinds return 400.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // POST only targets vegagerdin_station threads (PRIMARY_TARGET_TYPES).
  const access = await checkChatAccess(user, { provider: 'vegagerdin' })
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
    // Scope check: only vegagerdin_station threads accept new messages.
    const provider = await getThreadProvider(threadId, { domain: WEATHER_PULSE_DOMAIN, targetTypes: WEATHER_PULSE_PRIMARY_TARGET_TYPES })
    if (!provider) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    const message = await postMessage(threadId, user!.id, { body: msgBody, messageKind: kind })
    return NextResponse.json(message, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'message send failed' }, { status: 500 })
  }
}
