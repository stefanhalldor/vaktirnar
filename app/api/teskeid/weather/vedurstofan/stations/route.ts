import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { readVedurstofanProductForStations } from '@/lib/weather/providers/vedurstofan.server'
import type { VedurstofanStationResult } from '@/lib/weather/providers/vedurstofan.server'
import { VEDURSTOFAN_STATIONS_REGISTRY } from '@/lib/weather/providers/vedurstofanStationsRegistry'
import { buildStationExplorerResponse } from '@/lib/weather/providers/vedurstofanStationExplorer'

const readCachedStationExplorer = unstable_cache(
  async () => {
    const stationIds = VEDURSTOFAN_STATIONS_REGISTRY
      .filter(s => s.stationId !== null)
      .map(s => s.stationId!)
    let results: Map<string, VedurstofanStationResult>
    try {
      const raw = await readVedurstofanProductForStations(stationIds)
      results = raw instanceof Map ? raw : new Map()
    } catch {
      results = new Map()
    }
    return buildStationExplorerResponse(VEDURSTOFAN_STATIONS_REGISTRY, results)
  },
  ['vedurstofan-station-explorer-v1'],
  { revalidate: 60 },
)

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

  // When WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true, require per-user feature access.
  // Otherwise, allow public read of product/cache data (no live fetch, no user data).
  if (process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED === 'true') {
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
  }

  // Product-table read: returns data from vedurstofan_forecasts_latest.
  // Never makes live HTTP requests. Status (ok/stale/unavailable) is determined
  // from expires_at. The assembled response is shared for 60 seconds so every
  // panel open does not repeat the same paginated product-table read.
  const payload = await readCachedStationExplorer()
  return NextResponse.json(payload, {
    headers: {
      // Cache for 60 s in browser only (private — station data is not user-specific but
      // restricted-mode responses must not be served by CDN to other users).
      // stale-while-revalidate allows the browser to serve the cached copy while fetching fresh.
      'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
    },
  })
}
