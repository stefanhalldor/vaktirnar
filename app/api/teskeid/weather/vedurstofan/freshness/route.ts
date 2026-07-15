import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/supabase/admin'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { getExpectedVedurstofanCycleIso, getNextCycleAfterAtimeIso } from '@/lib/weather/vedurstofanFreshness'
import { getVedurstofanRunState } from '@/lib/weather/providers/vedurstofan.server'

const MANUAL_COOLDOWN_MS = 10 * 60 * 1000

/**
 * GET /api/teskeid/weather/vedurstofan/freshness
 *
 * Lightweight poll endpoint used by the open-result loop to:
 *   1. Detect when a newer Veðurstofan forecast cycle has arrived.
 *   2. Surface the server-side run state so the UI can initialise the
 *      manual refresh button without waiting for a user action.
 *
 * Requires:
 *   - Authenticated user with weather-provider-vedurstofan feature access.
 *   - WEATHER_ENABLED must be 'All' or 'Authenticated' (not off).
 *
 * Returns: VedurstofanFreshnessPayload
 */
export async function GET() {
  if (getWeatherEnabledMode() === 'off') {
    return NextResponse.json({ error: 'Weather disabled' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hasAccess = await checkFeatureAccess(user.id, user.email!, 'weather-provider-vedurstofan').catch(() => false)
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()
  const expectedCycleIso = getExpectedVedurstofanCycleIso(now)

  const admin = getAdmin()
  const { data: latestRow } = await admin
    .from('vedurstofan_forecasts_latest')
    .select('atime')
    .order('atime', { ascending: false })
    .limit(1)
    .maybeSingle()

  const atimeIso: string | null = latestRow?.atime ?? null
  const nextExpectedAfterDataIso = atimeIso ? getNextCycleAfterAtimeIso(atimeIso) : null

  const runState = await getVedurstofanRunState(expectedCycleIso)
  const lastAttemptIso = runState.state === 'recentlyAttempted' ? runState.lastAttemptIso : null
  const nextManualRefreshIso = lastAttemptIso
    ? new Date(Date.parse(lastAttemptIso) + MANUAL_COOLDOWN_MS).toISOString()
    : null

  return NextResponse.json({
    atimeIso,
    expectedCycleIso,
    nextExpectedAfterDataIso,
    runState: runState.state,
    lastAttemptIso,
    nextManualRefreshIso,
  })
}
