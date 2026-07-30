import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IcelandRoadGraphEdge } from '@/lib/iceland-routes/roadGraphTypes'
import type { RouteOption } from '@/lib/weather/provider.types'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getWeatherMode: vi.fn(),
  resolveAccess: vi.fn(),
  guestRateLimit: vi.fn(),
  candidateEnabled: vi.fn(),
  getGraph: vi.fn(),
  resolveEvidence: vi.fn(),
  evidenceMatches: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))

vi.mock('@/lib/weather/weatherBaseAccess.server', () => ({
  getWeatherEnabledMode: mocks.getWeatherMode,
  resolveWeatherBaseAccess: mocks.resolveAccess,
}))

vi.mock('@/lib/weather/ip-rate-limit.server', () => ({
  checkWeatherGuestRateLimit: mocks.guestRateLimit,
}))

vi.mock('@/lib/iceland-routes/roadGraphCandidate.server', () => ({
  isTeskeidRouteCandidateEnabled: mocks.candidateEnabled,
}))

vi.mock('@/lib/iceland-routes/roadGraphRuntime.server', () => ({
  getIcelandRoadGraph: mocks.getGraph,
}))

vi.mock('@/lib/iceland-routes/routeAssessmentCandidateEvidence.server', () => ({
  resolveTeskeidAssessmentRouteEvidence: mocks.resolveEvidence,
  teskeidAssessmentEvidenceMatchesSignedRoute: mocks.evidenceMatches,
}))

import { POST } from '@/app/api/teskeid/weather/travel/route-sections/route'
import { signRouteOptionEnvelope } from '@/lib/iceland-routes/routeOptionEnvelope.server'
import { parseRouteSectionsResponse } from '@/lib/iceland-routes/routeSections'

const ORIGIN = { lat: 64, lon: -21 }
const ROAD_POINT_A = { lat: 64.005, lon: -20.995 }
const ROAD_POINT_B = { lat: 64.01, lon: -20.99 }
const DESTINATION = { lat: 64.015, lon: -20.985 }
const ASSESSMENT_SCOPE_ID = `assessment:v3:${'A'.repeat(43)}`
const SECRET = 'route-sections-api-test-secret-at-least-32-bytes'

const ROUTE: RouteOption = {
  id: 'teskeid-road-graph-v1',
  routeIndex: -1,
  provider: 'teskeid',
  labels: ['TESKEID_EXPERIMENTAL', 'TESKEID_DERIVED_DURATION', 'TESKEID_GRAVEL'],
  isDefault: false,
  points: [ORIGIN, ROAD_POINT_A, ROAD_POINT_B, DESTINATION],
  distanceM: 1_000,
  durationS: 60,
  experimental: {
    derivedDuration: true,
    surface: { pavedM: 800, gravelM: 200, mixedM: 0, unknownM: 0 },
  },
}

function edge(input: {
  id: string
  segmentId: string
  fromNodeId: string
  toNodeId: string
  geometry: IcelandRoadGraphEdge['geometry']
  lengthM: number
  surface: IcelandRoadGraphEdge['surface']
  roadNumber?: string
  roadName?: string
}): IcelandRoadGraphEdge {
  return {
    ...input,
    travelTimeS: input.lengthM / 16.6666666667,
    speedKmh: 60,
    speedSource: 'official',
    roadClass: 'trunk',
    isFRoad: false,
    isMountainRoad: false,
    isSeasonal: false,
    graphRole: 'source_segment',
    sourceNetworkRole: 'assessment_public',
    networkRole: 'assessment_public',
    assessmentEligible: true,
  }
}

const CONNECTED_EDGES: IcelandRoadGraphEdge[] = [
  edge({
    id: 'private-edge-a',
    segmentId: 'private-segment-a',
    fromNodeId: 'private-node-a',
    toNodeId: 'private-node-b',
    geometry: [ORIGIN, ROAD_POINT_A],
    lengthM: 400,
    surface: 'paved',
  }),
  edge({
    id: 'private-edge-gravel',
    segmentId: 'private-segment-gravel',
    fromNodeId: 'private-node-b',
    toNodeId: 'private-node-c',
    geometry: [ROAD_POINT_A, ROAD_POINT_B],
    lengthM: 200,
    surface: 'gravel',
    roadNumber: '1',
    roadName: 'Official gravel road',
  }),
  edge({
    id: 'private-edge-c',
    segmentId: 'private-segment-c',
    fromNodeId: 'private-node-c',
    toNodeId: 'private-node-d',
    geometry: [ROAD_POINT_B, DESTINATION],
    lengthM: 400,
    surface: 'paved',
  }),
]

function envelope(route: RouteOption = ROUTE, now = new Date()) {
  return signRouteOptionEnvelope({
    origin: ORIGIN,
    destination: DESTINATION,
    assessmentScopeId: ASSESSMENT_SCOPE_ID,
    route,
  }, { now })
}

