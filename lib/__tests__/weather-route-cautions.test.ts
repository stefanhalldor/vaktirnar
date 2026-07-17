/**
 * Unit tests for lib/weather/routeCautions.ts
 * Pure logic tests — no HTTP mocking needed.
 */

import { describe, it, expect } from 'vitest'
import { matchRouteCautions } from '@/lib/weather/routeCautions'
import type { PlaceCandidate } from '@/lib/weather/provider.types'

// ── Test place candidates ─────────────────────────────────────────────────────

const FROM_REYKJAVIK: PlaceCandidate = {
  placeId: 'ChIJreykjavik',
  displayName: 'Reykjavík',
  formattedAddress: 'Reykjavík, Iceland',
  lat: 64.135,
  lon: -21.895,
}
const FROM_HOFN: PlaceCandidate = {
  placeId: 'ChIJhofn',
  displayName: 'Höfn',
  formattedAddress: 'Höfn, Iceland',
  lat: 64.255,
  lon: -15.207,
}
const FROM_ISAFJORDUR: PlaceCandidate = {
  placeId: 'ChIJisafjordur_origin',
  displayName: 'Ísafjörður',
  formattedAddress: 'Ísafjörður, Iceland',
  lat: 66.07,
  lon: -23.13,
}
const TO_ISAFJORDUR: PlaceCandidate = {
  placeId: 'ChIJIsafjordur',
  displayName: 'Ísafjörður',
  formattedAddress: 'Ísafjörður, Iceland',
  lat: 66.07,
  lon: -23.13,
}
const TO_BOLUNGARVIK: PlaceCandidate = {
  placeId: 'ChIJbolungarvik',
  displayName: 'Bolungarvík',
  formattedAddress: 'Bolungarvík, Iceland',
  lat: 66.15,
  lon: -23.26,
}
const TO_AKUREYRI: PlaceCandidate = {
  placeId: 'ChIJakureyri',
  displayName: 'Akureyri',
  formattedAddress: 'Akureyri, Iceland',
  lat: 65.683,
  lon: -18.1,
}
const TO_SELFOSS: PlaceCandidate = {
  placeId: 'ChIJselfoss',
  displayName: 'Selfoss',
  formattedAddress: 'Selfoss, Iceland',
  lat: 63.932,
  lon: -20.996,
}
const TO_HOFN: PlaceCandidate = {
  placeId: 'ChIJhofn_dest',
  displayName: 'Höfn',
  formattedAddress: 'Höfn, Iceland',
  lat: 64.255,
  lon: -15.207,
}

// ── Route point fixtures ──────────────────────────────────────────────────────

// HOLMAVIK_VIA = { lat: 65.703, lon: -21.685 }, radiusM = 8_000
// Points clearly NOT passing near Hólmavík (going northeast, skipping the west).
const POINTS_NOT_VIA_HOLMAVIK = [
  { lat: 64.10, lon: -21.90 }, // Garðabær area
  { lat: 65.00, lon: -19.50 }, // north central Iceland
  { lat: 65.68, lon: -18.10 }, // Akureyri area
]

// Points that DO pass near Hólmavík (within 8 km of lat 65.703, lon -21.685).
const POINTS_VIA_HOLMAVIK = [
  { lat: 64.10, lon: -21.90 }, // Garðabær area
  { lat: 65.70, lon: -21.69 }, // ~0.4 km from HOLMAVIK_VIA — inside 8 km threshold
  { lat: 66.07, lon: -23.13 }, // Ísafjörður
]

// ── Westfjords trailer caution ────────────────────────────────────────────────

