import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkChatAccess } from '@/lib/chat/access.server'
import { chatAccessError, isValidUuid, WEATHER_PULSE_SCOPE } from '@/lib/chat/api.server'
import { assertMessageScope, reportMessage } from '@/lib/chat/repository.server'

/**
 * POST /api/auth-mvp/vedurpuls/report
 * Body: { messageId: string, reason: string, body?: string }
 *
 * Reports a message for moderation.
 * Idempotent: duplicate reports from the same user return 200 instead of 201.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const access = await checkChatAccess(user)
  if (access !== 'allowed') return chatAccessError(access)

  const body = await request.json().catch(() => null)
  const { messageId, reason, body: reportBody } = body ?? {}

  if (!isValidUuid(messageId)) {
    return NextResponse.json({ error: 'messageId must be a valid UUID' }, { status: 400 })
  }
  const trimmedReason = typeof reason === 'string' ? reason.trim() : ''
  if (trimmedReason.length === 0) {
    return NextResponse.json({ error: 'reason required' }, { status: 400 })
  }
  if (trimmedReason.length > 100) {
    return NextResponse.json({ error: 'reason too long' }, { status: 400 })
  }
  if (reportBody != null && (typeof reportBody !== 'string' || reportBody.length > 1000)) {
    return NextResponse.json({ error: 'body too long' }, { status: 400 })
  }

  try {
    await assertMessageScope(messageId, WEATHER_PULSE_SCOPE)
    await reportMessage(messageId, user!.id, { reason: trimmedReason, body: reportBody ?? undefined })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'chat: not found') {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    if (err instanceof Error && err.message === 'chat: already reported') {
      return NextResponse.json({ ok: true, alreadyReported: true })
    }
    return NextResponse.json({ error: 'report failed' }, { status: 500 })
  }
}
