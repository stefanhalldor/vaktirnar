import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetIcelandRoadGraph, mockResolveVerifiedHmsPostalIdentity } = vi.hoisted(() => ({
  mockGetIcelandRoadGraph: vi.fn(),
  mockResolveVerifiedHmsPostalIdentity: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/iceland-routes/roadGraphRuntime.server', () => ({
  getIcelandRoadGraph: mockGetIcelandRoadGraph,
}))
vi.mock('@/lib/iceland-routes/routeAssessmentHmsIdentity.server', () => ({
  resolveVerifiedHmsPostalIdentity: mockResolveVerifiedHmsPostalIdentity,
}))

import { buildIcelandRoadGraph } from '@/lib/iceland-routes/roadGraph'
import type { IcelandRoadGraphSegmentInput } from '@/lib/iceland-routes/roadGraphTypes'
import {
  getRuralPostalAssessmentMapping,
  getUrbanPostalAssessmentMapping,
  RURAL_POSTAL_ASSESSMENT_MAPPINGS,
  URBAN_POSTAL_ASSESSMENT_MAPPINGS,
  type PostalAssessmentMapping,
} from '@/lib/iceland-routes/routeAssessmentMapping'
import { resolveRouteAssessmentScope } from '@/lib/iceland-routes/routeAssessmentScope.server'
import {
  parseRouteAssessmentScope,
  type RouteAssessmentEndpoint,
} from '@/lib/iceland-routes/routeAssessmentScope'
import type { LatLon } from '@/lib/iceland-routes/types'
import {
  findOfficialSettlementContainingPoint,
  getOfficialPostalLocality,
  getOfficialSettlementById,
} from '@/lib/places/officialPlaceDirectory.server'

const GARDABAER_ID = 'is50v:1407fdee-3621-5c85-686f-8bd6a4316272'
const HELLA_ID = 'hagstofa:1120'
const POSTAL_210_SOURCE_ID = 'e6b4bdfc-9fab-1237-49c4-15a90b99565f'
const POSTAL_225_SOURCE_ID = 'b57a92df-8ed9-4603-6ab3-d0b5778be777'
const POSTAL_851_SOURCE_ID = '453b1695-1c60-4a6e-3a69-fd9620c3adb0'

const gardabaer = getOfficialSettlementById(GARDABAER_ID)!
const hella = getOfficialSettlementById(HELLA_ID)!

