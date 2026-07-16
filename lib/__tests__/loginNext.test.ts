import { describe, it, expect } from 'vitest'
import { resolveSafeLoginNext } from '@/lib/auth/loginNext'

describe('resolveSafeLoginNext — null/empty', () => {
  it('returns null for null', () => expect(resolveSafeLoginNext(null)).toBeNull())
  it('returns null for undefined', () => expect(resolveSafeLoginNext(undefined)).toBeNull())
  it('returns null for empty string', () => expect(resolveSafeLoginNext('')).toBeNull())
})

describe('resolveSafeLoginNext — external URLs rejected', () => {
  it('rejects https://', () => expect(resolveSafeLoginNext('https://evil.example')).toBeNull())
  it('rejects http://', () => expect(resolveSafeLoginNext('http://evil.example')).toBeNull())
  it('rejects protocol-relative //', () => expect(resolveSafeLoginNext('//evil.example')).toBeNull())
  it('rejects URL without leading slash', () => expect(resolveSafeLoginNext('evil.example/path')).toBeNull())
})

describe('resolveSafeLoginNext — untrusted internal paths rejected', () => {
  it('rejects /', () => expect(resolveSafeLoginNext('/')).toBeNull())
  it('rejects /innskraning', () => expect(resolveSafeLoginNext('/innskraning')).toBeNull())
  it('rejects /lanad-og-skilad', () => expect(resolveSafeLoginNext('/lanad-og-skilad')).toBeNull())
  it('rejects /admin', () => expect(resolveSafeLoginNext('/admin')).toBeNull())
  it('rejects path that starts with allowed prefix via different segment', () =>
    expect(resolveSafeLoginNext('/auth-mvp-fake/path')).toBeNull())
  it('rejects /vedrid-fake (strict boundary)', () => expect(resolveSafeLoginNext('/vedrid-fake')).toBeNull())
  it('rejects /vedridar (strict boundary)', () => expect(resolveSafeLoginNext('/vedridar')).toBeNull())
  it('rejects /vedridX', () => expect(resolveSafeLoginNext('/vedridX')).toBeNull())
})

describe('resolveSafeLoginNext — allowed internal paths', () => {
  it('allows /auth-mvp/heim', () => expect(resolveSafeLoginNext('/auth-mvp/heim')).toBe('/auth-mvp/heim'))
  it('allows /auth-mvp/vedrid', () => expect(resolveSafeLoginNext('/auth-mvp/vedrid')).toBe('/auth-mvp/vedrid'))
  it('allows /auth-mvp/vedrid?restore=1', () =>
    expect(resolveSafeLoginNext('/auth-mvp/vedrid?restore=1')).toBe('/auth-mvp/vedrid?restore=1'))
  it('allows /auth-mvp/vedrid/puls/stod/12345', () =>
    expect(resolveSafeLoginNext('/auth-mvp/vedrid/puls/stod/12345')).toBe('/auth-mvp/vedrid/puls/stod/12345'))
  it('allows /auth-mvp/vedrid/puls/stod/12345?returnTo=%2Fauth-mvp%2Fvedrid', () => {
    const path = '/auth-mvp/vedrid/puls/stod/12345?returnTo=%2Fauth-mvp%2Fvedrid'
    expect(resolveSafeLoginNext(path)).toBe(path)
  })
  it('allows /vedrid', () => expect(resolveSafeLoginNext('/vedrid')).toBe('/vedrid'))
  it('allows /vedrid?restore=1', () => expect(resolveSafeLoginNext('/vedrid?restore=1')).toBe('/vedrid?restore=1'))
  it('allows /vedrid/ (sub-path)', () => expect(resolveSafeLoginNext('/vedrid/')).toBe('/vedrid/'))
})
