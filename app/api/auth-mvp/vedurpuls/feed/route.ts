import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkChatAccess } from '@/lib/chat/access.server'
import { chatAccessError, isValidTimestampCursor, WEATHER_PULSE_DOMAIN, WEATHER_PULSE_PRIMARY_TARGET_TYPES } from '@/lib/chat/api.server'
import { getFeedMessages } from '@/lib/chat/repository.server'

/**
 * GET /api/auth-mvp/vedurpuls/feed?limit=50&before=<timestamp>
 *
 * Returns the latest messages across all primary Veðurpúls threads (Vegagerðin stations),
 * newest-first. Use `before` (ISO timestamp) to page older messages.
 * Each message includes target metadata so the UI can show the station name.
 *
 * Scope: domain=weather, targetTypes=PRIMARY_TARGET_TYPES (vegagerdin_station).
 * Server-side filtering — no client-supplied thread list accepted.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const access = await checkChatAccess(user, { provider: 'vegagerdin' })
  if (access !== 'allowed') return chatAccessError(access)

  const { searchParams } = request.nextUrl

  const limitParam = parseInt(searchParams.get('limit') ?? '50', 10)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50

  const beforeRaw = searchParams.get('before')
  if (beforeRaw !== null && !isValidTimestampCursor(beforeRaw)) {
    return NextResponse.json({ error: 'before must be a valid timestamp' }, { status: 400 })
  }
  const before = beforeRaw ?? undefined

  try {
    const messages = await getFeedMessages(
      { domain: WEATHER_PULSE_DOMAIN, targetTypes: WEATHER_PULSE_PRIMARY_TARGET_TYPES },
      { limit, before }
    )
    return NextResponse.json(messages)
  } catch {
    return NextResponse.json({ error: 'feed unavailable' }, { status: 500 })
  }
}
