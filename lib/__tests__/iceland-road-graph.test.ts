import { describe, expect, it } from 'vitest'
import {
  analyzeIcelandRoadGraph,
  buildIcelandRoadGraph,
  buildIcelandRoadGraphRouteFromEdges,
  derivedRoadSpeedKmh,
  findIcelandRoadGraphRoute,
  findIcelandRoadGraphAlternatives,
  geometryLengthM,
  ICELAND_ROUTING_PROFILES,
} from '@/lib/iceland-routes/roadGraph'
import type {
  IcelandRoadGraphEdge,
  IcelandRoadGraphSegmentInput,
} from '@/lib/iceland-routes/roadGraphTypes'
import { createIcelandRoadDirectionInferenceAttestation } from '@/lib/iceland-routes/roadGraphDirectionInference'

const A = { lat: 64.10, lon: -21.90 }
const B = { lat: 64.10, lon: -21.70 }
const C = { lat: 64.18, lon: -21.80 }
const D = { lat: 64.18, lon: -21.90 }

function segment(
  id: string,
  geometry: IcelandRoadGraphSegmentInput['geometry'],
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

describe('Iceland road graph builder', () => {
  it('snaps neighbouring segment endpoints and creates directed edges', () => {
    const almostB = { lat: B.lat + 0.00002, lon: B.lon }
    const graph = buildIcelandRoadGraph([
      segment('a-b', [A, B]),
      segment('b-c', [almostB, C], { direction: 'forward' }),
    ], { nodeSnapToleranceM: 5 })

    expect(graph.nodes.size).toBe(3)
    expect(graph.edges).toHaveLength(3)
    expect(graph.edges.filter(edge => edge.segmentId === 'b-c')).toHaveLength(1)
  })

  it('chooses the best complete route across all nearby snaps in a merged component', () => {
    const origin = { lat: 64, lon: -21 }
    const originAlternative = { lat: 64, lon: -20.9998 }
    const destination = { lat: 64, lon: -20.9 }
    const destinationAlternative = { lat: 64, lon: -20.8998 }
    const graph = buildIcelandRoadGraph([
      segment('nearest-but-long', [origin, destination], { lengthM: 100_000 }),
      segment('slightly-farther-short', [originAlternative, destinationAlternative], { lengthM: 100 }),
      segment('component-bridge', [origin, originAlternative], { lengthM: 100_000 }),
    ], { nodeSnapToleranceM: 1 })

    const result = findIcelandRoadGraphRoute(graph, origin, destination, {
      profile: { objective: 'shortest' },
      maxSnapDistanceM: 20,
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.route.segmentIds).toEqual(['slightly-farther-short'])
    expect(result.originSnapDistanceM).toBeGreaterThan(0)
    expect(result.destinationSnapDistanceM).toBeGreaterThan(0)
  })

  it('respects reverse-only segments', () => {
    const graph = buildIcelandRoadGraph([
      segment('reverse', [A, B], { direction: 'reverse' }),
    ])

    expect(findIcelandRoadGraphRoute(graph, A, B, {
      profile: { objective: 'shortest' },
    }).status).toBe('no_route')
    expect(findIcelandRoadGraphRoute(graph, B, A, {
      profile: { objective: 'shortest' },
    }).status).toBe('ok')
  })

  it('can ignore source direction metadata without discarding it from inputs', () => {
    const graph = buildIcelandRoadGraph([
      segment('reverse', [A, B], { direction: 'reverse' }),
    ], { routingDirectionPolicy: 'bidirectional' })

    expect(findIcelandRoadGraphRoute(graph, A, B, {
      profile: { objective: 'shortest' },
    }).status).toBe('ok')
    expect(findIcelandRoadGraphRoute(graph, B, A, {
      profile: { objective: 'shortest' },
    }).status).toBe('ok')
  })

  it('reports weak components and source quality diagnostics', () => {
    const graph = buildIcelandRoadGraph([
      segment('a-b', [A, B]),
      segment('isolated', [{ lat: 65, lon: -20 }, { lat: 65.1, lon: -20 }], { surface: 'gravel' }),
    ])
    expect(analyzeIcelandRoadGraph(graph)).toMatchObject({
      nodeCount: 4,
      edgeCount: 4,
      segmentCount: 2,
      weakComponentCount: 2,
      largestWeakComponentNodeCount: 2,
      surfaceEdgeCounts: { paved: 2, gravel: 2, mixed: 0, unknown: 0 },
      derivedSpeedEdgeCount: 4,
    })
  })

  it('carries official authority evidence onto edges without routing access-only roads as shortcuts', () => {
    const publicMetadata = {
      provider: 'vegagerdin' as const,
      sourceLayerId: 6 as const,
      sourceObjectId: 1,
      sectionId: 10,
      roadPartCode: 1,
      ownerCode: 0,
      roadClassCode: 1,
      directionCode: 2,
      directionFieldState: 'integer' as const,
      inUseFromEpochMs: 0,
      outOfUseAtEpochMs: 253_402_214_400_000,
    }
    const graph = buildIcelandRoadGraph([
      segment('public-a', [A, C], {
        networkRole: 'assessment_public',
        official: publicMetadata,
        directionStatus: 'authoritative_both',
      }),
      segment('public-b', [C, B], { networkRole: 'assessment_public' }),
      segment('access-shortcut', [A, B], {
        networkRole: 'access_connector',
        lengthM: 10,
      }),
    ])

    expect(graph.edges.find(edge => edge.segmentId === 'public-a')).toMatchObject({
      networkRole: 'assessment_public',
      official: publicMetadata,
    })
    const route = findIcelandRoadGraphRoute(graph, A, B, {
      profile: { objective: 'shortest' },
      maxSnapDistanceM: 100,
    })
    expect(route.status).toBe('ok')
    if (route.status !== 'ok') return
    expect(route.route.segmentIds).toEqual(['public-a', 'public-b'])
    expect(route.route.segmentIds).not.toContain('access-shortcut')
  })

  it('creates zero edges for uncorroborated official NULL and 0 direction rows', () => {
    const official = (directionCode: number | null, directionFieldState: 'null' | 'integer') => ({
      provider: 'vegagerdin' as const,
      sourceLayerId: 6 as const,
      sourceObjectId: directionCode === null ? 1 : 2,
      sectionId: directionCode === null ? 10 : 20,
      roadPartCode: 1,
      ownerCode: 0,
      roadClassCode: 1,
      directionCode,
      directionFieldState,
      inUseFromEpochMs: 0,
      outOfUseAtEpochMs: 253_402_214_400_000,
    })
    const graph = buildIcelandRoadGraph([
      segment('null-direction', [A, B], {
        source: 'vegagerdin',
        direction: 'both',
        directionStatus: 'unknown_missing',
        official: official(null, 'null'),
      }),
      segment('zero-direction', [C, D], {
        source: 'vegagerdin',
        direction: 'both',
        directionStatus: 'unknown_domain_drift',
        official: official(0, 'integer'),
      }),
    ])
    expect(graph.edges).toEqual([])
  })

  it('fails closed when official metadata has no strict v2 direction status', () => {
    const graph = buildIcelandRoadGraph([segment('legacy-official', [A, B], {
      source: 'vegagerdin',
      direction: 'forward',
      official: {
        provider: 'vegagerdin',
        sourceLayerId: 6,
        sourceObjectId: 1,
        sectionId: 10,
        roadPartCode: 1,
        ownerCode: 0,
        roadClassCode: 1,
        directionCode: null,
        inUseFromEpochMs: 0,
        outOfUseAtEpochMs: 253_402_214_400_000,
      },
    })])
    expect(graph.edges).toEqual([])
  })

  it('models structurally marked inferred edges and exact ordered portions in a unit contract', () => {
    const sourceId = 'vegagerdin:layer-6:section-10:road-part-1:road-part-number-1'
    const sourceProvenanceKey = `assessment_public_roads=${'a'.repeat(64)}|road_surfaces=${'b'.repeat(64)}`
    const policy = {
      schemaVersion: 1 as const,
      policyId: 'direction-policy',
      policyVersion: '1.0.0',
      generatorId: 'direction-generator',
      generatorVersion: '1.0.0',
      minimumConfidenceBps: 9_000,
    }
    const evidence = createIcelandRoadDirectionInferenceAttestation({
      schemaVersion: 1,
      kind: 'inferred_both',
      segmentSourceId: sourceId,
      sourceProvenanceKey,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      generatorId: policy.generatorId,
      generatorVersion: policy.generatorVersion,
      evidenceArtifactId: 'direction-evidence',
      evidenceContentSha256: 'c'.repeat(64),
      confidenceBps: 9_500,
      validFromIso: '2026-07-01T00:00:00.000Z',
      expiresAtIso: '2026-08-01T00:00:00.000Z',
    })
    const evidenceArtifact = {
      schemaVersion: 1 as const,
      artifactId: 'direction-evidence',
      datasetId: 'independent-direction-dataset',
      datasetVersion: '2026-07',
      sourceUrl: 'https://example.test/direction-evidence.json',
      effectiveAtIso: '2026-07-01T00:00:00.000Z',
      contentSha256: 'c'.repeat(64),
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      generatorId: policy.generatorId,
      generatorVersion: policy.generatorVersion,
      licenseReviewId: 'license-review-1',
    }
    const input = segment(`${sourceId}:geometry-0`, [A, B], {
      source: 'vegagerdin',
      sourceId,
      lengthM: 12_345.67,
      roadNumber: '42',
      roadName: 'Prófunarvegur',
      surface: 'gravel',
      direction: 'unknown',
      directionStatus: 'unknown_missing',
      networkRole: 'assessment_public',
      official: {
        provider: 'vegagerdin',
        sourceLayerId: 6,
        sourceObjectId: 1,
        sectionId: 10,
        roadPartCode: 1,
        roadPartNumber: '1',
        ownerCode: 0,
        roadClassCode: 1,
        directionCode: null,
        directionFieldState: 'null',
        inUseFromEpochMs: 0,
        outOfUseAtEpochMs: 253_402_214_400_000,
      },
    })
    const graph = buildIcelandRoadGraph([input], {
      directionInference: {
        attestations: [evidence],
        evidenceArtifacts: [evidenceArtifact],
        sourceProvenanceKey,
        evaluatedAtIso: '2026-07-02T00:00:00.000Z',
        policy,
      },
    })
    expect(graph.edges).toHaveLength(2)
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        directionBasis: 'inferred',
        directionStatus: 'unknown_missing',
        directionInference: evidence,
      }),
    ]))
    expect(graph.directionAttestationIds).toEqual([evidence.attestationId])

    const result = findIcelandRoadGraphRoute(graph, A, B, {
      profile: { objective: 'shortest' },
      maxSnapDistanceM: 100,
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.route.inferredDirectionDistanceM).toBe(12_346)
    expect(result.route.authoritativeDirectionDistanceM).toBe(0)
    expect(result.route.legacyDirectionDistanceM).toBe(0)
    expect(result.route.directionAttestationIds).toEqual([evidence.attestationId])
    expect(result.route.inferredDirectionPortions).toEqual([{
      edgeId: `${input.id}:forward`,
      segmentId: input.id,
      attestationId: evidence.attestationId,
      startDistanceM: 0,
      endDistanceM: 12_345.67,
      distanceM: 12_345.67,
      geometry: input.geometry,
      roadNumber: '42',
      roadName: 'Prófunarvegur',
    }])
    expect(result.route.gravelPortions).toEqual([{
      edgeId: `${input.id}:forward`,
      segmentId: input.id,
      surface: 'gravel',
      startDistanceM: 0,
      endDistanceM: 12_345.67,
      distanceM: 12_345.67,
      geometry: input.geometry,
      roadNumber: '42',
      roadName: 'Prófunarvegur',
    }])
    expect(result.route.gravelPortions[0].edgeId)
      .toBe(result.route.inferredDirectionPortions[0].edgeId)
    expect(result.route.surface.gravelM).toBe(Math.round(
      result.route.gravelPortions.reduce((total, portion) => total + portion.distanceM, 0),
    ))
  })

  it('keeps exact ordered gravel ranges while excluding topology and access connectors', () => {
    function edge(
      id: string,
      lengthM: number,
      overrides: Partial<IcelandRoadGraphEdge> = {},
    ): IcelandRoadGraphEdge {
      return {
        id,
        segmentId: id,
        fromNodeId: `${id}:from`,
        toNodeId: `${id}:to`,
        geometry: [{ lat: 64, lon: -21 }, { lat: 64.01, lon: -21.01 }],
        lengthM,
        travelTimeS: lengthM / 10,
        speedKmh: 36,
        speedSource: 'official',
        roadClass: 'local',
        surface: 'gravel',
        isFRoad: false,
        isMountainRoad: false,
        isSeasonal: false,
        graphRole: 'source_segment',
        sourceNetworkRole: 'assessment_public',
        networkRole: 'assessment_public',
        directionBasis: 'authoritative',
        assessmentEligible: true,
        ...overrides,
      }
    }

    const firstGeometry = [{ lat: 64, lon: -21 }, { lat: 64.001, lon: -21.001 }]
    const secondGeometry = [{ lat: 64.001, lon: -21.001 }, { lat: 64.002, lon: -21.002 }]
    const route = buildIcelandRoadGraphRouteFromEdges([
      edge('gravel-1', 100.125, { geometry: firstGeometry, roadNumber: '1' }),
      edge('gravel-2', 20.25, { geometry: secondGeometry, roadName: 'Annar vegur' }),
      edge('topology-gap', 3.75, {
        graphRole: 'topology_connector',
        sourceNetworkRole: undefined,
        networkRole: undefined,
        assessmentEligible: false,
        topologyReceiptId: 'receipt-1',
        topologyDirectionAttested: true,
      }),
      edge('gravel-3', 200.375),
      edge('access-only', 4.5, {
        sourceNetworkRole: 'access_connector',
        networkRole: 'access_connector',
        assessmentEligible: false,
      }),
      edge('paved', 50.625, { surface: 'paved' }),
    ])

    expect(route.gravelPortions).toEqual([
      expect.objectContaining({
        edgeId: 'gravel-1',
        startDistanceM: 0,
        endDistanceM: 100.125,
        distanceM: 100.125,
        geometry: firstGeometry,
        roadNumber: '1',
      }),
      expect.objectContaining({
        edgeId: 'gravel-2',
        startDistanceM: 100.125,
        endDistanceM: 120.375,
        distanceM: 20.25,
        geometry: secondGeometry,
        roadName: 'Annar vegur',
      }),
      expect.objectContaining({
        edgeId: 'gravel-3',
        startDistanceM: 124.125,
        endDistanceM: 324.5,
        distanceM: 200.375,
      }),
    ])
    expect(route.gravelPortions.map(portion => portion.edgeId)).not.toContain('topology-gap')
    expect(route.gravelPortions.map(portion => portion.edgeId)).not.toContain('access-only')
    expect(route.edgeIds).not.toContain('topology-gap')
    expect(route.edgeIds).not.toContain('access-only')
    expect(route.topologyConnectorIds).toEqual(['receipt-1'])
    expect(route.unassessedConnectorDistanceM).toBe(8)
    expect(route.assessedDistanceM + route.unassessedConnectorDistanceM)
      .toBe(route.distanceM)

    const exactGravelM = route.gravelPortions.reduce(
      (total, portion) => total + portion.distanceM,
      0,
    )
    expect(exactGravelM).toBeCloseTo(320.75, 10)
    expect(route.surface.gravelM).toBe(Math.round(exactGravelM))
    for (const portion of route.gravelPortions) {
      expect(portion.endDistanceM - portion.startDistanceM)
        .toBeCloseTo(portion.distanceM, 10)
    }
  })
})

