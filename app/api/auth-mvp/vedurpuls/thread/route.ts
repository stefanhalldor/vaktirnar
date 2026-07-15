import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkChatAccess } from '@/lib/chat/access.server'
import { chatAccessError } from '@/lib/chat/api.server'
import { buildWeatherStationTarget } from '@/lib/chat/adapters/weather.server'
import { getOrCreateThread } from '@/lib/chat/repository.server'

/**
 * POST /api/auth-mvp/vedurpuls/thread
 * Body: { targetId: string }
 *
 * Get-or-creates the shared chat thread for a Veðurstofan station.
 * Safe to call on every station card open — does not reset message count.
 * Returns ThreadDto.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const access = await checkChatAccess(user)
  if (access !== 'allowed') return chatAccessError(access)

  const body = await request.json().catch(() => null)
  const targetId = typeof body?.targetId === 'string' ? body.targetId : null
  if (!targetId) return NextResponse.json({ error: 'targetId required' }, { status: 400 })

  const target = buildWeatherStationTarget(targetId)
  if (!target) return NextResponse.json({ error: 'unknown station' }, { status: 400 })

  try {
    const thread = await getOrCreateThread(target)
    return NextResponse.json(thread)
  } catch {
    return NextResponse.json({ error: 'thread unavailable' }, { status: 500 })
  }
}
