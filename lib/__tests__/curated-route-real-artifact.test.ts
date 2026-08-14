import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  HELLISHEIDI_GATE,
  HOLMAVIK_GATE,
  HOLMAVIK_NORTH_ROUTE61_GATE,
  OXI_STATION,
  REYDARFJORDUR_GATE,
  RING_ROAD_EAST_GATE,
  RING_ROAD_NORTHEAST_GATE,
  RING_ROAD_NORTH_GATE,
  RING_ROAD_SOUTH_GATE,
} from '@/lib/iceland-routes/curatedRouteParity'
import { auditIcelandGoldenRoutes, ICELAND_GOLDEN_ROUTES } from '@/lib/iceland-routes/goldenRoutes'
import { buildIcelandRoadGraph, haversineDistanceM } from '@/lib/iceland-routes/roadGraph'
import { resolveTeskeidAssessmentRouteEvidence } from '@/lib/iceland-routes/routeAssessmentCandidateEvidence.server'
import {
  createRouteAssessmentPhysicalTraversalKey,
  findRouteAssessmentRoadAnchors,
} from '@/lib/iceland-routes/routeAssessmentRoadAnchor.server'
import { createRouteAssessmentScopeId } from '@/lib/iceland-routes/routeAssessmentScopeId.server'
import type { IcelandRoadGraph, IcelandRoadGraphEdge } from '@/lib/iceland-routes/roadGraphTypes'
import {
  createRouteOptionEvidenceClaim,
  restoredRouteOptionEvidenceMatchesSignedRoute,
  restoreRouteOptionEvidence,
} from '@/lib/iceland-routes/routeOptionEvidence.server'
import type { LatLon } from '@/lib/iceland-routes/types'
import {
  normalizeVegagerdinRoadGraphSegmentsWithReport,
  type ArcGisGeoJsonFeatureCollection,
} from '@/lib/iceland-routes/vegagerdinRoadGraphSource'
import { reconcileVegagerdinRoadGraphTopology } from '@/lib/iceland-routes/vegagerdinRoadGraphTopology'

const artifactPath = join(process.cwd(), '.tmp', 'phase2-road-source', 'official-source.json')
const REQUIRED_ARTIFACT_SHA256 = 'db5832baf6cb0b566e13da3734cb9926917567bf25f33c91254ffb524be0c7b4'
const REYKJAVIK = { lat: 64.1466, lon: -21.9426 }
const HVERAGERDI = { lat: 63.9984, lon: -21.1887 }
const AKUREYRI = { lat: 65.6885, lon: -18.1262 }
const HOFN = { lat: 64.2497, lon: -15.2020 }
const EGILSSTADIR = { lat: 65.2674, lon: -14.3948 }
const THINGEYRI = { lat: 65.8797, lon: -23.4929 }
const GARDABAER = { lat: 64.08968, lon: -21.89214 }

interface LocalOfficialArtifact {
  assessment_public_roads: ArcGisGeoJsonFeatureCollection
  road_surfaces: ArcGisGeoJsonFeatureCollection
}

let graph: IcelandRoadGraph

function nearestVerifiedEdgeIndex(
  edges: readonly IcelandRoadGraphEdge[],
  gate: LatLon,
  roadNumbers: readonly string[],
): number {
  return edges.findIndex(edge => (
    roadNumbers.includes(edge.roadNumber ?? '')
    && edge.geometry.some(point => haversineDistanceM(point, gate) <= 2_500)
  ))
}

function nearestGraphRoadPoint(gate: LatLon, roadNumbers: readonly string[]) {
  let best: { distanceM: number; point: LatLon; roadNumber: string | undefined } | null = null
  for (const edge of graph.edges.values()) {
    if (!roadNumbers.includes(edge.roadNumber ?? '')) continue
    for (const point of edge.geometry) {
      const distanceM = haversineDistanceM(point, gate)
      if (!best || distanceM < best.distanceM) {
        best = { distanceM, point, roadNumber: edge.roadNumber }
      }
    }
  }
  return best
}

