import { describe, it, expect } from 'vitest'
import { resolveOverviewRouteLensCacheOnly, normalizePlaceName } from '@/lib/iceland-routes/lensResolver'
import { filterStationIdsForRouteLens } from '@/lib/iceland-routes/lensFilter'
import type { OverviewRouteLensResult } from '@/lib/iceland-routes/lensTypes'

// ── normalizePlaceName ───────────────────────────────────────────────────────

describe('normalizePlaceName', () => {
  it('lowercases and strips accents', () => {
    expect(normalizePlaceName('Akureyri')).toBe('akureyri')
    expect(normalizePlaceName('Höfn')).toBe('hofn')
    expect(normalizePlaceName('Vík')).toBe('vik')
  })

  it('replaces ð → d', () => {
    expect(normalizePlaceName('Norðurland')).toBe('nordurland')
    expect(normalizePlaceName('Egilsstaðir')).toBe('egilsstadir')
  })

  it('replaces þ → th', () => {
    expect(normalizePlaceName('Þingvellir')).toBe('thingvellir')
  })

  it('replaces æ → ae', () => {
    expect(normalizePlaceName('Kirkjubæjarklaustur')).toBe('kirkjubaejarklaustur')
  })

  it('trims whitespace', () => {
    expect(normalizePlaceName('  Reykjavík  ')).toBe('reykjavik')
  })
})

// ── resolveOverviewRouteLensCacheOnly ────────────────────────────────────────

describe('resolveOverviewRouteLensCacheOnly', () => {
  it('returns idle when both inputs are empty', () => {
    expect(resolveOverviewRouteLensCacheOnly({ from: '', to: '' }).status).toBe('idle')
  })

  it('returns idle when from is empty', () => {
    expect(resolveOverviewRouteLensCacheOnly({ from: '', to: 'Akureyri' }).status).toBe('idle')
  })

  it('returns idle when to is empty', () => {
    expect(resolveOverviewRouteLensCacheOnly({ from: 'Reykjavík', to: '' }).status).toBe('idle')
  })

  it('resolves Reykjavík → Akureyri to north iceland family', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Reykjavík', to: 'Akureyri' })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.routeFamily.id).toBe('capital-north-iceland')
  })

  it('resolves reverse direction: Akureyri → Reykjavík', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Akureyri', to: 'Reykjavík' })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.routeFamily.id).toBe('capital-north-iceland')
  })

  it('resolves case-insensitively: reykjavik → akureyri (no accents)', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'reykjavik', to: 'akureyri' })
    expect(result.status).toBe('resolved')
  })

  it('resolves Reykjavík → Vík to south coast family', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Reykjavík', to: 'Vík' })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.routeFamily.id).toBe('capital-south-coast')
  })

  it('resolves Reykjavík → Höfn to east iceland family', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Reykjavík', to: 'Höfn' })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.routeFamily.id).toBe('capital-east-iceland')
  })

  it('resolves Keflavík → Akureyri (Keflavík is capital alias)', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Keflavík', to: 'Akureyri' })
    expect(result.status).toBe('resolved')
  })

  it('resolves Reykjavík → Ísafjörður to westfjords family', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Reykjavík', to: 'Ísafjörður' })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.routeFamily.id).toBe('capital-westfjords')
  })

  it('resolves Reykjavík → Hólmavík to westfjords family', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Reykjavík', to: 'Hólmavík' })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.routeFamily.id).toBe('capital-westfjords')
  })

  it('returns cache_miss for unknown route (non-capital origin)', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Akureyri', to: 'Selfoss' })
    expect(result.status).toBe('cache_miss')
  })

  it('returns cache_miss for completely unknown places', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Atlantis', to: 'Narnia' })
    expect(result.status).toBe('cache_miss')
    if (result.status !== 'cache_miss') return
    expect(result.query.from).toBe('Atlantis')
    expect(result.query.to).toBe('Narnia')
  })

  // Alias tightening regression (Finding 4): short/partial inputs must not false-match
  it('does not false-match single-letter or very short inputs', () => {
    expect(resolveOverviewRouteLensCacheOnly({ from: 'Reykjavík', to: 'v' }).status).toBe('cache_miss')
    expect(resolveOverviewRouteLensCacheOnly({ from: 'Reykjavík', to: 'vi' }).status).toBe('cache_miss')
  })

  it('does not false-match "land" alone to south coast', () => {
    // "land" alias was removed; only exact named places should match
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Reykjavík', to: 'land' })
    expect(result.status).toBe('cache_miss')
  })

  it('does not false-match Landmannalaugar to south coast', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Reykjavík', to: 'Landmannalaugar' })
    expect(result.status).toBe('cache_miss')
  })

  it('does not false-match Akranes to north road', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Reykjavík', to: 'Akranes' })
    expect(result.status).toBe('cache_miss')
  })

  it('preserves original query in resolved result', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Reykjavík', to: 'Akureyri' })
    if (result.status !== 'resolved') return
    expect(result.query.from).toBe('Reykjavík')
    expect(result.query.to).toBe('Akureyri')
  })

  // Autocomplete place name regression: Google Places displayName values may include
  // qualifiers like "Vík í Mýrdal". These must resolve to the correct route family.
  it('resolves Reykjavík → Vík í Mýrdal to south coast family', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Reykjavík', to: 'Vík í Mýrdal' })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.routeFamily.id).toBe('capital-south-coast')
  })

  it('resolves Reykjavík → Egilsstaðir to east iceland family', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Reykjavík', to: 'Egilsstaðir' })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.routeFamily.id).toBe('capital-east-iceland')
  })

  it('resolves Reykjavík → Selfoss to south coast family', () => {
    const result = resolveOverviewRouteLensCacheOnly({ from: 'Reykjavík', to: 'Selfoss' })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.routeFamily.id).toBe('capital-south-coast')
  })
})

