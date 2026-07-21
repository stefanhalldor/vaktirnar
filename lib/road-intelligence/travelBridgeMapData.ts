import type { DeterministicResult, RouteWeatherPoint, WeatherStatus } from '@/lib/weather/types'

export type TravelBridgeMapError = 'missing_travel_plan' | 'missing_route_geometry'
export type TravelBridgePointStatus = WeatherStatus | 'no_data'
export type Wgs84Bbox = [west: number, south: number, east: number, north: number]

export type TravelBridgeMapData =
  | {
      ok: true
      routeGeoJson: Record<string, unknown>
      weatherPointGeoJson: Record<string, unknown>
      bbox: Wgs84Bbox
      distanceKm: number
      durationMinutes: number
      pointCount: number
    }
  | { ok: false; error: TravelBridgeMapError }

const ROUTE_STATUS_COLORS: Record<TravelBridgePointStatus, string> = {
  graent: '#2d5a27',
  gult: '#f59e0b',
  rautt: '#dc2626',
  no_data: '#94a3b8',
}

function isFiniteCoord(point: { lat: number; lon: number }): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon)
}

function statusForRouteWeatherPoint(pt: RouteWeatherPoint): TravelBridgePointStatus {
  return pt.summaryForWindow?.status ?? 'graent'
}

function routePointLabel(pt: RouteWeatherPoint): string {
  if (pt.isOrigin) return 'origin'
  if (pt.isDestinationClosest) return 'destination'
  if (pt.isHighlightedIssue) return 'highlight'
  return 'route'
}

function buildBbox(points: Array<{ lat: number; lon: number }>): Wgs84Bbox {
  const lats = points.map(p => p.lat)
  const lons = points.map(p => p.lon)
  return [
    Math.min(...lons),
    Math.min(...lats),
    Math.max(...lons),
    Math.max(...lats),
  ]
}

export function buildTravelBridgeMapData(result: DeterministicResult): TravelBridgeMapData {
  const plan = result.travelPlan
  if (!plan) return { ok: false, error: 'missing_travel_plan' }

  const routePoints = (
    plan.route.auditPolylinePoints && plan.route.auditPolylinePoints.length >= 2
      ? plan.route.auditPolylinePoints
      : (plan.routeWeatherPoints ?? []).map(pt => ({ lat: pt.lat, lon: pt.lon }))
  ).filter(isFiniteCoord)

  if (routePoints.length < 2) return { ok: false, error: 'missing_route_geometry' }

  const weatherPointFeatures = (plan.routeWeatherPoints ?? [])
    .filter(pt => isFiniteCoord(pt))
    .map((pt) => {
      const status = statusForRouteWeatherPoint(pt)
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [pt.lon, pt.lat],
        },
        properties: {
          id: pt.id,
          routeIndex: pt.routeIndex,
          totalRouteWeatherPoints: pt.totalRouteWeatherPoints,
          status,
          color: ROUTE_STATUS_COLORS[status],
          markerKind: routePointLabel(pt),
          isOrigin: Boolean(pt.isOrigin),
          isDestinationClosest: Boolean(pt.isDestinationClosest),
          isHighlightedIssue: Boolean(pt.isHighlightedIssue),
          distanceKm: pt.distanceFromOriginM / 1000,
          etaIso: pt.summaryForWindow?.etaIso ?? null,
          forecastTimeIso: pt.summaryForWindow?.forecastTimeIso ?? null,
          windMs: pt.summaryForWindow?.worstWindMs ?? null,
          gustMs: pt.summaryForWindow?.worstGustMs ?? null,
          precipMmPerHour: pt.summaryForWindow?.worstPrecipMmPerHour ?? null,
        },
      }
    })

  return {
    ok: true,
    routeGeoJson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: routePoints.map(pt => [pt.lon, pt.lat]),
          },
          properties: {
            status: result.stada,
            distanceKm: plan.route.distanceKm,
            durationMinutes: plan.route.durationMinutes,
          },
        },
      ],
    },
    weatherPointGeoJson: {
      type: 'FeatureCollection',
      features: weatherPointFeatures,
    },
    bbox: buildBbox(routePoints),
    distanceKm: plan.route.distanceKm,
    durationMinutes: plan.route.durationMinutes,
    pointCount: weatherPointFeatures.length,
  }
}
