import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  checkFeatureAccess: vi.fn(),
  getWeatherEnabledMode: vi.fn(),
  resolveWeatherBaseAccess: vi.fn(),
  fetchForecast: vi.fn(),
  sampleRouteWeatherPoints: vi.fn(),
  resolveRouteForecastCompleteness: vi.fn(),
  checkTravelWeather: vi.fn(),
  readVedurstofan: vi.fn(),
  getLastVedurstofanWarmAttemptIso: vi.fn(),
  readVegagerdin: vi.fn(),
  matchProviderPointsToRoute: vi.fn(),
  recordUsage: vi.fn(),
  routePairFingerprint: vi.fn(),
  candidateEnabled: vi.fn(),
  verifyEnvelope: vi.fn(),
  getGraph: vi.fn(),
  restoreEvidence: vi.fn(),
  restoredMatches: vi.fn(),
  globalFetch: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mocks.checkFeatureAccess }))
vi.mock('@/lib/weather/weatherBaseAccess.server', () => ({
  getWeatherEnabledMode: mocks.getWeatherEnabledMode,
  resolveWeatherBaseAccess: mocks.resolveWeatherBaseAccess,
}))
vi.mock('@/lib/weather/metno.server', () => ({ fetchForecast: mocks.fetchForecast }))
vi.mock('@/lib/weather/routeSampling', () => ({
  sampleRouteWeatherPoints: mocks.sampleRouteWeatherPoints,
}))
vi.mock('@/lib/weather/routeForecastCompleteness', () => ({
  resolveRouteForecastCompleteness: mocks.resolveRouteForecastCompleteness,
}))
vi.mock('@/lib/weather/travel', () => ({ checkTravelWeather: mocks.checkTravelWeather }))
vi.mock('@/lib/weather/providers/vedurstofan.server', () => ({
  readVedurstofanProductForStations: mocks.readVedurstofan,
  getLastVedurstofanWarmAttemptIso: mocks.getLastVedurstofanWarmAttemptIso,
}))
vi.mock('@/lib/weather/providers/vedurstofanStations', () => ({
  VEDURSTOFAN_STATIONS: [
    { stationId: '31392', stationName: 'Hellisheiði', lat: 64.04, lon: -21.37 },
    { stationId: '6300', stationName: 'Selfoss', lat: 63.93, lon: -20.99 },
  ],
}))
vi.mock('@/lib/weather/providers/vedurstofanStationsRegistry', () => ({
  VEDURSTOFAN_STATIONS_REGISTRY: [
    {
      stationId: '31392',
      name: 'Hellisheiði',
      lat: 64.04,
      lon: -21.37,
      sourceUrl: 'https://example.test/31392',
    },
    {
      stationId: '6300',
      name: 'Selfoss',
      lat: 63.93,
      lon: -20.99,
      sourceUrl: 'https://example.test/6300',
    },
  ],
}))
vi.mock('@/lib/weather/providers/vegagerdinCurrent.server', () => ({
  readVegagerdinCurrentWithHistoryFallback: mocks.readVegagerdin,
}))
vi.mock('@/lib/weather/providerRouteMatching', () => ({
  DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M: 1_000,
  VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M: 2_500,
  haversineM: vi.fn(() => 10_000),
  pointToPolylineDistanceM: vi.fn(() => 0),
  matchProviderPointsToRoute: mocks.matchProviderPointsToRoute,
}))
vi.mock('@/lib/teskeid/usage.server', () => ({
  recordTeskeidUsageEvent: mocks.recordUsage,
  routePairFingerprint: mocks.routePairFingerprint,
}))
vi.mock('@/lib/iceland-routes/roadGraphCandidate.server', () => ({
  isTeskeidRouteCandidateEnabled: mocks.candidateEnabled,
}))
vi.mock('@/lib/iceland-routes/routeOptionEnvelope.server', () => ({
  verifyRouteOptionEnvelope: mocks.verifyEnvelope,
}))
vi.mock('@/lib/iceland-routes/roadGraphRuntime.server', () => ({
  getIcelandRoadGraph: mocks.getGraph,
}))
vi.mock('@/lib/iceland-routes/routeOptionEvidence.server', () => ({
  restoreRouteOptionEvidence: mocks.restoreEvidence,
  restoredRouteOptionEvidenceMatchesSignedRoute: mocks.restoredMatches,
}))

