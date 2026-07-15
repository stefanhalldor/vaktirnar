import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { readVedurstofanProductForStations } from '@/lib/weather/providers/vedurstofan.server'
import type { VedurstofanStationResult } from '@/lib/weather/providers/vedurstofan.server'
import { VEDURSTOFAN_STATIONS_REGISTRY } from '@/lib/weather/providers/vedurstofanStationsRegistry'
import { buildStationExplorerResponse } from '@/lib/weather/providers/vedurstofanStationExplorer'

export async function GET() {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (getWeatherEnabledMode() === 'off') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (process.env.WEATHER_ELTA_VEDRID_FLAG !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hasVedrid = await checkFeatureAccess(user.id, user.email, 'vedrid')
  const hasEltaVedrid = await checkFeatureAccess(user.id, user.email, 'elta-vedrid')
  if (!hasVedrid || !hasEltaVedrid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const stationIds = VEDURSTOFAN_STATIONS_REGISTRY
    .filter(s => s.stationId !== null)
    .map(s => s.stationId!)
  // Product-table read: returns data from vedurstofan_forecasts_latest.
  // Never makes live HTTP requests. Status (ok/stale/unavailable) is determined
  // from expires_at. Background warmer must be run to populate the table.
  let results: Map<string, VedurstofanStationResult>
  try {
    results = await readVedurstofanProductForStations(stationIds)
  } catch {
    results = new Map()
  }

  const payload = buildStationExplorerResponse(VEDURSTOFAN_STATIONS_REGISTRY, results)
  return NextResponse.json(payload)
}
