/**
 * Unit tests for lib/weather/routeControlPoints.ts
 *
 * Tests are written against the public API (augmentProviderMatchingPoints) and
 * the ROUTE_CONTROL_SECTIONS registry. Section coordinates are APPROXIMATE and
 * will be updated after localhost visual verification.
 */

import { describe, it, expect, vi } from 'vitest'
import { augmentProviderMatchingPoints, ROUTE_CONTROL_SECTIONS } from '@/lib/weather/routeControlPoints'
import { matchProviderPointsToRoute, DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M } from '@/lib/weather/providerRouteMatching'

// ── Synthetic control section for deterministic testing ───────────────────────

// A small synthetic section with two gates and three anchors.
// Gates on a west-east axis; anchors follow a curved north-jog in the middle.
const SYNTHETIC_SECTION = {
  id: 'test-section',
  name: 'Test section',
  reason: 'Synthetic for unit tests',
  verified: true,
  gates: [
    { lat: 64.0, lon: -22.0, radiusM: 5_000 }, // west gate
    { lat: 64.0, lon: -21.0, radiusM: 5_000 }, // east gate
  ],
  anchors: [
    { lat: 64.05, lon: -21.8 }, // slight north jog
    { lat: 64.08, lon: -21.6 }, // more north
    { lat: 64.05, lon: -21.3 }, // back south
  ],
} as const

// ── Route fixtures ────────────────────────────────────────────────────────────

// Route that passes near both gates — section should be applied.
const ROUTE_VIA_BOTH_GATES = [
  { lat: 64.0, lon: -22.5 }, // west of west gate
  { lat: 64.0, lon: -21.95 }, // near west gate
  { lat: 64.0, lon: -21.5 },  // between gates (chord — no north jog)
  { lat: 64.0, lon: -21.05 }, // near east gate
  { lat: 64.0, lon: -20.5 },  // east of east gate
]

// Route that only passes near the west gate (east section is off-route).
const ROUTE_VIA_WEST_GATE_ONLY = [
  { lat: 64.0, lon: -22.5 },
  { lat: 64.0, lon: -21.95 }, // near west gate
  { lat: 63.9, lon: -21.50 }, // turns south — never near east gate
]

