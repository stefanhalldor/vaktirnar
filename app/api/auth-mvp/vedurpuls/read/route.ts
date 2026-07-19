import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkChatAccess } from '@/lib/chat/access.server'
import { chatAccessError, isValidUuid, WEATHER_PULSE_DOMAIN, WEATHER_PULSE_ALL_TARGET_TYPES } from '@/lib/chat/api.server'
import { markThreadRead, getThreadProvider } from '@/lib/chat/repository.server'

/**
 * POST /api/auth-mvp/vedurpuls/read
 * Body: { threadId: string }
 *
 * Marks the entire thread as read for the calling user at the current time.
 * Scope-checked: threadId must belong to domain=weather, any weather pulse target type
 * (ALL_TARGET_TYPES). Legacy Veðurstofan threads remain mark-readable alongside Vegagerðin.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const body = await request.json().catch(() => null)
  const { threadId } = body ?? {}

  if (!isValidUuid(threadId)) {
    return NextResponse.json({ error: 'threadId must be a valid UUID' }, { status: 400 })
  }

  try {
    // Scope first: validate domain + target_type before any access response.
    const provider = await getThreadProvider(threadId, { domain: WEATHER_PULSE_DOMAIN, targetTypes: WEATHER_PULSE_ALL_TARGET_TYPES })
    if (!provider) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }

    const access = await checkChatAccess(user, { provider })
    if (access !== 'allowed') return chatAccessError(access)

    await markThreadRead(threadId, user!.id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'mark read failed' }, { status: 500 })
  }
}
