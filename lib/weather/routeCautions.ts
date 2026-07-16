import type { PlaceCandidate } from './provider.types'
import type { RouteCautionResult, RouteCautionSeverity, RouteCautionVehicle } from './provider.types'
import {
  WESTFJORDS_NORTH_BOUNDS,
  HOLMAVIK_VIA,
  HOLMAVIK_PROXIMITY_M,
} from './routeCautionConstants'
import type { Bounds } from './routeCautionConstants'

// ── Road segment caution model ────────────────────────────────────────────────

/**
 * Detection strategy for a sensitive road segment.
 *
 * present-near-corridor: caution fires when the route DOES pass within
 *   radiusM of any corridorPoint. This is the intended final form of segment
 *   detection: fully geometry-driven, independent of origin/destination bounds.
 *   Use for hazard corridors that can be identified from positive route geometry
 *   once corridor points are visually verified (e.g. Öxi pass, Road 939).
 *
 * missing-via — TRANSITIONAL PROXY: caution fires when the route does NOT pass
 *   near any viaNearPoints AND at least one route party (origin or destination)
 *   is inside anyPartyBounds.
 *
 *   This is NOT a true geometry-based segment detector. It relies on the
 *   *absence* of a known safe corridor (e.g. Hólmavík on Route 61) as a proxy
 *   for concluding the route uses the hazardous segment. The anyPartyBounds gate
 *   prevents false positives on unrelated routes, but it also means:
 *   - A route through the hazardous segment from origins/destinations outside
 *     anyPartyBounds would NOT be detected.
 *   - A route with one party in bounds that avoids Hólmavík WILL be detected,
 *     even if the dangerous segment is not confirmed on the polyline.
 *
 *   Replace with 'present-near-corridor' + verified corridor geometry for any
 *   segment where precise detection is required. Keep as a documented fallback
 *   only when positive corridor geometry cannot yet be verified.
 */
type RoadSegmentDetection =
  | {
      type: 'missing-via'
      /** Route gets caution when it does NOT pass near any of these points. */
      viaNearPoints: Array<{ lat: number; lon: number; radiusM: number }>
      /**
       * At least one of origin or destination must be inside one of these bounds.
       * Required for missing-via detection to avoid flagging unrelated routes
       * that simply happen to not pass near the via-point.
       */
      anyPartyBounds: Bounds[]
    }
  | {
      type: 'present-near-corridor'
      /** Route gets caution when it passes within radiusM of any of these points. */
      corridorPoints: Array<{ lat: number; lon: number; radiusM: number }>
    }

type SensitiveRoadSegment = {
  /** Stable identifier for tests and diagnostics. */
  id: string
  /** Human-readable name for dev logs. */
  name: string
  roadNumbers: string[]
  detection: RoadSegmentDetection
  labelKey: string
  /** Short description shown below the caution chip in route selection. */
  summaryKey: string
  severity: RouteCautionSeverity
  appliesTo: RouteCautionVehicle[]
  source: {
    type: 'manual-curated'
    note: string
    /** True only after corridor geometry has been visually verified on localhost. */
    verified: boolean
  }
}

// ── Haversine helper ──────────────────────────────────────────────────────────

function haversineM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const sinHalfDLat = Math.sin(dLat / 2)
  const sinHalfDLon = Math.sin(dLon / 2)
  const a2 =
    sinHalfDLat * sinHalfDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinHalfDLon * sinHalfDLon
  return R * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2))
}

function routePassesNear(
  points: Array<{ lat: number; lon: number }>,
  target: { lat: number; lon: number },
  radiusM: number
): boolean {
  return points.some(p => haversineM(p, target) <= radiusM)
}

function matchesBounds(c: PlaceCandidate, b: Bounds): boolean {
  return c.lat >= b.minLat && c.lat <= b.maxLat && c.lon >= b.minLon && c.lon <= b.maxLon
}

// ── Segment registry ──────────────────────────────────────────────────────────

