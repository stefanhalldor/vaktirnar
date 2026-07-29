import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFindOfficialSettlementContainingPoint,
  mockGetOfficialPostalLocality,
  mockGetOfficialSettlementById,
  mockFindIcelandRoadGraphRoute,
  mockGetIcelandRoadGraph,
} = vi.hoisted(() => ({
  mockFindOfficialSettlementContainingPoint: vi.fn(),
  mockGetOfficialPostalLocality: vi.fn(),
  mockGetOfficialSettlementById: vi.fn(),
  mockFindIcelandRoadGraphRoute: vi.fn(),
  mockGetIcelandRoadGraph: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/places/officialPlaceDirectory.server', () => ({
  findOfficialSettlementContainingPoint: mockFindOfficialSettlementContainingPoint,
  getOfficialPostalLocality: mockGetOfficialPostalLocality,
  getOfficialSettlementById: mockGetOfficialSettlementById,
}))

vi.mock('@/lib/iceland-routes/roadGraph', () => ({
  findIcelandRoadGraphRoute: mockFindIcelandRoadGraphRoute,
  ICELAND_ROUTING_PROFILES: {
    fastestCar: { objective: 'fastest' },
  },
}))

vi.mock('@/lib/iceland-routes/roadGraphRuntime.server', () => ({
  getIcelandRoadGraph: mockGetIcelandRoadGraph,
}))

import {
  getRuralPostalAssessmentMapping,
  RURAL_POSTAL_ASSESSMENT_MAPPINGS,
} from '@/lib/iceland-routes/routeAssessmentMapping'
import { resolveRouteAssessmentScope } from '@/lib/iceland-routes/routeAssessmentScope.server'
import {
  parseRouteAssessmentScope,
  type RouteAssessmentEndpoint,
} from '@/lib/iceland-routes/routeAssessmentScope'

const POSTAL_851_SOURCE_ID = '453b1695-1c60-4a6e-3a69-fd9620c3adb0'

const dummyGeometry = {
  type: 'MultiPolygon' as const,
  coordinates: [[[
    [-21.95, 64.05],
    [-21.85, 64.05],
    [-21.85, 64.15],
    [-21.95, 64.15],
    [-21.95, 64.05],
  ]]],
}

const gardabaer = {
  id: 'hagstofa:1300',
  name: 'Garðabær',
  lat: 64.088,
  lon: -21.922,
  postalCode: '210',
  postalLocality: 'Garðabær',
  geometry: dummyGeometry,
}

const hella = {
  id: 'hagstofa:1120',
  name: 'Hella',
  lat: 63.836027,
  lon: -20.394082,
  postalCode: '850',
  postalLocality: 'Hella',
  geometry: dummyGeometry,
}

const navigationOrigin = {
  name: 'Núverandi staðsetning',
  formattedAddress: 'Nálægt Melás 8, 210 Garðabær',
  source: 'device',
  lat: 64.083771,
  lon: -21.929006,
}

const ruralNavigationDestination = {
  name: 'Víðibakki',
  formattedAddress: 'Víðibakki, 851 Hella, dreifbýli',
  source: 'hms',
  sourceId: 'hms-vidibakki',
  placeType: 'address' as const,
  postalCode: '851',
  postalLocality: 'Hella, dreifbýli',
  lat: 63.901234,
  lon: -20.201234,
}

const graphOriginPoint = { lat: 64.075, lon: -21.9 }
const graphDestinationPoint = { lat: 63.84, lon: -20.4 }

function readyGraph() {
  return {
    nodes: new Map([
      ['gar-gateway', { id: 'gar-gateway', point: graphOriginPoint }],
      ['hella-gateway', { id: 'hella-gateway', point: graphDestinationPoint }],
    ]),
  }
}

function readyGraphRoute() {
  return {
    status: 'ok' as const,
    snappedOriginNodeId: 'gar-gateway',
    snappedDestinationNodeId: 'hella-gateway',
    route: {
      geometry: [graphOriginPoint, graphDestinationPoint],
    },
  }
}

function validEndpoint(overrides: Partial<RouteAssessmentEndpoint> = {}): RouteAssessmentEndpoint {
  return {
    name: 'Garðabær',
    formattedAddress: 'Garðabær',
    lat: graphOriginPoint.lat,
    lon: graphOriginPoint.lon,
    source: 'official',
    sourceId: gardabaer.id,
    placeType: 'settlement',
    postalCode: '210',
    postalLocality: 'Garðabær',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetOfficialSettlementById.mockImplementation((id: string) => {
    if (id === gardabaer.id) return gardabaer
    if (id === hella.id) return hella
    return null
  })
  mockGetOfficialPostalLocality.mockImplementation((postalCode: string) => (
    postalCode === '851'
      ? {
          name: 'Hella, dreifbýli',
          classification: 'Dreifbýli',
          sourceId: POSTAL_851_SOURCE_ID,
          correctedAt: null,
        }
      : null
  ))
  mockGetIcelandRoadGraph.mockResolvedValue(readyGraph())
  mockFindIcelandRoadGraphRoute.mockReturnValue(readyGraphRoute())
})

