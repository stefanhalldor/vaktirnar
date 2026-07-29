import 'server-only'

import { createHash } from 'node:crypto'
import type { LatLon } from './types'

type AssessmentAnchorKind = 'settlement_node' | 'projected_road'

export type RouteAssessmentScopeIdInput = Readonly<{
  originAnchorKind: AssessmentAnchorKind
  originPoint: LatLon
  destinationAnchorKind: AssessmentAnchorKind
  destinationPoint: LatLon
  routeProvenanceFingerprint: string
}>

/**
 * Creates an opaque attestation from graph-derived anchors and the complete
 * selected-route provenance. Exact navigation coordinates and client labels
 * are deliberately not inputs, so the same value can be re-derived after a
 * signed route envelope reaches the final weather endpoint.
 */
export function createRouteAssessmentScopeId(input: RouteAssessmentScopeIdInput): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({
      version: 3,
      originAnchorKind: input.originAnchorKind,
      originPoint: [input.originPoint.lat.toFixed(7), input.originPoint.lon.toFixed(7)],
      destinationAnchorKind: input.destinationAnchorKind,
      destinationPoint: [input.destinationPoint.lat.toFixed(7), input.destinationPoint.lon.toFixed(7)],
      routeProvenanceFingerprint: input.routeProvenanceFingerprint,
    }))
    .digest('base64url')
  return `assessment:v3:${digest}`
}