const SENSITIVE_ROAD_SEGMENTS: readonly SensitiveRoadSegment[] = [
  {
    // ⚠️ TRANSITIONAL PROXY (see v342 review): uses missing-via detection, not
    // a verified Route 60 corridor. Semantically valid — routes to northern
    // Westfjords that avoid Hólmavík almost certainly use Route 60 mountain
    // passes — but architecturally this is still bounds-aware, not pure geometry.
    //
    // To graduate to a true segment-based implementation, trace approximate Route 60
    // corridor waypoints on localhost and replace this with:
    //   type: 'present-near-corridor',
    //   corridorPoints: [/* verified Route 60 waypoints, e.g. Dynjandivegur area */]
    //
    // Until then this is intentionally marked source.verified: false.
    id: 'westfjords-south-route60',
    name: 'Vestfjarðavegur / Route 60 – Southern Westfjords passes',
    roadNumbers: ['60'],
    detection: {
      type: 'missing-via',
      viaNearPoints: [{ ...HOLMAVIK_VIA, radiusM: HOLMAVIK_PROXIMITY_M }],
      anyPartyBounds: [WESTFJORDS_NORTH_BOUNDS],
    },
    labelKey: 'routeCautionTrailer',
    summaryKey: 'routeCautionWestfjordsSummary',
    severity: 'caution',
    appliesTo: ['trailer', 'caravan', 'camper'],
    source: {
      type: 'manual-curated',
      note: 'Hólmavík (Route 61) via-point used as safe-corridor proxy. Route 60 exact geometry pending visual verification on localhost.',
      verified: false,
    },
  },

  {
    // Öxi / Axarvegur 939 — mountain pass shortcut in eastern Iceland.
    // Google routes Egilsstaðir → Höfn (and similar) via Road 939 (Öxi) rather than
    // going around all the eastern fjords. Öxi is a steep, winding mountain pass
    // that can be difficult in poor visibility, rain, wind, or for vehicles with trailers.
    //
    // Visual confirmation: Skjámynd 2026-07-16 165938 (Egilsstaðir → Höfn,
    // Hringvegur/Leið 1) shows the Google route passing through the Öxi area.
    //
    // Detection: 'present-near-corridor' — fires when the route passes near the Öxi
    // pass summit area. This is geometry-driven and does NOT require bounds gates,
    // so it correctly flags the route regardless of origin/destination.
    //
    // Corridor coordinates are APPROXIMATE (based on geographic estimate of the
    // pass area, lat ~64.86, lon ~-14.37). Stebbi should verify on localhost:
    // 1. Run Egilsstaðir → Höfn and inspect the route map
    // 2. Confirm the detection point is visually on the Öxi mountain section
    //    (not on the coastal fjord roads nearby)
    // 3. Adjust lat/lon and/or radiusM if the detection misses or over-fires
    //
    // If coastal Route 1 (the fjord road around Fáskrúðsfjörður/Breiðdalsvík)
    // incorrectly gets this caution, tighten the radius or move the corridor point
    // further into the mountain pass interior.
    id: 'oxi-axarvegur-939',
    name: 'Öxi / Axarvegur 939',
    roadNumbers: ['939'],
    detection: {
      type: 'present-near-corridor',
      corridorPoints: [
        // APPROXIMATE — visually confirmed on screenshot but not GPS-precise.
        // Key detection point: Öxi pass/summit area.
        // radiusM widened to 10 km to compensate for approximate coordinates until
        // the exact Google polyline is confirmed on localhost.
        { lat: 64.860, lon: -14.365, radiusM: 10_000 },
      ],
    },
    labelKey: 'routeCautionTrailer',
    summaryKey: 'routeCautionOxiSummary',
    severity: 'caution',
    appliesTo: ['trailer', 'caravan', 'camper'],
    source: {
      type: 'manual-curated',
      note: 'Corridor point is approximate. Visual confirmation from Skjámynd 2026-07-16 165938 shows Google routing Egilsstaðir → Höfn via Öxi. GPS precision not verified — adjust coordinates after localhost map check.',
      verified: false,
    },
  },
]

// ── Matcher ───────────────────────────────────────────────────────────────────

/**
 * Evaluate all sensitive road segment rules against a single route and return
 * the matching caution results.
 *
 * Call this with the FULL route polyline (before sampling) so that sparse
 * sampled geometry does not produce false negatives on shorter caution segments.
 *
 * @param points  Full decoded route geometry (unsimplified).
 * @param from    Origin place candidate.
 * @param to      Destination place candidate.
 */
export function matchRouteCautions(
  points: Array<{ lat: number; lon: number }>,
  from: PlaceCandidate,
  to: PlaceCandidate
): RouteCautionResult[] {
  const results: RouteCautionResult[] = []

  for (const segment of SENSITIVE_ROAD_SEGMENTS) {
    const det = segment.detection

    if (det.type === 'missing-via') {
      // Gate: at least one party (origin or destination) must be in bounds.
      const partyInBounds = det.anyPartyBounds.some(
        b => matchesBounds(from, b) || matchesBounds(to, b)
      )
      if (!partyInBounds) continue

      // Caution fires when the route does NOT pass near any of the via points.
      const passesNearAny = det.viaNearPoints.some(vp =>
        routePassesNear(points, vp, vp.radiusM)
      )
      if (passesNearAny) continue
    } else if (det.type === 'present-near-corridor') {
      // Caution fires when the route DOES pass near at least one corridor point.
      const passesNearAny = det.corridorPoints.some(cp =>
        routePassesNear(points, cp, cp.radiusM)
      )
      if (!passesNearAny) continue
    }

    results.push({
      id: segment.id,
      severity: segment.severity,
      labelKey: segment.labelKey,
      summaryKey: segment.summaryKey,
      appliesTo: segment.appliesTo,
    })
  }

  return results
}