// Completely unrelated route far away.
const ROUTE_UNRELATED = [
  { lat: 65.5, lon: -18.0 },
  { lat: 65.7, lon: -17.5 },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('augmentProviderMatchingPoints', () => {
  it('returns unchanged points when no sections match (unrelated route)', () => {
    const result = augmentProviderMatchingPoints(ROUTE_UNRELATED, [SYNTHETIC_SECTION])
    expect(result).toHaveLength(ROUTE_UNRELATED.length)
    expect(result[0]).toMatchObject(ROUTE_UNRELATED[0])
    expect(result[result.length - 1]).toMatchObject(ROUTE_UNRELATED[ROUTE_UNRELATED.length - 1])
  })

  it('returns unchanged points when only one gate is matched', () => {
    const result = augmentProviderMatchingPoints(ROUTE_VIA_WEST_GATE_ONLY, [SYNTHETIC_SECTION])
    expect(result).toHaveLength(ROUTE_VIA_WEST_GATE_ONLY.length)
  })

  it('injects anchors when all gates match', () => {
    const result = augmentProviderMatchingPoints(ROUTE_VIA_BOTH_GATES, [SYNTHETIC_SECTION])
    // All 3 anchors should appear in the result
    for (const anchor of SYNTHETIC_SECTION.anchors) {
      expect(result.some(p => p.lat === anchor.lat && p.lon === anchor.lon)).toBe(true)
    }
  })

  it('preserves first and last route point after augmentation', () => {
    const result = augmentProviderMatchingPoints(ROUTE_VIA_BOTH_GATES, [SYNTHETIC_SECTION])
    expect(result[0]).toMatchObject(ROUTE_VIA_BOTH_GATES[0])
    expect(result[result.length - 1]).toMatchObject(ROUTE_VIA_BOTH_GATES[ROUTE_VIA_BOTH_GATES.length - 1])
  })

  it('never exceeds maxPoints after augmentation', () => {
    // Build a route near both gates but with many intermediate points
    const denseRoute = [
      { lat: 64.0, lon: -22.5 },
      ...Array.from({ length: 990 }, (_, i) => ({ lat: 64.0, lon: -22.0 + i * 0.0015 })),
      { lat: 64.0, lon: -20.5 },
    ]
    const result = augmentProviderMatchingPoints(denseRoute, [SYNTHETIC_SECTION], 1000)
    expect(result.length).toBeLessThanOrEqual(1000)
  })

  it('handles empty input safely', () => {
    const result = augmentProviderMatchingPoints([], [SYNTHETIC_SECTION])
    expect(result).toHaveLength(0)
  })

  it('works when route travels east→west (reversed gate order)', () => {
    const reversedRoute = [...ROUTE_VIA_BOTH_GATES].reverse()
    const result = augmentProviderMatchingPoints(reversedRoute, [SYNTHETIC_SECTION])
    // Anchors should appear regardless of direction
    for (const anchor of SYNTHETIC_SECTION.anchors) {
      expect(result.some(p => p.lat === anchor.lat && p.lon === anchor.lon)).toBe(true)
    }
    // First and last points preserved
    expect(result[0]).toMatchObject(reversedRoute[0])
    expect(result[result.length - 1]).toMatchObject(reversedRoute[reversedRoute.length - 1])
  })

  it('reversed route injects anchors in reverse order (travel order, not registry order)', () => {
    // SYNTHETIC_SECTION anchors go west→east (lons: -21.8, -21.6, -21.3).
    // A reversed route travels east→west, so anchors should appear in reverse order
    // (-21.3, -21.6, -21.8) to preserve route-fraction ordering for provider matching.
    const reversedRoute = [...ROUTE_VIA_BOTH_GATES].reverse()
    const result = augmentProviderMatchingPoints(reversedRoute, [SYNTHETIC_SECTION])

    // Find the index range where anchors were injected
    const anchorLonSet = new Set<number>(SYNTHETIC_SECTION.anchors.map(a => a.lon))
    const firstAnchorIdx = result.findIndex(p => anchorLonSet.has(p.lon))
    let lastAnchorIdx = -1
    for (let i = result.length - 1; i >= 0; i--) {
      if (anchorLonSet.has(result[i].lon)) { lastAnchorIdx = i; break }
    }
    expect(firstAnchorIdx).toBeGreaterThanOrEqual(0)

    // Extract injected anchors in their result order
    const injected = result.slice(firstAnchorIdx, lastAnchorIdx + 1).filter(p => anchorLonSet.has(p.lon))

    // Reversed route travels east→west (decreasing lon), so injected anchors should
    // have decreasing lon: -21.3 first, then -21.6, then -21.8
    expect(injected[0].lon).toBeGreaterThan(injected[1].lon) // -21.3 > -21.6
    expect(injected[1].lon).toBeGreaterThan(injected[2].lon) // -21.6 > -21.8
  })

  it('segment-only gate: section activates when route segment crosses gate but no vertex is inside', () => {
    // Route is just two endpoints, both far outside the gates.
    // The segment between them crosses through both gate areas.
    // Before fixing: vertex-only check missed this. After fix: segment projection catches it.
    const twoPointRoute = [
      { lat: 64.0, lon: -22.5 }, // west endpoint (outside west gate at -22.0)
      { lat: 64.0, lon: -20.5 }, // east endpoint (outside east gate at -21.0)
    ]
    // Both gates (radiusM=5000) are near the segment midpoint but no vertex is close:
    // vertex at -22.5 is ~27 km from west gate centre (-22.0), well outside 5 km
    // vertex at -20.5 is ~27 km from east gate centre (-21.0), well outside 5 km
    // But the segment passes exactly through lat=64.0, which is where both gates sit.
    const result = augmentProviderMatchingPoints(twoPointRoute, [SYNTHETIC_SECTION])

    // Anchors should be injected because segment projection detects both gates
    for (const anchor of SYNTHETIC_SECTION.anchors) {
      expect(result.some(p => p.lat === anchor.lat && p.lon === anchor.lon)).toBe(true)
    }
  })

  it('regression: station near anchor (not near chord) is found with 1 km threshold', () => {
    // ROUTE_VIA_BOTH_GATES chords straight east-west at lat=64.0.
    // Anchor adds a north jog to lat~64.08.
    // A station at (64.08, -21.6) is 0 km from the anchor but ~9 km from the chord.
    const augmented = augmentProviderMatchingPoints(ROUTE_VIA_BOTH_GATES, [SYNTHETIC_SECTION])

    // Without augmentation (chord only) — station missed
    const sparseMatches = matchProviderPointsToRoute({
      points: [{ id: 'S', lat: 64.08, lon: -21.6 }],
      routePolyline: ROUTE_VIA_BOTH_GATES,
      maxDistanceM: 1_000,
    })
    expect(sparseMatches).toHaveLength(0)

    // With augmentation — station found
    const denseMatches = matchProviderPointsToRoute({
      points: [{ id: 'S', lat: 64.08, lon: -21.6 }],
      routePolyline: augmented,
      maxDistanceM: 1_000,
    })
    expect(denseMatches).toHaveLength(1)
    expect(denseMatches[0].distanceM).toBeLessThan(1_000)
  })
})

describe('ROUTE_CONTROL_SECTIONS registry', () => {
  it('each section has a unique id', () => {
    const ids = ROUTE_CONTROL_SECTIONS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('each section has at least two gates', () => {
    for (const section of ROUTE_CONTROL_SECTIONS) {
      expect(section.gates.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('each section has at least two anchors', () => {
    for (const section of ROUTE_CONTROL_SECTIONS) {
      expect(section.anchors.length).toBeGreaterThanOrEqual(2)
    }
  })
})

// ── Vík/Mýrdalur regression ───────────────────────────────────────────────────
//
// Before the two-section fix, a single ring-road-vik-skeidflotur section had
// anchors that missed Vatnsskarðshólar (west of Vík) and were too far from
// Reynisfjall. On localhost (dev, verified:false sections active), incorrect
// anchors replaced good Google polyline geometry and caused route-dependent
// station mismatches. Production (verified:false → skipped) was unaffected.
//
// These tests use sparse horizontal chords at lat 63.40 that chord across south
// of the actual Route 1 coastal path. Without augmentation the stations at
// lat 63.42-63.47 fall outside the 1 km threshold. After augmentation with the
// corrected sections, all target stations are within 1 km.

describe('Vík/Mýrdalur regression — route-dependent station mismatch', () => {
  // Real Veðurstofan station coordinates (from Codex v397 handoff).
  // These are the product acceptance criteria for this fix.
  const VATNSSKARDSHOLAR = { id: 'vatnsskardsholar', lat: 63.424, lon: -19.1837 }
  const REYNISFJALL = { id: 'reynisfjall', lat: 63.4521, lon: -19.0378 }
  const MYRDALSSANDUR = { id: 'myrdalssandur', lat: 63.4661, lon: -18.6044 }
  const ALL_VIK_STATIONS = [VATNSSKARDSHOLAR, REYNISFJALL, MYRDALSSANDUR]

  // Sparse horizontal chords at lat 63.40, south of the actual Route 1 path.
  // Simulate Google RDP-simplified polylines on long routes.
  const VIK_WEST_CHORD = [   // triggers ring-road-vik-west only (east end stops before vik-east east gate)
    { lat: 63.40, lon: -19.6 },
    { lat: 63.40, lon: -18.6 },
  ]
  const VIK_EAST_CHORD = [   // triggers ring-road-vik-east only (west end starts after vik-west west gate)
    { lat: 63.40, lon: -19.2 },
    { lat: 63.40, lon: -18.2 },
  ]
  const VIK_BOTH_CHORD = [   // triggers both sections (long route, Reykjavík ↔ Egilsstaðir style)
    { lat: 63.40, lon: -19.6 },
    { lat: 63.40, lon: -18.2 },
  ]
  const SELFOSS_AREA = [     // unrelated route — no Vík gates triggered
    { lat: 63.93, lon: -21.0 },
    { lat: 63.97, lon: -21.4 },
  ]
  // Three-vertex sparse route from Vík heading west (Vík → Hella).
  // Only triggers ring-road-vik-west: the vik-east east gate is 31+ km east.
  const VIK_HELLA_SPARSE = [
    { lat: 63.419, lon: -18.998 }, // Vík start
    { lat: 63.440, lon: -19.550 }, // Route 1 near Skógar
    { lat: 63.853, lon: -20.407 }, // Hella
  ]

  it('sparse chord misses all three Vík stations without augmentation', () => {
    const matches = matchProviderPointsToRoute({
      points: ALL_VIK_STATIONS,
      routePolyline: VIK_BOTH_CHORD,
      maxDistanceM: DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M,
    })
    expect(matches).toHaveLength(0)
  })

  it('vik-west chord finds Vatnsskarðshólar and Reynisfjall within 1 km after augmentation', () => {
    const augmented = augmentProviderMatchingPoints(VIK_WEST_CHORD, ROUTE_CONTROL_SECTIONS)
    const matches = matchProviderPointsToRoute({
      points: [VATNSSKARDSHOLAR, REYNISFJALL],
      routePolyline: augmented,
      maxDistanceM: DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M,
    })
    expect(matches).toHaveLength(2)
    expect(matches.every(m => m.distanceM < DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M)).toBe(true)
  })

  it('vik-east chord finds Mýrdalssandur within 1 km after augmentation', () => {
    const augmented = augmentProviderMatchingPoints(VIK_EAST_CHORD, ROUTE_CONTROL_SECTIONS)
    const matches = matchProviderPointsToRoute({
      points: [MYRDALSSANDUR],
      routePolyline: augmented,
      maxDistanceM: DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M,
    })
    expect(matches).toHaveLength(1)
    expect(matches[0].distanceM).toBeLessThan(DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M)
  })

  it('long chord finds all three Vík stations within 1 km after augmentation', () => {
    const augmented = augmentProviderMatchingPoints(VIK_BOTH_CHORD, ROUTE_CONTROL_SECTIONS)
    const matches = matchProviderPointsToRoute({
      points: ALL_VIK_STATIONS,
      routePolyline: augmented,
      maxDistanceM: DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M,
    })
    expect(matches).toHaveLength(3)
    expect(matches.every(m => m.distanceM < DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M)).toBe(true)
  })

  it('reversed long chord (Egilsstaðir → Reykjavík) finds all three Vík stations', () => {
    const augmented = augmentProviderMatchingPoints(
      [...VIK_BOTH_CHORD].reverse(),
      ROUTE_CONTROL_SECTIONS,
    )
    const matches = matchProviderPointsToRoute({
      points: ALL_VIK_STATIONS,
      routePolyline: augmented,
      maxDistanceM: DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M,
    })
    expect(matches).toHaveLength(3)
  })

  it('Vík → Hella (westbound, short) finds Vatnsskarðshólar and Reynisfjall but NOT Mýrdalssandur', () => {
    // vik-east does not trigger: its east gate is 31+ km from the Vík start.
    const augmented = augmentProviderMatchingPoints(VIK_HELLA_SPARSE, ROUTE_CONTROL_SECTIONS)
    const allMatches = matchProviderPointsToRoute({
      points: ALL_VIK_STATIONS,
      routePolyline: augmented,
      maxDistanceM: DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M,
    })
    const ids = new Set(allMatches.map(m => m.point.id))
    expect(ids.has('vatnsskardsholar')).toBe(true)
    expect(ids.has('reynisfjall')).toBe(true)
    expect(ids.has('myrdalssandur')).toBe(false)
  })

  it('unrelated route (Selfoss area) finds no Vík stations', () => {
    const augmented = augmentProviderMatchingPoints(SELFOSS_AREA, ROUTE_CONTROL_SECTIONS)
    const matches = matchProviderPointsToRoute({
      points: ALL_VIK_STATIONS,
      routePolyline: augmented,
      maxDistanceM: DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M,
    })
    expect(matches).toHaveLength(0)
  })
})

describe('production guard — verified: false sections', () => {
  // Unverified variant of SYNTHETIC_SECTION for guard testing.
  const UNVERIFIED_SECTION = {
    id: 'test-unverified',
    name: SYNTHETIC_SECTION.name,
    reason: SYNTHETIC_SECTION.reason,
    verified: false,
    gates: SYNTHETIC_SECTION.gates,
    anchors: SYNTHETIC_SECTION.anchors,
  } as const

  it('skips unverified sections in production (NODE_ENV=production)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const result = augmentProviderMatchingPoints(ROUTE_VIA_BOTH_GATES, [UNVERIFIED_SECTION])
      // Section must be entirely skipped — no anchors injected, route unchanged
      for (const anchor of SYNTHETIC_SECTION.anchors) {
        expect(result.some(p => p.lat === anchor.lat && p.lon === anchor.lon)).toBe(false)
      }
      expect(result).toHaveLength(ROUTE_VIA_BOTH_GATES.length)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('applies unverified sections in dev/test (NODE_ENV != production)', () => {
    // NODE_ENV is 'test' in this environment — unverified sections should be active
    // so Stebbi can verify them visually on localhost before setting verified: true.
    const result = augmentProviderMatchingPoints(ROUTE_VIA_BOTH_GATES, [UNVERIFIED_SECTION])
    for (const anchor of SYNTHETIC_SECTION.anchors) {
      expect(result.some(p => p.lat === anchor.lat && p.lon === anchor.lon)).toBe(true)
    }
  })
})