describe('Iceland road graph routing profiles', () => {
  const graph = buildIcelandRoadGraph([
    segment('direct-gravel', [A, B], {
      lengthM: 10_000,
      surface: 'gravel',
      speedKmh: 40,
      speedSource: 'official',
    }),
    segment('paved-a-c', [A, C], {
      lengthM: 7_000,
      speedKmh: 80,
      speedSource: 'official',
    }),
    segment('paved-c-b', [C, B], {
      lengthM: 7_000,
      speedKmh: 80,
      speedSource: 'official',
    }),
  ])

  it('selects the physically shortest route when gravel is allowed', () => {
    const result = findIcelandRoadGraphRoute(graph, A, B, {
      profile: { objective: 'shortest' },
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.route.segmentIds).toEqual(['direct-gravel'])
    expect(result.route.surface.gravelM).toBe(10_000)
  })

  it('carries F-road distance and road numbers into the routed result', () => {
    const fRoadGraph = buildIcelandRoadGraph([
      segment('f-road', [A, B], {
        lengthM: 12_000,
        roadNumber: 'F35',
        roadClass: 'highland_trunk',
        isFRoad: true,
        isMountainRoad: true,
        surface: 'gravel',
      }),
    ])
    const result = findIcelandRoadGraphRoute(fRoadGraph, A, B, {
      profile: { objective: 'shortest' },
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.route.fRoadDistanceM).toBe(12_000)
    expect(result.route.fRoadNumbers).toEqual(['F35'])
  })

  it('selects the fastest route using segment speeds', () => {
    const result = findIcelandRoadGraphRoute(graph, A, B, {
      profile: { objective: 'fastest' },
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.route.segmentIds).toEqual(['paved-a-c', 'paved-c-b'])
    expect(result.route.durationS).toBe(630)
  })

  it('can require a fully paved route', () => {
    const result = findIcelandRoadGraphRoute(graph, A, B, {
      profile: ICELAND_ROUTING_PROFILES.shortestPaved,
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.route.segmentIds).toEqual(['paved-a-c', 'paved-c-b'])
    expect(result.route.surface).toEqual({ pavedM: 14_000, gravelM: 0, mixedM: 0, unknownM: 0 })
  })

  it('returns no route when the only available edge violates the profile', () => {
    const gravelOnly = buildIcelandRoadGraph([
      segment('gravel', [A, B], { surface: 'gravel' }),
    ])
    expect(findIcelandRoadGraphRoute(gravelOnly, A, B, {
      profile: ICELAND_ROUTING_PROFILES.fastestPaved,
    })).toEqual({ status: 'no_route' })
  })

  it('returns no-nearby-node outside the configured snap radius', () => {
    expect(findIcelandRoadGraphRoute(graph, { lat: 66, lon: -18 }, B, {
      profile: { objective: 'shortest' },
      maxSnapDistanceM: 100,
    })).toEqual({ status: 'no_nearby_node' })
  })

  it('chooses a connected nearby node pair instead of two disconnected nearest nodes', () => {
    const originLocal = { lat: 64.1001, lon: -21.9001 }
    const destinationLocal = { lat: 64.1001, lon: -21.7001 }
    const disconnectedA = { lat: 64.1002, lon: -21.9001 }
    const disconnectedB = { lat: 64.1002, lon: -21.7001 }
    const candidateGraph = buildIcelandRoadGraph([
      segment('origin-dead-end', [originLocal, disconnectedA], { direction: 'forward' }),
      segment('destination-dead-end', [disconnectedB, destinationLocal], { direction: 'forward' }),
      segment('connected-main', [A, B], { lengthM: 10_000 }),
    ], { nodeSnapToleranceM: 2 })

    const result = findIcelandRoadGraphRoute(candidateGraph, originLocal, destinationLocal, {
      profile: { objective: 'shortest' },
      maxSnapDistanceM: 100,
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.route.segmentIds).toEqual(['connected-main'])
  })
})

describe('Iceland road graph estimates', () => {
  it('calculates geometry length and conservative derived speeds', () => {
    expect(geometryLengthM([A, B])).toBeGreaterThan(9_000)
    expect(derivedRoadSpeedKmh('trunk', 'paved')).toBe(85)
    expect(derivedRoadSpeedKmh('trunk', 'gravel')).toBe(55)
    expect(derivedRoadSpeedKmh('highland_trunk', 'paved')).toBe(45)
    expect(derivedRoadSpeedKmh('local', 'gravel', true)).toBe(30)
  })

  it('marks distance that uses derived rather than official speed', () => {
    const graph = buildIcelandRoadGraph([segment('derived', [A, B], { lengthM: 12_345 })])
    const result = findIcelandRoadGraphRoute(graph, A, B, {
      profile: { objective: 'fastest' },
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.route.derivedSpeedDistanceM).toBe(12_345)
  })
})

describe('Iceland road graph alternatives', () => {
  it('returns a meaningfully different second route without hand-authored corridors', () => {
    const graph = buildIcelandRoadGraph([
      segment('primary-a', [A, B]), segment('primary-b', [B, C]),
      segment('alternate-a', [A, D]), segment('alternate-b', [D, C], { lengthM: 1300 }),
    ])
    const alternatives = findIcelandRoadGraphAlternatives(graph, A, C, {
      profile: ICELAND_ROUTING_PROFILES.fastestCar,
      maxSnapDistanceM: 100,
      maxAlternatives: 2,
      maxOverlap: 0.8,
    })
    expect(alternatives).toHaveLength(1)
    expect([
      ['primary-a', 'primary-b'],
      ['alternate-a', 'alternate-b'],
    ]).toContainEqual(alternatives[0].route.segmentIds)
    expect(alternatives[0].overlapWithPrimary).toBe(0)
  })
})
