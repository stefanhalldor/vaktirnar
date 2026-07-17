/**
 * Tests for POST /api/teskeid/weather/travel/provider-stations
 *
 * Lightweight endpoint: returns Veðurstofan stations matched to a route polyline,
 * with forecast data for the route-selection step preview card.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))
const { mockCheckFeatureAccess } = vi.hoisted(() => ({ mockCheckFeatureAccess: vi.fn() }))
const { mockMatchProviderPoints } = vi.hoisted(() => ({ mockMatchProviderPoints: vi.fn() }))
const { mockReadVedurstofanProduct } = vi.hoisted(() => ({ mockReadVedurstofanProduct: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/loans/guard', () => ({
  checkFeatureAccess: mockCheckFeatureAccess,
}))

vi.mock('@/lib/weather/providers/vedurstofan.server', () => ({
  readVedurstofanProductForStations: mockReadVedurstofanProduct,
}))

vi.mock('@/lib/weather/providerRouteMatching', () => ({
  DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M: 1_000,
  matchProviderPointsToRoute: mockMatchProviderPoints,
}))

// Registry: default two stations
vi.mock('@/lib/weather/providers/vedurstofanStationsRegistry', () => ({
  VEDURSTOFAN_STATIONS_REGISTRY: [
    {
      stationId: 'S1',
      name: 'Hellisheiði',
      lat: 64.04,
      lon: -21.37,
      sourceUrl: 'https://www.vedur.is/vedur/stodvar/?s=hellih',
    },
    {
      stationId: 'S2',
      name: 'Grafningur',
      lat: 64.10,
      lon: -21.20,
      sourceUrl: 'https://www.vedur.is/vedur/stodvar/?s=grafn',
    },
  ],
}))

import { POST } from '@/app/api/teskeid/weather/travel/provider-stations/route'

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROUTE_POINTS = [
  { lat: 64.09, lon: -21.93 },
  { lat: 64.04, lon: -21.37 },
  { lat: 63.85, lon: -21.00 },
]

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/teskeid/weather/travel/provider-stations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function signedInUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@example.com' } } })
}

function signedOutUser() {
  mockGetUser.mockResolvedValue({ data: { user: null } })
}

function makeStationMatch(stationId: string, distanceFromOriginM = 5_000) {
  return {
    point: { id: stationId, name: 'Hellisheiði', lat: 64.04, lon: -21.37 },
    distanceM: 2_000,
    distanceFromOriginM,
    routeFraction: distanceFromOriginM / 50_000,
    nearestRoutePoint: { lat: 64.04, lon: -21.37 },
  }
}

function makeStationResult(stationId = 'S1') {
  return new Map([
    [stationId, {
      status: 'ok' as const,
      payload: {
        source: 'vedurstofan' as const,
        endpoint: 'xml' as const,
        type: 'forec' as const,
        lang: 'is' as const,
        timeStep: '3h' as const,
        params: ['F', 'D', 'T', 'R', 'W'] as ['F', 'D', 'T', 'R', 'W'],
        stationId,
        stationName: 'Hellisheiði',
        atimeIso: '2026-07-16T06:00:00Z',
        fetchedAtIso: '2026-07-16T06:05:00Z',
        expiresAtIso: '2026-07-16T18:00:00Z',
        attribution: {
          provider: 'Veðurstofa Íslands' as const,
          downloadedAtIso: '2026-07-16T06:05:00Z',
          serviceUrl: 'https://xmlweather.vedur.is',
        },
        forecasts: [
          {
            ftimeIso: '2026-07-16T09:00:00Z',
            windSpeedMs: 5,
            windDirectionText: 'NV',
            temperatureC: 8,
            precipitationMmPerHour: 0,
            weatherText: 'Skýjað',
          },
        ],
        parseErrors: [],
      },
    }],
  ])
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  process.env.WEATHER_ENABLED = 'true'
  delete process.env.WEATHER_PUBLIC_ENABLED
  delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED

  signedInUser()
  mockCheckFeatureAccess.mockResolvedValue(true)
  mockMatchProviderPoints.mockReturnValue([])
  mockReadVedurstofanProduct.mockResolvedValue(new Map())
})

afterEach(() => {
  delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/teskeid/weather/travel/provider-stations — auth', () => {
  it('returns 401 when base weather access is blocked (signed-out in Authenticated mode)', async () => {
    signedOutUser()
    const res = await POST(makeRequest({ routePoints: ROUTE_POINTS }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true and user lacks provider access', async () => {
    process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED = 'true'
    mockCheckFeatureAccess.mockResolvedValue(false)
    const res = await POST(makeRequest({ routePoints: ROUTE_POINTS }))
    expect(res.status).toBe(403)
  })

  it('returns 401 when access required and signed-out user is blocked by base weather access', async () => {
    process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED = 'true'
    signedOutUser()
    const res = await POST(makeRequest({ routePoints: ROUTE_POINTS }))
    // Gate 1 (base weather) blocks signed-out users in Authenticated mode before Gate 2 (provider) runs
    expect(res.status).toBe(401)
  })

  it('returns 200 when WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED not set (open access)', async () => {
    mockMatchProviderPoints.mockReturnValue([makeStationMatch('S1')])
    mockReadVedurstofanProduct.mockResolvedValue(makeStationResult('S1'))
    const res = await POST(makeRequest({ routePoints: ROUTE_POINTS }))
    expect(res.status).toBe(200)
  })

  it('returns 200 for signed-out user in WEATHER_ENABLED=All mode with open provider', async () => {
    process.env.WEATHER_ENABLED = 'All'
    signedOutUser()
    mockMatchProviderPoints.mockReturnValue([])
    const res = await POST(makeRequest({ routePoints: ROUTE_POINTS }))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/teskeid/weather/travel/provider-stations — validation', () => {
  it('returns 400 when routePoints is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when routePoints is empty array', async () => {
    const res = await POST(makeRequest({ routePoints: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when routePoints exceeds 1000 entries', async () => {
    const points = Array.from({ length: 1001 }, (_, i) => ({ lat: 64 + i * 0.001, lon: -21 }))
    const res = await POST(makeRequest({ routePoints: points }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when a route point has non-finite lat', async () => {
    const res = await POST(makeRequest({ routePoints: [{ lat: NaN, lon: -21.93 }] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when a route point has non-finite lon', async () => {
    const res = await POST(makeRequest({ routePoints: [{ lat: 64.09, lon: Infinity }] }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/teskeid/weather/travel/provider-stations — station matching', () => {
  it('returns empty stations when no stations match route', async () => {
    mockMatchProviderPoints.mockReturnValue([])
    const res = await POST(makeRequest({ routePoints: ROUTE_POINTS }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.stations).toEqual([])
    expect(data.status).toBe('unavailable')
  })

  it('does not call readVedurstofanProductForStations when no stations matched', async () => {
    mockMatchProviderPoints.mockReturnValue([])
    await POST(makeRequest({ routePoints: ROUTE_POINTS }))
    expect(mockReadVedurstofanProduct).not.toHaveBeenCalled()
  })

  it('passes maxDistanceM=1000 (DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M) to matchProviderPointsToRoute', async () => {
    mockMatchProviderPoints.mockReturnValue([makeStationMatch('S1')])
    mockReadVedurstofanProduct.mockResolvedValue(makeStationResult('S1'))
    await POST(makeRequest({ routePoints: ROUTE_POINTS }))
    const args = mockMatchProviderPoints.mock.calls[0][0]
    expect(args.maxDistanceM).toBe(1_000)
  })

  it('returns station list with expected fields when stations match', async () => {
    mockMatchProviderPoints.mockReturnValue([makeStationMatch('S1', 5_000)])
    mockReadVedurstofanProduct.mockResolvedValue(makeStationResult('S1'))

    const res = await POST(makeRequest({ routePoints: ROUTE_POINTS }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.status).toBe('available')
    expect(data.stations).toHaveLength(1)

    const station = data.stations[0]
    expect(station.stationId).toBe('S1')
    expect(station.stationName).toBe('Hellisheiði')
    expect(station.lat).toBe(64.04)
    expect(station.lon).toBe(-21.37)
    expect(station.distanceM).toBe(2_000)
    expect(station.distanceFromOriginM).toBe(5_000)
    expect(station.sourceUrl).toBe('https://www.vedur.is/vedur/stodvar/?s=hellih')
    expect(Array.isArray(station.forecastRows)).toBe(true)
    expect(station.forecastRows[0].windSpeedMs).toBe(5)
  })

  it('excludes stations with status=unavailable from result', async () => {
    mockMatchProviderPoints.mockReturnValue([makeStationMatch('S1'), makeStationMatch('S2', 10_000)])
    mockReadVedurstofanProduct.mockResolvedValue(
      new Map([
        ['S1', { status: 'ok' as const, payload: makeStationResult('S1').get('S1')!.payload }],
        ['S2', { status: 'unavailable' as const }],
      ]),
    )

    const res = await POST(makeRequest({ routePoints: ROUTE_POINTS }))
    const data = await res.json()
    expect(data.stations).toHaveLength(1)
    expect(data.stations[0].stationId).toBe('S1')
  })

  it('returns unavailable (not 503) when product fetch fails', async () => {
    mockMatchProviderPoints.mockReturnValue([makeStationMatch('S1')])
    mockReadVedurstofanProduct.mockRejectedValue(new Error('DB error'))

    const res = await POST(makeRequest({ routePoints: ROUTE_POINTS }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.stations).toEqual([])
    expect(data.status).toBe('unavailable')
  })

  it('sorts stations by distanceFromOriginM ascending', async () => {
    mockMatchProviderPoints.mockReturnValue([
      makeStationMatch('S1', 30_000),
      makeStationMatch('S2', 10_000),
    ])
    mockReadVedurstofanProduct.mockResolvedValue(
      new Map([
        ['S1', { status: 'ok' as const, payload: makeStationResult('S1').get('S1')!.payload }],
        ['S2', {
          status: 'ok' as const,
          payload: {
            ...makeStationResult('S1').get('S1')!.payload,
            stationId: 'S2',
            stationName: 'Grafningur',
          },
        }],
      ]),
    )

    const res = await POST(makeRequest({ routePoints: ROUTE_POINTS }))
    const data = await res.json()
    expect(data.stations[0].stationId).toBe('S2') // 10_000 first
    expect(data.stations[1].stationId).toBe('S1') // 30_000 second
  })
})
