import { NextResponse } from 'next/server'
import {
  warmVedurstofanForecastCache,
  getVedurstofanRunState,
  insertVedurstofanRunningRow,
} from '@/lib/weather/providers/vedurstofan.server'
import { getExpectedVedurstofanCycleIso } from '@/lib/weather/vedurstofanFreshness'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'

// Runs every 10 minutes via Vercel cron (vercel.json: "*/10 * * * *").
// Fast-skips when the current expected cycle is already fresh, another run is in progress,
// or a run has been attempted within the cooldown window.
// Effectively only hits Veðurstofan in the ~10-30 min window after each 3-hour cycle boundary
// until fresh data is obtained — minimising unnecessary traffic to the provider.
// Warms all 280 Veðurstofan stations into weather_cache, then projects to vedurstofan_forecasts_latest.
export const maxDuration = 300

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (getWeatherEnabledMode() === 'off') {
    return NextResponse.json({ skipped: 'weather disabled' })
  }

  const expectedCycleIso = getExpectedVedurstofanCycleIso(new Date())

  try {
    const runState = await getVedurstofanRunState(expectedCycleIso)
    if (runState.state === 'alreadyFresh') return NextResponse.json({ skipped: 'alreadyFresh', expectedCycleIso })
    if (runState.state === 'running') return NextResponse.json({ skipped: 'running', expectedCycleIso })
    if (runState.state === 'recentlyAttempted') return NextResponse.json({ skipped: 'recentlyAttempted', expectedCycleIso })

    // Insert a running row so concurrent cron/manual runs can detect this one.
    const runId = await insertVedurstofanRunningRow(expectedCycleIso, 'cron')
    if (runId === null) return NextResponse.json({ skipped: 'running', expectedCycleIso })

    const result = await warmVedurstofanForecastCache({
      existingRunId: runId,
      triggeredBy: 'cron',
      triggerReason: 'scheduled_cycle_warm',
      expectedAtimeIso: expectedCycleIso,
    })
    return NextResponse.json({ ...result, expectedCycleIso })
  } catch {
    console.error('[cron/warm-vedurstofan] unexpected error')
    return NextResponse.json({ error: 'Warm failed' }, { status: 500 })
  }
}
