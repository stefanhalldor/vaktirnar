import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildIcelandRoadGraph,
  geometryLengthM,
  ICELAND_ROUTING_PROFILES,
} from '@/lib/iceland-routes/roadGraph'
import { auditIcelandGoldenRoutes } from '@/lib/iceland-routes/goldenRoutes'
import { auditExactVertexV2VidibakkiRoute } from '@/lib/iceland-routes/roadGraphExactVertexV2Regression.server'
import {
  resolveTeskeidAssessmentRouteEvidence,
  teskeidAssessmentRouteEdgesHaveIntegrity,
} from '@/lib/iceland-routes/routeAssessmentCandidateEvidence.server'
import { findRouteAssessmentRoadAnchors } from '@/lib/iceland-routes/routeAssessmentRoadAnchor.server'
import {
  createRouteAssessmentScopeId,
  ROUTE_ASSESSMENT_ANCHOR_REDERIVATION_TOLERANCE_M,
} from '@/lib/iceland-routes/routeAssessmentScopeId.server'
import {
  normalizeVegagerdinRoadGraphSegmentsWithReport,
  type ArcGisGeoJsonFeatureCollection,
} from '@/lib/iceland-routes/vegagerdinRoadGraphSource'
import { reconcileVegagerdinRoadGraphTopology } from '@/lib/iceland-routes/vegagerdinRoadGraphTopology'

const artifactPath = join(process.cwd(), '.tmp', 'phase2-road-source', 'official-source.json')
const describeRealArtifact = existsSync(artifactPath) ? describe : describe.skip

interface LocalOfficialArtifact {
  assessment_public_roads: ArcGisGeoJsonFeatureCollection
  road_surfaces: ArcGisGeoJsonFeatureCollection
}

