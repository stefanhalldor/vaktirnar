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
  // ── Þjóðvegur 1 — Vík/Mýrdalur west ──────────────────────────────────────
  // Covers Vatnsskarðshólar (63.424, -19.1837) and Reynisfjall (63.4521, -19.0378).
  //
  // Split into two sections (west / east of Vík) because short westbound routes
  // starting at Vík (e.g. Vík → Hella) travel west only and never approach the
  // Mýrdalssandur east gate. A combined west+east section would not trigger for
  // those short routes. The west section's east gate is placed near Vík so that
  // Vík-as-origin also activates the section.
  {
    id: 'ring-road-vik-west',
    name: 'Þjóðvegur 1 — Vík vestur (Vatnsskarðshólar/Reynisfjall)',
    reason:
      'Google polyline chords across the coastal curve west of Vík. ' +
      'Vatnsskarðshólar station (63.424, -19.1837) and Reynisfjall station ' +
      '(63.4521, -19.0378) fall outside the 1 km threshold when matched against ' +
      'the chord. Short routes starting at Vík (e.g. Vík → Hella) also need ' +
      'this section — they never reach the Mýrdalssandur east gate.',
    // PENDING LOCALHOST VERIFICATION — set to true after visual check:
    // 1. Reykjavík → Egilsstaðir: both gates triggered, anchors follow Route 1.
    // 2. Vík → Hella: west gate near Skógar + east gate near Vík both trigger.
    // 3. Selfoss → Þorlákshöfn: no injection (neither gate triggered).
    verified: false,
    gates: [
      // West gate: Route 1 near Skógar/Sólheimajökull.
      // Wide radius to catch sparse polylines chording over this area.
      // APPROXIMATE — adjust after visual localhost verification.
      { lat: 63.438, lon: -19.450, radiusM: 10_000 },
      // East gate: east of Vík town. Wide enough to catch Vík as route origin
      // (Vík → Hella starts here, so this gate must fire on the Vík start vertex).
      // APPROXIMATE — adjust after visual localhost verification.
      { lat: 63.420, lon: -18.870, radiusM: 10_000 },
    ],
    anchors: [
      // APPROXIMATE — trace of Route 1 west of Vík through Vatnsskarðshólar
      // and Reynisfjall. Adjust coordinates after visual localhost verification.
      { lat: 63.437, lon: -19.420 }, // Skógar area
      { lat: 63.431, lon: -19.310 }, // between Skógar and Vatnsskarðshólar
      { lat: 63.424, lon: -19.183 }, // Vatnsskarðshólar station (63.424, -19.1837)
      { lat: 63.429, lon: -19.115 }, // between stations
      { lat: 63.448, lon: -19.040 }, // near Reynisfjall station (63.4521, -19.0378)
      { lat: 63.424, lon: -18.975 }, // Vík approach
    ],
  },

  // ── Þjóðvegur 1 — Vík/Mýrdalur east ──────────────────────────────────────
  // Covers Mýrdalssandur station (63.4661, -18.6044), east of Vík.
  //
  // Short westbound routes starting at Vík (e.g. Vík → Hella) do NOT trigger
  // this section — the east gate is 31+ km from the Vík starting point.
  {
    id: 'ring-road-vik-east',
    name: 'Þjóðvegur 1 — Vík austur (Mýrdalssandur)',
    reason:
      'Google polyline chords across Route 1 east of Vík over Mýrdalssandur. ' +
      'Mýrdalssandur station (63.4661, -18.6044) falls outside the 1 km threshold ' +
      'on long routes (e.g. Höfn → Þorlákshöfn, Reykjavík → Egilsstaðir) when ' +
      'Google simplifies the polyline with a straight chord from Vík eastward.',
    // PENDING LOCALHOST VERIFICATION — set to true after visual check:
    // 1. Reykjavík → Egilsstaðir: Mýrdalssandur appears on route.
    // 2. Höfn → Þorlákshöfn: Mýrdalssandur appears on route.
    // 3. Vík → Hella: east section does NOT trigger (Mýrdalssandur absent).
    // 4. Selfoss → Þorlákshöfn: no injection.
    verified: false,
    gates: [
      // West gate: west of Reynisfjall, close enough to Vík to detect routes
      // that pass through the Vík corridor before heading east.
      // APPROXIMATE — adjust after visual localhost verification.
      { lat: 63.420, lon: -19.080, radiusM: 8_000 },
      // East gate: east of Mýrdalssandur (toward Álftaver/Meðalland).
      // APPROXIMATE — adjust after visual localhost verification.
      { lat: 63.470, lon: -18.380, radiusM: 10_000 },
    ],
    anchors: [
      // APPROXIMATE — trace of Route 1 east of Vík through Mýrdalssandur.
      // Adjust coordinates after visual localhost verification.
      { lat: 63.421, lon: -18.960 }, // east of Vík
      { lat: 63.430, lon: -18.870 }, // heading east
      { lat: 63.440, lon: -18.780 }, // mid-section
      { lat: 63.450, lon: -18.690 }, // approaching Mýrdalssandur
      { lat: 63.463, lon: -18.608 }, // near Mýrdalssandur station (63.4661, -18.6044)
      { lat: 63.470, lon: -18.520 }, // east continuation
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
 * All injection windows are computed against the ORIGINAL input array, then
 * overlapping windows are merged (combined anchors in travel order) and applied
 * right-to-left. This prevents sequential injections from clobbering anchors
 * that earlier sections added (e.g. two sections sharing the same 2-vertex chord).
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

  // Plan all injections against the ORIGINAL points array. Gate matching and
  // boundary finding must not be influenced by previous section injections.
  type Plan = {
    startIdx: number
    endIdx: number
    anchors: Array<{ lat: number; lon: number }>
    reversed: boolean
  }
  const plans: Plan[] = []

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
      pointToPolylineDistanceM(gate.lat, gate.lon, points) <= gate.radiusM
    )
    if (!allGatesMatched) continue

    // Find route vertex nearest to first gate → start of injection window.
    // Find route vertex nearest to last gate → end of injection window.
    // (Vertex proximity is intentional here: we need a vertex index as the
    //  injection boundary, not just a distance measurement.)
    const firstGate = section.gates[0]
    const lastGate = section.gates[section.gates.length - 1]

    let startIdx = 0
    let endIdx = points.length - 1
    let minStartDist = Infinity
    let minEndDist = Infinity

    for (let i = 0; i < points.length; i++) {
      const d1 = haversineM(points[i].lat, points[i].lon, firstGate.lat, firstGate.lon)
      if (d1 < minStartDist) { minStartDist = d1; startIdx = i }
      const d2 = haversineM(points[i].lat, points[i].lon, lastGate.lat, lastGate.lon)
      if (d2 < minEndDist) { minEndDist = d2; endIdx = i }
    }

    // Handle either direction of travel (route may go east→west or west→east).
    // Track direction so anchors are injected in travel order, not registry order.
    let reversed = false
    if (startIdx > endIdx) {
      ;[startIdx, endIdx] = [endIdx, startIdx]
      reversed = true
    }

    const orderedAnchors = reversed ? [...section.anchors].reverse() : [...section.anchors]
    plans.push({ startIdx, endIdx, anchors: orderedAnchors, reversed })
  }

  if (plans.length === 0) return capToMaxPoints([...points], maxPoints)

  // Sort plans by startIdx ascending; break ties with endIdx descending so wider
  // windows sort before narrower ones and subsume them during the merge below.
  // Sections are registered in spatial order (west to east), so for equal keys
  // stable sort preserves registry order, which is correct travel order for
  // non-reversed routes.
  plans.sort((a, b) =>
    a.startIdx !== b.startIdx ? a.startIdx - b.startIdx : b.endIdx - a.endIdx,
  )

  // Merge overlapping injection windows.
  // When a sparse chord spans multiple sections (same startIdx/endIdx), their
  // anchors must be combined into one injection. For reversed routes (east→west
  // travel), a new overlapping plan's area is spatially east of the previous —
  // it comes first in travel order — so prepend. For non-reversed, append.
  const merged: Plan[] = []
  for (const plan of plans) {
    const prev = merged[merged.length - 1]
    if (prev && plan.startIdx <= prev.endIdx) {
      prev.endIdx = Math.max(prev.endIdx, plan.endIdx)
      prev.anchors = plan.reversed
        ? [...plan.anchors, ...prev.anchors]
        : [...prev.anchors, ...plan.anchors]
    } else {
      merged.push({ startIdx: plan.startIdx, endIdx: plan.endIdx, anchors: [...plan.anchors], reversed: plan.reversed })
    }
  }

  // Apply merged plans right-to-left on the original points array.
  // Right-to-left ensures earlier (lower startIdx) plans are unaffected by
  // later (higher startIdx) injections: indices 0..endIdx_{i} remain stable
  // while only positions > endIdx_{i} shift after each right-side injection.
  let result = [...points]
  for (let i = merged.length - 1; i >= 0; i--) {
    const { startIdx, endIdx, anchors } = merged[i]
    result = [
      ...result.slice(0, startIdx + 1),
      ...anchors,
      ...result.slice(endIdx),
    ]
  }

  return capToMaxPoints(result, maxPoints)
}