function resolved(origin: LatLon, destination: LatLon) {
  const anchors = findRouteAssessmentRoadAnchors(
    graph,
    { kind: 'canonical_node', point: origin },
    { kind: 'canonical_node', point: destination },
    {
      maxOriginSnapDistanceM: 2_500,
      maxDestinationSnapDistanceM: 2_500,
      maxAlternatives: 0,
      deadlineAtMs: Date.now() + 30_000,
    },
  )
  expect(anchors.status).toBe('ok')
  if (anchors.status !== 'ok') throw new Error(`unexpected anchor status ${anchors.status}`)
  const assessmentScopeId = createRouteAssessmentScopeId({
    originAnchorKind: anchors.origin.kind,
    originPoint: anchors.origin.point,
    destinationAnchorKind: anchors.destination.kind,
    destinationPoint: anchors.destination.point,
    routeProvenanceFingerprint: anchors.routeProvenanceFingerprint,
  })
  const outcome = resolveTeskeidAssessmentRouteEvidence({
    graph,
    origin: anchors.origin.point,
    destination: anchors.destination.point,
    assessmentScopeId,
    includeAlternatives: true,
    deadlineAtMs: Date.now() + 120_000,
    alternativeDeadlineAtMs: Date.now() + 115_000,
  })
  expect(outcome.status).toBe('ready')
  if (outcome.status !== 'ready') throw new Error(`unexpected evidence status ${outcome.status}`)
  return outcome.evidence
}

function expectSignedEvidenceRoundTrip(
  evidence: ReturnType<typeof resolved>[number],
) {
  const origin = evidence.route.points[0]
  const destination = evidence.route.points.at(-1)
  expect(origin).toBeDefined()
  expect(destination).toBeDefined()
  if (!origin || !destination) return
  const claim = createRouteOptionEvidenceClaim({ origin, destination, evidence })
  expect(claim).not.toBeNull()
  if (!claim) return
  const restored = restoreRouteOptionEvidence({
    graph,
    claim,
    origin,
    destination,
  })
  expect(restored).not.toBeNull()
  if (!restored) return
  expect(restoredRouteOptionEvidenceMatchesSignedRoute({
    restored,
    signedRoute: evidence.route,
    claim,
    origin,
    destination,
  })).toBe(true)
}

beforeAll(() => {
  // This suite is a release gate. Missing artifacts fail; they never turn the
  // suite into describe.skip and therefore can never produce a false green.
  expect(existsSync(artifactPath), `required artifact missing: ${artifactPath}`).toBe(true)
  const bytes = readFileSync(artifactPath)
  expect(bytes.byteLength).toBe(96_483_446)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(REQUIRED_ARTIFACT_SHA256)
  const raw = JSON.parse(bytes.toString('utf8')) as LocalOfficialArtifact
  const normalized = normalizeVegagerdinRoadGraphSegmentsWithReport({
    roads: raw.assessment_public_roads,
    surfaces: raw.road_surfaces,
    roadLayerId: 6,
    effectiveAtEpochMs: Date.parse('2026-07-30T00:00:00.000Z'),
  })
  const topology = reconcileVegagerdinRoadGraphTopology({
    segments: normalized.segments,
    nodeSnapToleranceM: 20,
    artifact: {
      artifactId: 'local-official-road-source',
      contentSha256: REQUIRED_ARTIFACT_SHA256,
      validationReportId: 'v238-curated-route-parity',
    },
  })
  graph = buildIcelandRoadGraph(normalized.segments, {
    nodeSnapToleranceM: 20,
    routingDirectionPolicy: 'bidirectional',
    missingDirectionPolicy: 'provisional_bidirectional',
    topologyReconciliation: {
      bindings: topology.bindings,
      sectionLedger: topology.sectionLedger,
      receiptLedger: topology.receipts,
      policyId: topology.policyId,
      provenance: topology.receipts[0].provenance,
      invalidBindingBehavior: 'throw',
    },
  })
}, 120_000)