const navigationOrigin = {
  name: 'Núverandi staðsetning',
  formattedAddress: 'Nálægt Melás 8, 210 Garðabær',
  source: 'device',
  placeType: 'point' as const,
  postalCode: '210',
  postalLocality: 'Garðabær',
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

const graphJunction = { lat: 63.9, lon: -20.5 }
const graphDestinationEnd = { lat: 63.9, lon: -20.1 }

function segment(
  id: string,
  geometry: readonly LatLon[],
  overrides: Partial<IcelandRoadGraphSegmentInput> = {},
): IcelandRoadGraphSegmentInput {
  return {
    id,
    source: 'teskeid_fixture',
    sourceId: id,
    geometry,
    roadClass: 'trunk',
    surface: 'paved',
    direction: 'both',
    ...overrides,
  }
}

function readyGraph(extraTargetPoint = false) {
  return buildIcelandRoadGraph([
    segment('gardabaer-approach', [
      { lat: gardabaer.lat, lon: gardabaer.lon },
      graphJunction,
    ]),
    segment('vidibakki-road', extraTargetPoint
      ? [graphJunction, { lat: 63.9, lon: -20.3 }, graphDestinationEnd]
      : [graphJunction, graphDestinationEnd]),
  ], { nodeSnapToleranceM: 2 })
}

function verified(mapping: PostalAssessmentMapping) {
  return {
    sourceId: mapping.postalCode === '851' ? 'hms-vidibakki' : `hms-${mapping.postalCode}`,
    postalCode: mapping.postalCode,
    postalLocality: mapping.expectedPostalLocalityName,
    postalLocalitySourceId: mapping.postalLocalitySourceId,
    distanceM: 0,
    mapping,
    anchorKind: mapping.postalCode === '851' ? 'projected_road' : 'settlement_nodes',
  } as const
}

const verified210 = verified(getUrbanPostalAssessmentMapping('210')!)
const verified225 = verified(getUrbanPostalAssessmentMapping('225')!)
const verified851 = verified(getRuralPostalAssessmentMapping('851')!)

function validEndpoint(overrides: Partial<RouteAssessmentEndpoint> = {}): RouteAssessmentEndpoint {
  return {
    name: 'Garðabær',
    formattedAddress: 'Garðabær',
    lat: gardabaer.lat,
    lon: gardabaer.lon,
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
  mockGetIcelandRoadGraph.mockResolvedValue(readyGraph())
  mockResolveVerifiedHmsPostalIdentity.mockImplementation(async location => (
    location.lat === navigationOrigin.lat && location.lon === navigationOrigin.lon
      ? verified210
      : verified851
  ))
})

describe('curated structured postal assessment mappings', () => {
  it('matches the checked-in official identities for 210/225 → Garðabær', () => {
    expect(URBAN_POSTAL_ASSESSMENT_MAPPINGS).toEqual([
      {
        postalCode: '210',
        postalLocalitySourceId: POSTAL_210_SOURCE_ID,
        expectedPostalLocalityName: 'Garðabær',
        expectedPostalLocalityClassification: 'Þéttbýli',
        assessmentSettlementId: GARDABAER_ID,
        expectedSettlementName: 'Garðabær',
        provenance: 'stebbi_product_decision_2026_07_29',
      },
      {
        postalCode: '225',
        postalLocalitySourceId: POSTAL_225_SOURCE_ID,
        expectedPostalLocalityName: 'Garðabær',
        expectedPostalLocalityClassification: 'Þéttbýli',
        assessmentSettlementId: GARDABAER_ID,
        expectedSettlementName: 'Garðabær',
        provenance: 'stebbi_product_decision_2026_07_29',
      },
    ])
    expect(getOfficialPostalLocality('210')).toMatchObject({
      name: 'Garðabær', classification: 'Þéttbýli', sourceId: POSTAL_210_SOURCE_ID,
    })
    expect(getOfficialPostalLocality('225')).toMatchObject({
      name: 'Garðabær', classification: 'Þéttbýli', sourceId: POSTAL_225_SOURCE_ID,
    })
    expect(gardabaer).toMatchObject({ id: GARDABAER_ID, name: 'Garðabær' })
  })

  it('keeps exactly the approved 851 → Hella rural identity', () => {
    expect(RURAL_POSTAL_ASSESSMENT_MAPPINGS).toEqual([{
      postalCode: '851',
      postalLocalitySourceId: POSTAL_851_SOURCE_ID,
      expectedPostalLocalityName: 'Hella, dreifbýli',
      expectedPostalLocalityClassification: 'Dreifbýli',
      assessmentSettlementId: HELLA_ID,
      expectedSettlementName: 'Hella',
      provenance: 'stebbi_product_decision_2026_07_29',
    }])
    expect(getOfficialPostalLocality('851')).toMatchObject({
      name: 'Hella, dreifbýli', classification: 'Dreifbýli', sourceId: POSTAL_851_SOURCE_ID,
    })
    expect(hella).toMatchObject({ id: HELLA_ID, name: 'Hella' })
  })

  it('uses exact configured codes without trimming, name parsing or postcode arithmetic', () => {
    expect(getUrbanPostalAssessmentMapping('210')?.assessmentSettlementId).toBe(GARDABAER_ID)
    expect(getUrbanPostalAssessmentMapping('225')?.assessmentSettlementId).toBe(GARDABAER_ID)
    expect(getUrbanPostalAssessmentMapping(' 210')).toBeNull()
    expect(getUrbanPostalAssessmentMapping('211')).toBeNull()
    expect(getRuralPostalAssessmentMapping('851')?.assessmentSettlementId).toBe(HELLA_ID)
    expect(getRuralPostalAssessmentMapping('850')).toBeNull()
    expect(getRuralPostalAssessmentMapping('852')).toBeNull()
  })

  it('proves both acceptance coordinates are outside every settlement polygon', () => {
    expect(findOfficialSettlementContainingPoint(navigationOrigin.lat, navigationOrigin.lon)).toBeNull()
    expect(findOfficialSettlementContainingPoint(
      ruralNavigationDestination.lat,
      ruralNavigationDestination.lon,
    )).toBeNull()
  })
})

describe('resolveRouteAssessmentScope', () => {
  it('uses verified HMS identities and a mid-edge Víðibakki anchor while retaining area labels', async () => {
    const scope = await resolveRouteAssessmentScope(navigationOrigin, {
      ...ruralNavigationDestination,
      formattedAddress: 'Opaque address label',
      postalLocality: 'Display-only label that must not be parsed',
    })

    expect(scope.status).toBe('ready')
    if (scope.status !== 'ready') return
    expect(scope.scopeId).toMatch(/^assessment:v3:[A-Za-z0-9_-]{43}$/)
    expect(scope.origin).toMatchObject({
      name: 'Garðabær', sourceId: GARDABAER_ID, lat: gardabaer.lat, lon: gardabaer.lon,
    })
    expect(scope.destination).toMatchObject({
      name: 'Hella', sourceId: HELLA_ID, lat: graphJunction.lat, lon: ruralNavigationDestination.lon,
    })
    expect(scope.destination).not.toEqual(expect.objectContaining({
      lat: ruralNavigationDestination.lat,
      lon: ruralNavigationDestination.lon,
    }))
    expect(mockResolveVerifiedHmsPostalIdentity).toHaveBeenCalledWith(navigationOrigin)
    expect(mockResolveVerifiedHmsPostalIdentity).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: 'hms-vidibakki',
    }))

    const repeated = await resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination)
    expect(repeated.status).toBe('ready')
    if (repeated.status === 'ready') expect(repeated.scopeId).toBe(scope.scopeId)
  })

  it('uses only verified identity even when client postcode/locality fields are forged', async () => {
    const scope = await resolveRouteAssessmentScope({
      ...navigationOrigin,
      postalCode: '851',
      postalLocality: 'Forged rural locality',
    }, {
      ...ruralNavigationDestination,
      postalCode: '210',
      postalLocality: 'Forged urban locality',
    })

    expect(scope.status).toBe('ready')
    if (scope.status !== 'ready') return
    expect(scope.origin.sourceId).toBe(GARDABAER_ID)
    expect(scope.destination.sourceId).toBe(HELLA_ID)
  })

  it('supports the second verified Garðabær identity without parsing labels', async () => {
    mockResolveVerifiedHmsPostalIdentity
      .mockResolvedValueOnce(verified225)
      .mockResolvedValueOnce(verified851)
    const scope = await resolveRouteAssessmentScope({
      ...navigationOrigin,
      name: 'Opaque current point',
      formattedAddress: 'Opaque nearby label',
    }, ruralNavigationDestination)

    expect(scope.status).toBe('ready')
    if (scope.status !== 'ready') return
    expect(scope.origin).toMatchObject({ sourceId: GARDABAER_ID, name: 'Garðabær' })
  })

  it('rehydrates metadata-light saved coordinates through the verifier', async () => {
    const savedDestination = {
      name: 'Víðibakki',
      formattedAddress: 'Víðibakki',
      source: 'saved',
      placeType: 'address' as const,
      lat: ruralNavigationDestination.lat,
      lon: ruralNavigationDestination.lon,
    }
    const scope = await resolveRouteAssessmentScope(navigationOrigin, savedDestination)

    expect(scope.status).toBe('ready')
    expect(mockResolveVerifiedHmsPostalIdentity).toHaveBeenCalledWith(savedDestination)
  })

  it('supports the reverse rural direction and slices the exact origin road', async () => {
    const scope = await resolveRouteAssessmentScope(ruralNavigationDestination, navigationOrigin)

    expect(scope.status).toBe('ready')
    if (scope.status !== 'ready') return
    expect(scope.origin).toMatchObject({
      sourceId: HELLA_ID,
      lat: graphJunction.lat,
      lon: ruralNavigationDestination.lon,
    })
    expect(scope.destination).toMatchObject({
      sourceId: GARDABAER_ID,
      lat: gardabaer.lat,
      lon: gardabaer.lon,
    })
  })

  it('does not collapse two rural anchors in the same assessment settlement to same_area', async () => {
    mockResolveVerifiedHmsPostalIdentity.mockResolvedValue(verified851)
    const scope = await resolveRouteAssessmentScope({
      ...ruralNavigationDestination,
      sourceId: 'rural-origin',
      lat: 63.901,
      lon: -20.4,
    }, {
      ...ruralNavigationDestination,
      sourceId: 'rural-destination',
      lat: 63.901,
      lon: -20.2,
    })

    expect(scope.status).toBe('ready')
    if (scope.status !== 'ready') return
    expect(scope.origin.sourceId).toBe(HELLA_ID)
    expect(scope.destination.sourceId).toBe(HELLA_ID)
  })

  it('returns same_area before graph/HMS reads for two explicit official selections', async () => {
    const officialHella = {
      name: 'Hella',
      formattedAddress: 'Hella',
      source: 'official',
      sourceId: HELLA_ID,
      placeType: 'settlement' as const,
      lat: hella.lat,
      lon: hella.lon,
    }
    await expect(resolveRouteAssessmentScope(officialHella, officialHella)).resolves.toEqual({
      status: 'same_area', settlementId: HELLA_ID, settlementName: 'Hella',
    })
    expect(mockResolveVerifiedHmsPostalIdentity).not.toHaveBeenCalled()
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()
  })

  it('fails closed when HMS has no unique configured identity or lookup throws', async () => {
    mockResolveVerifiedHmsPostalIdentity
      .mockResolvedValueOnce(verified210)
      .mockResolvedValueOnce(null)
    await expect(
      resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination),
    ).resolves.toEqual({ status: 'unavailable', reason: 'assessment_area_unavailable' })
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()

    mockResolveVerifiedHmsPostalIdentity.mockRejectedValueOnce(new Error('hms_identity_lookup_failed'))
    await expect(
      resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination),
    ).resolves.toEqual({ status: 'unavailable', reason: 'assessment_area_unavailable' })
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()
  })

  it('fails closed when verified mapping provenance no longer matches the official artifact', async () => {
    mockResolveVerifiedHmsPostalIdentity.mockResolvedValueOnce({
      ...verified210,
      mapping: { ...verified210.mapping, expectedSettlementName: 'Wrong settlement' },
    })
    await expect(
      resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination),
    ).resolves.toEqual({ status: 'unavailable', reason: 'assessment_mapping_invalid' })
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()
  })

  it('binds scope identity to selected route provenance while remaining stable on one graph', async () => {
    const first = await resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination)
    const repeated = await resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination)
    mockGetIcelandRoadGraph.mockResolvedValueOnce(readyGraph(true))
    const drifted = await resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination)

    expect(first.status).toBe('ready')
    expect(repeated.status).toBe('ready')
    expect(drifted.status).toBe('ready')
    if (first.status !== 'ready' || repeated.status !== 'ready' || drifted.status !== 'ready') return
    expect(repeated.scopeId).toBe(first.scopeId)
    expect(drifted.destination).toEqual(first.destination)
    expect(drifted.scopeId).not.toBe(first.scopeId)
  })

  it('fails closed when graph read rejects, times out or has no connected road', async () => {
    mockGetIcelandRoadGraph.mockRejectedValueOnce(new Error('private graph unavailable'))
    await expect(
      resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination),
    ).resolves.toEqual({ status: 'unavailable', reason: 'road_graph_unavailable' })

    vi.useFakeTimers()
    try {
      mockGetIcelandRoadGraph.mockReturnValueOnce(new Promise(() => {}))
      const timedOut = resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination)
      await vi.advanceTimersByTimeAsync(1_001)
      await expect(timedOut).resolves.toEqual({
        status: 'unavailable', reason: 'road_graph_unavailable',
      })
    } finally {
      vi.useRealTimers()
    }

    mockGetIcelandRoadGraph.mockResolvedValueOnce(buildIcelandRoadGraph([
      segment('origin-only', [
        { lat: gardabaer.lat, lon: gardabaer.lon },
        { lat: gardabaer.lat + 0.01, lon: gardabaer.lon },
      ]),
    ]))
    await expect(
      resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination),
    ).resolves.toEqual({ status: 'unavailable', reason: 'no_connected_official_road' })
  })
})

