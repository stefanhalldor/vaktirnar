import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
} as const

/**
 * GET /api/teskeid/weather/route-memory/place-focus?placeKey={key}
 *
 * Returns the endpoint station IDs that best represent a single selected place,
 * derived from existing route-memory rows — no Google calls, no coordinate lookup.
 *
 * Algorithm:
 * - For routes where this place is the FROM endpoint: take the first station per
 *   provider per route (lowest route_order = departure end of the route).
 * - For routes where this place is the TO endpoint: take the last station per
 *   provider per route (highest route_order = arrival end of the route).
 * - Deduplicate across all matching routes and return one set per provider.
 *
 * Output: { vedurstofanStationIds: string[], vegagerdinStationIds: string[] }
 *
 * Access: public (station IDs are not individually sensitive).
 * Added to EXACT_PUBLIC_PATHS in middleware.ts.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const placeKey = searchParams.get('placeKey')?.trim()

  if (!placeKey) {
    return NextResponse.json({ vedurstofanStationIds: [], vegagerdinStationIds: [] }, { headers: NO_STORE_HEADERS })
  }

  try {
    const supabase = getAdmin()

    // Get route IDs where this place is the FROM endpoint
    const { data: fromRoutes } = await supabase
      .from('weather_route_memory_routes')
      .select('id')
      .eq('from_place_key', placeKey)

    // Get route IDs where this place is the TO endpoint
    const { data: toRoutes } = await supabase
      .from('weather_route_memory_routes')
      .select('id')
      .eq('to_place_key', placeKey)

    const fromRouteIds = (fromRoutes ?? []).map(r => r.id as string)
    const toRouteIds = (toRoutes ?? []).map(r => r.id as string)

    const vedurstofanIds = new Set<string>()
    const vegagerdinIds = new Set<string>()

    // From-routes: first station per provider per route (lowest route_order = departure end)
    if (fromRouteIds.length > 0) {
      const { data: stations } = await supabase
        .from('weather_route_memory_stations')
        .select('route_id, provider, station_id, route_order')
        .in('route_id', fromRouteIds)
        .order('route_order', { ascending: true })

      const seen = new Set<string>()
      for (const s of stations ?? []) {
        const routeProviderKey = `${s.route_id as string}:${s.provider as string}`
        if (seen.has(routeProviderKey)) continue
        seen.add(routeProviderKey)
        if (s.provider === 'vedurstofan') vedurstofanIds.add(s.station_id as string)
        else if (s.provider === 'vegagerdin') vegagerdinIds.add(s.station_id as string)
      }
    }

    // To-routes: last station per provider per route (highest route_order = arrival end)
    if (toRouteIds.length > 0) {
      const { data: stations } = await supabase
        .from('weather_route_memory_stations')
        .select('route_id, provider, station_id, route_order')
        .in('route_id', toRouteIds)
        .order('route_order', { ascending: false })

      const seen = new Set<string>()
      for (const s of stations ?? []) {
        const routeProviderKey = `${s.route_id as string}:${s.provider as string}`
        if (seen.has(routeProviderKey)) continue
        seen.add(routeProviderKey)
        if (s.provider === 'vedurstofan') vedurstofanIds.add(s.station_id as string)
        else if (s.provider === 'vegagerdin') vegagerdinIds.add(s.station_id as string)
      }
    }

    return NextResponse.json({
      vedurstofanStationIds: Array.from(vedurstofanIds),
      vegagerdinStationIds: Array.from(vegagerdinIds),
    }, { headers: NO_STORE_HEADERS })
  } catch {
    return NextResponse.json({ vedurstofanStationIds: [], vegagerdinStationIds: [] }, { headers: NO_STORE_HEADERS })
  }
}