describe('curated rural postal assessment mapping', () => {
  it('contains exactly the approved structured 851 → Hella relation with provenance', () => {
    expect(RURAL_POSTAL_ASSESSMENT_MAPPINGS).toEqual([{
      postalCode: '851',
      postalLocalitySourceId: POSTAL_851_SOURCE_ID,
      expectedPostalLocalityName: 'Hella, dreifbýli',
      expectedPostalLocalityClassification: 'Dreifbýli',
      assessmentSettlementId: 'hagstofa:1120',
      expectedSettlementName: 'Hella',
      provenance: 'stebbi_product_decision_2026_07_29',
    }])
  })

  it('uses exact structured postcode identity and never normalizes or guesses another code', () => {
    expect(getRuralPostalAssessmentMapping('851')?.assessmentSettlementId).toBe('hagstofa:1120')
    expect(getRuralPostalAssessmentMapping(' 851')).toBeNull()
    expect(getRuralPostalAssessmentMapping('850')).toBeNull()
    expect(getRuralPostalAssessmentMapping('852')).toBeNull()
    expect(getRuralPostalAssessmentMapping(undefined)).toBeNull()
  })
})

describe('resolveRouteAssessmentScope', () => {
  it('maps a structured 851 rural destination to Hella and routes only between official graph anchors', async () => {
    mockFindOfficialSettlementContainingPoint
      .mockReturnValueOnce({ id: gardabaer.id, name: gardabaer.name, geometry: dummyGeometry })
      .mockReturnValueOnce(null)

    await expect(
      resolveRouteAssessmentScope(navigationOrigin, {
        ...ruralNavigationDestination,
        // Display text is deliberately irrelevant to the structured mapping.
        formattedAddress: 'Opaque address label',
        postalLocality: 'Display-only label that must not be parsed',
      }),
    ).resolves.toEqual({
      status: 'ready',
      scopeId: `${gardabaer.id}:gar-gateway:${hella.id}:hella-gateway`,
      origin: {
        name: 'Garðabær',
        formattedAddress: 'Garðabær',
        ...graphOriginPoint,
        source: 'official',
        sourceId: gardabaer.id,
        placeType: 'settlement',
        postalCode: '210',
        postalLocality: 'Garðabær',
      },
      destination: {
        name: 'Hella',
        formattedAddress: 'Hella',
        ...graphDestinationPoint,
        source: 'official',
        sourceId: 'hagstofa:1120',
        placeType: 'settlement',
        postalCode: '850',
        postalLocality: 'Hella',
      },
    })

    expect(mockGetOfficialPostalLocality).toHaveBeenCalledWith('851')
    expect(mockGetOfficialSettlementById).toHaveBeenCalledWith('hagstofa:1120')
    expect(mockFindIcelandRoadGraphRoute).toHaveBeenCalledWith(
      expect.anything(),
      { lat: gardabaer.lat, lon: gardabaer.lon },
      { lat: hella.lat, lon: hella.lon },
      expect.objectContaining({ maxSnapDistanceM: 5_000 }),
    )
    expect(mockFindIcelandRoadGraphRoute).not.toHaveBeenCalledWith(
      expect.anything(),
      { lat: navigationOrigin.lat, lon: navigationOrigin.lon },
      { lat: ruralNavigationDestination.lat, lon: ruralNavigationDestination.lon },
      expect.anything(),
    )
  })

  it('returns same_area before reading the graph when both endpoints resolve to one settlement', async () => {
    mockFindOfficialSettlementContainingPoint
      .mockReturnValueOnce({ id: hella.id, name: hella.name, geometry: dummyGeometry })
      .mockReturnValueOnce({ id: hella.id, name: hella.name, geometry: dummyGeometry })

    const secondHellaAddress = {
      ...ruralNavigationDestination,
      postalCode: '850',
      formattedAddress: 'Þrúðvangur 1, 850 Hella',
      lat: 63.837,
      lon: -20.395,
    }

    await expect(
      resolveRouteAssessmentScope(
        { ...navigationOrigin, lat: 63.836, lon: -20.394 },
        secondHellaAddress,
      ),
    ).resolves.toEqual({
      status: 'same_area',
      settlementId: 'hagstofa:1120',
      settlementName: 'Hella',
    })
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()
    expect(mockFindIcelandRoadGraphRoute).not.toHaveBeenCalled()
  })

  it('fails closed for an unmapped rural postcode', async () => {
    mockFindOfficialSettlementContainingPoint
      .mockReturnValueOnce({ id: gardabaer.id, name: gardabaer.name, geometry: dummyGeometry })
      .mockReturnValueOnce(null)

    await expect(resolveRouteAssessmentScope(navigationOrigin, {
      ...ruralNavigationDestination,
      postalCode: '852',
    })).resolves.toEqual({
      status: 'unavailable',
      reason: 'assessment_area_unavailable',
    })
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()
  })

  it('fails closed when checked-in postal provenance does not match the curated mapping', async () => {
    mockFindOfficialSettlementContainingPoint
      .mockReturnValueOnce({ id: gardabaer.id, name: gardabaer.name, geometry: dummyGeometry })
      .mockReturnValueOnce(null)
    mockGetOfficialPostalLocality.mockReturnValue({
      name: 'Hella, dreifbýli',
      classification: 'Dreifbýli',
      sourceId: 'different-source-id',
      correctedAt: null,
    })

    await expect(
      resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination),
    ).resolves.toEqual({
      status: 'unavailable',
      reason: 'assessment_mapping_invalid',
    })
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'Unexpected rural locality',
      classification: 'Dreifbýli',
      sourceId: POSTAL_851_SOURCE_ID,
      correctedAt: null,
    },
    {
      name: 'Hella, dreifbýli',
      classification: 'Þéttbýli',
      sourceId: POSTAL_851_SOURCE_ID,
      correctedAt: null,
    },
  ])('fails closed when approved postal identity metadata drifts: %#', async postalLocality => {
    mockFindOfficialSettlementContainingPoint
      .mockReturnValueOnce({ id: gardabaer.id, name: gardabaer.name, geometry: dummyGeometry })
      .mockReturnValueOnce(null)
    mockGetOfficialPostalLocality.mockReturnValue(postalLocality)

    await expect(
      resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination),
    ).resolves.toEqual({
      status: 'unavailable',
      reason: 'assessment_mapping_invalid',
    })
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()
  })

  it('fails closed when the official graph cannot be read', async () => {
    mockFindOfficialSettlementContainingPoint
      .mockReturnValueOnce({ id: gardabaer.id, name: gardabaer.name, geometry: dummyGeometry })
      .mockReturnValueOnce({ id: hella.id, name: hella.name, geometry: dummyGeometry })
    mockGetIcelandRoadGraph.mockRejectedValue(new Error('private graph unavailable'))

    await expect(
      resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination),
    ).resolves.toEqual({
      status: 'unavailable',
      reason: 'road_graph_unavailable',
    })
  })

  it('fails closed when the official graph has no connected route', async () => {
    mockFindOfficialSettlementContainingPoint
      .mockReturnValueOnce({ id: gardabaer.id, name: gardabaer.name, geometry: dummyGeometry })
      .mockReturnValueOnce({ id: hella.id, name: hella.name, geometry: dummyGeometry })
    mockFindIcelandRoadGraphRoute.mockReturnValue({ status: 'no_route' })

    await expect(
      resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination),
    ).resolves.toEqual({
      status: 'unavailable',
      reason: 'no_connected_official_road',
    })
  })
})

