import { describe, it, expect } from 'vitest'
import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'

describe('normalizeEmailForAccess', () => {
  it('lowercases and trims regular email', () => {
    expect(normalizeEmailForAccess('  User@Example.com  ')).toBe('user@example.com')
  })

  it('removes dots from Gmail local-part', () => {
    expect(normalizeEmailForAccess('ariel.petur@gmail.com')).toBe('arielpetur@gmail.com')
  })

  it('treats googlemail.com as gmail.com', () => {
    expect(normalizeEmailForAccess('ariel.petur@googlemail.com')).toBe('arielpetur@gmail.com')
  })

  it('dotted and dot-free Gmail become the same canonical value', () => {
    const a = normalizeEmailForAccess('a.b.c@gmail.com')
    const b = normalizeEmailForAccess('abc@gmail.com')
    expect(a).toBe(b)
  })

  it('does not remove dots from non-Gmail local-part', () => {
    expect(normalizeEmailForAccess('a.b@example.com')).toBe('a.b@example.com')
  })

  it('a.b@example.com and ab@example.com are NOT the same', () => {
    expect(normalizeEmailForAccess('a.b@example.com')).not.toBe(
      normalizeEmailForAccess('ab@example.com'),
    )
  })

  it('returns null for empty string', () => {
    expect(normalizeEmailForAccess('')).toBeNull()
  })

  it('returns null for string without @', () => {
    expect(normalizeEmailForAccess('notanemail')).toBeNull()
  })

  it('returns null for missing local-part', () => {
    expect(normalizeEmailForAccess('@example.com')).toBeNull()
  })

  it('returns null for missing domain', () => {
    expect(normalizeEmailForAccess('user@')).toBeNull()
  })

  it('returns null for domain without dot', () => {
    expect(normalizeEmailForAccess('user@localhost')).toBeNull()
  })

  it('returns null for string with internal whitespace', () => {
    expect(normalizeEmailForAccess('us er@example.com')).toBeNull()
  })
})
