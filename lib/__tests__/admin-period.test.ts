import { describe, it, expect } from 'vitest'
import { pickPeriod, resolveInitialPeriod } from '@/lib/admin/period'

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

// ── resolveInitialPeriod ──────────────────────────────────────────────────────

describe('resolveInitialPeriod', () => {
  const NOW = 1_700_000_000_000 // fixed reference timestamp

  // 1. No stored timestamp (first visit)
  it('null stored (first visit) → 5min', () => {
    expect(resolveInitialPeriod(null, NOW)).toBe('5min')
  })

  // 2. Recent valid timestamp
  it('stored 2 min ago → 5min', () => {
    expect(resolveInitialPeriod(String(NOW - 2 * MIN), NOW)).toBe('5min')
  })

  // 3. 59-minute elapsed
  it('stored 59 min ago → 1h', () => {
    expect(resolveInitialPeriod(String(NOW - 59 * MIN), NOW)).toBe('1h')
  })

  // 4. Invalid (non-numeric) stored value
  it('non-numeric stored value → 5min', () => {
    expect(resolveInitialPeriod('not-a-number', NOW)).toBe('5min')
  })

  // 5. Future timestamp (stored > now → elapsed negative)
  it('future timestamp → 5min', () => {
    expect(resolveInitialPeriod(String(NOW + 60 * 1000), NOW)).toBe('5min')
  })

  // 6. Proves analytics can never open with legacy '7d' default.
  // The guard (periodReady) ensures the analytics effect waits; since
  // resolveInitialPeriod never returns '7d' for fallback cases, even if
  // the guard were bypassed the period would be '5min', not '7d'.
  it('first visit resolves to 5min, never to the legacy 7d default', () => {
    expect(resolveInitialPeriod(null, NOW)).not.toBe('7d')
  })

  it('invalid stored value resolves to 5min, never to 7d', () => {
    expect(resolveInitialPeriod('garbage', NOW)).not.toBe('7d')
  })

  it('future timestamp resolves to 5min, never to 7d', () => {
    expect(resolveInitialPeriod(String(NOW + 9999), NOW)).not.toBe('7d')
  })

  // Hardened edge cases (empty/whitespace/non-finite/negative stored values)
  it('empty string stored → 5min', () => {
    expect(resolveInitialPeriod('', NOW)).toBe('5min')
  })

  it('whitespace-only stored → 5min', () => {
    expect(resolveInitialPeriod('   ', NOW)).toBe('5min')
  })

  it('negative stored timestamp → 5min', () => {
    expect(resolveInitialPeriod('-1', NOW)).toBe('5min')
  })

  it('"Infinity" stored → 5min', () => {
    expect(resolveInitialPeriod('Infinity', NOW)).toBe('5min')
  })

  // Additional boundary: valid 30-day elapsed
  it('stored exactly 30 d ago → 30d', () => {
    expect(resolveInitialPeriod(String(NOW - 30 * D), NOW)).toBe('30d')
  })

  // elapsed === 0 (same-millisecond re-open)
  it('stored at exactly now (0 ms elapsed) → 5min', () => {
    expect(resolveInitialPeriod(String(NOW), NOW)).toBe('5min')
  })
})