function request(routeEnvelope: unknown, extra: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/teskeid/weather/travel/route-sections', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '203.0.113.42',
    },
    body: JSON.stringify({ routeEnvelope, ...extra }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  process.env.AUTH_CODE_SECRET = SECRET
  mocks.getWeatherMode.mockReturnValue('authenticated')
  mocks.candidateEnabled.mockReturnValue(true)
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'user@example.com' } },
  })
  mocks.resolveAccess.mockResolvedValue({
    mode: 'authenticated',
    userId: 'user-1',
    actor: 'authenticated',
  })
  mocks.guestRateLimit.mockResolvedValue(true)
  mocks.getGraph.mockResolvedValue({ graph: 'active-v1' })
  mocks.resolveEvidence.mockReturnValue({
    status: 'ready',
    evidence: [{
      route: ROUTE,
      connectedRoadEdges: CONNECTED_EDGES,
      routeProvenanceFingerprint: 'server-only-provenance',
    }],
    originSnapDistanceM: 0,
    destinationSnapDistanceM: 0,
  })
  mocks.evidenceMatches.mockImplementation((candidate, signedRoute) => (
    candidate.route.id === signedRoute.id
      && candidate.route.distanceM === signedRoute.distanceM
      && candidate.route.durationS === signedRoute.durationS
  ))
})

