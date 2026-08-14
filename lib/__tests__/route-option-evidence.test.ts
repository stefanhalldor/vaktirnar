import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  buildIcelandRoadGraphRouteFromEdges,
} from '@/lib/iceland-routes/roadGraph'
import type {
  IcelandRoadGraph,
  IcelandRoadGraphEdge,
} from '@/lib/iceland-routes/roadGraphTypes'
import { roadGraphRouteToTeskeidOption } from '@/lib/iceland-routes/routeAssessmentCandidateEvidence.server'
import { createRouteAssessmentRouteProvenanceFingerprint } from '@/lib/iceland-routes/routeAssessmentRoadAnchor.server'
import { restoreRouteAssessmentEdgeSlice } from '@/lib/iceland-routes/routeAssessmentRoadAnchor.server'
import { createTeskeidAssessmentAlternativeRouteId } from '@/lib/iceland-routes/routeAssessmentCandidateIdentity.server'
import { REYDARFJORDUR_GATE } from '@/lib/iceland-routes/curatedRouteParity'
import {
  createRouteOptionEvidenceClaim,
  restoredRouteOptionEvidenceMatchesSignedRoute,
  restoreRouteOptionEvidence,
} from '@/lib/iceland-routes/routeOptionEvidence.server'

const ORIGIN = { lat: 64, lon: -21 }
const POINT_A = { lat: 64.005, lon: -20.995 }
const POINT_B = { lat: 64.01, lon: -20.99 }
const DESTINATION = { lat: 64.015, lon: -20.985 }

