import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  HELLISHEIDI_GATE,
  OXI_STATION,
  REYDARFJORDUR_GATE,
  RING_ROAD_EAST_GATE,
  RING_ROAD_NORTHEAST_GATE,
  RING_ROAD_NORTH_GATE,
  RING_ROAD_SOUTH_GATE,
} from '@/lib/iceland-routes/curatedRouteParity'
import { buildIcelandRoadGraph } from '@/lib/iceland-routes/roadGraph'
import { resolveTeskeidAssessmentRouteEvidence } from '@/lib/iceland-routes/routeAssessmentCandidateEvidence.server'
import { findRouteAssessmentRoadAnchors } from '@/lib/iceland-routes/routeAssessmentRoadAnchor.server'
import { createRouteAssessmentScopeId } from '@/lib/iceland-routes/routeAssessmentScopeId.server'
import type { IcelandRoadGraph, IcelandRoadGraphSegmentInput } from '@/lib/iceland-routes/roadGraphTypes'
import type { LatLon } from '@/lib/iceland-routes/types'

const REYKJAVIK = { lat: 64.1466, lon: -21.9426 }
const HVERAGERDI = { lat: 63.9984, lon: -21.1887 }
const AKUREYRI = { lat: 65.6885, lon: -18.1262 }
const HOFN = { lat: 64.2497, lon: -15.2020 }
const EGILSSTADIR = { lat: 65.2674, lon: -14.3948 }
const ISAFJORDUR = { lat: 66.0749, lon: -23.1251 }

function segment(
  id: string,
  geometry: readonly LatLon[],
  lengthM: number,
  roadNumber = '1',
): IcelandRoadGraphSegmentInput {
  return {
    id,
    source: 'teskeid_fixture',
    sourceId: id,
    geometry,
    roadNumber,
    lengthM,
    roadClass: 'trunk',
    surface: 'paved',
    direction: 'both',
  }
}

function signedScope(graph: IcelandRoadGraph, origin: LatLon, destination: LatLon) {
  const anchors = findRouteAssessmentRoadAnchors(
    graph,
    { kind: 'canonical_node', point: origin },
    { kind: 'canonical_node', point: destination },
    { maxOriginSnapDistanceM: 500, maxDestinationSnapDistanceM: 500 },
  )
  if (anchors.status !== 'ok') throw new Error(`unexpected anchor status ${anchors.status}`)
  return {
    origin: anchors.origin.point,
    destination: anchors.destination.point,
    assessmentScopeId: createRouteAssessmentScopeId({
      originAnchorKind: anchors.origin.kind,
      originPoint: anchors.origin.point,
      destinationAnchorKind: anchors.destination.kind,
      destinationPoint: anchors.destination.point,
      routeProvenanceFingerprint: anchors.routeProvenanceFingerprint,
    }),
  }
}

function resolve(graph: IcelandRoadGraph, origin: LatLon, destination: LatLon) {
  const scope = signedScope(graph, origin, destination)
  return resolveTeskeidAssessmentRouteEvidence({
    graph,
    ...scope,
    includeAlternatives: true,
    deadlineAtMs: Date.now() + 30_000,
    alternativeDeadlineAtMs: Date.now() + 29_000,
  })
}

