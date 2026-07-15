import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkChatAccess } from '@/lib/chat/access.server'
import { chatAccessError, isValidUuid, WEATHER_PULSE_SCOPE } from '@/lib/chat/api.server'
import { assertThreadScope, markThreadRead } from '@/lib/chat/repository.server'

/**
 * POST /api/auth-mvp/vedurpuls/read
 * Body: { threadId: string }
 *
 * Marks the entire thread as read for the calling user at the current time.
 * Scope-checked: threadId must belong to domain=weather, targetType=vedurstofan_station.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const access = await checkChatAccess(user)
  if (access !== 'allowed') return chatAccessError(access)

  const body = await request.json().catch(() => null)
  const { threadId } = body ?? {}

  if (!isValidUuid(threadId)) {
    return NextResponse.json({ error: 'threadId must be a valid UUID' }, { status: 400 })
  }

  try {
    await assertThreadScope(threadId, WEATHER_PULSE_SCOPE)
    await markThreadRead(threadId, user!.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Error && err.message === 'chat: not found') {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'mark read failed' }, { status: 500 })
  }
}
