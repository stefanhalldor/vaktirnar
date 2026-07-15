/**
 * Tests for Veðurstofan cycle freshness helpers.
 *
 * Cadence: 3-hour UTC (00, 03, 06, 09, 12, 15, 18, 21).
 * Grace window: 10 minutes after a cycle boundary.
 */

import { describe, it, expect } from 'vitest'
import {
  getExpectedVedurstofanCycleIso,
  getNextVedurstofanCycleIso,
  isVedurstofanCycleFresh,
  VEDURSTOFAN_CADENCE_MS,
  VEDURSTOFAN_GRACE_MS,
} from '@/lib/weather/vedurstofanFreshness'

const d = (iso: string) => new Date(iso)

describe('getExpectedVedurstofanCycleIso', () => {
  it('returns 12:00 for 12:05 UTC', () => {
    expect(getExpectedVedurstofanCycleIso(d('2026-07-14T12:05:00Z'))).toBe('2026-07-14T12:00:00.000Z')
  })

  it('returns 12:00 for 14:59 UTC', () => {
    expect(getExpectedVedurstofanCycleIso(d('2026-07-14T14:59:59Z'))).toBe('2026-07-14T12:00:00.000Z')
  })

  it('returns 15:00 at exactly 15:00 UTC', () => {
    expect(getExpectedVedurstofanCycleIso(d('2026-07-14T15:00:00Z'))).toBe('2026-07-14T15:00:00.000Z')
  })

  it('returns 00:00 for 02:59 UTC', () => {
    expect(getExpectedVedurstofanCycleIso(d('2026-07-14T02:59:00Z'))).toBe('2026-07-14T00:00:00.000Z')
  })

  it('returns 21:00 for 23:59 UTC', () => {
    expect(getExpectedVedurstofanCycleIso(d('2026-07-14T23:59:00Z'))).toBe('2026-07-14T21:00:00.000Z')
  })
})

describe('getNextVedurstofanCycleIso', () => {
  it('returns 15:00 when current cycle is 12:00', () => {
    expect(getNextVedurstofanCycleIso(d('2026-07-14T12:05:00Z'))).toBe('2026-07-14T15:00:00.000Z')
  })

  it('returns next-day 00:00 when current cycle is 21:00', () => {
    expect(getNextVedurstofanCycleIso(d('2026-07-14T23:00:00Z'))).toBe('2026-07-15T00:00:00.000Z')
  })
})

describe('isVedurstofanCycleFresh', () => {
  it('returns false for null atimeIso', () => {
    expect(isVedurstofanCycleFresh(null, d('2026-07-14T12:30:00Z'))).toBe(false)
  })

  it('returns false for invalid atimeIso', () => {
    expect(isVedurstofanCycleFresh('not-a-date', d('2026-07-14T12:30:00Z'))).toBe(false)
  })

  it('returns true when atimeIso matches current cycle (well past grace)', () => {
    // Now is 13:00 UTC, expected cycle is 12:00, atime is 12:00 — fresh
    expect(isVedurstofanCycleFresh('2026-07-14T12:00:00.000Z', d('2026-07-14T13:00:00Z'))).toBe(true)
  })

  it('returns false when atimeIso is from previous cycle (well past grace)', () => {
    // Now is 13:00 UTC, expected cycle is 12:00, atime is 09:00 — stale
    expect(isVedurstofanCycleFresh('2026-07-14T09:00:00.000Z', d('2026-07-14T13:00:00Z'))).toBe(false)
  })

  it('returns true within grace window for immediately previous cycle (09:00 when now=12:05)', () => {
    // Grace: accept current OR immediately previous cycle
    const now = new Date('2026-07-14T12:00:00Z')
    const withinGrace = new Date(now.getTime() + VEDURSTOFAN_GRACE_MS - 1000)
    expect(isVedurstofanCycleFresh('2026-07-14T09:00:00.000Z', withinGrace)).toBe(true)
  })

  it('returns false within grace window for two cycles ago (06:00 when now=12:05)', () => {
    // Grace does NOT accept arbitrarily old data — only prev cycle
    const now = new Date('2026-07-14T12:00:00Z')
    const withinGrace = new Date(now.getTime() + VEDURSTOFAN_GRACE_MS - 1000)
    expect(isVedurstofanCycleFresh('2026-07-14T06:00:00.000Z', withinGrace)).toBe(false)
  })

  it('returns false within grace window for yesterday old data (atime=yesterday 21:00 when now=12:05)', () => {
    const now = new Date('2026-07-14T12:00:00Z')
    const withinGrace = new Date(now.getTime() + VEDURSTOFAN_GRACE_MS - 1000)
    expect(isVedurstofanCycleFresh('2026-07-13T21:00:00.000Z', withinGrace)).toBe(false)
  })

  it('returns false just after grace window with previous-cycle data (09:00 at 12:11)', () => {
    // After grace ends, previous cycle is no longer acceptable
    const now = new Date('2026-07-14T12:00:00Z')
    const afterGrace = new Date(now.getTime() + VEDURSTOFAN_GRACE_MS + 1000)
    expect(isVedurstofanCycleFresh('2026-07-14T09:00:00.000Z', afterGrace)).toBe(false)
  })

  it('returns false just after grace window with old-cycle data', () => {
    const now = new Date('2026-07-14T12:00:00Z')
    const afterGrace = new Date(now.getTime() + VEDURSTOFAN_GRACE_MS + 1000)
    expect(isVedurstofanCycleFresh('2026-07-14T09:00:00.000Z', afterGrace)).toBe(false)
  })

  it('returns true for atime 1 minute before expected cycle (provider rounding)', () => {
    // atime is 11:59 instead of 12:00 — within the ±1min tolerance
    expect(isVedurstofanCycleFresh('2026-07-14T11:59:00.000Z', d('2026-07-14T13:00:00Z'))).toBe(true)
  })

  it('cadence constant is 3 hours', () => {
    expect(VEDURSTOFAN_CADENCE_MS).toBe(3 * 60 * 60 * 1000)
  })

  it('grace constant is 10 minutes', () => {
    expect(VEDURSTOFAN_GRACE_MS).toBe(10 * 60 * 1000)
  })
})
