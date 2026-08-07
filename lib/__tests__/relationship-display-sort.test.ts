import { describe, expect, it } from 'vitest'
import {
  getRelationshipDisplayName,
  sortRelationshipEntries,
} from '@/lib/relationships/display-and-sort'

describe('relationship display and canonical ordering', () => {
  it('uses private name before profile name, email, and fallback', () => {
    expect(getRelationshipDisplayName({
      privateDisplayName: '  Mamma  ',
      counterpartDisplayName: 'María',
      email: 'maria@example.com',
      fallback: 'Óþekktur',
    })).toBe('Mamma')
    expect(getRelationshipDisplayName({
      privateDisplayName: ' ',
      counterpartDisplayName: 'María',
      email: 'maria@example.com',
    })).toBe('María')
    expect(getRelationshipDisplayName({ email: 'maria@example.com' })).toBe('maria@example.com')
    expect(getRelationshipDisplayName({ fallback: 'Óþekktur' })).toBe('Óþekktur')
  })

  it('sorts with canonical Icelandic collation and numeric comparison', () => {
    const rows = [
      { id: 'thor', label: 'Þór' },
      { id: 'arni-10', label: 'Árni 10' },
      { id: 'anna', label: 'anna' },
      { id: 'arni-2', label: 'Árni 2' },
    ]

    expect(sortRelationshipEntries(rows, (row) => ({
      id: row.id,
      displayName: row.label,
    })).map((row) => row.id)).toEqual(['anna', 'arni-2', 'arni-10', 'thor'])
  })

  it('uses email and id as deterministic ties and places missing labels last', () => {
    const rows = [
      { id: 'z', label: '', email: null },
      { id: 'b', label: 'Anna', email: 'b@example.com' },
      { id: 'a', label: 'anna', email: 'a@example.com' },
      { id: 'c', label: 'Anna', email: 'a@example.com' },
    ]

    expect(sortRelationshipEntries(rows, (row) => ({
      id: row.id,
      displayName: row.label,
      email: row.email,
    })).map((row) => row.id)).toEqual(['a', 'c', 'b', 'z'])
  })

  it('returns a sorted copy without mutating the input array', () => {
    const rows = [{ id: 'b', label: 'Bjarni' }, { id: 'a', label: 'Anna' }]
    const sorted = sortRelationshipEntries(rows, (row) => ({ id: row.id, displayName: row.label }))

    expect(sorted.map((row) => row.id)).toEqual(['a', 'b'])
    expect(rows.map((row) => row.id)).toEqual(['b', 'a'])
  })
})
