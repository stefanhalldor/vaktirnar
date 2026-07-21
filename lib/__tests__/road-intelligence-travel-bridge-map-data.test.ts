import { describe, expect, it } from 'vitest'
import type { DeterministicResult, RouteWeatherPoint } from '@/lib/weather/types'
import { buildTravelBridgeMapData } from '@/lib/road-intelligence/travelBridgeMapData'

function makeResult(overrides: Partial<DeterministicResult> = {}): DeterministicResult {
  return {
    id: 'test',
    source: 'deterministic',
    toolName: 'travel',
    createdAt: '2026-07-21T09:00:00.000Z',
    svar: 'Prófun',
    stada: 'gult',
    ...overrides,
  }
}

function makePoint(overrides: Partial<RouteWeatherPoint> = {}): RouteWeatherPoint {
  return {
    id: 'pt-1',
    routeIndex: 0,
    totalRouteWeatherPoints: 2,
    lat: 64.1466,
    lon: -21.9426,
    forecastLat: 64.15,
    forecastLon: -21.94,
    distanceFromOriginM: 0,
    routeFraction: 0,
    googleMapsUrl: 'https://maps.example.test',
    metnoUrl: 'https://api.met.no/example',
    yrnoUrl: 'https://yr.no/example',
    ...overrides,
  }
}

describe('buildTravelBridgeMapData', () => {
  it('rejects a result without travelPlan', () => {
    expect(buildTravelBridgeMapData(makeResult())).toEqual({
      ok: false,
      error: 'missing_travel_plan',
    })
  })

  it('builds route line, weather point features, and bbox from a travel result', () => {
    const result = buildTravelBridgeMapData(makeResult({
      travelPlan: {
        route: {
          originName: 'Reykjavík',
          destinationName: 'Akureyri',
          distanceKm: 389,
          durationMinutes: 288,
          auditPolylinePoints: [
            { lat: 64.1466, lon: -21.9426 },
            { lat: 65.6835, lon: -18.0878 },
          ],
        },
        outbound: {
          earliestDepartureIso: '2026-07-21T09:00:00.000Z',
          candidates: [],
          badWindows: [],
          windowMode: false,
        },
        routeWeatherPoints: [
          makePoint({
            id: 'origin',
            isOrigin: true,
            summaryForWindow: {
              status: 'graent',
              worstWindMs: 4,
              worstGustMs: 8,
              worstPrecipMmPerHour: 0,
              etaIso: '2026-07-21T09:00:00.000Z',
            },
          }),
          makePoint({
            id: 'north',
            routeIndex: 1,
            lat: 65.6835,
            lon: -18.0878,
            distanceFromOriginM: 389000,
            routeFraction: 1,
            isDestinationClosest: true,
            summaryForWindow: {
              status: 'gult',
              worstWindMs: 11,
              worstGustMs: 18,
              worstPrecipMmPerHour: 0.2,
              etaIso: '2026-07-21T13:48:00.000Z',
            },
          }),
        ],
      },
    }))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.distanceKm).toBe(389)
    expect(result.durationMinutes).toBe(288)
    expect(result.pointCount).toBe(2)
    expect(result.bbox).toEqual([-21.9426, 64.1466, -18.0878, 65.6835])

    const routeFeature = (result.routeGeoJson['features'] as Array<Record<string, unknown>>)[0]
    expect(routeFeature['geometry']).toMatchObject({
      type: 'LineString',
      coordinates: [
        [-21.9426, 64.1466],
        [-18.0878, 65.6835],
      ],
    })

    const pointFeatures = result.weatherPointGeoJson['features'] as Array<Record<string, unknown>>
    expect(pointFeatures[0]['properties']).toMatchObject({
      id: 'origin',
      status: 'graent',
      color: '#2d5a27',
      markerKind: 'origin',
      windMs: 4,
      gustMs: 8,
    })
    expect(pointFeatures[1]['properties']).toMatchObject({
      id: 'north',
      status: 'gult',
      color: '#f59e0b',
      markerKind: 'destination',
      distanceKm: 389,
    })
  })

  it('falls back to routeWeatherPoints when auditPolylinePoints are missing', () => {
    const result = buildTravelBridgeMapData(makeResult({
      travelPlan: {
        route: {
          originName: 'A',
          destinationName: 'B',
          distanceKm: 1,
          durationMinutes: 2,
        },
        outbound: {
          earliestDepartureIso: '2026-07-21T09:00:00.000Z',
          candidates: [],
          badWindows: [],
          windowMode: false,
        },
        routeWeatherPoints: [
          makePoint({ id: 'a', lat: 64, lon: -22 }),
          makePoint({ id: 'b', lat: 65, lon: -21, routeIndex: 1 }),
        ],
      },
    }))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const routeFeature = (result.routeGeoJson['features'] as Array<Record<string, unknown>>)[0]
    expect(routeFeature['geometry']).toMatchObject({
      type: 'LineString',
      coordinates: [
        [-22, 64],
        [-21, 65],
      ],
    })
  })
})
