import { describe, it, expect } from 'vitest'
import { computeLoanChanges } from '@/lib/loans/event-diff'

const BASE = { item_name: 'Bók', note: null as string | null, loaned_at: '2026-01-01', due_at: null as string | null }

describe('computeLoanChanges', () => {
  it('returns [] when all fields identical', () => {
    expect(computeLoanChanges(BASE, BASE)).toEqual([])
  })

  it('detects item_name changed', () => {
    const changes = computeLoanChanges(BASE, { ...BASE, item_name: 'Borðtennisrekki' })
    expect(changes).toEqual([{ field: 'item_name', changeType: 'changed', oldValue: 'Bók', newValue: 'Borðtennisrekki' }])
  })

  it('detects loaned_at changed', () => {
    const changes = computeLoanChanges(BASE, { ...BASE, loaned_at: '2026-03-15' })
    expect(changes).toEqual([{ field: 'loaned_at', changeType: 'changed', oldValue: '2026-01-01', newValue: '2026-03-15' }])
  })

  it('detects due_at added (null -> date)', () => {
    const changes = computeLoanChanges(BASE, { ...BASE, due_at: '2026-12-31' })
    expect(changes).toEqual([{ field: 'due_at', changeType: 'added', newValue: '2026-12-31' }])
  })

  it('detects due_at removed (date -> null)', () => {
    const before = { ...BASE, due_at: '2026-12-31' }
    const changes = computeLoanChanges(before, { ...before, due_at: null })
    expect(changes).toEqual([{ field: 'due_at', changeType: 'removed', oldValue: '2026-12-31' }])
  })

  it('detects due_at changed (date -> date)', () => {
    const before = { ...BASE, due_at: '2026-06-01' }
    const changes = computeLoanChanges(before, { ...before, due_at: '2026-12-31' })
    expect(changes).toEqual([{ field: 'due_at', changeType: 'changed', oldValue: '2026-06-01', newValue: '2026-12-31' }])
  })

  it('detects note added (null -> text) with content', () => {
    const changes = computeLoanChanges(BASE, { ...BASE, note: 'Merkt með rauðu bandi' })
    expect(changes).toEqual([{ field: 'note', changeType: 'added', newValue: 'Merkt með rauðu bandi' }])
  })

  it('detects note removed (text -> null) with content', () => {
    const before = { ...BASE, note: 'Merkt með rauðu bandi' }
    const changes = computeLoanChanges(before, { ...before, note: null })
    expect(changes).toEqual([{ field: 'note', changeType: 'removed', oldValue: 'Merkt með rauðu bandi' }])
  })

  it('detects note changed (text -> text) with content', () => {
    const before = { ...BASE, note: 'Gamalt' }
    const changes = computeLoanChanges(before, { ...before, note: 'Nýtt' })
    expect(changes).toEqual([{ field: 'note', changeType: 'changed', oldValue: 'Gamalt', newValue: 'Nýtt' }])
  })

  it('returns multiple changes when multiple fields differ', () => {
    const after = { item_name: 'Nýr hlutur', note: 'Nýtt', loaned_at: '2026-01-01', due_at: '2026-12-31' }
    const changes = computeLoanChanges(BASE, after)
    const fields = changes.map((c) => c.field)
    expect(fields).toContain('item_name')
    expect(fields).toContain('due_at')
    expect(fields).toContain('note')
    expect(fields).not.toContain('loaned_at')
  })

  it('does not check loaned_at or due_at when not present in after (narrow edit)', () => {
    const before = { item_name: 'Bók', note: null as string | null }
    const after  = { item_name: 'Bók', note: 'Nýtt' }
    const changes = computeLoanChanges(before, after)
    expect(changes).toHaveLength(1)
    expect(changes[0].field).toBe('note')
  })
})