describe('matchRouteCautions — Westfjords trailer caution', () => {
  it('Reykjavík → Ísafjörður that avoids Hólmavík gets trailer caution', () => {
    const cautions = matchRouteCautions(POINTS_NOT_VIA_HOLMAVIK, FROM_REYKJAVIK, TO_ISAFJORDUR)
    expect(cautions.some(c => c.id === 'westfjords-south-route60')).toBe(true)
  })

  it('Höfn → Ísafjörður that avoids Hólmavík also gets trailer caution', () => {
    const cautions = matchRouteCautions(POINTS_NOT_VIA_HOLMAVIK, FROM_HOFN, TO_ISAFJORDUR)
    expect(cautions.some(c => c.id === 'westfjords-south-route60')).toBe(true)
  })

  it('Ísafjörður → Höfn (reverse direction) also gets trailer caution when avoiding Hólmavík', () => {
    // origin is Ísafjörður (in WESTFJORDS_NORTH_BOUNDS) → anyPartyBounds satisfied
    const cautions = matchRouteCautions(POINTS_NOT_VIA_HOLMAVIK, FROM_ISAFJORDUR, TO_HOFN)
    expect(cautions.some(c => c.id === 'westfjords-south-route60')).toBe(true)
  })

  it('route to Bolungarvík that avoids Hólmavík gets trailer caution', () => {
    const cautions = matchRouteCautions(POINTS_NOT_VIA_HOLMAVIK, FROM_REYKJAVIK, TO_BOLUNGARVIK)
    expect(cautions.some(c => c.id === 'westfjords-south-route60')).toBe(true)
  })

  it('route to Ísafjörður that passes near Hólmavík does NOT get trailer caution', () => {
    const cautions = matchRouteCautions(POINTS_VIA_HOLMAVIK, FROM_REYKJAVIK, TO_ISAFJORDUR)
    expect(cautions.some(c => c.id === 'westfjords-south-route60')).toBe(false)
  })

  it('route to Akureyri (outside WESTFJORDS_NORTH_BOUNDS) gets no Westfjords caution', () => {
    const cautions = matchRouteCautions(POINTS_NOT_VIA_HOLMAVIK, FROM_REYKJAVIK, TO_AKUREYRI)
    expect(cautions.some(c => c.id === 'westfjords-south-route60')).toBe(false)
  })

  it('route to Selfoss (south Iceland) gets no Westfjords caution', () => {
    const cautions = matchRouteCautions(POINTS_NOT_VIA_HOLMAVIK, FROM_REYKJAVIK, TO_SELFOSS)
    expect(cautions.some(c => c.id === 'westfjords-south-route60')).toBe(false)
  })

  it('Akureyri → Höfn (neither party in Westfjords) gets no Westfjords caution', () => {
    const fromAkureyri: PlaceCandidate = { placeId: 'x', displayName: 'Akureyri', formattedAddress: '', lat: 65.683, lon: -18.1 }
    const cautions = matchRouteCautions(POINTS_NOT_VIA_HOLMAVIK, fromAkureyri, TO_HOFN)
    expect(cautions.some(c => c.id === 'westfjords-south-route60')).toBe(false)
  })

  it('caution has correct severity, labelKey, summaryKey and appliesTo', () => {
    const cautions = matchRouteCautions(POINTS_NOT_VIA_HOLMAVIK, FROM_REYKJAVIK, TO_ISAFJORDUR)
    const c = cautions.find(c => c.id === 'westfjords-south-route60')
    expect(c).toBeDefined()
    expect(c!.severity).toBe('caution')
    expect(c!.labelKey).toBe('routeCautionTrailer')
    expect(c!.summaryKey).toBe('routeCautionWestfjordsSummary')
    expect(c!.appliesTo).toContain('trailer')
    expect(c!.appliesTo).toContain('caravan')
    expect(c!.appliesTo).toContain('camper')
  })

  it('returns empty array for non-Westfjords routes', () => {
    const cautions = matchRouteCautions(POINTS_NOT_VIA_HOLMAVIK, FROM_REYKJAVIK, TO_AKUREYRI)
    expect(cautions).toHaveLength(0)
  })
})

// ── Öxi / Axarvegur 939 caution ───────────────────────────────────────────────

