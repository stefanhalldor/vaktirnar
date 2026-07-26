import { NextRequest, NextResponse } from 'next/server'
import { findIcelandRoadGraphAlternatives, findIcelandRoadGraphRoute, ICELAND_ROUTING_PROFILES } from '@/lib/iceland-routes/roadGraph'
import { getIcelandRoadGraph } from '@/lib/iceland-routes/roadGraphRuntime.server'
import { validateIcelandicCoords } from '@/lib/weather/coords'
import { readVegagerdinCurrentWithHistoryFallback } from '@/lib/weather/providers/vegagerdinCurrent.server'
import { matchProviderPointsToRoute } from '@/lib/weather/providerRouteMatching'

export const dynamic = 'force-dynamic'
const enabled = () => process.env.NODE_ENV !== 'production' || process.env.TESKEID_ROUTE_LAB_ENABLED === 'true'
type Point = { lat: number; lon: number }
type Body = { origin?: Point; destination?: Point; alternatives?: boolean; pavedOnly?: boolean }

export async function POST(request: NextRequest) {
  if (!enabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const body = await request.json().catch(() => null) as Body | null
  if (!body?.origin || !body.destination || !validateIcelandicCoords(body.origin.lat, body.origin.lon) || !validateIcelandicCoords(body.destination.lat, body.destination.lon)) return NextResponse.json({ error: 'invalid_points' }, { status: 400 })
  try {
    const graph = await getIcelandRoadGraph()
    const profile = body.pavedOnly ? ICELAND_ROUTING_PROFILES.fastestPaved : ICELAND_ROUTING_PROFILES.fastestCar
    const primary = findIcelandRoadGraphRoute(graph, body.origin, body.destination, { profile, maxSnapDistanceM: 25_000 })
    if (primary.status !== 'ok') return NextResponse.json({ status: primary.status, routes: [] })
    const alternatives = body.alternatives ? findIcelandRoadGraphAlternatives(graph, body.origin, body.destination, { profile, maxSnapDistanceM: 25_000, maxAlternatives: 3, maxOverlap: 0.94 }) : []
    const candidates = [{ route: primary.route, originSnapDistanceM: primary.originSnapDistanceM, destinationSnapDistanceM: primary.destinationSnapDistanceM, overlapWithPrimary: 1 }, ...alternatives]
    const current = await readVegagerdinCurrentWithHistoryFallback().catch(() => ({ status: 'unavailable' as const, reason: 'read_failed' as const }))
    const routes = candidates.map((candidate, index) => {
      const stations = current.status !== 'unavailable' ? matchProviderPointsToRoute({
        points: current.payload.measurements.map(item => ({ id: item.stationId, ...item })),
        routePolyline: candidate.route.geometry,
        maxDistanceM: 5_000,
        maxPoints: 30,
      }).map(match => ({ stationId: match.point.stationId, name: match.point.stationName, distanceFromOriginM: match.distanceFromOriginM, measuredAtIso: match.point.measuredAtIso, windMs: match.point.meanWindMs, gustMs: match.point.gustLast10MinMs, roadTemperatureC: match.point.roadTemperatureC })) : []
      return { id: `route-${index + 1}`, geometry: candidate.route.geometry, distanceM: candidate.route.distanceM, durationS: candidate.route.durationS, surface: candidate.route.surface, segmentCount: candidate.route.segmentIds.length, originSnapDistanceM: candidate.originSnapDistanceM, destinationSnapDistanceM: candidate.destinationSnapDistanceM, overlapWithPrimary: candidate.overlapWithPrimary, warnings: [...(candidate.route.surface.gravelM > 0 ? ['gravel'] : []), ...(candidate.route.surface.mixedM > 0 ? ['mixed_surface'] : []), ...(candidate.route.surface.unknownM > 0 ? ['unknown_surface'] : []), ...(candidate.originSnapDistanceM > 1_000 || candidate.destinationSnapDistanceM > 1_000 ? ['long_snap'] : []), 'derived_speed'], vegagerdin: { status: current.status, stations } }
    })
    return NextResponse.json({ status: 'ok', routes })
  } catch { return NextResponse.json({ error: 'route_lab_unavailable' }, { status: 503 }) }
}
