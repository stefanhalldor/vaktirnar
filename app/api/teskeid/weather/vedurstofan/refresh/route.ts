import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import {
  warmVedurstofanForecastCache,
  getVedurstofanRunState,
  insertVedurstofanRunningRow,
} from '@/lib/weather/providers/vedurstofan.server'
import {
  getExpectedVedurstofanCycleIso,
  getNextVedurstofanCycleIso,
  isVedurstofanCycleFresh,
} from '@/lib/weather/vedurstofanFreshness'

// Manual Veðurstofan refresh can take up to 5 minutes (280 stations in batches).
export const maxDuration = 300

/** POST /api/teskeid/weather/vedurstofan/refresh
 *
 * Triggers a Veðurstofan all-stations warm. Returns an honest status the UI can trust.
 *
 * Requires:
 *   - Authenticated user with weather-provider-vedurstofan feature access.
 *   - WEATHER_ENABLED must be 'All' or 'Authenticated' (not off).
 *
 * Returns:
 *   { status: 'alreadyFresh' }            — a finished run after the current cycle exists
 *   { status: 'running' }                 — another request is already warming this cycle
 *   { status: 'recentlyAttempted', lastAttemptIso } — any run (cron or manual) finished < 10 min ago
 *   { status: 'fresh' }                   — warm succeeded and provider returned new cycle
 *   { status: 'stillStale' }              — warm ran but provider still returned old cycle
 *   { status: 'failed' }                  — warm threw unexpectedly
 *
 * Never exposes CRON_SECRET. Never accepts client-provided station lists.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hasAccess = await checkFeatureAccess(user.id, user.email!, 'weather-provider-vedurstofan').catch(() => false)
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (getWeatherEnabledMode() === 'off') {
    return NextResponse.json({ error: 'Weather disabled' }, { status: 503 })
  }

  const now = new Date()
  const expectedCycleIso = getExpectedVedurstofanCycleIso(now)
  const nextCycleIso = getNextVedurstofanCycleIso(now)

  // Check current run state before taking action
  const runState = await getVedurstofanRunState(expectedCycleIso)

  if (runState.state === 'alreadyFresh') {
    return NextResponse.json({ status: 'alreadyFresh', expectedCycleIso, nextCycleIso })
  }

  if (runState.state === 'running') {
    return NextResponse.json({ status: 'running', expectedCycleIso, nextCycleIso })
  }

  if (runState.state === 'recentlyAttempted') {
    return NextResponse.json({
      status: 'recentlyAttempted',
      lastAttemptIso: runState.lastAttemptIso,
      expectedCycleIso,
      nextCycleIso,
    })
  }

  // Insert a running row — if another concurrent request just inserted one, this returns null.
  const runId = await insertVedurstofanRunningRow(expectedCycleIso, 'manual', user.id)
  if (runId === null) {
    // Race condition: another request beat us to it.
    return NextResponse.json({ status: 'running', expectedCycleIso, nextCycleIso })
  }

  try {
    const warmResult = await warmVedurstofanForecastCache({
      existingRunId: runId,
      triggeredBy: 'manual',
      triggeredByUserId: user.id,
      triggerReason: 'stale_cycle_refresh',
      expectedAtimeIso: expectedCycleIso,
    })

    // Conservative freshness: result_atime (min across all projected stations) must satisfy
    // the same cycle-fresh check the UI uses. One fresh station is not enough.
    const dataIsFresh = isVedurstofanCycleFresh(warmResult.resultAtimeIso, now)

    return NextResponse.json({
      status: dataIsFresh ? 'fresh' : 'stillStale',
      expectedCycleIso,
      nextCycleIso,
      warmResult: {
        fresh: warmResult.fresh,
        stale: warmResult.stale,
        unavailable: warmResult.unavailable,
      },
    })
  } catch {
    return NextResponse.json({ status: 'failed' }, { status: 500 })
  }
}
