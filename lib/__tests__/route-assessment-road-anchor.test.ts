import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  buildIcelandRoadGraph,
  ICELAND_ROUTING_PROFILES,
  isIcelandRoadGraphEdgeAllowed,
} from '@/lib/iceland-routes/roadGraph'
import { findRouteAssessmentRoadAnchors } from '@/lib/iceland-routes/routeAssessmentRoadAnchor.server'
import { createRouteAssessmentScopeId } from '@/lib/iceland-routes/routeAssessmentScopeId.server'
import { createIcelandRoadDirectionInferenceAttestation } from '@/lib/iceland-routes/roadGraphDirectionInference'
import type { IcelandRoadGraphSegmentInput } from '@/lib/iceland-routes/roadGraphTypes'
import type { LatLon } from '@/lib/iceland-routes/types'

const ORIGIN = { lat: 64.09, lon: -21.92 }

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

function findAnchors(
  segments: readonly IcelandRoadGraphSegmentInput[],
  origin: { kind: 'canonical_node' | 'projected_road' | 'trusted_anchor'; point: LatLon },
  destination: { kind: 'canonical_node' | 'projected_road' | 'trusted_anchor'; point: LatLon },
  maxDistanceM = 500,
) {
  return findRouteAssessmentRoadAnchors(
    buildIcelandRoadGraph(segments, { nodeSnapToleranceM: 2 }),
    origin,
    destination,
    {
      maxOriginSnapDistanceM: maxDistanceM,
      maxDestinationSnapDistanceM: maxDistanceM,
    },
  )
}