describe('v238 official-artifact curated parity (required, never skipped)', () => {
  it('keeps all 23 golden route pairs green in both directions', () => {
    expect(ICELAND_GOLDEN_ROUTES).toHaveLength(23)
    const audit = auditIcelandGoldenRoutes(graph)
    expect(audit).toHaveLength(23)
    expect(audit.filter(route => route.status !== 'ok')).toEqual([])
    expect(audit.every(route => (
      route.reverseDistanceKm !== null
      && route.directionalDistanceDeltaM !== null
    ))).toBe(true)
  }, 60_000)

  it('resolves every provider-neutral curated gate to the expected official road', () => {
    const gates: readonly [string, LatLon, readonly string[]][] = [
      ['Hellisheiði', HELLISHEIDI_GATE, ['1']],
      ['south', RING_ROAD_SOUTH_GATE, ['1']],
      ['east', RING_ROAD_EAST_GATE, ['1']],
      ['northeast', RING_ROAD_NORTHEAST_GATE, ['1']],
      ['north', RING_ROAD_NORTH_GATE, ['1']],
      ['Reyðarfjörður', REYDARFJORDUR_GATE, ['92', '96']],
    ]
    for (const [name, gate, roads] of gates) {
      const anchors = findRouteAssessmentRoadAnchors(
        graph,
        { kind: 'canonical_node', point: gate },
        { kind: 'canonical_node', point: gate },
        { maxOriginSnapDistanceM: 2_500, maxDestinationSnapDistanceM: 2_500 },
      )
      expect(anchors.status, name).not.toBe('no_origin_anchor')
      const nearest = nearestGraphRoadPoint(gate, roads)
      expect(
        nearest?.distanceM,
        `${name}: ${JSON.stringify(nearest)}`,
      ).toBeLessThanOrEqual(2_500)
    }
  }, 30_000)

  it('proves both exact Hellisheiði rule outcomes and the dual east label', () => {
    const south = resolved(REYKJAVIK, HVERAGERDI)
    const southRoute = south.find(item => item.route.labels.includes('CURATED_VIA_HELLISHEIDI'))
    expect(southRoute).toBeDefined()
    expect(nearestVerifiedEdgeIndex(southRoute!.connectedRoadEdges, HELLISHEIDI_GATE, ['1'])).toBeGreaterThanOrEqual(0)
    expectSignedEvidenceRoundTrip(southRoute!)

    const east = resolved(REYKJAVIK, EGILSSTADIR)
    const eastRoute = east.find(item => item.route.labels.includes('CURATED_EAST_ICELAND_VIA_HELLISHEIDI'))
    expect(eastRoute?.route.labels).toContain('CURATED_VIA_HELLISHEIDI')
    expect(nearestVerifiedEdgeIndex(eastRoute!.connectedRoadEdges, HELLISHEIDI_GATE, ['1'])).toBeGreaterThanOrEqual(0)
    expectSignedEvidenceRoundTrip(eastRoute!)
  }, 240_000)

  it('dedupes the Garðabær to Egilsstaðir southern path and removes terminal backtrack', () => {
    const evidence = resolved(GARDABAER, EGILSSTADIR)
    const physicalKeys = evidence.map(item => (
      createRouteAssessmentPhysicalTraversalKey(item.connectedRoadEdges)
    ))
    expect(new Set(physicalKeys).size).toBe(physicalKeys.length)

    const oxiRoutes = evidence.filter(item => (
      item.connectedRoadEdges.some(edge => edge.roadNumber === '939')
    ))
    expect(oxiRoutes).toHaveLength(1)
    const oxi = oxiRoutes[0]
    expect(oxi.route.labels).toEqual(expect.arrayContaining([
      'CURATED_VIA_HELLISHEIDI',
      'CURATED_EAST_ICELAND_VIA_HELLISHEIDI',
    ]))
    expect(oxi.route.cautions).toContainEqual(expect.objectContaining({
      id: 'oxi-axarvegur-939',
    }))

    const tail = oxi.connectedRoadEdges.slice(-2)
    expect(tail).toHaveLength(2)
    expect(
      tail[0].segmentId === tail[1].segmentId
      && /:forward(?::assessment:|$)/.test(tail[0].id)
        !== /:forward(?::assessment:|$)/.test(tail[1].id),
    ).toBe(false)
  }, 240_000)

  it('proves Hringurinn A south-east-north in ordered official Road 1 evidence', () => {
    const evidence = resolved(REYKJAVIK, AKUREYRI)
    const ring = evidence.find(item => item.route.labels.includes('CURATED_RING_ROAD'))
    expect(ring, JSON.stringify(evidence.map(item => ({
      labels: item.route.labels,
      distanceM: item.route.distanceM,
      roads: [...new Set(item.connectedRoadEdges.map(edge => edge.roadNumber))],
    })))).toBeDefined()
    const indices = [HELLISHEIDI_GATE, RING_ROAD_SOUTH_GATE, RING_ROAD_EAST_GATE, RING_ROAD_NORTHEAST_GATE]
      .map(gate => nearestVerifiedEdgeIndex(ring!.connectedRoadEdges, gate, ['1']))
    expect(indices.every(index => index >= 0)).toBe(true)
    expect(indices).toEqual([...indices].sort((left, right) => left - right))
    expect(ring!.route.distanceM).toBeGreaterThan(900_000)
  }, 240_000)

  it('proves Hringurinn B north-east-south without Öxi or destination backtrack', () => {
    const evidence = resolved(REYKJAVIK, HOFN)
    const ring = evidence.find(item => item.route.labels.includes('CURATED_RING_ROAD'))
    expect(ring, JSON.stringify(evidence.map(item => ({
      labels: item.route.labels,
      distanceM: item.route.distanceM,
      roads: [...new Set(item.connectedRoadEdges.map(edge => edge.roadNumber))],
    })))).toBeDefined()
    const northIndex = nearestVerifiedEdgeIndex(ring!.connectedRoadEdges, RING_ROAD_NORTH_GATE, ['1'])
    const northeastIndex = nearestVerifiedEdgeIndex(ring!.connectedRoadEdges, RING_ROAD_NORTHEAST_GATE, ['1'])
    expect(northIndex).toBeGreaterThanOrEqual(0)
    expect(northeastIndex).toBeGreaterThan(northIndex)
    expect(ring!.connectedRoadEdges.some(edge => edge.roadNumber === '939')).toBe(false)
    expect(ring!.route.cautions).not.toContainEqual(expect.objectContaining({ id: 'oxi-axarvegur-939' }))
    const destinationNearIndices = ring!.route.points
      .map((point, index) => haversineDistanceM(point, HOFN) <= 5_000 ? index : -1)
      .filter(index => index >= 0)
    expect(destinationNearIndices.at(-1)).toBe(ring!.route.points.length - 1)
  }, 240_000)

  it('proves Öxi detection and a distinct Reyðarfjörður-safe route in both directions', () => {
    for (const [origin, destination] of [
      [EGILSSTADIR, HOFN],
      [HOFN, EGILSSTADIR],
    ] as const) {
      const evidence = resolved(origin, destination)
      const oxi = evidence.find(item => item.connectedRoadEdges.some(edge => edge.roadNumber === '939'))
      const safe = evidence.find(item => item.route.labels.includes('CURATED_AVOID_OXI'))
      expect(oxi).toBeDefined()
      expect(nearestVerifiedEdgeIndex(oxi!.connectedRoadEdges, OXI_STATION, ['939'])).toBeGreaterThanOrEqual(0)
      expect(safe).toBeDefined()
      expect(nearestVerifiedEdgeIndex(safe!.connectedRoadEdges, REYDARFJORDUR_GATE, ['92', '96'])).toBeGreaterThanOrEqual(0)
      expect(safe!.connectedRoadEdges.some(edge => edge.roadNumber === '939')).toBe(false)
      expect(safe!.route.cautions).not.toContainEqual(expect.objectContaining({ id: 'oxi-axarvegur-939' }))
      expectSignedEvidenceRoundTrip(oxi!)
      expectSignedEvidenceRoundTrip(safe!)
    }
  }, 240_000)

  it('preserves Hólmavík ordered gates and signed edge evidence in both directions', () => {
    for (const [origin, destination, expectedOrder] of [
      [REYKJAVIK, THINGEYRI, [HOLMAVIK_GATE, HOLMAVIK_NORTH_ROUTE61_GATE]],
      [THINGEYRI, REYKJAVIK, [HOLMAVIK_NORTH_ROUTE61_GATE, HOLMAVIK_GATE]],
    ] as const) {
      const evidence = resolved(origin, destination)
      const holmavik = evidence.find(item => item.route.labels.includes('CURATED_VIA_HOLMAVIK'))
      expect(holmavik).toBeDefined()
      const indices = expectedOrder.map(gate => nearestVerifiedEdgeIndex(
        holmavik!.connectedRoadEdges,
        gate,
        ['61'],
      ))
      expect(indices[0]).toBeGreaterThanOrEqual(0)
      expect(indices[1]).toBeGreaterThan(indices[0])
      expect(holmavik!.route.points[0]).toEqual(holmavik!.connectedRoadEdges[0].geometry[0])
      expect(holmavik!.route.points.at(-1)).toEqual(holmavik!.connectedRoadEdges.at(-1)?.geometry.at(-1))
      expectSignedEvidenceRoundTrip(holmavik!)
    }
  }, 240_000)
})
