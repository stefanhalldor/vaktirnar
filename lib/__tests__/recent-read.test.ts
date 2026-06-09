import { describe, it, expect } from 'vitest'
import { parseRecentReadCookie, serializeRecentReadKeys } from '../loans/recent-read'
import { computeRecentReadKey } from '../loans/recent-read.server'
import type { LoanItem } from '../loans/types'

function makeLoan(overrides: Partial<LoanItem> = {}): LoanItem {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    item_name: 'Test item',
    note: null,
    loaned_at: '2026-05-01',
    due_at: null,
    returned_at: null,
    my_role: 'lender',
    other_display_name: null,
    invitation_id: null,
    invitation_status: null,
    invitation_attempt_status: null,
    can_send_invitation: false,
    is_creator: true,
    ...overrides,
  }
}

describe('parseRecentReadCookie', () => {
  it('returns empty set for null', () => {
    expect(parseRecentReadCookie(null).size).toBe(0)
  })

  it('returns empty set for undefined', () => {
    expect(parseRecentReadCookie(undefined).size).toBe(0)
  })

  it('returns empty set for empty string', () => {
    expect(parseRecentReadCookie('').size).toBe(0)
  })

  it('parses dot-separated 32-char hex keys', () => {
    const k1 = 'a'.repeat(32)
    const k2 = 'b'.repeat(32)
    const parsed = parseRecentReadCookie(`${k1}.${k2}`)
    expect(parsed.has(k1)).toBe(true)
    expect(parsed.has(k2)).toBe(true)
    expect(parsed.size).toBe(2)
  })

  it('filters out non-hex characters', () => {
    const validKey = 'a'.repeat(32)
    const invalidKey = 'g'.repeat(32) // 'g' is not hex
    const parsed = parseRecentReadCookie(`${validKey}.${invalidKey}`)
    expect(parsed.size).toBe(1)
    expect(parsed.has(validKey)).toBe(true)
  })

  it('filters out keys with wrong length', () => {
    const tooShort = 'a'.repeat(31)
    const tooLong = 'a'.repeat(33)
    const valid = 'a'.repeat(32)
    const parsed = parseRecentReadCookie(`${tooShort}.${tooLong}.${valid}`)
    expect(parsed.size).toBe(1)
    expect(parsed.has(valid)).toBe(true)
  })

  it('handles corrupted values gracefully', () => {
    const parsed = parseRecentReadCookie('invalid!value@here#test')
    expect(parsed.size).toBe(0)
  })
})

describe('serializeRecentReadKeys', () => {
  it('joins keys with dots', () => {
    const k1 = 'a'.repeat(32)
    const k2 = 'b'.repeat(32)
    const result = serializeRecentReadKeys(new Set([k1]), [k2])
    expect(result).toBe(`${k1}.${k2}`)
  })

  it('deduplicates keys', () => {
    const k = 'a'.repeat(32)
    const result = serializeRecentReadKeys(new Set([k]), [k])
    expect(result.split('.').length).toBe(1)
    expect(result).toBe(k)
  })

  it('caps at 80 keys, keeping the last 80', () => {
    const existing = Array.from({ length: 80 }, (_, i) =>
      i.toString(16).padStart(32, '0')
    )
    const newKey = 'f'.repeat(32)
    const result = serializeRecentReadKeys(new Set(existing), [newKey])
    const parts = result.split('.')
    expect(parts.length).toBe(80)
    expect(parts[parts.length - 1]).toBe(newKey)
    expect(parts.includes(existing[0])).toBe(false)
  })

  it('returns empty string when no keys', () => {
    expect(serializeRecentReadKeys(new Set(), [])).toBe('')
  })
})

describe('computeRecentReadKey', () => {
  it('returns a 32-char hex string', () => {
    const key = computeRecentReadKey('user-1', makeLoan())
    expect(key).toMatch(/^[0-9a-f]{32}$/)
  })

  it('is deterministic for the same inputs', () => {
    const loan = makeLoan()
    expect(computeRecentReadKey('user-1', loan)).toBe(computeRecentReadKey('user-1', loan))
  })

  it('differs for different users with the same loan', () => {
    const loan = makeLoan()
    expect(computeRecentReadKey('user-1', loan)).not.toBe(computeRecentReadKey('user-2', loan))
  })

  it('differs for different loans with the same user', () => {
    const l1 = makeLoan({ id: 'id-1', item_name: 'Alpha' })
    const l2 = makeLoan({ id: 'id-2', item_name: 'Beta' })
    expect(computeRecentReadKey('user-1', l1)).not.toBe(computeRecentReadKey('user-1', l2))
  })

  it('changes when loan transitions to overdue', () => {
    const loanCurrent = makeLoan({ due_at: '2099-12-31' })
    const loanOverdue = { ...loanCurrent, due_at: '2020-01-01' }
    expect(computeRecentReadKey('user-1', loanCurrent)).not.toBe(
      computeRecentReadKey('user-1', loanOverdue)
    )
  })

  it('changes when returned_at is set', () => {
    const loan = makeLoan({ id: 'r-test' })
    const loanReturned = { ...loan, returned_at: '2026-06-01' }
    expect(computeRecentReadKey('user-1', loan)).not.toBe(
      computeRecentReadKey('user-1', loanReturned)
    )
  })
})
