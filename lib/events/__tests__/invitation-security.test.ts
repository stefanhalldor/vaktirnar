import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  eventGuestAttendanceReykjavikDate,
  eventGuestAttendanceSecurityContext,
} from '@/lib/events/invitation-security.server'

const ORIGINAL_SECRET = process.env.AUTH_CODE_SECRET
const BASE = {
  actorUserId: '10000000-0000-4000-8000-000000000001',
  eventId: '30000000-0000-4000-8000-000000000001',
  eventGuestId: '40000000-0000-4000-8000-000000000001',
  recipientEmail: 'First.Last@GoogleMail.com',
}

beforeEach(() => {
  process.env.AUTH_CODE_SECRET = 'event-attendance-test-secret-at-least-32-bytes'
})

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.AUTH_CODE_SECRET
  else process.env.AUTH_CODE_SECRET = ORIGINAL_SECRET
  vi.restoreAllMocks()
})

describe('event attendance invitation security context', () => {
  it.each([undefined, 'too-short'])('fails closed for a missing or short secret', (secret) => {
    if (secret === undefined) delete process.env.AUTH_CODE_SECRET
    else process.env.AUTH_CODE_SECRET = secret
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => eventGuestAttendanceSecurityContext(BASE)).toThrow('event_unavailable')
    expect(consoleError).toHaveBeenCalledWith(
      '[events/attendance] invitation security is not configured',
    )
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(BASE.recipientEmail)
  })

  it('canonicalizes equivalent Gmail addresses before deriving scoped hashes', () => {
    const first = eventGuestAttendanceSecurityContext(BASE)
    const second = eventGuestAttendanceSecurityContext({
      ...BASE,
      recipientEmail: 'firstlast@gmail.com',
    })
    expect(first).toEqual(second)
    expect(first.canonicalEmail).toBe('firstlast@gmail.com')
  })

  it('derives distinct bounded 64-hex scopes without embedding identifiers or email', () => {
    const result = eventGuestAttendanceSecurityContext(BASE)
    const hashes = [
      result.recipientHash,
      result.actorRecipientRateHash,
      result.actorTotalRateHash,
    ]
    expect(new Set(hashes).size).toBe(3)
    for (const hash of hashes) {
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
      expect(hash).not.toContain(BASE.actorUserId)
      expect(hash).not.toContain(BASE.eventId)
      expect(hash).not.toContain(BASE.eventGuestId)
      expect(hash).not.toContain('@')
    }

    const otherActor = eventGuestAttendanceSecurityContext({
      ...BASE,
      actorUserId: '10000000-0000-4000-8000-000000000002',
    })
    expect(otherActor.recipientHash).toBe(result.recipientHash)
    expect(otherActor.actorRecipientRateHash).not.toBe(result.actorRecipientRateHash)
    expect(otherActor.actorTotalRateHash).not.toBe(result.actorTotalRateHash)
  })

  it('formats the supplied instant as an exact Reykjavik calendar date', () => {
    expect(eventGuestAttendanceReykjavikDate(new Date('2026-08-16T00:00:00.000Z')))
      .toBe('2026-08-16')
    expect(eventGuestAttendanceReykjavikDate(new Date('2026-12-31T23:59:59.999Z')))
      .toBe('2026-12-31')
    expect(eventGuestAttendanceReykjavikDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