describe('route assessment official-road anchors', () => {
  it.each([
    ['topology connector', {
      graphRole: 'topology_connector' as const,
      assessmentEligible: false,
      topologyReceiptId: 'receipt:test',
      topologyDirectionAttested: true as const,
    }],
    ['explicitly unassessed edge', { assessmentEligible: false }],
    ['access source edge', {
      sourceNetworkRole: 'access_connector' as const,
      networkRole: 'access_connector' as const,
    }],
  ])('never selects a %s as an assessment anchor', (_case, edgeOverrides) => {
    const start = { lat: 64, lon: -20.6 }
    const end = { lat: 64, lon: -20.2 }
    const base = buildIcelandRoadGraph([
      segment('candidate', [start, end], { networkRole: 'assessment_public' }),
    ])
    const edges = base.edges.map(edge => ({ ...edge, ...edgeOverrides }))
    const outgoing = new Map<string, typeof edges>()
    for (const edge of edges) {
      outgoing.set(edge.fromNodeId, [...(outgoing.get(edge.fromNodeId) ?? []), edge])
    }
    const result = findRouteAssessmentRoadAnchors(
      { ...base, edges, outgoing },
      { kind: 'canonical_node', point: start },
      { kind: 'projected_road', point: end },
      { maxOriginSnapDistanceM: 2, maxDestinationSnapDistanceM: 2 },
    )

    expect(result).toEqual({ status: 'no_origin_anchor' })
  })

  it('ends on a direction-correct partial edge at the mid-road destination', () => {
    const junction = { lat: 64, lon: -20.5 }
    const edgeEnd = { lat: 64, lon: -20.1 }
    const exactDestination = { lat: 64.001, lon: -20.3 }
    const result = findAnchors([
      segment('approach', [ORIGIN, junction]),
      segment('target', [junction, edgeEnd]),
    ], {
      kind: 'canonical_node',
      point: ORIGIN,
    }, {
      kind: 'projected_road',
      point: exactDestination,
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.origin).toMatchObject({ kind: 'settlement_node', point: ORIGIN })
    expect(result.destination.kind).toBe('projected_road')
    expect(result.destination.point.lat).toBeCloseTo(64, 6)
    expect(result.destination.point.lon).toBeCloseTo(-20.3, 6)
    expect(result.destination.snapDistanceM).toBeGreaterThan(100)
    expect(result.destination.point).not.toEqual(exactDestination)
    expect(result.connectedRoadEdges).toHaveLength(2)
    expect(result.connectedRoadEdges[1].geometry.at(-1)).toEqual(result.destination.point)
    expect(result.connectedRoadEdges[1].geometry.at(-1)).not.toEqual(edgeEnd)
  })

  it('skips a closer disconnected edge and chooses the nearest directed-reachable edge', () => {
    const junction = { lat: 64, lon: -20.5 }
    const exactDestination = { lat: 64.001, lon: -20.3 }
    const result = findAnchors([
      segment('approach', [ORIGIN, junction]),
      segment('reachable', [junction, { lat: 64, lon: -20.1 }]),
      segment('disconnected', [
        { lat: 64.001, lon: -20.35 },
        { lat: 64.001, lon: -20.25 },
      ]),
    ], {
      kind: 'canonical_node',
      point: ORIGIN,
    }, {
      kind: 'projected_road',
      point: exactDestination,
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.connectedRoadEdges.at(-1)?.segmentId).toBe('reachable')
    expect(result.destination.snapDistanceM).toBeGreaterThan(100)
  })

  it('does not arrive through the wrong end of a one-way edge', () => {
    const junction = { lat: 64, lon: -20.5 }
    const exactDestination = { lat: 64.001, lon: -20.3 }
    const result = findAnchors([
      segment('approach', [ORIGIN, junction]),
      segment('reachable', [junction, { lat: 64, lon: -20.1 }]),
      segment('wrong-way-nearest', [
        { lat: 64.001, lon: -20.3 },
        junction,
      ], { direction: 'forward' }),
    ], {
      kind: 'canonical_node',
      point: ORIGIN,
    }, {
      kind: 'projected_road',
      point: exactDestination,
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.connectedRoadEdges.at(-1)?.segmentId).toBe('reachable')
  })

  it('skips a closer seasonal destination edge in actual anchor selection', () => {
    const junction = { lat: 64, lon: -20.5 }
    const exactDestination = { lat: 64.001, lon: -20.3 }
    const result = findAnchors([
      segment('approach', [ORIGIN, junction]),
      segment('eligible', [junction, { lat: 64, lon: -20.1 }]),
      segment('seasonal-nearest', [junction, exactDestination], { isSeasonal: true }),
    ], {
      kind: 'canonical_node',
      point: ORIGIN,
    }, {
      kind: 'projected_road',
      point: exactDestination,
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.connectedRoadEdges.at(-1)?.segmentId).toBe('eligible')
    expect(result.destination.point).not.toEqual(exactDestination)
  })

  it('supports the reverse rural direction with a partial origin edge', () => {
    const junction = { lat: 64, lon: -20.5 }
    const exactOrigin = { lat: 64.001, lon: -20.3 }
    const result = findAnchors([
      segment('approach', [ORIGIN, junction]),
      segment('target', [junction, { lat: 64, lon: -20.1 }]),
    ], {
      kind: 'projected_road',
      point: exactOrigin,
    }, {
      kind: 'canonical_node',
      point: ORIGIN,
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.origin.kind).toBe('projected_road')
    expect(result.origin.point).toMatchObject({ lat: 64 })
    expect(result.connectedRoadEdges[0].geometry[0]).toEqual(result.origin.point)
    expect(result.connectedRoadEdges.at(-1)?.geometry.at(-1)).toEqual(ORIGIN)
  })

  it('uses a direct partial edge when both projected anchors share its direction', () => {
    const roadStart = { lat: 64, lon: -20.5 }
    const roadEnd = { lat: 64, lon: -20.1 }
    const result = findAnchors([
      segment('target', [roadStart, roadEnd], { direction: 'forward' }),
    ], {
      kind: 'projected_road',
      point: { lat: 64.001, lon: -20.4 },
    }, {
      kind: 'projected_road',
      point: { lat: 64.001, lon: -20.2 },
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.connectedRoadEdges).toHaveLength(1)
    expect(result.connectedRoadEdges[0].geometry[0].lon).toBeCloseTo(-20.4, 6)
    expect(result.connectedRoadEdges[0].geometry.at(-1)?.lon).toBeCloseTo(-20.2, 6)
  })

  it('applies edge admissibility to only the traversed same-edge slice', () => {
    const roadStart = { lat: 64, lon: -20.5 }
    const roadEnd = { lat: 64, lon: -20.1 }
    const inspected: IcelandRoadGraphSegmentInput['geometry'][] = []
    const result = findRouteAssessmentRoadAnchors(
      buildIcelandRoadGraph([
        segment('target', [roadStart, roadEnd], { direction: 'forward' }),
      ], { nodeSnapToleranceM: 2 }),
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.4 } },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.2 } },
      {
        maxOriginSnapDistanceM: 500,
        maxDestinationSnapDistanceM: 500,
        edgeAdmissibility: edge => {
          inspected.push(edge.geometry)
          return (edge.geometry[0]?.lon ?? -Infinity) > -20.45
            && (edge.geometry.at(-1)?.lon ?? Infinity) < -20.15
        },
      },
    )

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(inspected.some(geometry => (
      Math.abs((geometry[0]?.lon ?? 0) - (-20.4)) < 1e-6
      && Math.abs((geometry.at(-1)?.lon ?? 0) - (-20.2)) < 1e-6
    ))).toBe(true)
    expect(inspected.some(geometry => (
      geometry[0]?.lon === roadStart.lon
      && geometry.at(-1)?.lon === roadEnd.lon
    ))).toBe(false)
    expect(result.connectedRoadEdges).toHaveLength(1)
  })

  it('projects canonical endpoints to the middle of long segments instead of graph endpoints', () => {
    const result = findAnchors([
      segment('long-road', [
        { lat: 64, lon: -21 },
        { lat: 64, lon: -19 },
      ], { direction: 'forward' }),
    ], {
      kind: 'canonical_node',
      point: { lat: 64.001, lon: -20.8 },
    }, {
      kind: 'canonical_node',
      point: { lat: 64.001, lon: -19.2 },
    }, 200)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.origin.kind).toBe('projected_road')
    expect(result.destination.kind).toBe('projected_road')
    expect(result.origin.point.lon).toBeCloseTo(-20.8, 6)
    expect(result.destination.point.lon).toBeCloseTo(-19.2, 6)
    expect(result.connectedRoadEdges).toHaveLength(1)
    expect(result.connectedRoadEdges[0].geometry[0]).toEqual(result.origin.point)
    expect(result.connectedRoadEdges[0].geometry.at(-1)).toEqual(result.destination.point)
  })

  it('uses the nearest reachable road even when a farther road has a cheaper through-route', () => {
    const origin = { lat: 64, lon: -20.2 }
    const destination = { lat: 64, lon: -20 }
    const simpleStart = { lat: 64.000225, lon: -20.01 }
    const detourTop = { lat: 64.45, lon: -20.2 }
    const nearestStart = { lat: 64.000045, lon: -20.001 }
    const result = findAnchors([
      segment('simple-approach', [origin, simpleStart], { direction: 'forward' }),
      segment('simple-target', [
        simpleStart,
        { lat: 64.000225, lon: -19.99 },
      ], { direction: 'forward' }),
      segment('detour-a', [origin, detourTop], { direction: 'forward' }),
      segment('detour-b', [detourTop, nearestStart], { direction: 'forward' }),
      segment('nearest-target', [
        nearestStart,
        { lat: 64.000045, lon: -19.999 },
      ], { direction: 'forward' }),
    ], {
      kind: 'canonical_node',
      point: origin,
    }, {
      kind: 'projected_road',
      point: destination,
    }, 100)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.connectedRoadEdges.map(edge => edge.segmentId)).toEqual([
      'detour-a',
      'detour-b',
      'nearest-target',
    ])
    expect(result.destination.snapDistanceM).toBeGreaterThan(4)
    expect(result.destination.snapDistanceM).toBeLessThan(6)
  })

  it('rejects reverse travel between projected anchors on a forward-only edge', () => {
    const result = findAnchors([
      segment('one-way', [
        { lat: 64, lon: -20.5 },
        { lat: 64, lon: -20.1 },
      ], { direction: 'forward' }),
    ], {
      kind: 'projected_road',
      point: { lat: 64.001, lon: -20.2 },
    }, {
      kind: 'projected_road',
      point: { lat: 64.001, lon: -20.4 },
    })

    expect(result).toEqual({ status: 'no_route' })
  })

  it('uses the shared profile eligibility and excludes seasonal roads', () => {
    const graph = buildIcelandRoadGraph([
      segment('gravel', [ORIGIN, { lat: 64.08, lon: -21.8 }], { surface: 'gravel' }),
      segment('seasonal', [ORIGIN, { lat: 64.07, lon: -21.7 }], { isSeasonal: true }),
    ])
    const gravel = graph.edges.find(edge => edge.segmentId === 'gravel')!
    const seasonal = graph.edges.find(edge => edge.segmentId === 'seasonal')!

    expect(isIcelandRoadGraphEdgeAllowed(gravel, ICELAND_ROUTING_PROFILES.fastestCar)).toBe(true)
    expect(isIcelandRoadGraphEdgeAllowed(gravel, ICELAND_ROUTING_PROFILES.shortestPaved)).toBe(false)
    expect(isIcelandRoadGraphEdgeAllowed(seasonal, ICELAND_ROUTING_PROFILES.fastestCar)).toBe(false)
  })

  it('uses the requested route profile for candidate and path eligibility', () => {
    const origin = { lat: 64, lon: -20.2 }
    const destination = { lat: 64, lon: -20 }
    const pavedStart = { lat: 64.000225, lon: -20.01 }
    const gravelStart = { lat: 64.000045, lon: -20.001 }
    const graph = buildIcelandRoadGraph([
      segment('paved-approach', [origin, pavedStart], { direction: 'forward' }),
      segment('paved-target', [
        pavedStart,
        { lat: 64.000225, lon: -19.99 },
      ], { direction: 'forward' }),
      segment('gravel-approach', [origin, gravelStart], {
        direction: 'forward',
        surface: 'gravel',
      }),
      segment('gravel-target', [
        gravelStart,
        { lat: 64.000045, lon: -19.999 },
      ], {
        direction: 'forward',
        surface: 'gravel',
      }),
    ], { nodeSnapToleranceM: 2 })
    const result = findRouteAssessmentRoadAnchors(
      graph,
      { kind: 'canonical_node', point: origin },
      { kind: 'projected_road', point: destination },
      {
        maxOriginSnapDistanceM: 100,
        maxDestinationSnapDistanceM: 100,
        profile: ICELAND_ROUTING_PROFILES.shortestPaved,
      },
    )

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.connectedRoadEdges.map(edge => edge.segmentId)).toEqual([
      'paved-approach',
      'paved-target',
    ])
    expect(result.connectedRoadEdges.every(edge => edge.surface === 'paved')).toBe(true)
  })

  it('fails closed when a trusted anchor is ambiguous across physical roads', () => {
    const crossing = { lat: 64, lon: -20.3 }
    const result = findAnchors([
      segment('horizontal', [
        { lat: 64, lon: -20.5 },
        { lat: 64, lon: -20.1 },
      ]),
      segment('vertical', [
        { lat: 63.9, lon: -20.3 },
        { lat: 64.1, lon: -20.3 },
      ]),
    ], {
      kind: 'trusted_anchor',
      point: crossing,
    }, {
      kind: 'trusted_anchor',
      point: { lat: 64, lon: -20.1 },
    }, 2)

    expect(result).toEqual({ status: 'ambiguous_trusted_anchor' })
  })

  it('re-derives a unique trusted mid-edge anchor at two-metre tolerance', () => {
    const roadStart = { lat: 64, lon: -20.5 }
    const roadEnd = { lat: 64, lon: -20.1 }
    const result = findAnchors([
      segment('target', [roadStart, roadEnd], { direction: 'forward' }),
    ], {
      kind: 'trusted_anchor',
      point: { lat: 64, lon: -20.4 },
    }, {
      kind: 'trusted_anchor',
      point: { lat: 64, lon: -20.2 },
    }, 2)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.origin.kind).toBe('projected_road')
    expect(result.destination.kind).toBe('projected_road')
    expect(result.connectedRoadEdges).toHaveLength(1)
  })

  it('keeps a trusted on-edge point as a partial anchor when it is 1–2 m from a node', () => {
    const roadStart = { lat: 64, lon: -20.5 }
    const nearStartOnEdge = { lat: 64, lon: -20.49997 }
    const result = findAnchors([
      segment('target', [roadStart, { lat: 64, lon: -20.1 }], { direction: 'forward' }),
    ], {
      kind: 'trusted_anchor',
      point: nearStartOnEdge,
    }, {
      kind: 'trusted_anchor',
      point: { lat: 64, lon: -20.2 },
    }, 2)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.origin.kind).toBe('projected_road')
    expect(result.connectedRoadEdges[0].geometry[0]).toEqual(nearStartOnEdge)
  })

  it('keeps provenance stable and changes it when selected edge geometry drifts', () => {
    const junction = { lat: 64, lon: -20.5 }
    const destination = { lat: 64.001, lon: -20.2 }
    const baseSegments = [
      segment('approach', [ORIGIN, junction]),
      segment('target', [junction, { lat: 64, lon: -20.1 }]),
    ]
    const request = () => findAnchors(baseSegments, {
      kind: 'canonical_node', point: ORIGIN,
    }, {
      kind: 'projected_road', point: destination,
    })
    const first = request()
    const repeated = request()
    const drifted = findAnchors([
      baseSegments[0],
      segment('target', [junction, { lat: 64, lon: -20.3 }, { lat: 64, lon: -20.1 }]),
    ], {
      kind: 'canonical_node', point: ORIGIN,
    }, {
      kind: 'projected_road', point: destination,
    })

    expect(first.status).toBe('ok')
    expect(repeated.status).toBe('ok')
    expect(drifted.status).toBe('ok')
    if (first.status !== 'ok' || repeated.status !== 'ok' || drifted.status !== 'ok') return
    expect(repeated.routeProvenanceFingerprint).toBe(first.routeProvenanceFingerprint)
    expect(drifted.destination.point).toEqual(first.destination.point)
    expect(drifted.routeProvenanceFingerprint).not.toBe(first.routeProvenanceFingerprint)
  })

  it('changes provenance when structural inference policy, artifact, or expiry metadata changes', () => {
    const sourceId = 'vegagerdin:layer-6:section-10:road-part-1:road-part-number-1'
    const start = { lat: 64, lon: -20.5 }
    const end = { lat: 64, lon: -20.1 }
    const sourceProvenanceKey = `assessment_public_roads=${'a'.repeat(64)}|road_surfaces=${'b'.repeat(64)}`
    const policy = {
      schemaVersion: 1 as const,
      policyId: 'direction-policy',
      policyVersion: '1.0.0',
      generatorId: 'direction-generator',
      generatorVersion: '1.0.0',
      minimumConfidenceBps: 9_000,
    }
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
    const source = segment(`${sourceId}:geometry-0`, [start, end], {
      source: 'vegagerdin',
      sourceId,
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
    const resolve = (
      expiresAtIso: string,
      minimumConfidenceBps = policy.minimumConfidenceBps,
      datasetVersion = evidenceArtifact.datasetVersion,
    ) => {
      const resolvedPolicy = { ...policy, minimumConfidenceBps }
      const resolvedEvidenceArtifact = { ...evidenceArtifact, datasetVersion }
      const attestation = createIcelandRoadDirectionInferenceAttestation({
        schemaVersion: 1,
        kind: 'inferred_both',
        segmentSourceId: sourceId,
        sourceProvenanceKey,
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        generatorId: policy.generatorId,
        generatorVersion: policy.generatorVersion,
        evidenceArtifactId: resolvedEvidenceArtifact.artifactId,
        evidenceContentSha256: resolvedEvidenceArtifact.contentSha256,
        confidenceBps: 9_500,
        validFromIso: '2026-07-01T00:00:00.000Z',
        expiresAtIso,
      })
      const graph = buildIcelandRoadGraph([source], {
        nodeSnapToleranceM: 2,
        directionInference: {
          policy: resolvedPolicy,
          evidenceArtifacts: [resolvedEvidenceArtifact],
          attestations: [attestation],
          sourceProvenanceKey,
          evaluatedAtIso: '2026-07-02T00:00:00.000Z',
        },
      })
      return findRouteAssessmentRoadAnchors(
        graph,
        { kind: 'canonical_node', point: start },
        { kind: 'canonical_node', point: end },
        { maxOriginSnapDistanceM: 2, maxDestinationSnapDistanceM: 2 },
      )
    }
    const first = resolve('2026-08-01T00:00:00.000Z')
    const changedExpiry = resolve('2026-09-01T00:00:00.000Z')
    const changedPolicy = resolve('2026-08-01T00:00:00.000Z', 9_100)
    const changedArtifact = resolve('2026-08-01T00:00:00.000Z', 9_000, '2026-07-rev2')
    expect(first.status).toBe('ok')
    expect(changedExpiry.status).toBe('ok')
    expect(changedPolicy.status).toBe('ok')
    expect(changedArtifact.status).toBe('ok')
    if (
      first.status !== 'ok'
      || changedExpiry.status !== 'ok'
      || changedPolicy.status !== 'ok'
      || changedArtifact.status !== 'ok'
    ) return
    expect(changedExpiry.routeProvenanceFingerprint).not.toBe(first.routeProvenanceFingerprint)
    expect(changedPolicy.routeProvenanceFingerprint).not.toBe(first.routeProvenanceFingerprint)
    expect(changedArtifact.routeProvenanceFingerprint).not.toBe(first.routeProvenanceFingerprint)
  })

  it('finds a real one-way detour while preserving both projected partial endpoints', () => {
    const roadStart = { lat: 64, lon: -20.7 }
    const startGateway = { lat: 64, lon: -20.6 }
    const primaryMid = { lat: 64, lon: -20.4 }
    const endGateway = { lat: 64, lon: -20.2 }
    const roadEnd = { lat: 64, lon: -20.1 }
    const detourMid = { lat: 63.9, lon: -20.4 }
    const graph = buildIcelandRoadGraph([
      segment('origin-edge', [roadStart, startGateway], { direction: 'forward' }),
      segment('primary-a', [startGateway, primaryMid], { direction: 'forward' }),
      segment('primary-b', [primaryMid, endGateway], { direction: 'forward' }),
      segment('detour-a', [startGateway, detourMid], { direction: 'forward' }),
      segment('detour-b', [detourMid, endGateway], { direction: 'forward' }),
      segment('destination-edge', [endGateway, roadEnd], { direction: 'forward' }),
    ], { nodeSnapToleranceM: 2 })

    const result = findRouteAssessmentRoadAnchors(
      graph,
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.65 } },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.15 } },
      {
        maxOriginSnapDistanceM: 500,
        maxDestinationSnapDistanceM: 500,
        maxAlternatives: 4,
        maxAlternativeOverlap: 0.94,
      },
    )

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.alternativesComplete).toBe(true)
    expect(result.alternativeSearchAttempts).toBeGreaterThan(0)
    expect(result.alternativeSearchAttempts).toBeLessThanOrEqual(40)
    expect(result.alternatives).toHaveLength(1)
    const alternative = result.alternatives[0]
    expect(alternative.routeProvenanceFingerprint).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(alternative.connectedRoadEdges[0].geometry[0]).toEqual(result.origin.point)
    expect(alternative.connectedRoadEdges.at(-1)?.geometry.at(-1)).toEqual(result.destination.point)
    expect(alternative.connectedRoadEdges.map(edge => edge.segmentId)).toEqual([
      'origin-edge',
      'detour-a',
      'detour-b',
      'destination-edge',
    ])
  })

  it('inherits base exclusions and sliced-edge admissibility in generated alternatives', () => {
    const roadStart = { lat: 64, lon: -20.8 }
    const startGateway = { lat: 64, lon: -20.7 }
    const primaryMid = { lat: 64, lon: -20.5 }
    const endGateway = { lat: 64, lon: -20.3 }
    const roadEnd = { lat: 64, lon: -20.2 }
    const graph = buildIcelandRoadGraph([
      segment('origin-edge', [roadStart, startGateway], { direction: 'forward' }),
      segment('primary-a', [startGateway, primaryMid], { direction: 'forward' }),
      segment('primary-b', [primaryMid, endGateway], { direction: 'forward' }),
      segment('excluded-a', [startGateway, { lat: 63.97, lon: -20.5 }], { direction: 'forward' }),
      segment('excluded-b', [{ lat: 63.97, lon: -20.5 }, endGateway], { direction: 'forward' }),
      segment('rejected-a', [startGateway, { lat: 63.95, lon: -20.5 }], { direction: 'forward' }),
      segment('rejected-b', [{ lat: 63.95, lon: -20.5 }, endGateway], { direction: 'forward' }),
      segment('allowed-a', [startGateway, { lat: 63.9, lon: -20.5 }], { direction: 'forward' }),
      segment('allowed-b', [{ lat: 63.9, lon: -20.5 }, endGateway], { direction: 'forward' }),
      segment('destination-edge', [endGateway, roadEnd], { direction: 'forward' }),
    ], { nodeSnapToleranceM: 2 })

    const result = findRouteAssessmentRoadAnchors(
      graph,
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.75 } },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.25 } },
      {
        maxOriginSnapDistanceM: 500,
        maxDestinationSnapDistanceM: 500,
        maxAlternatives: 4,
        maxAlternativeOverlap: 0.94,
        excludedSegmentIds: new Set(['excluded-a', 'excluded-b']),
        edgeAdmissibility: edge => {
          if (edge.segmentId === 'origin-edge') {
            return (edge.geometry[0]?.lon ?? -Infinity) > roadStart.lon
          }
          if (edge.segmentId === 'destination-edge') {
            return (edge.geometry.at(-1)?.lon ?? Infinity) < roadEnd.lon
          }
          return !edge.segmentId.startsWith('rejected-')
        },
      },
    )

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.alternatives).toHaveLength(1)
    expect(result.alternatives[0].connectedRoadEdges.map(edge => edge.segmentId)).toEqual([
      'origin-edge',
      'allowed-a',
      'allowed-b',
      'destination-edge',
    ])
    expect(result.alternatives[0].connectedRoadEdges[0].geometry[0]).toEqual(result.origin.point)
    expect(result.alternatives[0].connectedRoadEdges.at(-1)?.geometry.at(-1)).toEqual(
      result.destination.point,
    )
  })

  it('marks a bounded alternative search incomplete when its synchronous deadline is exhausted', () => {
    const start = { lat: 64, lon: -20.6 }
    const middle = { lat: 64, lon: -20.4 }
    const end = { lat: 64, lon: -20.2 }
    const result = findRouteAssessmentRoadAnchors(
      buildIcelandRoadGraph([
        segment('primary-a', [start, middle]),
        segment('primary-b', [middle, end]),
      ]),
      { kind: 'trusted_anchor', point: start },
      { kind: 'trusted_anchor', point: end },
      {
        maxOriginSnapDistanceM: 2,
        maxDestinationSnapDistanceM: 2,
        maxAlternatives: 4,
        alternativeDeadlineAtMs: Date.now() - 1,
      },
    )

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.alternativesComplete).toBe(false)
    expect(result.alternativeSearchAttempts).toBe(0)
    expect(result.alternatives).toEqual([])
  })

  it('fails closed instead of returning a partial primary route after its deadline', () => {
    const start = { lat: 64, lon: -20.6 }
    const end = { lat: 64, lon: -20.2 }
    const result = findRouteAssessmentRoadAnchors(
      buildIcelandRoadGraph([
        segment('road', [start, end]),
      ]),
      { kind: 'canonical_node', point: start },
      { kind: 'canonical_node', point: end },
      {
        maxOriginSnapDistanceM: 2,
        maxDestinationSnapDistanceM: 2,
        deadlineAtMs: Date.now() - 1,
      },
    )

    expect(result).toEqual({ status: 'incomplete' })
  })

  it('fails closed when the absolute deadline expires during segment-geometry projection', () => {
    const geometry = Array.from({ length: 128 }, (_, index) => ({
      lat: 64,
      lon: -20.6 + index * 0.003,
    }))
    const activeGraph = buildIcelandRoadGraph([
      segment('long-geometry', geometry),
    ])
    let nowCalls = 0
    const now = vi.spyOn(Date, 'now').mockImplementation(() => (
      nowCalls++ < 5 ? 0 : 1_000
    ))
    try {
      const result = findRouteAssessmentRoadAnchors(
        activeGraph,
        { kind: 'canonical_node', point: geometry[0] },
        { kind: 'canonical_node', point: geometry.at(-1)! },
        {
          maxOriginSnapDistanceM: 2,
          maxDestinationSnapDistanceM: 2,
          deadlineAtMs: 500,
        },
      )

      expect(result).toEqual({ status: 'incomplete' })
      expect(nowCalls).toBeGreaterThan(5)
    } finally {
      now.mockRestore()
    }
  })

  it('caps single-segment alternative spur searches at forty attempts', () => {
    const points = Array.from({ length: 82 }, (_, index) => ({
      lat: 64,
      lon: -21 + index * 0.001,
    }))
    const result = findRouteAssessmentRoadAnchors(
      buildIcelandRoadGraph(points.slice(0, -1).map((point, index) => (
        segment(`chain-${index}`, [point, points[index + 1]], { direction: 'forward' })
      ))),
      { kind: 'trusted_anchor', point: points[0] },
      { kind: 'trusted_anchor', point: points.at(-1)! },
      {
        maxOriginSnapDistanceM: 2,
        maxDestinationSnapDistanceM: 2,
        maxAlternatives: 4,
      },
    )

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.alternativesComplete).toBe(true)
    expect(result.alternativeSearchAttempts).toBeGreaterThan(0)
    expect(result.alternativeSearchAttempts).toBeLessThanOrEqual(40)
    expect(result.alternatives).toEqual([])
  })

  it('re-derives the same opaque scope attestation from returned safe anchors', () => {
    const junction = { lat: 64, lon: -20.5 }
    const graph = buildIcelandRoadGraph([
      segment('approach', [ORIGIN, junction]),
      segment('target', [junction, { lat: 64, lon: -20.1 }]),
    ], { nodeSnapToleranceM: 2 })
    const initial = findRouteAssessmentRoadAnchors(
      graph,
      { kind: 'canonical_node', point: ORIGIN },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.201234 } },
      { maxOriginSnapDistanceM: 500, maxDestinationSnapDistanceM: 500 },
    )
    expect(initial.status).toBe('ok')
    if (initial.status !== 'ok') return
    const initialScopeId = createRouteAssessmentScopeId({
      originAnchorKind: initial.origin.kind,
      originPoint: initial.origin.point,
      destinationAnchorKind: initial.destination.kind,
      destinationPoint: initial.destination.point,
      routeProvenanceFingerprint: initial.routeProvenanceFingerprint,
    })

    const rederived = findRouteAssessmentRoadAnchors(
      graph,
      { kind: 'trusted_anchor', point: initial.origin.point },
      { kind: 'trusted_anchor', point: initial.destination.point },
      { maxOriginSnapDistanceM: 2, maxDestinationSnapDistanceM: 2 },
    )
    expect(rederived.status).toBe('ok')
    if (rederived.status !== 'ok') return
    const rederivedScopeId = createRouteAssessmentScopeId({
      originAnchorKind: rederived.origin.kind,
      originPoint: rederived.origin.point,
      destinationAnchorKind: rederived.destination.kind,
      destinationPoint: rederived.destination.point,
      routeProvenanceFingerprint: rederived.routeProvenanceFingerprint,
    })

    expect(rederivedScopeId).toBe(initialScopeId)
  })

  it('normalizes a projected anchor within 0.5 m of an edge endpoint for fresh-scope round trips', () => {
    const junction = { lat: 64, lon: -20.5 }
    const graph = buildIcelandRoadGraph([
      segment('approach', [ORIGIN, junction]),
      segment('target', [junction, { lat: 64, lon: -20.1 }], { direction: 'forward' }),
    ], { nodeSnapToleranceM: 2 })
    const initial = findRouteAssessmentRoadAnchors(
      graph,
      { kind: 'canonical_node', point: ORIGIN },
      { kind: 'projected_road', point: { lat: 64, lon: -20.499995 } },
      { maxOriginSnapDistanceM: 500, maxDestinationSnapDistanceM: 500 },
    )
    expect(initial.status).toBe('ok')
    if (initial.status !== 'ok') return
    expect(initial.destination).toMatchObject({
      kind: 'settlement_node',
      point: junction,
    })
    const initialScopeId = createRouteAssessmentScopeId({
      originAnchorKind: initial.origin.kind,
      originPoint: initial.origin.point,
      destinationAnchorKind: initial.destination.kind,
      destinationPoint: initial.destination.point,
      routeProvenanceFingerprint: initial.routeProvenanceFingerprint,
    })

    const rederived = findRouteAssessmentRoadAnchors(
      graph,
      { kind: 'trusted_anchor', point: initial.origin.point },
      { kind: 'trusted_anchor', point: initial.destination.point },
      { maxOriginSnapDistanceM: 2, maxDestinationSnapDistanceM: 2 },
    )
    expect(rederived.status).toBe('ok')
    if (rederived.status !== 'ok') return
    expect(createRouteAssessmentScopeId({
      originAnchorKind: rederived.origin.kind,
      originPoint: rederived.origin.point,
      destinationAnchorKind: rederived.destination.kind,
      destinationPoint: rederived.destination.point,
      routeProvenanceFingerprint: rederived.routeProvenanceFingerprint,
    })).toBe(initialScopeId)
  })

  it('fails closed when either endpoint has no in-range eligible anchor', () => {
    const graphSegments = [segment('local', [ORIGIN, { lat: 64.1, lon: -21.8 }])]
    expect(findAnchors(graphSegments, {
      kind: 'canonical_node', point: ORIGIN,
    }, {
      kind: 'projected_road', point: { lat: 66, lon: -18 },
    })).toEqual({ status: 'no_destination_anchor' })
    expect(findAnchors([
      segment('far-local', [
        { lat: 64.2, lon: -21.6 },
        { lat: 64.21, lon: -21.5 },
      ]),
    ], {
      kind: 'canonical_node', point: ORIGIN,
    }, {
      kind: 'projected_road', point: { lat: 64.2, lon: -21.55 },
    }, 5)).toEqual({ status: 'no_origin_anchor' })
  })
})