describe('POST /api/teskeid/weather/travel/route-sections', () => {
  it('returns bounded official gravel sections bound to the exact envelope signature', async () => {
    const signed = envelope()
    const first = await POST(request(signed))
    const second = await POST(request(signed))
    const body = await first.json()
    const secondBody = await second.json()

    expect(first.status).toBe(200)
    expect(first.headers.get('cache-control')).toContain('private')
    expect(first.headers.get('cache-control')).toContain('no-store')
    expect(body).toMatchObject({
      status: 'ready',
      schemaVersion: 1,
      routeIdentity: signed.signature,
      data: {
        coverage: {
          status: 'complete',
          routeDistanceM: 1_000,
          assessedDistanceM: 1_000,
          unassessedDistanceM: 0,
        },
        surface: {
          pavedM: 800,
          gravelM: 200,
          mixedM: 0,
          unknownM: 0,
          gravelSections: [{
            startDistanceM: 400,
            endDistanceM: 600,
            distanceM: 200,
            geometry: [ROAD_POINT_A, ROAD_POINT_B],
            roadNumber: '1',
            roadName: 'Official gravel road',
          }],
        },
        direction: { status: 'unavailable' },
      },
    })
    expect(body.presentationHash).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(secondBody.presentationHash).toBe(body.presentationHash)
    expect(parseRouteSectionsResponse(body, signed.signature)).toEqual(body)

    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('private-edge')
    expect(serialized).not.toContain('private-segment')
    expect(serialized).not.toContain('private-node')
    expect(serialized).not.toContain('server-only-provenance')
    expect(body).not.toHaveProperty('origin')
    expect(body).not.toHaveProperty('destination')
    expect(body.data.direction).not.toHaveProperty('inferredSections')
    expect(mocks.resolveEvidence).toHaveBeenCalledWith(expect.objectContaining({
      graph: { graph: 'active-v1' },
      origin: ORIGIN,
      destination: DESTINATION,
      assessmentScopeId: ASSESSMENT_SCOPE_ID,
      includeAlternatives: false,
      deadlineAtMs: expect.any(Number),
    }))
    expect(mocks.evidenceMatches).toHaveBeenCalledWith(
      expect.objectContaining({ connectedRoadEdges: CONNECTED_EDGES }),
      signed.route,
    )
  })

  it('rejects tampered, expired, unscoped and non-Teskeið envelopes before graph work', async () => {
    const valid = envelope()
    const tampered = {
      ...valid,
      signature: `${valid.signature[0] === '0' ? '1' : '0'}${valid.signature.slice(1)}`,
    }
    const expired = envelope(ROUTE, new Date(Date.now() - 20 * 60_000))
    const unscoped = signRouteOptionEnvelope({
      origin: ORIGIN,
      destination: DESTINATION,
      route: ROUTE,
    })
    const google = signRouteOptionEnvelope({
      origin: ORIGIN,
      destination: DESTINATION,
      assessmentScopeId: ASSESSMENT_SCOPE_ID,
      route: { ...ROUTE, id: 'google-1', routeIndex: 0, provider: 'google' },
    })

    for (const invalid of [tampered, expired, unscoped, google]) {
      const response = await POST(request(invalid))
      expect(response.status).toBe(422)
      expect(response.headers.get('cache-control')).toContain('no-store')
    }
    expect(mocks.getGraph).not.toHaveBeenCalled()
    expect(mocks.guestRateLimit).not.toHaveBeenCalled()
  })

  it('fails closed when current server evidence does not match the signed route', async () => {
    mocks.evidenceMatches.mockReturnValue(false)
    const response = await POST(request(envelope()))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ status: 'unavailable' })
  })

  it('fails closed when regenerated surface truth drifted from the signed route', async () => {
    const driftedRoute: RouteOption = {
      ...ROUTE,
      experimental: {
        derivedDuration: true,
        surface: { pavedM: 810, gravelM: 190, mixedM: 0, unknownM: 0 },
      },
    }
    const response = await POST(request(envelope(driftedRoute)))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ status: 'unavailable' })
  })

  it('returns a signature-bound pending state without emitting partial sections', async () => {
    mocks.resolveEvidence.mockReturnValue({ status: 'incomplete', evidence: [] })
    const signed = envelope()
    const response = await POST(request(signed))

    expect(response.status).toBe(202)
    expect(response.headers.get('cache-control')).toContain('no-store')
    await expect(response.json()).resolves.toEqual({
      status: 'pending',
      routeIdentity: signed.signature,
    })
  })

  it('returns signature-bound pending when a cold graph load exceeds the shared deadline', async () => {
    const signed = envelope()
    mocks.getGraph.mockReturnValue(new Promise(() => {}))
    vi.useFakeTimers()

    try {
      const responsePromise = POST(request(signed))
      await vi.advanceTimersByTimeAsync(0)
      expect(mocks.getGraph).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(5_001)

      const response = await responsePromise
      expect(response.status).toBe(202)
      await expect(response.json()).resolves.toEqual({
        status: 'pending',
        routeIdentity: signed.signature,
      })
      expect(mocks.resolveEvidence).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('recomputes a signed alternative under one shared bounded deadline', async () => {
    const alternativeRoute: RouteOption = {
      ...ROUTE,
      id: `teskeid-road-graph-v1-alt-1-${'A'.repeat(43)}`,
      routeIndex: -2,
    }
    mocks.resolveEvidence.mockReturnValue({
      status: 'ready',
      evidence: [{
        route: alternativeRoute,
        connectedRoadEdges: CONNECTED_EDGES,
        routeProvenanceFingerprint: 'A'.repeat(43),
      }],
      originSnapDistanceM: 0,
      destinationSnapDistanceM: 0,
    })

    const response = await POST(request(envelope(alternativeRoute)))

    expect(response.status).toBe(200)
    const evidenceInput = mocks.resolveEvidence.mock.calls[0]?.[0]
    expect(evidenceInput).toMatchObject({
      includeAlternatives: true,
      deadlineAtMs: expect.any(Number),
      alternativeDeadlineAtMs: expect.any(Number),
    })
    expect(evidenceInput.alternativeDeadlineAtMs).toBe(evidenceInput.deadlineAtMs)
  })

  it('charges the anonymous budget before body and HMAC work, including invalid envelopes', async () => {
    mocks.getWeatherMode.mockReturnValue('all')
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    mocks.resolveAccess.mockResolvedValue({ mode: 'public', userId: null, actor: 'public' })
    mocks.guestRateLimit
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const valid = envelope()
    const tampered = { ...valid, route: { ...valid.route, durationS: valid.route.durationS + 1 } }

    const invalidResponse = await POST(request(tampered))
    expect(invalidResponse.status).toBe(422)
    expect(mocks.guestRateLimit).toHaveBeenCalledTimes(1)

    const limitedResponse = await POST(request(valid))
    expect(limitedResponse.status).toBe(429)
    expect(mocks.guestRateLimit).toHaveBeenCalledTimes(2)
    expect(mocks.guestRateLimit).toHaveBeenCalledWith('203.0.113.42', 'teskeid-candidate')
    expect(mocks.getGraph).not.toHaveBeenCalled()
  })

  it('rejects a declared oversized body before buffering it', async () => {
    const response = await POST(new Request(
      'http://localhost/api/teskeid/weather/travel/route-sections',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(4_718_593),
        },
        body: '{}',
      },
    ))

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({ status: 'invalid_request' })
    expect(mocks.getGraph).not.toHaveBeenCalled()
  })

  it('stops and rejects an oversized streamed body without a content-length header', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4_718_593))
        controller.close()
      },
    })
    const requestInit: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      duplex: 'half',
    }

    const response = await POST(new Request(
      'http://localhost/api/teskeid/weather/travel/route-sections',
      requestInit,
    ))

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({ status: 'invalid_request' })
    expect(mocks.getGraph).not.toHaveBeenCalled()
  })

  it('accepts no client section data or other extra body fields', async () => {
    const response = await POST(request(envelope(), {
      gravelSections: [{ geometry: [ORIGIN, DESTINATION] }],
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ status: 'invalid_request' })
    expect(mocks.getGraph).not.toHaveBeenCalled()
  })

  it('rejects JSON-like but non-JSON media types before reading route data', async () => {
    const response = await POST(new Request(
      'http://localhost/api/teskeid/weather/travel/route-sections',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json-patch+json' },
        body: JSON.stringify({ routeEnvelope: envelope() }),
      },
    ))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ status: 'invalid_request' })
    expect(mocks.getGraph).not.toHaveBeenCalled()
  })
})
