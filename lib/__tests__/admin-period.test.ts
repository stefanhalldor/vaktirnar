import { describe, it, expect } from 'vitest'
import { pickPeriod } from '@/lib/admin/period'

const MIN = 60 * 1000
const H = 60 * MIN
const D = 24 * H

describe('pickPeriod', () => {
  // ── Exact boundary values (upper edge of each bucket) ──────────────────────

  it('exactly 5 min → 5min', () => {
    expect(pickPeriod(5 * MIN)).toBe('5min')
  })

  it('exactly 10 min → 10min', () => {
    expect(pickPeriod(10 * MIN)).toBe('10min')
  })

  it('exactly 15 min → 15min', () => {
    expect(pickPeriod(15 * MIN)).toBe('15min')
  })

  it('exactly 30 min → 30min', () => {
    expect(pickPeriod(30 * MIN)).toBe('30min')
  })

  it('exactly 1 h → 1h', () => {
    expect(pickPeriod(1 * H)).toBe('1h')
  })

  it('exactly 2 h → 2h', () => {
    expect(pickPeriod(2 * H)).toBe('2h')
  })

  it('exactly 6 h → 6h', () => {
    expect(pickPeriod(6 * H)).toBe('6h')
  })

  it('exactly 12 h → 12h', () => {
    expect(pickPeriod(12 * H)).toBe('12h')
  })

  it('exactly 24 h → 24h', () => {
    expect(pickPeriod(24 * H)).toBe('24h')
  })

  it('exactly 7 d → 7d', () => {
    expect(pickPeriod(7 * D)).toBe('7d')
  })

  it('exactly 30 d → 30d', () => {
    expect(pickPeriod(30 * D)).toBe('30d')
  })

  // ── One millisecond past each boundary (moves to next bucket) ──────────────

  it('5 min + 1 ms → 10min', () => {
    expect(pickPeriod(5 * MIN + 1)).toBe('10min')
  })

  it('30 min + 1 ms → 1h', () => {
    expect(pickPeriod(30 * MIN + 1)).toBe('1h')
  })

  it('30 d + 1 ms → all', () => {
    expect(pickPeriod(30 * D + 1)).toBe('all')
  })

  // ── Spec-highlighted boundary cases ────────────────────────────────────────

  it('59 min → 1h (smallest period covering 59 min)', () => {
    expect(pickPeriod(59 * MIN)).toBe('1h')
  })

  it('31 d → all (older than 30 d)', () => {
    expect(pickPeriod(31 * D)).toBe('all')
  })

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('0 ms → 5min (just opened)', () => {
    expect(pickPeriod(0)).toBe('5min')
  })

  it('1 ms → 5min (well within 5 min)', () => {
    expect(pickPeriod(1)).toBe('5min')
  })

  it('very large value → all', () => {
    expect(pickPeriod(365 * D)).toBe('all')
  })
})