describe('matchRouteCautions — Öxi caution', () => {
  // Öxi detection point: lat 64.860, lon -14.365, radiusM 10_000
  // Any route within 10 km of this point gets the Öxi caution.

  // Points that pass near the Öxi corridor (within 6 km of lat 64.860, lon -14.365).
  const POINTS_VIA_OXI = [
    { lat: 64.25, lon: -15.21 }, // Höfn area
    { lat: 64.86, lon: -14.37 }, // ~0.3 km from corridor point — within 6 km
    { lat: 65.27, lon: -14.40 }, // Egilsstaðir area
  ]

  // Points that go around the coastal fjords (NOT via Öxi).
  const POINTS_COASTAL_ROUTE1 = [
    { lat: 65.27, lon: -14.40 }, // Egilsstaðir area
    { lat: 64.93, lon: -13.80 }, // Seyðisfjörður/Neskaupstaður area (coastal)
    { lat: 64.69, lon: -14.28 }, // Djúpivogur coastal area
    { lat: 64.25, lon: -15.21 }, // Höfn
  ]

  const FROM_EGILSSTADIR: PlaceCandidate = {
    placeId: 'ChIJegilsstadir',
    displayName: 'Egilsstaðir',
    formattedAddress: 'Egilsstaðir, Iceland',
    lat: 65.27,
    lon: -14.40,
  }

  it('route via Öxi pass gets Öxi caution', () => {
    const cautions = matchRouteCautions(POINTS_VIA_OXI, FROM_EGILSSTADIR, TO_HOFN)
    expect(cautions.some(c => c.id === 'oxi-axarvegur-939')).toBe(true)
  })

  it('Öxi caution fires regardless of origin/destination bounds — pure geometry detection', () => {
    // Origin and destination are outside WESTFJORDS_NORTH_BOUNDS.
    // Detection should still fire because the route passes near the corridor point.
    const cautions = matchRouteCautions(POINTS_VIA_OXI, FROM_EGILSSTADIR, TO_HOFN)
    expect(cautions.some(c => c.id === 'oxi-axarvegur-939')).toBe(true)
  })

  it('coastal Route 1 (around the fjords) does NOT get Öxi caution', () => {
    const cautions = matchRouteCautions(POINTS_COASTAL_ROUTE1, FROM_EGILSSTADIR, TO_HOFN)
    expect(cautions.some(c => c.id === 'oxi-axarvegur-939')).toBe(false)
  })

  it('Öxi caution has correct labelKey and summaryKey', () => {
    const cautions = matchRouteCautions(POINTS_VIA_OXI, FROM_EGILSSTADIR, TO_HOFN)
    const c = cautions.find(c => c.id === 'oxi-axarvegur-939')
    expect(c).toBeDefined()
    expect(c!.labelKey).toBe('routeCautionTrailer')
    expect(c!.summaryKey).toBe('routeCautionOxiSummary')
    expect(c!.severity).toBe('caution')
  })

  it('route via actual Öxi station (64.8257, -14.6573) fires caution — evidence point fix for Höfn→Egilsstaðir', () => {
    // This is the real bug: the route passes the Veðurstofan station at ~0 km
    // but the old approximate corridorPoint (64.860, -14.365) was ~14 km away.
    // The new evidencePoint at the exact station coordinates fires within 1.5 km.
    const POINTS_VIA_OXI_STATION = [
      { lat: 64.255, lon: -15.207 }, // Höfn
      { lat: 64.826, lon: -14.658 }, // ~0.1 km from Öxi station (64.8257, -14.6573)
      { lat: 65.270, lon: -14.400 }, // Egilsstaðir
    ]
    const cautions = matchRouteCautions(POINTS_VIA_OXI_STATION, FROM_HOFN, TO_AKUREYRI)
    expect(cautions.some(c => c.id === 'oxi-axarvegur-939')).toBe(true)
  })

  it('existing corridor-point detection still fires (backward compat with approximate point)', () => {
    // POINTS_VIA_OXI uses (64.86, -14.37) ~0.3 km from old corridor point — must still work.
    const cautions = matchRouteCautions(POINTS_VIA_OXI, FROM_EGILSSTADIR, TO_HOFN)
    expect(cautions.some(c => c.id === 'oxi-axarvegur-939')).toBe(true)
  })

  it('segment-only detection: caution fires when route segment passes near evidence point but no vertex is close', () => {
    // Two-vertex route straddling the Öxi station (64.8257, -14.6573) with radiusM=1500.
    // Neither vertex is within 1.5 km of the station, but the segment between them
    // passes very close to it. Vertex-only check would miss this; segment projection catches it.
    const POINTS_SEGMENT_THROUGH_OXI = [
      { lat: 64.820, lon: -14.700 }, // west of station, ~3 km from station
      { lat: 64.830, lon: -14.600 }, // east of station, ~3 km from station
      // segment between these two passes within ~1 km of (64.8257, -14.6573)
    ]
    const cautions = matchRouteCautions(POINTS_SEGMENT_THROUGH_OXI, FROM_HOFN, TO_AKUREYRI)
    expect(cautions.some(c => c.id === 'oxi-axarvegur-939')).toBe(true)
  })

  it('evidencePointsOnly: corridorPoint-only route does not fire, evidence-point route still fires', () => {
    // Route near the station (evidence point, 1.5 km radius) — fires normally with default options.
    const POINTS_VIA_STATION_ONLY = [
      { lat: 64.255, lon: -15.207 }, // Höfn
      { lat: 64.826, lon: -14.658 }, // ~0.1 km from Öxi station (evidencePoint), >10 km from corridorPoint
      { lat: 65.270, lon: -14.400 }, // Egilsstaðir
    ]
    // Without option: evidence point fires → caution
    expect(matchRouteCautions(POINTS_VIA_STATION_ONLY, FROM_HOFN, TO_AKUREYRI)
      .some(c => c.id === 'oxi-axarvegur-939')).toBe(true)
    // With evidencePointsOnly: evidence fires (road passes station) → caution still fires
    expect(matchRouteCautions(POINTS_VIA_STATION_ONLY, FROM_HOFN, TO_AKUREYRI, { evidencePointsOnly: true })
      .some(c => c.id === 'oxi-axarvegur-939')).toBe(true)

    // Route near the APPROXIMATE corridorPoint (10 km radius) only — not near station.
    // POINTS_VIA_OXI hits (64.86, -14.37) which is ~0.3 km from corridorPoint but ~11 km from station.
    // Without option: corridorPoint fires → caution
    expect(matchRouteCautions(POINTS_VIA_OXI, FROM_EGILSSTADIR, TO_HOFN)
      .some(c => c.id === 'oxi-axarvegur-939')).toBe(true)
    // With evidencePointsOnly: corridorPoint skipped, station not close enough → no caution
    // This is exactly the curated-route-validation scenario: avoidance route passes near
    // the approximate area but not near the actual Road 939 station.
    expect(matchRouteCautions(POINTS_VIA_OXI, FROM_EGILSSTADIR, TO_HOFN, { evidencePointsOnly: true })
      .some(c => c.id === 'oxi-axarvegur-939')).toBe(false)
  })

  it('Westfjords and Öxi cautions can coexist on a single route', () => {
    // Synthetic route: starts in Westfjords (anyPartyBounds satisfied), avoids Hólmavík,
    // AND passes near Öxi corridor. Both cautions should fire independently.
    const POINTS_VIA_OXI_AND_WESTFJORDS = [
      { lat: 66.07, lon: -23.13 }, // Ísafjörður — in WESTFJORDS_NORTH_BOUNDS
      { lat: 64.86, lon: -14.37 }, // near Öxi corridor — within 6 km of detection point
      { lat: 65.27, lon: -14.40 }, // Egilsstaðir area
    ]
    const FROM_ISAFJORDUR_SYN: PlaceCandidate = {
      placeId: 'ChIJisyn', displayName: 'Ísafjörður', formattedAddress: '', lat: 66.07, lon: -23.13
    }
    const TO_EGILSSTADIR_SYN: PlaceCandidate = {
      placeId: 'ChIJegsyn', displayName: 'Egilsstaðir', formattedAddress: '', lat: 65.27, lon: -14.40
    }
    const cautions = matchRouteCautions(POINTS_VIA_OXI_AND_WESTFJORDS, FROM_ISAFJORDUR_SYN, TO_EGILSSTADIR_SYN)
    expect(cautions.some(c => c.id === 'westfjords-south-route60')).toBe(true)
    expect(cautions.some(c => c.id === 'oxi-axarvegur-939')).toBe(true)
    expect(cautions).toHaveLength(2)
  })
})