describe('parseRouteAssessmentScope', () => {
  const readyPayload = {
    status: 'ready',
    scopeId: 'assessment:v3:test',
    origin: validEndpoint(),
    destination: validEndpoint({
      name: 'Hella',
      formattedAddress: 'Hella',
      lat: graphJunction.lat,
      lon: ruralNavigationDestination.lon,
      sourceId: hella.id,
      postalCode: '850',
      postalLocality: 'Hella',
    }),
  }

  it('accepts and normalizes the exact ready, same_area and unavailable contracts', () => {
    expect(parseRouteAssessmentScope(readyPayload)).toEqual(readyPayload)
    expect(parseRouteAssessmentScope({
      status: 'same_area', settlementId: hella.id, settlementName: ' Hella ',
    })).toEqual({ status: 'same_area', settlementId: hella.id, settlementName: 'Hella' })
    expect(parseRouteAssessmentScope({
      status: 'unavailable', reason: 'road_graph_unavailable',
    })).toEqual({ status: 'unavailable', reason: 'road_graph_unavailable' })
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
    { ...readyPayload, anchorKind: 'projected_road' },
    { ...readyPayload, unexpected: true },
    { ...readyPayload, origin: { ...readyPayload.origin, unexpected: true } },
    { status: 'same_area', settlementId: hella.id, settlementName: 'Hella', unexpected: true },
    { status: 'unavailable', reason: 'road_graph_unavailable', unexpected: true },
  ])('rejects unknown fields instead of silently accepting a widened contract %#', payload => {
    expect(parseRouteAssessmentScope(payload)).toBeNull()
  })
})
