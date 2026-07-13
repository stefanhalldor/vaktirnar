import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { fetchVedurstofanForecastsForStations } from '@/lib/weather/providers/vedurstofan.server'
import type { VedurstofanStationResult } from '@/lib/weather/providers/vedurstofan.server'
import { VEDURSTOFAN_STATIONS } from '@/lib/weather/providers/vedurstofanStations'
import { buildStationExplorerResponse } from '@/lib/weather/providers/vedurstofanStationExplorer'

export async function GET() {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (process.env.WEATHER_ENABLED !== 'true') {
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

  const stationIds = VEDURSTOFAN_STATIONS.map(s => s.stationId)
  let results: Map<string, VedurstofanStationResult>
  try {
    results = await fetchVedurstofanForecastsForStations(stationIds, { timeoutMs: 1500 })
  } catch {
    results = new Map()
  }

  const payload = buildStationExplorerResponse(VEDURSTOFAN_STATIONS, results)
  return NextResponse.json(payload)
}
