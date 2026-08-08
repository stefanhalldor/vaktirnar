import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  buildIcelandRoadGraph,
  buildIcelandRoadGraphRouteFromEdges,
  haversineDistanceM,
} from '@/lib/iceland-routes/roadGraph'
import { resolveTeskeidAssessmentRouteEvidence } from '@/lib/iceland-routes/routeAssessmentCandidateEvidence.server'
import { findRouteAssessmentRoadAnchors } from '@/lib/iceland-routes/routeAssessmentRoadAnchor.server'
import { createRouteAssessmentScopeId } from '@/lib/iceland-routes/routeAssessmentScopeId.server'
import {
  createRouteOptionEvidenceClaim,
  restoreRouteOptionEvidence,
} from '@/lib/iceland-routes/routeOptionEvidence.server'
import {
  normalizeVegagerdinRoadGraphSegmentsWithReport,
  type ArcGisGeoJsonFeatureCollection,
} from '@/lib/iceland-routes/vegagerdinRoadGraphSource'
import { reconcileVegagerdinRoadGraphTopology } from '@/lib/iceland-routes/vegagerdinRoadGraphTopology'
import {
  HOLMAVIK_NORTH_ROUTE61_VIA,
  HOLMAVIK_VIA,
} from '@/lib/weather/routeCautionConstants'

const artifactPath = join(process.cwd(), '.tmp', 'phase2-road-source', 'official-source.json')
const describeRealArtifact = existsSync(artifactPath) ? describe : describe.skip
const REYKJAVIK = { lat: 64.1466, lon: -21.9426 }
const THINGEYRI = { lat: 65.8797, lon: -23.4929 }

interface LocalOfficialArtifact {
  assessment_public_roads: ArcGisGeoJsonFeatureCollection
  road_surfaces: ArcGisGeoJsonFeatureCollection
}

function nearestPointIndex(
  points: readonly { lat: number; lon: number }[],
  target: { lat: number; lon: number },
): number {
  let bestIndex = -1
  let bestDistanceM = Number.POSITIVE_INFINITY
  points.forEach((point, index) => {
    const distanceM = haversineDistanceM(point, target)
    if (distanceM < bestDistanceM) {
      bestDistanceM = distanceM
      bestIndex = index
    }
  })
  return bestIndex
}

describeRealArtifact('Reykjavík to Þingeyri via Hólmavík official-artifact regression', () => {
  it('keeps the Teskeið route northbound after Hólmavík', () => {
    const bytes = readFileSync(artifactPath)
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
        contentSha256: createHash('sha256').update(bytes).digest('hex'),
        validationReportId: 'holmavik-north-corridor-real-artifact-regression',
      },
    })
    const graph = buildIcelandRoadGraph(normalized.segments, {
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
    const anchors = findRouteAssessmentRoadAnchors(
      graph,
      { kind: 'canonical_node', point: REYKJAVIK },
      { kind: 'canonical_node', point: THINGEYRI },
      { maxOriginSnapDistanceM: 2_500, maxDestinationSnapDistanceM: 2_500 },
    )
    expect(anchors.status).toBe('ok')
    if (anchors.status !== 'ok') return
    const assessmentScopeId = createRouteAssessmentScopeId({
      originAnchorKind: anchors.origin.kind,
      originPoint: anchors.origin.point,
      destinationAnchorKind: anchors.destination.kind,
      destinationPoint: anchors.destination.point,
      routeProvenanceFingerprint: anchors.routeProvenanceFingerprint,
    })
    const startedAtMs = Date.now()
    const outcome = resolveTeskeidAssessmentRouteEvidence({
      graph,
      origin: anchors.origin.point,
      destination: anchors.destination.point,
      assessmentScopeId,
      includeAlternatives: false,
      // This artifact gate proves the extended completion path, not a portable
      // host-level SLO for metadata reads, signing or HTTP overhead.
      deadlineAtMs: Date.now() + 20_000,
    })
    expect(outcome.status).toBe('ready')
    expect(Date.now() - startedAtMs).toBeLessThan(20_000)
    if (outcome.status !== 'ready') return
    const viaHolmavik = outcome.evidence.find(evidence => (
      evidence.route.labels.includes('CURATED_VIA_HOLMAVIK')
    ))
    expect(viaHolmavik?.route.provider).toBe('teskeid')
    if (!viaHolmavik) return
    const route = buildIcelandRoadGraphRouteFromEdges(viaHolmavik.connectedRoadEdges)
    const holmavikIndex = nearestPointIndex(route.geometry, HOLMAVIK_VIA)
    const northGateIndex = nearestPointIndex(route.geometry, HOLMAVIK_NORTH_ROUTE61_VIA)
    expect(holmavikIndex).toBeGreaterThanOrEqual(0)
    expect(northGateIndex).toBeGreaterThan(holmavikIndex)
    expect(haversineDistanceM(route.geometry[holmavikIndex], HOLMAVIK_VIA)).toBeLessThanOrEqual(2_500)
    expect(haversineDistanceM(route.geometry[northGateIndex], HOLMAVIK_NORTH_ROUTE61_VIA)).toBeLessThanOrEqual(2_500)
    expect(route.distanceM / 1_000).toBeGreaterThan(400)
    expect(route.distanceM / 1_000).toBeLessThan(500)

    const claim = createRouteOptionEvidenceClaim({
      origin: anchors.origin.point,
      destination: anchors.destination.point,
      evidence: viaHolmavik,
    })
    expect(claim).not.toBeNull()
    if (!claim) return
    const restored = restoreRouteOptionEvidence({
      graph,
      claim,
      origin: anchors.origin.point,
      destination: anchors.destination.point,
    })
    expect(restored).not.toBeNull()
    expect(restored?.connectedRoadEdges.map(edge => edge.id)).toEqual(claim.edgeIds)
    expect(restored?.route.distanceM).toBe(route.distanceM)
    expect(restored?.route.durationS).toBe(route.durationS)
    expect(restored?.route.surface).toEqual(route.surface)
    expect(restored?.route.surface.gravelM).toBeGreaterThan(0)
    expect(restored?.route.gravelPortions.length).toBeGreaterThan(0)
    expect(restored?.route.gravelPortions.reduce(
      (sum, portion) => sum + portion.distanceM,
      0,
    )).toBe(restored?.route.surface.gravelM)
  }, 90_000)
})
