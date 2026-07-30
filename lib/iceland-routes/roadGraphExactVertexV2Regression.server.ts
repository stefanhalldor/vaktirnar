import 'server-only'

import { geometryLengthM, ICELAND_ROUTING_PROFILES } from './roadGraph'
import type { IcelandRoadGraph, IcelandRoadGraphEdge } from './roadGraphTypes'
import type { SourceAttestedJunctionGapReceipt } from './roadGraphTopologyReconciliation'
import { findRouteAssessmentRoadAnchors } from './routeAssessmentRoadAnchor.server'

const VIDIBAKKI_HMS_POINT = { lat: 63.86990055, lon: -20.31340331 }
const ISAFJORDUR_POINT = { lat: 66.0748, lon: -23.1340 }

export type ExactVertexV2RegressionStatus =
  | 'ok'
  | 'junction_receipt_missing'
  | 'route_unavailable'
  | 'distance_out_of_range'
  | 'snap_out_of_range'
  | 'corridor_mismatch'
  | 'direction_asymmetry'

export interface ExactVertexV2RegressionAudit {
  status: ExactVertexV2RegressionStatus
  receiptId: string | null
  forwardDistanceM: number | null
  reverseDistanceM: number | null
  forwardGeometryDistanceM: number | null
  reverseGeometryDistanceM: number | null
  vidibakkiSnapDistanceM: number | null
  isafjordurSnapDistanceM: number | null
}

function compressedRoadNumbers(edges: readonly IcelandRoadGraphEdge[]): string[] {
  return edges
    .map(edge => edge.roadNumber)
    .filter((roadNumber): roadNumber is string => Boolean(roadNumber))
    .filter((roadNumber, index, values) => index === 0 || roadNumber !== values[index - 1])
}

/**
 * Promotion-time regression for the real official T-junction that motivated
 * exact-vertex v2. This is a validation canary, never a place-specific routing
 * override: ordinary endpoint snapping and graph search still choose the route.
 */
export function auditExactVertexV2VidibakkiRoute(input: {
  graph: IcelandRoadGraph
  receipts: readonly SourceAttestedJunctionGapReceipt[]
}): ExactVertexV2RegressionAudit {
  const receipt = input.receipts.find(candidate => (
    candidate.sourceSection.roadNumber === '271'
    && candidate.sourceSection.sectionNumber === '01'
    && candidate.targetSection.roadNumber === '1'
    && candidate.targetSection.sectionNumber.toLowerCase() === 'c5'
    && candidate.targetAttestation.kind === 'source_exact_interior_vertex'
  ))
  const base = {
    receiptId: receipt?.id ?? null,
    forwardDistanceM: null,
    reverseDistanceM: null,
    forwardGeometryDistanceM: null,
    reverseGeometryDistanceM: null,
    vidibakkiSnapDistanceM: null,
    isafjordurSnapDistanceM: null,
  }
  if (!receipt) return { status: 'junction_receipt_missing', ...base }

  const audits = ([
    [VIDIBAKKI_HMS_POINT, ISAFJORDUR_POINT],
    [ISAFJORDUR_POINT, VIDIBAKKI_HMS_POINT],
  ] as const).map(([origin, destination]) => {
    const result = findRouteAssessmentRoadAnchors(
      input.graph,
      { kind: 'projected_road', point: origin },
      { kind: 'projected_road', point: destination },
      {
        profile: ICELAND_ROUTING_PROFILES.fastestCar,
        maxOriginSnapDistanceM: 2_500,
        maxDestinationSnapDistanceM: 2_500,
        maxAlternatives: 0,
      },
    )
    if (result.status !== 'ok') return null
    const distanceM = result.connectedRoadEdges.reduce((sum, edge) => sum + edge.lengthM, 0)
    const geometryDistanceM = result.connectedRoadEdges.reduce(
      (sum, edge) => sum + geometryLengthM(edge.geometry),
      0,
    )
    return {
      result,
      distanceM,
      geometryDistanceM,
      roadNumbers: compressedRoadNumbers(result.connectedRoadEdges),
    }
  })
  if (!audits[0] || !audits[1]) return { status: 'route_unavailable', ...base }

  const forward = audits[0]
  const reverse = audits[1]
  const details = {
    receiptId: receipt.id,
    forwardDistanceM: forward.distanceM,
    reverseDistanceM: reverse.distanceM,
    forwardGeometryDistanceM: forward.geometryDistanceM,
    reverseGeometryDistanceM: reverse.geometryDistanceM,
    vidibakkiSnapDistanceM: forward.result.origin.snapDistanceM,
    isafjordurSnapDistanceM: forward.result.destination.snapDistanceM,
  }
  if (
    [forward.distanceM, reverse.distanceM, forward.geometryDistanceM, reverse.geometryDistanceM]
      .some(distanceM => distanceM < 530_000 || distanceM > 540_000)
    || Math.abs(forward.distanceM - forward.geometryDistanceM) >= 5_000
    || Math.abs(reverse.distanceM - reverse.geometryDistanceM) >= 5_000
  ) return { status: 'distance_out_of_range', ...details }
  if (
    details.vidibakkiSnapDistanceM < 350
    || details.vidibakkiSnapDistanceM > 550
    || details.isafjordurSnapDistanceM < 100
    || details.isafjordurSnapDistanceM > 300
  ) return { status: 'snap_out_of_range', ...details }

  const expectedForwardRoads = ['271', '1', '60', '61']
  const expectedReverseRoads = [...expectedForwardRoads].reverse()
  const corridorIsValid = (
    JSON.stringify(forward.roadNumbers) === JSON.stringify(expectedForwardRoads)
    && JSON.stringify(reverse.roadNumbers) === JSON.stringify(expectedReverseRoads)
    && [forward, reverse].every(audit => (
      audit.result.connectedRoadEdges.some(edge => edge.official?.sectionId === 58_496)
      && audit.result.connectedRoadEdges.some(edge => edge.official?.sectionId === 48_906)
      && audit.result.connectedRoadEdges.some(edge => edge.topologyReceiptId === receipt.id)
      && audit.result.connectedRoadEdges.every(edge => edge.roadNumber !== '26' && edge.roadNumber !== '268')
    ))
  )
  if (!corridorIsValid) return { status: 'corridor_mismatch', ...details }
  if (Math.abs(forward.distanceM - reverse.distanceM) >= 1) {
    return { status: 'direction_asymmetry', ...details }
  }
  return { status: 'ok', ...details }
}
