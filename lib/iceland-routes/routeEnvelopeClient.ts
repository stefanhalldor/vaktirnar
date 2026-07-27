export const ROUTE_ENVELOPE_MIN_TTL_MS = 60_000

type ClientRouteEnvelope = {
  expiresAt: string
  route: { id: string }
}

export function findFreshRouteEnvelope<T extends ClientRouteEnvelope>(
  envelopes: readonly T[],
  selectedRouteId: string | null,
  nowMs = Date.now(),
): T | null {
  if (!selectedRouteId) return null
  const envelope = envelopes.find(candidate => candidate.route.id === selectedRouteId)
  if (!envelope) return null
  const expiresAtMs = Date.parse(envelope.expiresAt)
  return Number.isFinite(expiresAtMs)
    && expiresAtMs > nowMs + ROUTE_ENVELOPE_MIN_TTL_MS
    ? envelope
    : null
}
