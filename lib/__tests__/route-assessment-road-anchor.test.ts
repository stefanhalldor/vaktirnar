import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  buildIcelandRoadGraph,
  ICELAND_ROUTING_PROFILES,
  isIcelandRoadGraphEdgeAllowed,
} from '@/lib/iceland-routes/roadGraph'
import { findRouteAssessmentRoadAnchors } from '@/lib/iceland-routes/routeAssessmentRoadAnchor.server'
import { createRouteAssessmentScopeId } from '@/lib/iceland-routes/routeAssessmentScopeId.server'
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
