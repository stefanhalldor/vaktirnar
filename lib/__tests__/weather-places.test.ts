/**
 * Unit tests for lib/weather/places.ts
 */

import { describe, it, expect } from 'vitest'
import { resolvePlace, roundCoord } from '@/lib/weather/places'

describe('resolvePlace', () => {
  it('resolves canonical Icelandic name', () => {
    const p = resolvePlace('Reykjavík')
    expect(p).not.toBeNull()
    expect(p!.name).toBe('Reykjavík')
    expect(p!.lat).toBeCloseTo(64.135)
    expect(p!.lon).toBeCloseTo(-21.895)
  })

  it('resolves case-insensitive', () => {
    expect(resolvePlace('reykjavík')).not.toBeNull()
    expect(resolvePlace('REYKJAVÍK')).not.toBeNull()
  })

  it('resolves ASCII alias moso → Mosfellsbær', () => {
    const p = resolvePlace('moso')
    expect(p).not.toBeNull()
    expect(p!.name).toBe('Mosfellsbær')
  })

  it('resolves Icelandic alias Mósó → Mosfellsbær', () => {
    const p = resolvePlace('Mósó')
    expect(p).not.toBeNull()
    expect(p!.name).toBe('Mosfellsbær')
  })

  it('resolves mosfellsbær (with Icelandic chars)', () => {
    expect(resolvePlace('mosfellsbær')).not.toBeNull()
  })

  it('resolves selfoss', () => {
    const p = resolvePlace('selfoss')
    expect(p).not.toBeNull()
    expect(p!.name).toBe('Selfoss')
  })

  it('resolves akureyri', () => {
    expect(resolvePlace('akureyri')).not.toBeNull()
  })

  it('resolves hafnarfjörður', () => {
    expect(resolvePlace('hafnarfjörður')).not.toBeNull()
  })

  it('resolves kópavogur', () => {
    expect(resolvePlace('kópavogur')).not.toBeNull()
  })

  it('resolves garðabær', () => {
    expect(resolvePlace('garðabær')).not.toBeNull()
  })

  it('resolves borgarnes', () => {
    expect(resolvePlace('borgarnes')).not.toBeNull()
  })

  it('resolves hveragerði', () => {
    expect(resolvePlace('hveragerði')).not.toBeNull()
  })

  it('returns null for unknown place', () => {
    expect(resolvePlace('London')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(resolvePlace('')).toBeNull()
  })
})

describe('roundCoord', () => {
  it('rounds to 3 decimal places', () => {
    expect(roundCoord(64.1234567)).toBe(64.123)
  })

  it('does not change a value already at 3dp', () => {
    expect(roundCoord(64.135)).toBe(64.135)
  })

  it('handles negative coordinates', () => {
    expect(roundCoord(-21.8954321)).toBe(-21.895)
  })
})
