import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkChatAccess } from '@/lib/chat/access.server'
import { chatAccessError } from '@/lib/chat/api.server'
import { buildWeatherPulseTarget } from '@/lib/chat/adapters/weather.server'
import { getOrCreateThread } from '@/lib/chat/repository.server'
import type { WeatherPulseProvider } from '@/lib/weather/pulseTarget'

/**
 * POST /api/auth-mvp/vedurpuls/thread
 * Body: { provider: 'vedurstofan' | 'vegagerdin', targetId: string }
 *
 * Get-or-creates the shared chat thread for a weather station.
 * provider is required — there is no default. The route returns 400 if omitted.
 * Safe to call on every station card open — does not reset message count.
 * Returns ThreadDto.
 *
 * NOTE: provider='vegagerdin' requires SQL migration 81 to be run first.
 * Without it, thread creation will fail at the DB CHECK constraint.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const body = await request.json().catch(() => null)
  const targetId = typeof body?.targetId === 'string' ? body.targetId : null
  if (!targetId) return NextResponse.json({ error: 'targetId required' }, { status: 400 })

  const rawProvider = body?.provider
  if (rawProvider !== 'vedurstofan' && rawProvider !== 'vegagerdin') {
    return NextResponse.json({ error: 'provider must be vedurstofan or vegagerdin' }, { status: 400 })
  }
  const provider: WeatherPulseProvider = rawProvider

  const access = await checkChatAccess(user, { provider })
  if (access !== 'allowed') return chatAccessError(access)

  const target = await buildWeatherPulseTarget(provider, targetId)
  if (!target) return NextResponse.json({ error: 'unknown station' }, { status: 400 })

  try {
    const thread = await getOrCreateThread(target)
    return NextResponse.json(thread)
  } catch {
    return NextResponse.json({ error: 'thread unavailable' }, { status: 500 })
  }
}
