/**
 * Unit tests for lib/weather/coords.ts — validateIcelandicCoords
 */

import { describe, it, expect } from 'vitest'
import { validateIcelandicCoords } from '@/lib/weather/coords'

describe('validateIcelandicCoords — valid coordinates', () => {
  it('accepts Reykjavík (64.135, -21.895)', () => {
    expect(validateIcelandicCoords(64.135, -21.895)).toBe(true)
  })

  it('accepts Akureyri (65.683, -18.1)', () => {
    expect(validateIcelandicCoords(65.683, -18.1)).toBe(true)
  })

  it('accepts Ísafjörður (66.067, -23.117)', () => {
    expect(validateIcelandicCoords(66.067, -23.117)).toBe(true)
  })

  it('accepts Jökulsárlón (64.083, -16.183)', () => {
    expect(validateIcelandicCoords(64.083, -16.183)).toBe(true)
  })

  it('accepts boundary values (lat 63, lon -25)', () => {
    expect(validateIcelandicCoords(63.0, -25.0)).toBe(true)
  })

  it('accepts boundary values (lat 67, lon -12)', () => {
    expect(validateIcelandicCoords(67.0, -12.0)).toBe(true)
  })
})

describe('validateIcelandicCoords — out of bounds', () => {
  it('rejects latitude too low (below Iceland)', () => {
    expect(validateIcelandicCoords(62.9, -21.0)).toBe(false)
  })

  it('rejects latitude too high (above Iceland)', () => {
    expect(validateIcelandicCoords(67.1, -21.0)).toBe(false)
  })

  it('rejects longitude too far east (mainland Europe)', () => {
    expect(validateIcelandicCoords(64.0, -11.9)).toBe(false)
  })

  it('rejects longitude too far west (Greenland)', () => {
    expect(validateIcelandicCoords(64.0, -25.1)).toBe(false)
  })

  it('rejects London coordinates', () => {
    expect(validateIcelandicCoords(51.5, -0.1)).toBe(false)
  })

  it('rejects New York coordinates', () => {
    expect(validateIcelandicCoords(40.7, -74.0)).toBe(false)
  })
})

describe('validateIcelandicCoords — invalid values', () => {
  it('rejects NaN lat', () => {
    expect(validateIcelandicCoords(NaN, -21.0)).toBe(false)
  })

  it('rejects NaN lon', () => {
    expect(validateIcelandicCoords(64.0, NaN)).toBe(false)
  })

  it('rejects Infinity', () => {
    expect(validateIcelandicCoords(Infinity, -21.0)).toBe(false)
  })

  it('rejects -Infinity', () => {
    expect(validateIcelandicCoords(64.0, -Infinity)).toBe(false)
  })
})