function edge(input: Readonly<{
  id: string
  segmentId: string
  fromNodeId: string
  toNodeId: string
  geometry: IcelandRoadGraphEdge['geometry']
  lengthM: number
  surface: IcelandRoadGraphEdge['surface']
}>): IcelandRoadGraphEdge {
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

const EDGES: IcelandRoadGraphEdge[] = [
  edge({
    id: 'edge-a',
    segmentId: 'segment-a',
    fromNodeId: 'node-a',
    toNodeId: 'node-b',
    geometry: [ORIGIN, POINT_A],
    lengthM: 400,
    surface: 'paved',
  }),
  edge({
    id: 'edge-gravel',
    segmentId: 'segment-gravel',
    fromNodeId: 'node-b',
    toNodeId: 'node-c',
    geometry: [POINT_A, POINT_B],
    lengthM: 200,
    surface: 'gravel',
  }),
  edge({
    id: 'edge-c',
    segmentId: 'segment-c',
    fromNodeId: 'node-c',
    toNodeId: 'node-d',
    geometry: [POINT_B, DESTINATION],
    lengthM: 400,
    surface: 'paved',
  }),
]

function graph(edges: readonly IcelandRoadGraphEdge[] = EDGES): IcelandRoadGraph {
  return {
    nodes: new Map(),
    edges,
    outgoing: new Map(),
  }
}

function evidence() {
  const route = buildIcelandRoadGraphRouteFromEdges(EDGES)
  const originAnchorKind = 'projected_road' as const
  const destinationAnchorKind = 'projected_road' as const
  return {
    route: roadGraphRouteToTeskeidOption(route, ORIGIN, DESTINATION, 0, 0, 0),
    connectedRoadEdges: EDGES,
    routeProvenanceFingerprint: createRouteAssessmentRouteProvenanceFingerprint({
      origin: { kind: originAnchorKind, point: ORIGIN },
      destination: { kind: destinationAnchorKind, point: DESTINATION },
      connectedRoadEdges: EDGES,
    }),
    originAnchorKind,
    destinationAnchorKind,
  }
}

describe('signed route option evidence', () => {
  it('restores the exact ordered path and its gravel portion without routing again', () => {
    const claim = createRouteOptionEvidenceClaim({
      origin: ORIGIN,
      destination: DESTINATION,
      evidence: evidence(),
    })
    expect(claim).not.toBeNull()
    if (!claim) return

    const restored = restoreRouteOptionEvidence({
      graph: graph(),
      claim,
      origin: ORIGIN,
      destination: DESTINATION,
    })
    expect(restored?.connectedRoadEdges.map(item => item.id)).toEqual([
      'edge-a',
      'edge-gravel',
      'edge-c',
    ])
    expect(restored?.route.surface).toEqual({
      pavedM: 800,
      gravelM: 200,
      mixedM: 0,
      unknownM: 0,
    })
    expect(restored?.route.gravelPortions).toHaveLength(1)
    expect(restored?.route.gravelPortions[0].geometry).toEqual([POINT_A, POINT_B])
  })

  it('strictly matches only the signed route rebuilt from restored graph evidence', () => {
    const original = evidence()
    const claim = createRouteOptionEvidenceClaim({
      origin: ORIGIN,
      destination: DESTINATION,
      evidence: original,
    })
    expect(claim).not.toBeNull()
    if (!claim) return
    const restored = restoreRouteOptionEvidence({
      graph: graph(),
      claim,
      origin: ORIGIN,
      destination: DESTINATION,
    })
    expect(restored).not.toBeNull()
    if (!restored) return

    expect(restoredRouteOptionEvidenceMatchesSignedRoute({
      restored,
      signedRoute: original.route,
      claim,
      origin: ORIGIN,
      destination: DESTINATION,
    })).toBe(true)
    const signedAlternative = {
      ...original.route,
      id: createTeskeidAssessmentAlternativeRouteId(1, claim.routeProvenanceFingerprint),
      routeIndex: -2,
      labels: [...original.route.labels, 'TESKEID_ALTERNATIVE'],
    }
    expect(restoredRouteOptionEvidenceMatchesSignedRoute({
      restored,
      signedRoute: signedAlternative,
      claim,
      origin: ORIGIN,
      destination: DESTINATION,
    })).toBe(true)
    for (const signedRoute of [
      { ...original.route, id: 'forged-id' },
      { ...original.route, routeIndex: -2 },
      { ...original.route, distanceM: original.route.distanceM + 1 },
      { ...original.route, durationS: original.route.durationS + 1 },
      { ...original.route, points: [...original.route.points].reverse() },
      { ...original.route, providerMatchingPoints: [...original.route.points] },
      {
        ...original.route,
        experimental: {
          ...original.route.experimental!,
          surface: {
            ...original.route.experimental!.surface,
            gravelM: original.route.experimental!.surface.gravelM + 1,
          },
        },
      },
      {
        ...original.route,
        experimental: {
          ...original.route.experimental!,
          fRoad: { distanceM: 1, roadNumbers: ['F1'] },
        },
      },
      { ...original.route, labels: [...original.route.labels, 'CURATED_AVOID_OXI'] },
      {
        ...original.route,
        cautions: [{
          id: 'oxi-axarvegur-939',
          severity: 'caution' as const,
          labelKey: 'routeCautionTrailer',
          summaryKey: 'routeCautionOxiSummary',
          appliesTo: ['trailer' as const],
        }],
      },
    ]) {
      expect(restoredRouteOptionEvidenceMatchesSignedRoute({
        restored,
        signedRoute,
        claim,
        origin: ORIGIN,
        destination: DESTINATION,
      })).toBe(false)
    }
  })

  it('does not invent an Öxi-avoid label for an ordinary safe Reyðarfjörður route', () => {
    const safeEdges = [
      edge({
        id: 'edge-reydarfjordur-a',
        segmentId: 'segment-reydarfjordur-a',
        fromNodeId: 'node-reydarfjordur-a',
        toNodeId: 'node-reydarfjordur-b',
        geometry: [ORIGIN, REYDARFJORDUR_GATE],
        lengthM: 1_000,
        surface: 'paved',
      }),
      edge({
        id: 'edge-reydarfjordur-b',
        segmentId: 'segment-reydarfjordur-b',
        fromNodeId: 'node-reydarfjordur-b',
        toNodeId: 'node-reydarfjordur-c',
        geometry: [REYDARFJORDUR_GATE, DESTINATION],
        lengthM: 1_000,
        surface: 'paved',
      }),
    ].map(item => ({ ...item, roadNumber: '92' }))
    const route = buildIcelandRoadGraphRouteFromEdges(safeEdges)
    const ordinary = {
      route: roadGraphRouteToTeskeidOption(route, ORIGIN, DESTINATION, 0, 0, 0),
      connectedRoadEdges: safeEdges,
      routeProvenanceFingerprint: createRouteAssessmentRouteProvenanceFingerprint({
        origin: { kind: 'projected_road' as const, point: ORIGIN },
        destination: { kind: 'projected_road' as const, point: DESTINATION },
        connectedRoadEdges: safeEdges,
      }),
      originAnchorKind: 'projected_road' as const,
      destinationAnchorKind: 'projected_road' as const,
    }
    const claim = createRouteOptionEvidenceClaim({
      origin: ORIGIN,
      destination: DESTINATION,
      evidence: ordinary,
    })
    expect(claim).not.toBeNull()
    if (!claim) return
    const restored = restoreRouteOptionEvidence({
      graph: graph(safeEdges),
      claim,
      origin: ORIGIN,
      destination: DESTINATION,
    })
    expect(restored).not.toBeNull()
    if (!restored) return

    expect(ordinary.route.labels).not.toContain('CURATED_AVOID_OXI')
    expect(restoredRouteOptionEvidenceMatchesSignedRoute({
      restored,
      signedRoute: ordinary.route,
      claim,
      origin: ORIGIN,
      destination: DESTINATION,
    })).toBe(true)

    const contextualSafeRoute = {
      ...ordinary.route,
      labels: [...ordinary.route.labels, 'CURATED_AVOID_OXI'],
    }
    expect(restoredRouteOptionEvidenceMatchesSignedRoute({
      restored,
      signedRoute: contextualSafeRoute,
      claim,
      origin: ORIGIN,
      destination: DESTINATION,
    })).toBe(true)
  })

  it('fails closed for missing, reordered, drifted, or wrong-policy graph evidence', () => {
    const claim = createRouteOptionEvidenceClaim({
      origin: ORIGIN,
      destination: DESTINATION,
      evidence: evidence(),
    })
    expect(claim).not.toBeNull()
    if (!claim) return

    expect(restoreRouteOptionEvidence({
      graph: graph(EDGES.slice(0, 2)),
      claim,
      origin: ORIGIN,
      destination: DESTINATION,
    })).toBeNull()
    expect(restoreRouteOptionEvidence({
      graph: graph(),
      claim: { ...claim, edgeIds: [...claim.edgeIds].reverse() },
      origin: ORIGIN,
      destination: DESTINATION,
    })).toBeNull()
    expect(restoreRouteOptionEvidence({
      graph: graph(EDGES.map(item => (
        item.id === 'edge-gravel' ? { ...item, surface: 'paved' as const } : item
      ))),
      claim,
      origin: ORIGIN,
      destination: DESTINATION,
    })).toBeNull()
    expect(restoreRouteOptionEvidence({
      graph: graph(),
      claim: { ...claim, graphBuildPolicyFingerprint: 'stale-policy' },
      origin: ORIGIN,
      destination: DESTINATION,
    })).toBeNull()
    expect(restoreRouteOptionEvidence({
      graph: graph(),
      claim: { ...claim, nodeIds: ['forged', ...claim.nodeIds.slice(1)] },
      origin: ORIGIN,
      destination: DESTINATION,
    })).toBeNull()
  })

  it('reconstructs a projected assessment edge from its immutable source edge', () => {
    const sourceEdge = edge({
      id: 'edge-source-origin',
      segmentId: 'segment-source-origin',
      fromNodeId: 'node-source-origin',
      toNodeId: 'node-b',
      geometry: [{ lat: 63.995, lon: -21.005 }, POINT_A],
      lengthM: 800,
      surface: 'paved',
    })
    const projectedEdge = restoreRouteAssessmentEdgeSlice(
      sourceEdge,
      `${sourceEdge.id}:assessment:0.500000000000-1.000000000000`,
    )
    expect(projectedEdge).not.toBeNull()
    if (!projectedEdge) return
    const projectedEdges = [projectedEdge, EDGES[1], EDGES[2]]
    const projectedEvidence = {
      ...evidence(),
      connectedRoadEdges: projectedEdges,
      routeProvenanceFingerprint: createRouteAssessmentRouteProvenanceFingerprint({
        origin: { kind: 'projected_road', point: ORIGIN },
        destination: { kind: 'projected_road', point: DESTINATION },
        connectedRoadEdges: projectedEdges,
      }),
    }
    const claim = createRouteOptionEvidenceClaim({
      origin: ORIGIN,
      destination: DESTINATION,
      evidence: projectedEvidence,
    })
    expect(claim).not.toBeNull()
    if (!claim) return

    const restored = restoreRouteOptionEvidence({
      graph: graph([sourceEdge, EDGES[1], EDGES[2]]),
      claim,
      origin: ORIGIN,
      destination: DESTINATION,
    })
    expect(restored?.connectedRoadEdges.map(item => item.id)).toEqual(claim.edgeIds)
  })
})