import { POST } from '@/app/api/teskeid/weather/travel/route'

const ORIGIN = { name: 'Garðabær', lat: 64.0912, lon: -21.9123 }
const DESTINATION = { name: 'Víðibakki', lat: 63.9942, lon: -20.1321 }
const SCOPE_ID = `assessment:v3:${'a'.repeat(43)}`
const ROUTE = {
  id: `teskeid-road-graph-v1-alt-1-${'b'.repeat(43)}`,
  routeIndex: -2,
  provider: 'teskeid' as const,
  labels: ['TESKEID_EXPERIMENTAL', 'TESKEID_ALTERNATIVE', 'CURATED_VIA_HELLISHEIDI'],
  isDefault: false,
  points: [
    { lat: ORIGIN.lat, lon: ORIGIN.lon },
    { lat: 64.04, lon: -20.9 },
    { lat: DESTINATION.lat, lon: DESTINATION.lon },
  ],
  providerMatchingPoints: [
    { lat: ORIGIN.lat, lon: ORIGIN.lon },
    { lat: 64.06, lon: -21.4 },
    { lat: 64.04, lon: -20.9 },
    { lat: DESTINATION.lat, lon: DESTINATION.lon },
  ],
  distanceM: 58_000,
  durationS: 3_600,
  experimental: {
    derivedDuration: true as const,
    surface: { pavedM: 58_000, gravelM: 0, mixedM: 0, unknownM: 0 },
  },
}
const CLAIM = {
  graphBuildPolicyFingerprint: 'policy-v238',
  routeProvenanceFingerprint: 'c'.repeat(43),
  originAnchorKind: 'settlement_node' as const,
  destinationAnchorKind: 'projected_road' as const,
  edgeIds: ['edge-1'],
  nodeIds: ['node-a', 'node-b'],
}
const VERIFIED_ENVELOPE = {
  version: 1 as const,
  issuedAt: '2026-08-13T12:00:00.000Z',
  expiresAt: '2026-08-13T12:15:00.000Z',
  assessmentScopeId: SCOPE_ID,
  origin: { lat: ORIGIN.lat, lon: ORIGIN.lon },
  destination: { lat: DESTINATION.lat, lon: DESTINATION.lon },
  route: ROUTE,
  routeEvidence: CLAIM,
  signature: 'signed-route',
}
const GRAPH = { edges: [{ id: 'edge-1' }] }
const RESTORED = { connectedRoadEdges: [{ id: 'edge-1' }], route: { distanceM: 58_000 } }
const HELLISHEIDI_STATION_ID = '31392'
const SELFOSS_STATION_ID = '6300'

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/teskeid/weather/travel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    origin: ORIGIN,
    destination: DESTINATION,
    assessmentScopeId: SCOPE_ID,
    selectedRouteId: ROUTE.id,
    routeEnvelope: { signature: 'raw-envelope' },
    trailerKind: 'none',
    ...overrides,
  }
}

function completeAssessment() {
  return {
    status: 'complete' as const,
    pointForecasts: [
      { routeIndex: 0, distanceFromOriginM: 0, elapsedFromTripOriginS: 0, forecast: [] },
      { routeIndex: 1, distanceFromOriginM: ROUTE.distanceM, elapsedFromTripOriginS: ROUTE.durationS, forecast: [] },
    ],
    assessmentCompleteness: {
      status: 'complete' as const,
      forecast: {
        status: 'complete' as const,
        requestedPointCount: 2,
        succeededPointCount: 2,
        failedPointCount: 0,
      },
      providers: {},
    },
  }
}

function stationMatch(stationId: string, distanceFromOriginM: number) {
  const isHellisheidi = stationId === HELLISHEIDI_STATION_ID
  return {
    point: {
      id: stationId,
      name: isHellisheidi ? 'Hellisheiði' : 'Selfoss',
      lat: isHellisheidi ? 64.04 : 63.93,
      lon: isHellisheidi ? -21.37 : -20.99,
    },
    distanceM: isHellisheidi ? 240 : 310,
    distanceFromOriginM,
    routeFraction: distanceFromOriginM / ROUTE.distanceM,
    nearestRoutePoint: isHellisheidi
      ? { lat: 64.04, lon: -21.37 }
      : { lat: 63.93, lon: -20.99 },
  }
}

