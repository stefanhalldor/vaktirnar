import { NextResponse } from 'next/server'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { warmAllRoadMapPlaceMetnoHistory } from '@/lib/weather/weatherChaseHistory.server'

export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (
    process.env.AUTH_MVP_ENABLED !== 'true'
    || process.env.WEATHER_ELTA_VEDRID_FLAG !== 'true'
    || getWeatherEnabledMode() === 'off'
  ) {
    return NextResponse.json({ skipped: 'forecast history disabled' })
  }
  try {
    const result = await warmAllRoadMapPlaceMetnoHistory()
    const complete = result.succeeded === result.total && result.failed === 0
    return NextResponse.json({ status: complete ? 'ok' : 'error', ...result }, {
      status: complete ? 200 : 503,
    })
  } catch {
    console.error('[cron/warm-metno-points] unexpected error')
    return NextResponse.json({ status: 'error', total: 0, succeeded: 0, failed: 0 }, { status: 500 })
  }
}
