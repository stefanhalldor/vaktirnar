/**
 * Tests for POST /api/teskeid/weather/travel/route (final-submit path).
 *
 * Focused regression: a selected curated route (CURATED_VIA_THRENGSLAVEGUR)
 * must survive final-submit recomputation without returning selected_route_unavailable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))
const { mockCheckFeatureAccess } = vi.hoisted(() => ({ mockCheckFeatureAccess: vi.fn() }))
const { mockGetRouteOptions } = vi.hoisted(() => ({ mockGetRouteOptions: vi.fn() }))
const { mockGetRouteGeometry } = vi.hoisted(() => ({ mockGetRouteGeometry: vi.fn() }))
const { mockFetchForecast } = vi.hoisted(() => ({ mockFetchForecast: vi.fn() }))
const { mockSampleRouteWeatherPoints } = vi.hoisted(() => ({ mockSampleRouteWeatherPoints: vi.fn() }))
const { mockFetchVedurstofan } = vi.hoisted(() => ({ mockFetchVedurstofan: vi.fn() }))
const { mockMatchProviderPoints } = vi.hoisted(() => ({
  mockMatchProviderPoints: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/loans/guard', () => ({
  checkFeatureAccess: mockCheckFeatureAccess,
}))

vi.mock('@/lib/weather/provider.server', () => ({
  getWeatherMapProvider: vi.fn(() => ({
    getRouteOptions: mockGetRouteOptions,
    getRouteGeometry: mockGetRouteGeometry,
  })),
}))

vi.mock('@/lib/weather/metno.server', () => ({
  fetchForecast: mockFetchForecast,
}))

vi.mock('@/lib/weather/routeSampling', () => ({
  sampleRouteWeatherPoints: mockSampleRouteWeatherPoints,
}))

vi.mock('@/lib/weather/providers/vedurstofan.server', () => ({
  readVedurstofanProductForStations: mockFetchVedurstofan,
  getLastVedurstofanWarmAttemptIso: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/weather/providers/vedurstofanStations', () => ({
  VEDURSTOFAN_STATIONS: [],
}))

vi.mock('@/lib/weather/providerRouteMatching', () => ({
  haversineM: vi.fn((lat1: number, lon1: number, lat2: number, lon2: number) => {
    // Real haversine for cumDist computation in route.ts
    const R = 6_371_000
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }),
  matchProviderPointsToRoute: mockMatchProviderPoints,
}))

import { POST } from '@/app/api/teskeid/weather/travel/route'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Valid Iceland coordinates for Garðabær and Þorlákshöfn
const GARDABAER = { name: 'Garðabær', lat: 64.09, lon: -21.93 }
const THORLAKSHOFN = { name: 'Þorlákshöfn', lat: 63.849, lon: -21.365 }

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/teskeid/weather/travel/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function authedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@example.com' } } })
  mockCheckFeatureAccess.mockResolvedValue(true)
}

function makeRouteOption(id: string, labels: string[], routeIndex = 0) {
  return {
    id,
    routeIndex,
    provider: 'google' as const,
    labels,
    isDefault: labels.includes('DEFAULT_ROUTE'),
    points: [
      { lat: 64.09, lon: -21.93 },
      { lat: 63.849, lon: -21.365 },
    ],
    distanceM: 56000,
    durationS: 3420,
  }
}

function makeHour(time: string) {
  return {
    time,
    airTemperatureC: 10,
    windSpeedMs: 3,
    windGustMs: 5,
    windFromDegrees: 180,
    precipitationMmPerHour: 0,
    symbolCode: 'clearsky_day',
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  process.env.WEATHER_ENABLED = 'true'
  delete process.env.WEATHER_PUBLIC_ENABLED
  delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
  delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED

  mockSampleRouteWeatherPoints.mockReturnValue({
    weatherPoints: [{
      lat: 64.09, lon: -21.93,
      forecastLat: 64.09, forecastLon: -21.93,
      routeIndex: 0, distanceFromOriginM: 0,
    }],
    diagnostics: { strategy: 'exhaustive', totalCells: 1, sampledCells: 1 },
  })

  mockFetchForecast.mockResolvedValue([
    makeHour('2026-07-10T08:00:00Z'),
    makeHour('2026-07-10T09:00:00Z'),
    makeHour('2026-07-10T10:00:00Z'),
  ])

  // Default route geometry for non-selectedRouteId tests
  mockGetRouteGeometry.mockResolvedValue({
    points: [{ lat: 64.09, lon: -21.93 }, { lat: 63.849, lon: -21.365 }],
    distanceM: 56000,
    durationS: 3420,
  })

  // Default: no Veðurstofan stations matched — enrichment is skipped
  mockMatchProviderPoints.mockReturnValue([])
  mockFetchVedurstofan.mockResolvedValue(new Map())
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/teskeid/weather/travel/route — auth / public access', () => {
  it('signed-in user without vedrid is allowed in Authenticated mode (legacy: WEATHER_ENABLED=true)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'novedrid@example.com' } } })
    mockCheckFeatureAccess.mockResolvedValue(false)
    // WEATHER_ENABLED=true + no WEATHER_PUBLIC_ENABLED = authenticated mode → all signed-in users allowed
    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
  })

  it('signed-out guest returns 401 in Authenticated mode', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    process.env.WEATHER_ENABLED = 'Authenticated'
    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(401)
  })

  it('legacy fallback for All mode: signed-in user without vedrid gets MET/Yr when WEATHER_ENABLED=true + WEATHER_PUBLIC_ENABLED=true', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'novedrid@example.com' } } })
    mockCheckFeatureAccess.mockResolvedValue(false)
    process.env.WEATHER_PUBLIC_ENABLED = 'true'
    mockGetRouteOptions.mockResolvedValue([makeRouteOption('google-0', ['DEFAULT_ROUTE'])])
    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
  })

  it('legacy fallback for All mode: signed-in user without vedrid and without provider access does not get Veðurstofan layer', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'novedrid@example.com' } } })
    // Both vedrid and weather-provider-vedurstofan calls return false
    mockCheckFeatureAccess.mockResolvedValue(false)
    process.env.WEATHER_PUBLIC_ENABLED = 'true'
    mockGetRouteOptions.mockResolvedValue([makeRouteOption('google-0', ['DEFAULT_ROUTE'])])
    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    expect(mockFetchVedurstofan).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.vedurstofanLayer).toBeUndefined()
  })

  it('includes vedurstofanLayer for signed-in public-tier user with weather-provider-vedurstofan access (WEATHER_ENABLED=All)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-public', email: 'provider@example.com' } } })
    // First call: vedrid → false (public-tier in All mode), second call: weather-provider-vedurstofan → true
    mockCheckFeatureAccess.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    process.env.WEATHER_ENABLED = 'All'
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )
    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.vedurstofanLayer).toBeDefined()
    expect(body.vedurstofanLayer.status).toBe('available')
  })
})

describe('POST /api/teskeid/weather/travel/route — curated route final-submit', () => {
  it('succeeds when selectedRouteId matches a curated CURATED_VIA_THRENGSLAVEGUR route', async () => {
    authedUser()
    const curatedId = 'google-56000-64.0900,-21.9300-63.9695,-21.6475-63.8490,-21.3650'
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-default-id', ['DEFAULT_ROUTE']),
      makeRouteOption(curatedId, ['CURATED_VIA_THRENGSLAVEGUR'], -1),
    ])

    const res = await POST(makeRequest({
      origin: { ...GARDABAER, placeId: 'ChIJgardabaer' },
      destination: { ...THORLAKSHOFN, placeId: 'ChIJU1N290hC1kgRypBJRWS0YX4' },
      trailerKind: 'none',
      selectedRouteId: curatedId,
    }))

    expect(res.status).not.toBe(422)
    const body = await res.json()
    expect(body.error).not.toBe('selected_route_unavailable')
  })

  it('returns selected_route_unavailable when curated id is not in provider results', async () => {
    authedUser()
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-default-id', ['DEFAULT_ROUTE']),
    ])

    const res = await POST(makeRequest({
      origin: { ...GARDABAER, placeId: 'ChIJgardabaer' },
      destination: { ...THORLAKSHOFN, placeId: 'ChIJU1N290hC1kgRypBJRWS0YX4' },
      trailerKind: 'none',
      selectedRouteId: 'google-curated-id-not-in-results',
    }))

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('selected_route_unavailable')
  })

  it('uses the curated route geometry for weather sampling, not the default route', async () => {
    authedUser()
    const curatedId = 'google-56000-curated'
    const curatedPoints = [
      { lat: 64.09, lon: -21.93 },
      { lat: 63.97, lon: -21.52 },  // via Þrengslavegur
      { lat: 63.849, lon: -21.365 },
    ]
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-default-id', ['DEFAULT_ROUTE']),
      {
        id: curatedId,
        routeIndex: -1,
        provider: 'google' as const,
        labels: ['CURATED_VIA_THRENGSLAVEGUR'],
        isDefault: false,
        points: curatedPoints,
        distanceM: 56000,
        durationS: 3420,
      },
    ])

    await POST(makeRequest({
      origin: { ...GARDABAER, placeId: 'ChIJgardabaer' },
      destination: { ...THORLAKSHOFN, placeId: 'ChIJU1N290hC1kgRypBJRWS0YX4' },
      trailerKind: 'none',
      selectedRouteId: curatedId,
    }))

    // sampleRouteWeatherPoints should have been called with the curated route's points
    const samplingCall = mockSampleRouteWeatherPoints.mock.calls[0]
    expect(samplingCall[0]).toEqual(curatedPoints)
  })
})

// ── Veðurstofan travel layer ───────────────────────────────────────────────────

const HELLISH_ID = '31392'

function makeVedurstofanPayload() {
  return {
    source: 'vedurstofan' as const,
    endpoint: 'xml' as const,
    type: 'forec' as const,
    lang: 'is' as const,
    timeStep: '3h' as const,
    params: ['F', 'D', 'T', 'R', 'W'] as ['F', 'D', 'T', 'R', 'W'],
    stationId: HELLISH_ID,
    stationName: 'Hellisheiði',
    atimeIso: '2026-07-10T06:00:00Z',
    fetchedAtIso: new Date().toISOString(),
    expiresAtIso: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    attribution: { provider: 'Veðurstofa Íslands' as const, downloadedAtIso: '', serviceUrl: '' },
    forecasts: [
      { ftimeIso: '2026-07-10T09:00:00Z', windSpeedMs: 12, windDirectionText: 'N', temperatureC: 5, precipitationMmPerHour: 0.5, weatherText: 'Skýjað' },
      { ftimeIso: '2026-07-10T12:00:00Z', windSpeedMs: 8, windDirectionText: 'NV', temperatureC: 6, precipitationMmPerHour: 0, weatherText: 'Hlýtt' },
    ],
    parseErrors: [],
  }
}

function setupLayerEnabled() {
  // authedUser() makes checkFeatureAccess return true for all calls, including weather-provider-vedurstofan.
  // No separate env var needed — the gate is now purely per-user feature access.
}

// Hellisheiði coords (~64.04, -21.37) — clearly distinct from Garðabær (64.09, -21.93)
function makeStationMatch(stationId: string, distanceFromOriginM = 5_000) {
  return {
    point: { id: stationId, name: 'Hellisheiði', lat: 64.04, lon: -21.37 },
    distanceM: 2_000,
    distanceFromOriginM,
    routeFraction: distanceFromOriginM / 56_000,
    nearestRoutePoint: { lat: 64.04, lon: -21.37 },
  }
}

function setupStationMapping() {
  mockMatchProviderPoints.mockReturnValue([makeStationMatch(HELLISH_ID)])
}

describe('POST /api/teskeid/weather/travel/route — Veðurstofan layer', () => {
  it('does not call product table and returns no vedurstofanLayer when user lacks weather-provider-vedurstofan access', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@example.com' } } })
    // First call: vedrid access (allow), second call: weather-provider-vedurstofan access (deny)
    mockCheckFeatureAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(mockFetchVedurstofan).not.toHaveBeenCalled()
    expect(body.vedurstofanLayer).toBeUndefined()
  })

  it('includes vedurstofanLayer with points when layer is enabled', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.vedurstofanLayer).toBeDefined()
    expect(body.vedurstofanLayer.experimental).toBe(true)
    expect(body.vedurstofanLayer.status).toBe('available')
    expect(body.vedurstofanLayer.augmentedResult).toBeUndefined()
    expect(body.vedurstofanLayer.points).toHaveLength(1)
    expect(body.vedurstofanLayer.points[0].stationId).toBe(HELLISH_ID)
    expect(body.vedurstofanLayer.points[0].forecastRows).toHaveLength(2)
  })

  it('baseline result is unchanged and has no vedurstofanStation when layer is enabled', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    const body = await res.json()
    expect(body.stada).toBeDefined()
    expect(body.travelPlan?.routeWeatherPoints?.[0]?.vedurstofanStation).toBeUndefined()
  })

  it('returns vedurstofanLayer.status unavailable and empty points when product table is empty', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(new Map())

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stada).toBeDefined()
    expect(body.vedurstofanLayer.status).toBe('unavailable')
    expect(body.vedurstofanLayer.points).toHaveLength(0)
  })

  it('excludes unavailable station from layer points (fail-open)', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'unavailable' }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    const body = await res.json()
    expect(body.stada).toBeDefined()
    expect(body.vedurstofanLayer.status).toBe('unavailable')
    expect(body.vedurstofanLayer.points).toHaveLength(0)
  })

  it('includes stale station data in layer points with status stale', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'stale', payload: makeVedurstofanPayload() }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    const body = await res.json()
    expect(body.vedurstofanLayer.status).toBe('available')
    expect(body.vedurstofanLayer.points[0].status).toBe('stale')
    expect(body.vedurstofanLayer.points[0].forecastRows).toHaveLength(2)
  })

  it('does not call product table when no stations are matched for the route', async () => {
    authedUser()
    setupLayerEnabled()
    mockMatchProviderPoints.mockReturnValue([])

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    expect(mockFetchVedurstofan).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.vedurstofanLayer).toBeUndefined()
  })

  it('does not read product table or return vedurstofanLayer when user lacks weather-provider-vedurstofan access', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@example.com' } } })
    // Access required gate is active: vedrid access (allow), weather-provider-vedurstofan access (deny)
    process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED = 'true'
    mockCheckFeatureAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    setupStationMapping()

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    expect(mockFetchVedurstofan).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.vedurstofanLayer).toBeUndefined()
  })

  it('returns baseline result when product-table read times out', async () => {
    vi.useFakeTimers()
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockReturnValue(new Promise(() => {})) // never resolves

    const resPromise = POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    await vi.advanceTimersByTimeAsync(2000)
    const res = await resPromise
    vi.useRealTimers()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stada).toBeDefined()
    expect(body.vedurstofanLayer).toBeUndefined()
  })

  it('builds one layer point per unique station, matched directly from route geometry', async () => {
    authedUser()
    setupLayerEnabled()
    // The route has two weather sample points, but station selection now comes from route geometry matching.
    // Only one station is matched (HELLISH_ID) — exactly one layer point must appear.
    mockSampleRouteWeatherPoints.mockReturnValue({
      weatherPoints: [
        { lat: 64.09, lon: -21.93, forecastLat: 64.09, forecastLon: -21.93, routeIndex: 0, distanceFromOriginM: 0 },
        { lat: 64.00, lon: -21.80, forecastLat: 64.00, forecastLon: -21.80, routeIndex: 1, distanceFromOriginM: 10_000 },
      ],
      diagnostics: { strategy: 'exhaustive', totalCells: 2, sampledCells: 2 },
    })
    mockMatchProviderPoints.mockReturnValue([makeStationMatch(HELLISH_ID)])
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )
    mockFetchForecast.mockResolvedValue([makeHour('2026-07-10T08:00:00Z')])

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    const body = await res.json()
    expect(body.vedurstofanLayer.points).toHaveLength(1)
    expect(body.vedurstofanLayer.points[0].stationId).toBe(HELLISH_ID)
    expect(body.vedurstofanLayer.points[0].routePointId).toBe(`vedurstofan_${HELLISH_ID}`)
  })

  it('builds one layer point per unique station with station-based routePointId', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    const body = await res.json()
    expect(body.vedurstofanLayer.points[0].routePointId).toBe(`vedurstofan_${HELLISH_ID}`)
    expect(body.vedurstofanLayer.points[0].routeIndex).toBeUndefined()
  })

  it('selects a station via route geometry even when sampleRouteWeatherPoints does not cover its location', async () => {
    authedUser()
    setupLayerEnabled()
    // Sampled MET/Yr point: Garðabær (64.09, -21.93) — far from Hellisheiði (~64.04, -21.37).
    // Old code: getUniqueStationIdsForRoute(weatherPoints) would check each sampled point → miss Hellisheiði.
    // New code: matchProviderPointsToRoute uses routeGeometry.points directly → finds Hellisheiði.
    // This test proves the API uses the route-geometry matcher; the spatial correctness of
    // the matcher itself is proven in providerRouteMatching.test.ts test 1.
    mockSampleRouteWeatherPoints.mockReturnValue({
      weatherPoints: [{ lat: 64.09, lon: -21.93, forecastLat: 64.09, forecastLon: -21.93, routeIndex: 0, distanceFromOriginM: 0 }],
      diagnostics: { strategy: 'exhaustive', totalCells: 1, sampledCells: 1 },
    })
    mockMatchProviderPoints.mockReturnValue([makeStationMatch(HELLISH_ID, 8_000)])
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    // Station was found via route geometry, not via sampled MET/Yr points
    expect(mockMatchProviderPoints).toHaveBeenCalled()
    const args = mockMatchProviderPoints.mock.calls[0][0]
    expect(args.routePolyline).toBeDefined()
    expect(args.maxDistanceM).toBe(15_000)
    const body = await res.json()
    expect(body.vedurstofanLayer.points).toHaveLength(1)
    expect(body.vedurstofanLayer.points[0].stationId).toBe(HELLISH_ID)
  })

  it('passes route geometry points (not sampled weather points) to matchProviderPointsToRoute', async () => {
    authedUser()
    setupLayerEnabled()
    const routePoints = [
      { lat: 64.09, lon: -21.93 },
      { lat: 63.849, lon: -21.365 },
    ]
    mockGetRouteGeometry.mockResolvedValue({ points: routePoints, distanceM: 56000, durationS: 3420 })
    mockMatchProviderPoints.mockReturnValue([])

    await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))

    expect(mockMatchProviderPoints).toHaveBeenCalledWith(
      expect.objectContaining({ routePolyline: routePoints }),
    )
  })

  it('preserves distanceM, distanceFromOriginM, and routeFraction from route match in layer points', async () => {
    authedUser()
    setupLayerEnabled()
    mockMatchProviderPoints.mockReturnValue([
      makeStationMatch(HELLISH_ID, 12_000),
    ])
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    const body = await res.json()
    const pt = body.vedurstofanLayer.points[0]
    expect(pt.distanceM).toBe(2_000)
    expect(pt.distanceFromOriginM).toBe(12_000)
    expect(pt.routeFraction).toBeCloseTo(12_000 / 56_000, 5)
  })

  it('still runs MET/Yr route sampling unchanged when Veðurstofan layer is enabled', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )

    await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))

    // sampleRouteWeatherPoints must still be called for MET/Yr baseline — unchanged by this refactor
    expect(mockSampleRouteWeatherPoints).toHaveBeenCalledTimes(1)
    // MET/Yr sampling call is independent of station matching
    expect(mockMatchProviderPoints).toHaveBeenCalledTimes(1)
  })
})