function vedurstofanPayload(stationId = HELLISHEIDI_STATION_ID) {
  const stationName = stationId === HELLISHEIDI_STATION_ID ? 'Hellisheiði' : 'Selfoss'
  return {
    source: 'vedurstofan' as const,
    endpoint: 'xml' as const,
    type: 'forec' as const,
    lang: 'is' as const,
    timeStep: '3h' as const,
    params: ['F', 'D', 'T', 'R', 'W'] as ['F', 'D', 'T', 'R', 'W'],
    stationId,
    stationName,
    atimeIso: '2026-08-13T12:00:00.000Z',
    fetchedAtIso: '2026-08-13T12:05:00.000Z',
    expiresAtIso: '2026-08-13T13:35:00.000Z',
    attribution: {
      provider: 'Veðurstofa Íslands' as const,
      downloadedAtIso: '2026-08-13T12:05:00.000Z',
      serviceUrl: 'https://example.test/vedurstofan',
    },
    forecasts: [
      {
        ftimeIso: '2026-08-13T15:00:00.000Z',
        windSpeedMs: 12,
        windDirectionText: 'N',
        temperatureC: 5,
        precipitationMmPerHour: 0.5,
        weatherText: 'Skýjað',
      },
      {
        ftimeIso: '2026-08-13T18:00:00.000Z',
        windSpeedMs: 8,
        windDirectionText: 'NV',
        temperatureC: 6,
        precipitationMmPerHour: 0,
        weatherText: 'Léttskýjað',
      },
    ],
    parseErrors: [],
  }
}

function vegagerdinResult(status: 'fresh' | 'stale' = 'fresh') {
  return {
    status,
    cacheStatus: status,
    measurementFreshness: status,
    payload: {
      source: 'vegagerdin' as const,
      endpoint: 'vedur2014_1' as const,
      fetchedAtIso: '2026-08-13T12:05:00.000Z',
      oldestMeasuredAtIso: '2026-08-13T12:00:00.000Z',
      measurements: [{
        source: 'vegagerdin' as const,
        stationId: HELLISHEIDI_STATION_ID,
        stationName: 'Hellisheiði',
        lat: 64.04,
        lon: -21.37,
        measuredAtIso: '2026-08-13T12:00:00.000Z',
        fetchedAtIso: '2026-08-13T12:05:00.000Z',
        meanWindMs: 8,
        gustLast10MinMs: 16,
        windDirectionDeg: 180,
        windDirectionText: 'S',
        airTemperatureC: 5,
        roadTemperatureC: 2,
        dataQuality: 'complete' as const,
      }],
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.globalFetch.mockRejectedValue(new Error('unexpected_network_fetch'))
  vi.stubGlobal('fetch', mocks.globalFetch)
  vi.stubEnv('AUTH_MVP_ENABLED', 'true')
  vi.stubEnv('WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED', '')
  vi.stubEnv('WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED', '')
  mocks.getWeatherEnabledMode.mockReturnValue('all')
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'u@example.com' } } })
  mocks.resolveWeatherBaseAccess.mockResolvedValue({
    mode: 'authenticated', actor: 'authenticated', userId: 'u1',
  })
  mocks.checkFeatureAccess.mockResolvedValue(true)
  mocks.candidateEnabled.mockReturnValue(true)
  mocks.verifyEnvelope.mockReturnValue(VERIFIED_ENVELOPE)
  mocks.getGraph.mockResolvedValue(GRAPH)
  mocks.restoreEvidence.mockReturnValue(RESTORED)
  mocks.restoredMatches.mockReturnValue(true)
  mocks.routePairFingerprint.mockReturnValue('pair-hash')
  mocks.sampleRouteWeatherPoints.mockReturnValue({
    weatherPoints: [
      { ...ROUTE.providerMatchingPoints[0], forecastLat: ORIGIN.lat, forecastLon: ORIGIN.lon, routeIndex: 0, distanceFromOriginM: 0 },
      { ...ROUTE.providerMatchingPoints.at(-1)!, forecastLat: DESTINATION.lat, forecastLon: DESTINATION.lon, routeIndex: 1, distanceFromOriginM: 30_000 },
    ],
    diagnostics: { mode: 'test', selectedWeatherPointCount: 2 },
  })
  mocks.fetchForecast.mockResolvedValue([])
  mocks.resolveRouteForecastCompleteness.mockReturnValue(completeAssessment())
  mocks.checkTravelWeather.mockImplementation(() => ({
    id: 'weather-result',
    stada: 'innan-marka',
    svar: 'Prófun',
    travelPlan: {
      route: {
        auditPolylinePoints: ROUTE.providerMatchingPoints,
      },
      routeWeatherPoints: [],
    },
  }))
  mocks.matchProviderPointsToRoute.mockReturnValue([])
  mocks.readVedurstofan.mockResolvedValue(new Map())
  mocks.getLastVedurstofanWarmAttemptIso.mockResolvedValue(null)
  mocks.readVegagerdin.mockResolvedValue({ status: 'unavailable', reason: 'test' })
})