// ── filterStationIdsForRouteLens ─────────────────────────────────────────────

const AKUREYRI_FAMILY_WAYPOINTS = [
  { lat: 64.135, lon: -21.895 }, // Reykjavík
  { lat: 64.540, lon: -21.921 }, // Borgarnes
  { lat: 65.103, lon: -21.786 }, // Búðardalur area
  { lat: 65.402, lon: -20.947 }, // Hvammstangi
  { lat: 65.658, lon: -20.291 }, // Blönduós
  { lat: 65.572, lon: -19.460 }, // Varmahlíð
  { lat: 65.686, lon: -18.085 }, // Akureyri
]

const RESOLVED_NORTH: OverviewRouteLensResult = {
  status: 'resolved',
  query: { from: 'Reykjavík', to: 'Akureyri' },
  routeFamily: {
    id: 'capital-north-iceland',
    label: 'Reykjavík — Norðurland / Akureyri',
    labelEn: 'Reykjavík — North Iceland / Akureyri',
    corridorWaypoints: AKUREYRI_FAMILY_WAYPOINTS,
    corridorRadiusKm: 60,
  },
}

describe('filterStationIdsForRouteLens', () => {
  it('returns null when status is idle', () => {
    expect(filterStationIdsForRouteLens([], { status: 'idle' })).toBeNull()
  })

  it('returns null when status is cache_miss', () => {
    const cacheMiss: OverviewRouteLensResult = {
      status: 'cache_miss',
      query: { from: 'Atlantis', to: 'Narnia' },
    }
    expect(filterStationIdsForRouteLens([], cacheMiss)).toBeNull()
  })

  it('includes a station at a corridor waypoint', () => {
    const station = { id: 'rvk-1', lat: 64.135, lon: -21.895 } // Reykjavík waypoint
    const result = filterStationIdsForRouteLens([station], RESOLVED_NORTH)
    expect(result).not.toBeNull()
    expect(result?.has('rvk-1')).toBe(true)
  })

  it('includes a station near (within radius of) a corridor waypoint', () => {
    // ~30 km from Akureyri waypoint
    const station = { id: 'near-akureyri', lat: 65.422, lon: -18.085 }
    const result = filterStationIdsForRouteLens([station], RESOLVED_NORTH)
    expect(result?.has('near-akureyri')).toBe(true)
  })

  it('excludes a station far from all waypoints', () => {
    // Vestmannaeyjar — far south of all north-road waypoints
    const station = { id: 'vestmannaeyjar', lat: 63.441, lon: -20.270 }
    const result = filterStationIdsForRouteLens([station], RESOLVED_NORTH)
    expect(result?.has('vestmannaeyjar')).toBe(false)
  })

  it('returns empty set when no stations are within corridor', () => {
    const farStations = [
      { id: 'far-1', lat: 63.441, lon: -20.270 }, // Vestmannaeyjar
      { id: 'far-2', lat: 64.255, lon: -15.207 }, // Höfn
    ]
    const result = filterStationIdsForRouteLens(farStations, RESOLVED_NORTH)
    expect(result).not.toBeNull()
    expect(result?.size).toBe(0)
  })

  it('includes station near any waypoint along the corridor', () => {
    const nearBorgarnes = { id: 'near-borgarnes', lat: 64.500, lon: -21.850 }
    const nearAkureyri = { id: 'near-akureyri', lat: 65.700, lon: -18.100 }
    const farAway = { id: 'far', lat: 63.441, lon: -20.270 }

    const result = filterStationIdsForRouteLens(
      [nearBorgarnes, nearAkureyri, farAway],
      RESOLVED_NORTH,
    )
    expect(result?.has('near-borgarnes')).toBe(true)
    expect(result?.has('near-akureyri')).toBe(true)
    expect(result?.has('far')).toBe(false)
  })

  // Provider ID collision regression (Finding 2): same station ID used in two providers
  // with different coordinates — filters must be computed separately per provider.
  it('does not bleed a corridor match across providers with the same station ID', () => {
    // Provider A (Veðurstofan): station "123" is near Reykjavík (on north route corridor)
    const vedurstofanStations = [{ id: '123', lat: 64.135, lon: -21.895 }]
    // Provider B (Vegagerðin): station "123" is far south (off north route corridor)
    const vegagerdinStations = [{ id: '123', lat: 63.441, lon: -20.270 }]

    const vedurstofanResult = filterStationIdsForRouteLens(vedurstofanStations, RESOLVED_NORTH)
    const vegagerdinResult = filterStationIdsForRouteLens(vegagerdinStations, RESOLVED_NORTH)

    // Veðurstofan "123" is on the north route — included
    expect(vedurstofanResult?.has('123')).toBe(true)
    // Vegagerðin "123" is off the north route — excluded
    expect(vegagerdinResult?.has('123')).toBe(false)
  })
})
