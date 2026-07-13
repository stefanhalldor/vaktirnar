import { NextResponse } from 'next/server'
import { warmVedurstofanForecastCache } from '@/lib/weather/providers/vedurstofan.server'

// Runs every 6 hours via Vercel cron (vercel.json)
// Warms all 280 Veðurstofan stations into weather_cache, then projects to vedurstofan_forecasts_latest
export const maxDuration = 300

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (process.env.WEATHER_ENABLED !== 'true') {
    return NextResponse.json({ skipped: 'weather disabled' })
  }

  try {
    const result = await warmVedurstofanForecastCache()
    return NextResponse.json(result)
  } catch {
    console.error('[cron/warm-vedurstofan] unexpected error')
    return NextResponse.json({ error: 'Warm failed' }, { status: 500 })
  }
}
