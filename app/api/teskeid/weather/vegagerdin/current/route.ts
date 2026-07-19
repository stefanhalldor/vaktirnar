import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { readVegagerdinCurrentWithHistoryFallback } from '@/lib/weather/providers/vegagerdinCurrent.server'
import type { VegagerdinCurrentStationDto } from '@/lib/weather/providers/vegagerdinCurrentTypes'

export async function GET() {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (getWeatherEnabledMode() === 'off') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // When WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true, require the user to be
  // signed in and have the provider-specific feature_access row.
  //
  // Access contract:
  //   - Does NOT require a 'vedrid' row — provider access is independent of base weather access.
  //   - Only checks 'weather-provider-vegagerdin'. If you have the provider row, you get in.
  //   - In WEATHER_ENABLED=All mode: signed-out users get base weather via public tier, so a
  //     user with only a provider row (no vedrid) must still be signed in for restricted mode.
  //   - Graduation: delete WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED → open to all weather users.
  if (process.env.WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED === 'true') {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const hasVegagerdin = await checkFeatureAccess(user.id, user.email, 'weather-provider-vegagerdin')
    if (!hasVegagerdin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Cache-first read with history fallback. Never contacts upstream Vegagerðin API.
  const result = await readVegagerdinCurrentWithHistoryFallback()

  if (result.status === 'unavailable') {
    return NextResponse.json({ status: 'unavailable', reason: result.reason, stations: [] }, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    })
  }

  const { payload, cacheStatus, measurementFreshness } = result

  // Explicit DTO mapping — do not pass internal measurement shape directly.
  // This decouples the public API contract from server-internal provider types.
  const stations: VegagerdinCurrentStationDto[] = payload.measurements.map(m => ({
    stationId: m.stationId,
    stationName: m.stationName,
    lat: m.lat,
    lon: m.lon,
    measuredAtIso: m.measuredAtIso,
    fetchedAtIso: m.fetchedAtIso,
    meanWindMs: m.meanWindMs,
    gustLast10MinMs: m.gustLast10MinMs,
    windDirectionDeg: m.windDirectionDeg,
    windDirectionText: m.windDirectionText,
    airTemperatureC: m.airTemperatureC,
    roadTemperatureC: m.roadTemperatureC,
    dataQuality: m.dataQuality,
  }))

  return NextResponse.json(
    {
      status: 'ok',
      cacheStatus,
      measurementFreshness,
      fetchedAtIso: payload.fetchedAtIso,
      oldestMeasuredAtIso: payload.oldestMeasuredAtIso,
      stations,
    },
    {
      headers: {
        // Short browser cache: data is current measurements, not user-specific.
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
      },
    },
  )
}
