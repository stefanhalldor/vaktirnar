/**
 * Route control points — road-intelligence anchors for provider-station matching.
 *
 * Google's route polyline (even HIGH_QUALITY) can chord across coastal curves,
 * fjords, and mountain bends on Icelandic roads. When matching fixed provider
 * stations (Veðurstofan, future Vegagerðin) against the route, a chord that skips
 * the actual road means stations near the real road can fall outside the 1 km
 * threshold and be missed.
 *
 * RouteControlSection entries correct this by injecting ordered anchor points
 * along the actual road into providerMatchingPoints. Anchors only activate when
 * the route passes near all gate points, preventing false injection on unrelated
 * routes.
 *
 * This does NOT affect:
 * - Google route display, duration, or distance
 * - met.no/Yr sampling (points)
 * - Route caution detection
 * - Any SQL or cache layer
 */

import { haversineM, pointToPolylineDistanceM } from './providerRouteMatching'

export type RouteControlSection = {
  /** Stable identifier for tests and diagnostics. */
  id: string
  /** Human-readable description for dev logs. */
  name: string
  /** Why this section exists — what Google gets wrong here. */
  reason: string
  /**
   * Must be true after visual localhost verification that:
   * 1. Gates correctly identify the intended route corridor.
   * 2. Anchors follow the actual road (not a parallel road or field).
   * 3. No false positives on nearby unrelated routes.
   */
  verified: boolean
  /**
   * ALL gates must have at least one route point within radiusM before anchors
   * are injected. Requiring all gates prevents injection on routes that happen
   * to be near one end of the corridor but take a different road.
   */
  gates: ReadonlyArray<{ lat: number; lon: number; radiusM: number }>
  /**
   * Ordered anchor points approximating the actual road through this section.
   * These replace the chord between the gate-nearest route points.
   * Must be visually verified on localhost before release.
   */
  anchors: ReadonlyArray<{ lat: number; lon: number }>
}

// ── Cap helper (same pattern as samplePoints in google.server.ts) ─────────────