afterEach(() => {
  expect(mocks.globalFetch).not.toHaveBeenCalled()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('POST /api/teskeid/weather/travel (v238)', () => {
  it('enforces product/base access and validates endpoints', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    expect((await POST(request(validBody()))).status).toBe(404)

    process.env.AUTH_MVP_ENABLED = 'true'
    mocks.resolveWeatherBaseAccess.mockResolvedValueOnce({ mode: 'blocked' })
    expect((await POST(request(validBody()))).status).toBe(401)

    expect((await POST(request(validBody({ origin: null })))).status).toBe(400)
    expect(mocks.fetchForecast).not.toHaveBeenCalled()
  })

  it.each([
    ['missing scope', { assessmentScopeId: undefined }, 400],
    ['missing envelope', { routeEnvelope: undefined }, 422],
    ['bad signature', {}, 422],
  ])('rejects %s before weather', async (_label, override, expectedStatus) => {
    if (_label === 'bad signature') mocks.verifyEnvelope.mockReturnValue(null)
    const response = await POST(request(validBody(override)))
    expect(response.status).toBe(expectedStatus)
    expect(mocks.getGraph).not.toHaveBeenCalled()
    expect(mocks.fetchForecast).not.toHaveBeenCalled()
  })

  it.each([
    ['non-Teskeið provider', { ...VERIFIED_ENVELOPE, route: { ...ROUTE, provider: 'google' } }],
    ['missing compact evidence', { ...VERIFIED_ENVELOPE, routeEvidence: undefined }],
  ])('rejects %s before graph/weather', async (_label, envelope) => {
    mocks.verifyEnvelope.mockReturnValue(envelope)
    const response = await POST(request(validBody()))
    expect(response.status).toBe(422)
    expect(mocks.getGraph).not.toHaveBeenCalled()
    expect(mocks.fetchForecast).not.toHaveBeenCalled()
  })

  it('rejects a conflicting selected route id', async () => {
    const response = await POST(request(validBody({ selectedRouteId: 'another-route' })))
    expect(response.status).toBe(422)
    expect(mocks.getGraph).not.toHaveBeenCalled()
  })

  it('fail-closes the global Teskeið routing switch before graph/weather', async () => {
    mocks.candidateEnabled.mockReturnValue(false)
    const response = await POST(request(validBody()))
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({ error: 'selected_route_unavailable' })
    expect(mocks.getGraph).not.toHaveBeenCalled()
    expect(mocks.fetchForecast).not.toHaveBeenCalled()
  })

  it.each([
    ['missing edge/current graph drift', null, true],
    ['regenerated route mismatch', RESTORED, false],
  ])('rejects %s before any provider work', async (_label, restored, matches) => {
    mocks.restoreEvidence.mockReturnValue(restored)
    mocks.restoredMatches.mockReturnValue(matches)

    const response = await POST(request(validBody()))
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({ error: 'route_envelope_invalid' })
    expect(mocks.getGraph).toHaveBeenCalledOnce()
    expect(mocks.fetchForecast).not.toHaveBeenCalled()
    expect(mocks.sampleRouteWeatherPoints).not.toHaveBeenCalled()
  })

  it('restores and strict-matches evidence before assessing the exact selected Teskeið geometry', async () => {
    const response = await POST(request(validBody()))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.restoreEvidence).toHaveBeenCalledWith({
      graph: GRAPH,
      claim: CLAIM,
      origin: VERIFIED_ENVELOPE.origin,
      destination: VERIFIED_ENVELOPE.destination,
    })
    expect(mocks.restoredMatches).toHaveBeenCalledWith({
      restored: RESTORED,
      signedRoute: ROUTE,
      claim: CLAIM,
      origin: VERIFIED_ENVELOPE.origin,
      destination: VERIFIED_ENVELOPE.destination,
    })
    expect(mocks.sampleRouteWeatherPoints).toHaveBeenCalledWith(
      ROUTE.providerMatchingPoints,
      expect.any(Array),
    )
    expect(body.travelPlan.route.weatherCoverage).toMatchObject({
      status: 'full',
      coverageDistanceM: ROUTE.distanceM,
      coverageDurationS: ROUTE.durationS,
    })
  })

  it('samples met.no and matches provider stations over the complete signed Teskeið geometry', async () => {
    const plannedPoints = ROUTE.providerMatchingPoints.map((point, routeIndex) => ({
      ...point,
      forecastLat: point.lat,
      forecastLon: point.lon,
      routeIndex,
      distanceFromOriginM: routeIndex * 10_000,
    }))
    mocks.sampleRouteWeatherPoints.mockReturnValue({
      weatherPoints: plannedPoints,
      diagnostics: { mode: 'all_unique_forecast_points', selectedWeatherPointCount: 4 },
    })
    mocks.matchProviderPointsToRoute.mockReturnValue([
      stationMatch(HELLISHEIDI_STATION_ID, 18_000),
    ])

    const response = await POST(request(validBody()))

    expect(response.status).toBe(200)
    expect(mocks.sampleRouteWeatherPoints).toHaveBeenCalledWith(
      ROUTE.providerMatchingPoints,
      expect.any(Array),
    )
    for (const point of ROUTE.providerMatchingPoints) {
      expect(mocks.fetchForecast).toHaveBeenCalledWith(point.lat, point.lon)
    }
    expect(mocks.fetchForecast).toHaveBeenCalledTimes(ROUTE.providerMatchingPoints.length + 1)
    expect(mocks.matchProviderPointsToRoute).toHaveBeenCalledWith(expect.objectContaining({
      routePolyline: ROUTE.providerMatchingPoints,
      maxDistanceM: 1_000,
    }))
    expect(mocks.checkTravelWeather).toHaveBeenCalledWith(expect.objectContaining({
      auditPolylinePoints: ROUTE.providerMatchingPoints,
    }))
  })

  it('falls back to signed display points when provider-matching geometry is absent', async () => {
    const routeWithoutDenseGeometry = { ...ROUTE, providerMatchingPoints: undefined }
    mocks.verifyEnvelope.mockReturnValue({
      ...VERIFIED_ENVELOPE,
      route: routeWithoutDenseGeometry,
    })

    const response = await POST(request(validBody()))

    expect(response.status).toBe(200)
    expect(mocks.sampleRouteWeatherPoints).toHaveBeenCalledWith(ROUTE.points, expect.any(Array))
    expect(mocks.matchProviderPointsToRoute).toHaveBeenCalledWith(expect.objectContaining({
      routePolyline: ROUTE.points,
    }))
    expect(mocks.checkTravelWeather).toHaveBeenCalledWith(expect.objectContaining({
      auditPolylinePoints: ROUTE.points,
    }))
  })

  it('serves public guest weather only from the same signed Teskeið envelope', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    mocks.resolveWeatherBaseAccess.mockResolvedValue({
      mode: 'public', actor: 'public', userId: null,
    })
    delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
    delete process.env.WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED

    const response = await POST(request(validBody()))

    expect(response.status).toBe(200)
    expect(mocks.verifyEnvelope).toHaveBeenCalledOnce()
    expect(mocks.restoreEvidence).toHaveBeenCalledOnce()
    expect(mocks.fetchForecast).toHaveBeenCalled()
    expect(mocks.checkFeatureAccess).not.toHaveBeenCalled()
  })

  it('returns a retryable weather failure without weakening route trust', async () => {
    mocks.resolveRouteForecastCompleteness.mockReturnValue({
      pointForecasts: [],
      assessmentCompleteness: {
        status: 'incomplete',
        forecast: {
          status: 'incomplete',
          requestedPointCount: 2,
          succeededPointCount: 1,
          failedPointCount: 1,
        },
        providers: {},
      },
    })
    const response = await POST(request(validBody()))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toBe('forecast_unavailable')
    expect(body).not.toHaveProperty('travelPlan')
    expect(mocks.restoreEvidence).toHaveBeenCalledOnce()
  })

  it('honours both authenticated provider-layer access gates without blocking met.no', async () => {
    vi.stubEnv('WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED', 'true')
    vi.stubEnv('WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED', 'true')
    mocks.checkFeatureAccess.mockResolvedValue(false)
    mocks.matchProviderPointsToRoute.mockReturnValue([
      stationMatch(HELLISHEIDI_STATION_ID, 18_000),
    ])
    mocks.readVegagerdin.mockResolvedValue(vegagerdinResult())

    const response = await POST(request(validBody()))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.checkFeatureAccess).toHaveBeenCalledTimes(2)
    expect(mocks.readVedurstofan).not.toHaveBeenCalled()
    expect(body).not.toHaveProperty('vedurstofanLayer')
    expect(body).not.toHaveProperty('vegagerdinLayer')
    expect(body.travelPlan.route.assessmentCompleteness.providers).toMatchObject({
      vedurstofan: { status: 'not_requested', reason: 'feature_disabled' },
      vegagerdin: { status: 'not_requested', reason: 'feature_disabled' },
    })
    expect(mocks.fetchForecast).toHaveBeenCalled()
  })

  it('returns a complete Veðurstofan layer when every matched station is available', async () => {
    mocks.matchProviderPointsToRoute.mockReturnValue([
      stationMatch(HELLISHEIDI_STATION_ID, 18_000),
      stationMatch(SELFOSS_STATION_ID, 42_000),
    ])
    mocks.readVedurstofan.mockResolvedValue(new Map([
      [HELLISHEIDI_STATION_ID, { status: 'ok', payload: vedurstofanPayload() }],
      [SELFOSS_STATION_ID, { status: 'ok', payload: vedurstofanPayload(SELFOSS_STATION_ID) }],
    ]))

    const response = await POST(request(validBody()))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.vedurstofanLayer).toMatchObject({
      status: 'available',
      mappedPointCount: 2,
      availablePointCount: 2,
      stalePointCount: 0,
      unavailablePointCount: 0,
    })
    expect(body.vedurstofanLayer.points.map((point: { stationId: string }) => point.stationId))
      .toEqual([HELLISHEIDI_STATION_ID, SELFOSS_STATION_ID])
    expect(body.travelPlan.route.assessmentCompleteness.providers.vedurstofan).toMatchObject({
      status: 'complete',
      requestedPointCount: 2,
      succeededPointCount: 2,
      failedPointCount: 0,
    })
  })

  it('keeps the baseline result and reports partial Veðurstofan evidence', async () => {
    mocks.matchProviderPointsToRoute.mockReturnValue([
      stationMatch(HELLISHEIDI_STATION_ID, 18_000),
      stationMatch(SELFOSS_STATION_ID, 42_000),
    ])
    mocks.readVedurstofan.mockResolvedValue(new Map([
      [HELLISHEIDI_STATION_ID, { status: 'ok', payload: vedurstofanPayload() }],
    ]))

    const response = await POST(request(validBody()))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.stada).toBe('innan-marka')
    expect(body.vedurstofanLayer).toMatchObject({
      status: 'partial',
      mappedPointCount: 2,
      availablePointCount: 1,
      unavailablePointCount: 1,
    })
    expect(body.travelPlan.route.assessmentCompleteness.providers.vedurstofan).toMatchObject({
      status: 'partial',
      requestedPointCount: 2,
      succeededPointCount: 1,
      failedPointCount: 1,
    })
  })

  it('keeps stale Veðurstofan data visible and counts it as usable provider evidence', async () => {
    mocks.matchProviderPointsToRoute.mockReturnValue([
      stationMatch(HELLISHEIDI_STATION_ID, 18_000),
    ])
    mocks.readVedurstofan.mockResolvedValue(new Map([
      [HELLISHEIDI_STATION_ID, { status: 'stale', payload: vedurstofanPayload() }],
    ]))

    const response = await POST(request(validBody()))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.vedurstofanLayer).toMatchObject({
      status: 'available',
      mappedPointCount: 1,
      availablePointCount: 0,
      stalePointCount: 1,
      unavailablePointCount: 0,
    })
    expect(body.vedurstofanLayer.points[0]).toMatchObject({
      stationId: HELLISHEIDI_STATION_ID,
      status: 'stale',
    })
    expect(body.travelPlan.route.assessmentCompleteness.providers.vedurstofan)
      .toMatchObject({ status: 'complete', succeededPointCount: 1, failedPointCount: 0 })
  })

  it('fails the unavailable Veðurstofan layer open without weakening the baseline result', async () => {
    mocks.matchProviderPointsToRoute.mockReturnValue([
      stationMatch(HELLISHEIDI_STATION_ID, 18_000),
    ])
    mocks.readVedurstofan.mockResolvedValue(new Map())

    const response = await POST(request(validBody()))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.stada).toBe('innan-marka')
    expect(body.vedurstofanLayer).toMatchObject({
      status: 'unavailable',
      mappedPointCount: 1,
      availablePointCount: 0,
      unavailablePointCount: 1,
      points: [],
    })
    expect(body.travelPlan.route.assessmentCompleteness.providers.vedurstofan)
      .toMatchObject({ status: 'unavailable', reason: 'provider_unavailable' })
  })

  it('fails a Veðurstofan timeout open after the bounded 20-second layer budget', async () => {
    vi.useFakeTimers()
    mocks.matchProviderPointsToRoute.mockReturnValue([
      stationMatch(HELLISHEIDI_STATION_ID, 18_000),
    ])
    mocks.readVedurstofan.mockReturnValue(new Promise(() => undefined))

    const responsePromise = POST(request(validBody()))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(20_500)
    const response = await responsePromise
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.stada).toBe('innan-marka')
    expect(body).not.toHaveProperty('vedurstofanLayer')
    expect(body.travelPlan.route.assessmentCompleteness.providers.vedurstofan)
      .toMatchObject({ status: 'unavailable', reason: 'provider_unavailable' })
  })

  it.each(['fresh', 'stale'] as const)(
    'keeps a %s Vegagerðin layer on the full signed route',
    async freshness => {
      mocks.matchProviderPointsToRoute.mockReturnValue([
        stationMatch(HELLISHEIDI_STATION_ID, 18_000),
      ])
      mocks.readVegagerdin.mockResolvedValue(vegagerdinResult(freshness))

      const response = await POST(request(validBody()))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.vegagerdinLayer).toMatchObject({
        status: 'available',
        cacheStatus: freshness,
        measurementFreshness: freshness,
        mappedPointCount: 1,
        availablePointCount: 1,
      })
      expect(body.vegagerdinLayer.points[0]).toMatchObject({
        stationId: HELLISHEIDI_STATION_ID,
        gustLast10MinMs: 16,
        windDisplayStatus: 'haettulegt',
      })
      expect(mocks.matchProviderPointsToRoute).toHaveBeenCalledWith(expect.objectContaining({
        routePolyline: ROUTE.providerMatchingPoints,
      }))
    },
  )

  it('fails a Vegagerðin exception open and keeps diagnostics privacy-safe', async () => {
    mocks.readVegagerdin.mockRejectedValue(
      new Error('https://example.invalid/?lat=64.09&token=private'),
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(request(validBody()))
    const body = await response.json()
    const serializedLogs = JSON.stringify(errorSpy.mock.calls)

    expect(response.status).toBe(200)
    expect(body.stada).toBe('innan-marka')
    expect(body).not.toHaveProperty('vegagerdinLayer')
    expect(serializedLogs).toContain('[vegagerdin-route-layer] build failed')
    expect(serializedLogs).not.toContain('token=private')
    expect(serializedLogs).not.toContain('lat=64.09')
    errorSpy.mockRestore()
  })

  it('contains no live Google route computation or route-memory path', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/teskeid/weather/travel/route.ts'),
      'utf8',
    )
    expect(source).not.toContain('getWeatherMapProvider')
    expect(source).not.toContain('getRouteOptions')
    expect(source).not.toContain('getRouteGeometry')
    expect(source).not.toContain('computeRoutes')
    expect(source).not.toContain('recordRouteMemory')
  })
})
