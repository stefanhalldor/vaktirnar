export type ScopeBoundRouteEnvelope = Readonly<{
  assessmentScopeId?: string
  route: Readonly<{ id: string }>
}>

function isScopeBoundRouteEnvelope(value: unknown): value is ScopeBoundRouteEnvelope {
  if (!value || typeof value !== 'object') return false
  const envelope = value as Record<string, unknown>
  if (!envelope.route || typeof envelope.route !== 'object') return false
  const route = envelope.route as Record<string, unknown>
  return (envelope.assessmentScopeId === undefined
      || typeof envelope.assessmentScopeId === 'string')
    && typeof route.id === 'string'
}

/**
 * Shared invariant for both network-ready artifacts and client-cache hits.
 * Recommendation, order and every signed envelope must belong to one exact
 * assessment scope; partial artifacts are never treated as ready.
 */
export function isAtomicTeskeidCandidateArtifact({
  scopeId,
  recommendedRouteId,
  envelopes,
}: {
  scopeId: string | null | undefined
  recommendedRouteId: string | null | undefined
  envelopes: readonly unknown[]
}): boolean {
  if (!scopeId || !recommendedRouteId || envelopes.length === 0) return false
  const firstEnvelope = envelopes[0]
  if (
    !isScopeBoundRouteEnvelope(firstEnvelope)
    || firstEnvelope.route.id !== recommendedRouteId
  ) return false

  const routeIds = new Set<string>()
  for (const value of envelopes) {
    if (!isScopeBoundRouteEnvelope(value)) return false
    const envelope = value
    if (
      envelope.assessmentScopeId !== scopeId
      || envelope.route.id.length === 0
      || routeIds.has(envelope.route.id)
    ) return false
    routeIds.add(envelope.route.id)
  }
  return routeIds.has(recommendedRouteId)
}
