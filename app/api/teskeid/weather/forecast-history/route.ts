import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import {
  readWeatherChaseHistory,
  validateWeatherChaseHistoryRequest,
} from '@/lib/weather/weatherChaseHistory.server'
import type { WeatherChaseHistoryItemRequest } from '@/lib/weather/weatherChaseHistory.types'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

async function providerAccessAllowed(items: WeatherChaseHistoryItemRequest[]): Promise<boolean> {
  if (!items.some(item => item.providerId === 'vedurstofan')) return true
  if (process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED !== 'true') return true
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return false
  const [hasWeather, hasChase] = await Promise.all([
    checkFeatureAccess(user.id, user.email, 'vedrid'),
    checkFeatureAccess(user.id, user.email, 'elta-vedrid'),
  ])
  return hasWeather && hasChase
}

export async function POST(request: Request) {
  if (
    process.env.AUTH_MVP_ENABLED !== 'true'
    || getWeatherEnabledMode() === 'off'
    || process.env.WEATHER_ELTA_VEDRID_FLAG !== 'true'
  ) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const body = await request.json().catch(() => null)
  const input = validateWeatherChaseHistoryRequest(body)
  if (!input) {
    return NextResponse.json({ status: 'error', error: 'invalid_request' }, { status: 400 })
  }
  if (!await providerAccessAllowed(input.items)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  try {
    const result = await readWeatherChaseHistory(input)
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch {
    console.error('[weather/forecast-history] read failed')
    return NextResponse.json(
      { status: 'error', error: 'history_unavailable' },
      { status: 503 },
    )
  }
}