describe('parseRouteAssessmentScope', () => {
  const readyPayload = {
    status: 'ready',
    scopeId: `${gardabaer.id}:gar-gateway:${hella.id}:hella-gateway`,
    origin: validEndpoint(),
    destination: validEndpoint({
      name: 'Hella',
      formattedAddress: 'Hella',
      ...graphDestinationPoint,
      sourceId: hella.id,
      postalCode: '850',
      postalLocality: 'Hella',
    }),
  }

  it('accepts and normalizes the exact ready, same_area and unavailable contracts', () => {
    expect(parseRouteAssessmentScope(readyPayload)).toEqual(readyPayload)
    expect(parseRouteAssessmentScope({
      status: 'same_area',
      settlementId: hella.id,
      settlementName: ' Hella ',
    })).toEqual({
      status: 'same_area',
      settlementId: hella.id,
      settlementName: 'Hella',
    })
    expect(parseRouteAssessmentScope({
      status: 'unavailable',
      reason: 'road_graph_unavailable',
    })).toEqual({
      status: 'unavailable',
      reason: 'road_graph_unavailable',
    })
  })

  it.each([
    null,
    [],
    {},
    { ...readyPayload, scopeId: '   ' },
    { ...readyPayload, origin: { ...readyPayload.origin, lat: 0 } },
    { ...readyPayload, destination: { ...readyPayload.destination, source: 'hms' } },
    { ...readyPayload, destination: { ...readyPayload.destination, postalCode: '85' } },
    { status: 'same_area', settlementId: ' ', settlementName: 'Hella' },
    { status: 'unavailable', reason: 'made_up_reason' },
    { status: 'future_status' },
  ])('rejects malformed or unsupported payload %#', payload => {
    expect(parseRouteAssessmentScope(payload)).toBeNull()
  })

  it.each([
    { ...readyPayload, unexpected: true },
    { ...readyPayload, origin: { ...readyPayload.origin, unexpected: true } },
    { status: 'same_area', settlementId: hella.id, settlementName: 'Hella', unexpected: true },
    { status: 'unavailable', reason: 'road_graph_unavailable', unexpected: true },
  ])('rejects unknown fields instead of silently accepting a widened contract %#', payload => {
    expect(parseRouteAssessmentScope(payload)).toBeNull()
  })
})
