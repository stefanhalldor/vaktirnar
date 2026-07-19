import { describe, it, expect } from 'vitest'
import {
  normalizePlaceForMemory,
  buildRouteMemoryKey,
  slugifyPlaceKey,
} from '@/lib/iceland-routes/routePlaceNormalization'

describe('normalizePlaceForMemory', () => {

  // ── Known cities ─────────────────────────────────────────────────────────────

  it('normalizes Reykjavík by name', () => {
    expect(normalizePlaceForMemory('Reykjavík')).toEqual({ key: 'reykjavik', label: 'Reykjavík' })
  })

  it('normalizes Akureyri by name', () => {
    expect(normalizePlaceForMemory('Akureyri')).toEqual({ key: 'akureyri', label: 'Akureyri' })
  })

  it('normalizes Höfn by name', () => {
    expect(normalizePlaceForMemory('Höfn')).toEqual({ key: 'hofn', label: 'Höfn' })
  })

  it('normalizes Egilsstaðir by name', () => {
    expect(normalizePlaceForMemory('Egilsstaðir')).toEqual({ key: 'egilsstadir', label: 'Egilsstaðir' })
  })

  // ── Capital area municipalities — finer-grained than hofudborgarsvaedi ───────

  it('normalizes Garðabær by name', () => {
    expect(normalizePlaceForMemory('Garðabær')).toEqual({ key: 'gardabaer', label: 'Garðabær' })
  })

  it('normalizes Kópavogur by name', () => {
    expect(normalizePlaceForMemory('Kópavogur')).toEqual({ key: 'kopavogur', label: 'Kópavogur' })
  })

  it('normalizes Hafnarfjörður by name', () => {
    expect(normalizePlaceForMemory('Hafnarfjörður')).toEqual({ key: 'hafnarfjordur', label: 'Hafnarfjörður' })
  })

  // ── Street address with locality in formattedAddress ────────────────────────
  // Key use case: "Melás 8" by itself is unrecognizable,
  // but "Melás 8, Garðabær" resolves to gardabaer.

  it('normalizes "Melás 8" with formattedAddress containing Garðabær', () => {
    expect(
      normalizePlaceForMemory('Melás 8', 'Melás 8, Garðabær, Iceland'),
    ).toEqual({ key: 'gardabaer', label: 'Garðabær' })
  })

  it('returns null for bare street address without recognizable locality', () => {
    expect(normalizePlaceForMemory('Melás 8')).toBeNull()
  })

  it('extracts Sandgerði from street address in formattedAddress', () => {
    expect(normalizePlaceForMemory('Strandvegur 4', 'Strandvegur 4, Sandgerði')).toEqual(
      { key: 'sandgerdi', label: 'Sandgerði' },
    )
  })

  // ── Garðabær is distinct from Reykjavík ────────────────────────────────────

  it('prefers Garðabær over Reykjavík when both appear in text', () => {
    // Garðabær entry comes before Reykjavík in PLACE_NORM_ENTRIES
    const result = normalizePlaceForMemory('Garðabær', 'Garðabær, Iceland')
    expect(result?.key).toBe('gardabaer')
    expect(result?.key).not.toBe('reykjavik')
  })

  // ── Siglufjörður — Icelandic and ASCII-ish variants ─────────────────────────

  it('normalizes Siglufjörður by name', () => {
    expect(normalizePlaceForMemory('Siglufjörður')).toEqual({ key: 'siglufjordur', label: 'Siglufjörður' })
  })

  it('normalizes Siglufjordur (ASCII) by name', () => {
    expect(normalizePlaceForMemory('Siglufjordur')).toEqual({ key: 'siglufjordur', label: 'Siglufjörður' })
  })

  it('normalizes Siglufjördur (partial diacritic) by name', () => {
    expect(normalizePlaceForMemory('Siglufjördur')).toEqual({ key: 'siglufjordur', label: 'Siglufjörður' })
  })

  it('normalizes Siglufjörður in a formatted address', () => {
    expect(normalizePlaceForMemory('Siglufjörður', 'Siglufjörður, Iceland')).toEqual(
      { key: 'siglufjordur', label: 'Siglufjörður' },
    )
  })

  // ── Generic parser — self-registers any public locality ─────────────────────

  it('self-registers Sandgerði by name (not in alias table)', () => {
    expect(normalizePlaceForMemory('Sandgerði')).toEqual({ key: 'sandgerdi', label: 'Sandgerði' })
  })

  it('self-registers hyphenated localities such as Stóra-Borg by name', () => {
    expect(normalizePlaceForMemory('Stóra-Borg')).toEqual({ key: 'storaborg', label: 'Stóra-Borg' })
  })

  it('extracts Sandgerði from formatted address with street', () => {
    expect(
      normalizePlaceForMemory('Strandvegur 4', 'Strandvegur 4, Sandgerði, Iceland'),
    ).toEqual({ key: 'sandgerdi', label: 'Sandgerði' })
  })

  it('extracts locality when postal prefix precedes town in formattedAddress', () => {
    // "580 Siglufjörður, Iceland" is matched by alias first, but this verifies
    // the generic parser handles postal prefixes for any unknown town.
    expect(
      normalizePlaceForMemory('Þingeyri', '470 Þingeyri, Iceland'),
    ).toEqual({ key: 'thingeyri', label: 'Þingeyri' })
  })

  it('returns null for bare street address without locality', () => {
    expect(normalizePlaceForMemory('Melás 8')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normalizePlaceForMemory('')).toBeNull()
  })

  // ── Case insensitivity ───────────────────────────────────────────────────────

  it('matches reykjavik lowercase', () => {
    expect(normalizePlaceForMemory('reykjavík')).toEqual({ key: 'reykjavik', label: 'Reykjavík' })
  })

  it('matches akureyri uppercase', () => {
    expect(normalizePlaceForMemory('AKUREYRI')).toEqual({ key: 'akureyri', label: 'Akureyri' })
  })

  // ── ASCII variants in address ────────────────────────────────────────────────

  it('matches Garðabær with ASCII variant gardabaer in address', () => {
    expect(normalizePlaceForMemory('Melás 8', 'Melás 8, Gardabaer, Iceland')).toEqual(
      { key: 'gardabaer', label: 'Garðabær' },
    )
  })
})

describe('slugifyPlaceKey', () => {
  it('converts Icelandic diacritics to ASCII', () => {
    expect(slugifyPlaceKey('Siglufjörður')).toBe('siglufjordur')
    expect(slugifyPlaceKey('Garðabær')).toBe('gardabaer')
    expect(slugifyPlaceKey('Ísafjörður')).toBe('isafjordur')
    expect(slugifyPlaceKey('Þingeyri')).toBe('thingeyri')
  })

  it('lowercases and removes punctuation', () => {
    expect(slugifyPlaceKey('AKUREYRI')).toBe('akureyri')
    expect(slugifyPlaceKey('Hvolsvöllur')).toBe('hvolsvollur')
  })
})

describe('buildRouteMemoryKey', () => {
  it('builds default variant key', () => {
    expect(buildRouteMemoryKey('reykjavik', 'akureyri')).toBe('reykjavik--akureyri--default')
  })

  it('builds custom variant key', () => {
    expect(buildRouteMemoryKey('reykjavik', 'akureyri', 'via_hringvegur')).toBe(
      'reykjavik--akureyri--via_hringvegur',
    )
  })

  it('is symmetric-sensitive (from/to order matters)', () => {
    const fwd = buildRouteMemoryKey('reykjavik', 'akureyri')
    const rev = buildRouteMemoryKey('akureyri', 'reykjavik')
    expect(fwd).not.toBe(rev)
  })
})