describe('provider-neutral curated route evidence', () => {
  it('reuses a complete graph alternative through verified Road 1 Hellisheiði evidence', () => {
    const graph = buildIcelandRoadGraph([
      segment('direct-route-39', [REYKJAVIK, HVERAGERDI], 45_000, '39'),
      segment('route-1-west', [REYKJAVIK, HELLISHEIDI_GATE], 30_000),
      segment('route-1-east', [HELLISHEIDI_GATE, HVERAGERDI], 30_000),
    ], { nodeSnapToleranceM: 2 })
    const outcome = resolve(graph, REYKJAVIK, HVERAGERDI)
    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    const curated = outcome.evidence.find(candidate => (
      candidate.route.labels.includes('CURATED_VIA_HELLISHEIDI')
    ))
    expect(curated).toBeDefined()
    expect(curated?.connectedRoadEdges.every(edge => edge.roadNumber === '1')).toBe(true)
    expect(curated?.route.labels).toContain('TESKEID_ALTERNATIVE')
    expect(outcome.evidence.filter(candidate => (
      candidate.route.labels.includes('CURATED_VIA_HELLISHEIDI')
    ))).toHaveLength(1)
  })

  it('preserves the south-east-north Ring Road alternative as atomic graph evidence', () => {
    const graph = buildIcelandRoadGraph([
      segment('fast-north', [REYKJAVIK, AKUREYRI], 390_000),
      segment('ring-a-1', [REYKJAVIK, HELLISHEIDI_GATE], 100_000),
      segment('ring-a-2', [HELLISHEIDI_GATE, RING_ROAD_SOUTH_GATE], 200_000),
      segment('ring-a-3', [RING_ROAD_SOUTH_GATE, RING_ROAD_EAST_GATE], 300_000),
      // The fixture follows the verified Road 1/Reyðarfjörður corridor. A
      // straight synthetic chord between the two ring gates would cross the
      // Öxi caution geometry even though the real road does not.
      segment(
        'ring-a-4',
        [RING_ROAD_EAST_GATE, REYDARFJORDUR_GATE, RING_ROAD_NORTHEAST_GATE],
        150_000,
      ),
      segment('ring-a-5', [RING_ROAD_NORTHEAST_GATE, AKUREYRI], 250_000),
    ], { nodeSnapToleranceM: 2 })
    const outcome = resolve(graph, REYKJAVIK, AKUREYRI)
    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    const ring = outcome.evidence.find(candidate => candidate.route.labels.includes('CURATED_RING_ROAD'))
    expect(ring?.connectedRoadEdges.map(edge => edge.segmentId)).toEqual([
      'ring-a-1', 'ring-a-2', 'ring-a-3', 'ring-a-4', 'ring-a-5',
    ])
    expect(ring?.route.points[0]).toEqual(REYKJAVIK)
    expect(ring?.route.points.at(-1)).toEqual(AKUREYRI)
  })

  it('preserves the north-east-south Ring Road alternative without destination backtrack', () => {
    const graph = buildIcelandRoadGraph([
      segment('fast-south', [REYKJAVIK, HELLISHEIDI_GATE, HOFN], 450_000),
      segment('ring-b-1', [REYKJAVIK, RING_ROAD_NORTH_GATE], 250_000),
      segment('ring-b-2', [RING_ROAD_NORTH_GATE, RING_ROAD_NORTHEAST_GATE], 250_000),
      segment(
        'ring-b-3',
        [RING_ROAD_NORTHEAST_GATE, REYDARFJORDUR_GATE, RING_ROAD_EAST_GATE, HOFN],
        300_000,
      ),
    ], { nodeSnapToleranceM: 2 })
    const outcome = resolve(graph, REYKJAVIK, HOFN)
    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    const ring = outcome.evidence.find(candidate => candidate.route.labels.includes('CURATED_RING_ROAD'))
    expect(ring?.connectedRoadEdges.map(edge => edge.segmentId)).toEqual([
      'ring-b-1', 'ring-b-2', 'ring-b-3',
    ])
    expect(ring?.connectedRoadEdges.some(edge => edge.roadNumber === '939')).toBe(false)
    expect(ring?.route.points.filter(point => point.lat === HOFN.lat && point.lon === HOFN.lon)).toHaveLength(1)
  })

  it('reuses and labels the safe Reyðarfjörður candidate when the primary uses Öxi', () => {
    const graph = buildIcelandRoadGraph([
      segment('oxi-north', [EGILSSTADIR, OXI_STATION], 70_000, '939'),
      segment('oxi-south', [OXI_STATION, HOFN], 70_000, '939'),
      segment('fjord-north', [EGILSSTADIR, REYDARFJORDUR_GATE], 100_000, '92'),
      segment('fjord-south', [REYDARFJORDUR_GATE, HOFN], 100_000, '96'),
    ], { nodeSnapToleranceM: 2 })
    const outcome = resolve(graph, EGILSSTADIR, HOFN)
    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    const unsafe = outcome.evidence.find(candidate => (
      candidate.connectedRoadEdges.some(edge => edge.roadNumber === '939')
    ))
    const safe = outcome.evidence.find(candidate => (
      candidate.route.labels.includes('CURATED_AVOID_OXI')
    ))
    expect(unsafe?.route.cautions).toContainEqual(expect.objectContaining({ id: 'oxi-axarvegur-939' }))
    expect(safe?.connectedRoadEdges.map(edge => edge.roadNumber)).toEqual(['92', '96'])
    expect(safe?.route.cautions).not.toContainEqual(expect.objectContaining({ id: 'oxi-axarvegur-939' }))
    expect(outcome.evidence.filter(candidate => (
      candidate.route.labels.includes('CURATED_AVOID_OXI')
    ))).toHaveLength(1)
  })

  it('fails closed when a triggered Hellisheiði corridor cannot be proved', () => {
    const graph = buildIcelandRoadGraph([
      segment('direct-route-39', [REYKJAVIK, HVERAGERDI], 45_000, '39'),
    ], { nodeSnapToleranceM: 2 })

    expect(resolve(graph, REYKJAVIK, HVERAGERDI)).toEqual({
      status: 'unavailable',
      evidence: [],
    })
  })

  it('fails closed instead of publishing an Öxi-only candidate', () => {
    const graph = buildIcelandRoadGraph([
      segment('oxi-north', [EGILSSTADIR, OXI_STATION], 70_000, '939'),
      segment('oxi-south', [OXI_STATION, HOFN], 70_000, '939'),
    ], { nodeSnapToleranceM: 2 })

    expect(resolve(graph, EGILSSTADIR, HOFN)).toEqual({
      status: 'unavailable',
      evidence: [],
    })
  })

  it('fails closed when the mandatory northbound Ring Road route is unavailable', () => {
    const graph = buildIcelandRoadGraph([
      segment('fast-north-only', [REYKJAVIK, AKUREYRI], 390_000),
    ], { nodeSnapToleranceM: 2 })

    expect(resolve(graph, REYKJAVIK, AKUREYRI)).toEqual({
      status: 'unavailable',
      evidence: [],
    })
  })

  it('fails closed when the mandatory southbound Ring Road route is unavailable', () => {
    const graph = buildIcelandRoadGraph([
      // This proves the separately mandatory Hellisheiði outcome so the
      // unavailable result specifically exercises the missing clockwise ring.
      segment('fast-south-via-hellisheidi', [REYKJAVIK, HELLISHEIDI_GATE, HOFN], 450_000),
    ], { nodeSnapToleranceM: 2 })

    expect(resolve(graph, REYKJAVIK, HOFN)).toEqual({
      status: 'unavailable',
      evidence: [],
    })
  })

  it('fails closed when the mandatory Hólmavík safety route is unavailable', () => {
    const graph = buildIcelandRoadGraph([
      segment('westfjords-direct-only', [REYKJAVIK, ISAFJORDUR], 450_000, '60'),
    ], { nodeSnapToleranceM: 2 })

    expect(resolve(graph, REYKJAVIK, ISAFJORDUR)).toEqual({
      status: 'unavailable',
      evidence: [],
    })
  })
})