describeRealArtifact('Garðabær to Akranes official-artifact topology regression', () => {
  it('uses the direct tunnel/west-of-Akrafjall corridor through the reciprocal official junction', () => {
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
        validationReportId: 'akranes-real-artifact-regression',
      },
    })
    const graph = buildIcelandRoadGraph(normalized.segments, {
      nodeSnapToleranceM: 20,
      routingDirectionPolicy: 'bidirectional',
      missingDirectionPolicy: 'provisional_bidirectional',
      topologyReconciliation: {
        bindings: topology.bindings,
        invalidBindingBehavior: 'throw',
      },
    })

    const goldenRoutes = auditIcelandGoldenRoutes(graph)
    expect(goldenRoutes.filter(route => route.status !== 'ok')).toEqual([])

    const result = findRouteAssessmentRoadAnchors(
      graph,
      { kind: 'canonical_node', point: { lat: 64.091018, lon: -21.921047 } },
      { kind: 'canonical_node', point: { lat: 64.319957, lon: -22.062097 } },
      {
        profile: ICELAND_ROUTING_PROFILES.fastestCar,
        maxOriginSnapDistanceM: 2_500,
        maxDestinationSnapDistanceM: 2_500,
        maxAlternatives: 0,
      },
    )

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    const distanceM = result.connectedRoadEdges.reduce((sum, edge) => sum + edge.lengthM, 0)
    const topologyEdges = result.connectedRoadEdges
      .filter(edge => edge.graphRole === 'topology_connector')
    expect(distanceM / 1_000).toBeGreaterThanOrEqual(47)
    expect(distanceM / 1_000).toBeLessThanOrEqual(52)
    expect(new Set(topologyEdges.map(edge => edge.topologyReceiptId)).size).toBeGreaterThanOrEqual(1)
    expect(topologyEdges.some(edge => edge.lengthM >= 30 && edge.lengthM <= 33)).toBe(true)
    expect(result.connectedRoadEdges.some(edge => (
      edge.roadNumber === '1' && edge.official?.sectionNumber === 'g0'
    ))).toBe(true)
    expect(result.connectedRoadEdges.some(edge => (
      edge.roadNumber === '51' && edge.official?.sectionNumber === '01'
    ))).toBe(true)
    expect(result.connectedRoadEdges.every(edge => edge.directionBasis === undefined)).toBe(true)
  }, 60_000)

  it('routes the actual HMS Víðibakki point through the nearest reachable 271-01 to 1-c5 T-junction', () => {
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
        validationReportId: 'rural-corridor-real-artifact-regression',
      },
    })
    const graph = buildIcelandRoadGraph(normalized.segments, {
      nodeSnapToleranceM: 20,
      routingDirectionPolicy: 'bidirectional',
      missingDirectionPolicy: 'provisional_bidirectional',
      topologyReconciliation: {
        bindings: topology.bindings,
        invalidBindingBehavior: 'throw',
      },
    })
    expect(auditExactVertexV2VidibakkiRoute({
      graph,
      receipts: topology.receipts,
    })).toMatchObject({
      status: 'ok',
      forwardDistanceM: expect.any(Number),
      reverseDistanceM: expect.any(Number),
    })
    const exactJunctionReceipt = topology.receipts.find(receipt => (
      receipt.sourceSection.roadNumber === '271'
      && receipt.sourceSection.sectionNumber === '01'
      && receipt.targetSection.roadNumber === '1'
      && receipt.targetSection.sectionNumber.toLowerCase() === 'c5'
      && receipt.targetAttestation.kind === 'source_exact_interior_vertex'
    ))
    expect(exactJunctionReceipt).toBeDefined()
    expect(exactJunctionReceipt).toMatchObject({
      targetAttestation: { kind: 'source_exact_interior_vertex' },
      targetSplit: { location: 'vertex' },
      connector: { lengthM: expect.any(Number) },
    })
    expect(exactJunctionReceipt!.connector.lengthM).toBeLessThanOrEqual(0.001)

    // Exact official HMS Staðfangaskrá selection, not a Google polyline point.
    const vidibakki = {
      lat: 63.86990055,
      lon: -20.31340331,
    }
    const isafjordur = {
      lat: 66.0748,
      lon: -23.1340,
    }
    const directionDistancesM: number[] = []
    for (const [origin, destination] of [
      [vidibakki, isafjordur],
      [isafjordur, vidibakki],
    ] as const) {
      const result = findRouteAssessmentRoadAnchors(
        graph,
        { kind: 'projected_road', point: origin },
        { kind: 'projected_road', point: destination },
        {
          profile: ICELAND_ROUTING_PROFILES.fastestCar,
          maxOriginSnapDistanceM: 2_500,
          maxDestinationSnapDistanceM: 2_500,
          maxAlternatives: 0,
        },
      )
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') continue
      const assessmentScopeId = createRouteAssessmentScopeId({
        originAnchorKind: result.origin.kind,
        originPoint: result.origin.point,
        destinationAnchorKind: result.destination.kind,
        destinationPoint: result.destination.point,
        routeProvenanceFingerprint: result.routeProvenanceFingerprint,
      })
      const trustedAnchors = findRouteAssessmentRoadAnchors(
        graph,
        { kind: 'trusted_anchor', point: result.origin.point },
        { kind: 'trusted_anchor', point: result.destination.point },
        {
          maxOriginSnapDistanceM: ROUTE_ASSESSMENT_ANCHOR_REDERIVATION_TOLERANCE_M,
          maxDestinationSnapDistanceM: ROUTE_ASSESSMENT_ANCHOR_REDERIVATION_TOLERANCE_M,
          maxAlternatives: 0,
          deadlineAtMs: Date.now() + 30_000,
        },
      )
      expect(trustedAnchors.status).toBe('ok')
      if (trustedAnchors.status !== 'ok') continue
      const trustedScopeId = createRouteAssessmentScopeId({
        originAnchorKind: trustedAnchors.origin.kind,
        originPoint: trustedAnchors.origin.point,
        destinationAnchorKind: trustedAnchors.destination.kind,
        destinationPoint: trustedAnchors.destination.point,
        routeProvenanceFingerprint: trustedAnchors.routeProvenanceFingerprint,
      })
      expect(trustedScopeId).toBe(assessmentScopeId)
      expect(teskeidAssessmentRouteEdgesHaveIntegrity({
        connectedRoadEdges: trustedAnchors.connectedRoadEdges,
        origin: trustedAnchors.origin.point,
        destination: trustedAnchors.destination.point,
      })).toBe(true)
      const liveCandidateEvidence = resolveTeskeidAssessmentRouteEvidence({
        graph,
        origin: result.origin.point,
        destination: result.destination.point,
        assessmentScopeId,
        includeAlternatives: false,
        deadlineAtMs: Date.now() + 30_000,
      })
      expect(liveCandidateEvidence.status).toBe('ready')
      const distanceM = result.connectedRoadEdges.reduce((sum, edge) => sum + edge.lengthM, 0)
      const geometryDistanceM = result.connectedRoadEdges.reduce(
        (sum, edge) => sum + geometryLengthM(edge.geometry),
        0,
      )
      directionDistancesM.push(distanceM)
      const vidibakkiSnapDistanceM = origin === vidibakki
        ? result.origin.snapDistanceM
        : result.destination.snapDistanceM
      const isafjordurSnapDistanceM = origin === isafjordur
        ? result.origin.snapDistanceM
        : result.destination.snapDistanceM
      expect(vidibakkiSnapDistanceM).toBeGreaterThan(400)
      expect(vidibakkiSnapDistanceM).toBeLessThan(500)
      expect(isafjordurSnapDistanceM).toBeGreaterThan(150)
      expect(isafjordurSnapDistanceM).toBeLessThan(250)
      expect(distanceM / 1_000).toBeGreaterThan(530)
      expect(distanceM / 1_000).toBeLessThan(540)
      expect(geometryDistanceM / 1_000).toBeGreaterThan(530)
      expect(geometryDistanceM / 1_000).toBeLessThan(540)
      expect(Math.abs(distanceM - geometryDistanceM)).toBeLessThan(5_000)
      expect(result.connectedRoadEdges.some(edge => (
        edge.roadNumber === '271' && edge.official?.sectionNumber === '01'
      ))).toBe(true)
      expect(result.connectedRoadEdges.some(edge => (
        edge.roadNumber === '1' && edge.official?.sectionNumber?.toLowerCase() === 'c5'
      ))).toBe(true)
      expect(result.connectedRoadEdges.some(edge => edge.official?.sectionId === 58_496)).toBe(true)
      expect(result.connectedRoadEdges.some(edge => edge.official?.sectionId === 48_906)).toBe(true)
      expect(result.connectedRoadEdges.some(edge => edge.roadNumber === '26')).toBe(false)
      expect(result.connectedRoadEdges.some(edge => edge.roadNumber === '268')).toBe(false)
      expect(result.connectedRoadEdges.some(edge => (
        edge.topologyReceiptId === exactJunctionReceipt!.id
      ))).toBe(true)
      for (let edgeIndex = 0; edgeIndex + 1 < result.connectedRoadEdges.length; edgeIndex += 1) {
        expect(result.connectedRoadEdges[edgeIndex].toNodeId)
          .toBe(result.connectedRoadEdges[edgeIndex + 1].fromNodeId)
      }
      const roadNumbers = result.connectedRoadEdges
        .map(edge => edge.roadNumber)
        .filter((roadNumber): roadNumber is string => Boolean(roadNumber))
        .filter((roadNumber, index, values) => index === 0 || roadNumber !== values[index - 1])
      expect(roadNumbers).toEqual(origin === vidibakki
        ? ['271', '1', '60', '61']
        : ['61', '60', '1', '271'])
    }
    expect(directionDistancesM).toHaveLength(2)
    expect(Math.abs(directionDistancesM[0] - directionDistancesM[1])).toBeLessThan(1)
  }, 60_000)
})