function capToMaxPoints(
  points: Array<{ lat: number; lon: number }>,
  maxPoints: number,
): Array<{ lat: number; lon: number }> {
  if (points.length <= maxPoints) return points
  const step = Math.ceil(points.length / maxPoints)
  const strided: typeof points = []
  for (let i = 0; i < points.length; i += step) strided.push(points[i])
  const last = points[points.length - 1]
  if (strided[strided.length - 1] !== last) {
    if (strided.length < maxPoints) strided.push(last)
    else strided[strided.length - 1] = last
  }
  return strided
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const ROUTE_CONTROL_SECTIONS: readonly RouteControlSection[] = [
  {
    id: 'ring-road-vik-skeidflotur',
    name: 'Þjóðvegur 1 — Vík/Skeiðflötur/Vatnsskarðshólar',
    reason:
      'Google polyline chords across the coastal curve on Route 1 between Vík and Skeiðflötur. ' +
      'Stations near the actual road (e.g. Vatnsskarðshólar area) can fall outside the 1 km ' +
      'threshold when matched against the chord.',
    // PENDING LOCALHOST VERIFICATION — set to true after visual check:
    // 1. Run Reykjavík → Egilsstaðir and confirm both gates are triggered.
    // 2. Confirm anchor points visually follow the actual Route 1 coastal path.
    // 3. Run a route that skips this section (e.g. Selfoss → Þorlákshöfn) and confirm no injection.
    verified: false,
    gates: [
      // West gate: Route 1 west of Vík (Mýrdalur/Skógafoss area).
      // APPROXIMATE — verify on localhost that Reykjavík→east routes pass inside this radius.
      { lat: 63.418, lon: -19.383, radiusM: 8_000 },
      // East gate: Route 1 east of Skeiðflötur (toward Mýrdalssandur).
      // APPROXIMATE — verify on localhost that the east end of the section is covered.
      { lat: 63.440, lon: -18.550, radiusM: 8_000 },
    ],
    anchors: [
      // APPROXIMATE — trace of Route 1 coastal path between Vík and Skeiðflötur.
      // These follow the south coast; Google's chord cuts slightly inland/across.
      // Adjust coordinates after visual localhost verification.
      { lat: 63.419, lon: -19.005 }, // Vík town area
      { lat: 63.427, lon: -18.920 }, // east of Vík
      { lat: 63.436, lon: -18.835 }, // Skeiðflötur west
      { lat: 63.443, lon: -18.748 }, // Skeiðflötur mid
      { lat: 63.449, lon: -18.665 }, // Vatnsskarðshólar area
      { lat: 63.448, lon: -18.580 }, // east of Vatnsskarðshólar
    ],
  },
]

// ── Augmentation ──────────────────────────────────────────────────────────────

/**
 * Augment provider-matching route points with road control anchors.
 *
 * For each RouteControlSection whose gates ALL match (every gate must have at
 * least one route point within its radiusM), replaces the chord between the
 * gate-nearest route points with the section's ordered anchors.
 *
 * Results are always capped at maxPoints using the endpoint-preserving stride
 * pattern (same as samplePoints / providerMatchingPointsFrom).
 *
 * Call this on RDP-simplified providerMatchingPoints, after rdpSimplify() and
 * before returning from providerMatchingPointsFrom() in google.server.ts.
 *
 * Does not mutate the input array.
 */
export function augmentProviderMatchingPoints(
  points: ReadonlyArray<{ lat: number; lon: number }>,
  sections: readonly RouteControlSection[] = ROUTE_CONTROL_SECTIONS,
  maxPoints = 1000,
): Array<{ lat: number; lon: number }> {
  if (points.length === 0) return []

  let result = [...points]

  for (const section of sections) {
    // Skip unverified sections in production. Approximate anchors that have not
    // been visually confirmed on localhost must not affect which Veðurstofan
    // stations appear on routes or their order. In dev/test, unverified sections
    // are active so Stebbi can verify them locally before setting verified: true.
    if (process.env.NODE_ENV === 'production' && !section.verified) continue

    // Check all gates are passed by the route using segment projection, not just
    // vertex proximity. A chord over a gate radius (after RDP) would be missed
    // by vertex-only checks; segment projection catches it correctly.
    const allGatesMatched = section.gates.every(gate =>
      pointToPolylineDistanceM(gate.lat, gate.lon, result) <= gate.radiusM
    )
    if (!allGatesMatched) continue

    // Find route vertex nearest to first gate → start of injection window
    // Find route vertex nearest to last gate → end of injection window
    // (Vertex proximity is intentional here: we need a vertex index as the
    //  injection boundary, not just a distance measurement.)
    const firstGate = section.gates[0]
    const lastGate = section.gates[section.gates.length - 1]

    let startIdx = 0
    let endIdx = result.length - 1
    let minStartDist = Infinity
    let minEndDist = Infinity

    for (let i = 0; i < result.length; i++) {
      const d1 = haversineM(result[i].lat, result[i].lon, firstGate.lat, firstGate.lon)
      if (d1 < minStartDist) { minStartDist = d1; startIdx = i }
      const d2 = haversineM(result[i].lat, result[i].lon, lastGate.lat, lastGate.lon)
      if (d2 < minEndDist) { minEndDist = d2; endIdx = i }
    }

    // Handle either direction of travel (route may go east→west or west→east).
    // Track direction so anchors are injected in travel order, not registry order.
    let reversed = false
    if (startIdx > endIdx) {
      ;[startIdx, endIdx] = [endIdx, startIdx]
      reversed = true
    }

    // Replace chord between startIdx..endIdx with anchors in travel order.
    const orderedAnchors = reversed ? [...section.anchors].reverse() : [...section.anchors]
    result = [
      ...result.slice(0, startIdx + 1),
      ...orderedAnchors,
      ...result.slice(endIdx),
    ]
  }

  return capToMaxPoints(result, maxPoints)
}
