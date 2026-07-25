import { describe, it, expect } from 'vitest'
import { buildPrototypeLegacyRedirectUrl } from '@/lib/weather/prototypeRedirect'

describe('buildPrototypeLegacyRedirectUrl — no query', () => {
  it('returns /vedrid for empty params', () =>
    expect(buildPrototypeLegacyRedirectUrl({})).toBe('/vedrid'))

  it('ignores undefined values from the Next.js searchParams contract', () =>
    expect(buildPrototypeLegacyRedirectUrl({ view: undefined })).toBe('/vedrid'))
})

describe('buildPrototypeLegacyRedirectUrl — single params', () => {
  it('preserves a single string param', () =>
    expect(buildPrototypeLegacyRedirectUrl({ view: 'map' })).toBe('/vedrid?view=map'))

  it('preserves route restore state', () =>
    expect(
      buildPrototypeLegacyRedirectUrl({ context: 'route', view: 'map', restoreRoute: '1' }),
    ).toBe('/vedrid?context=route&view=map&restoreRoute=1'))
})

describe('buildPrototypeLegacyRedirectUrl — repeated keys', () => {
  it('preserves repeated key as array', () =>
    expect(buildPrototypeLegacyRedirectUrl({ tag: ['a', 'b'] })).toBe('/vedrid?tag=a&tag=b'))

  it('mixed single and repeated keys', () =>
    expect(
      buildPrototypeLegacyRedirectUrl({ view: 'map', tag: ['a', 'b'] }),
    ).toBe('/vedrid?view=map&tag=a&tag=b'))
})

describe('buildPrototypeLegacyRedirectUrl — special characters', () => {
  it('URL-encodes spaces', () =>
    expect(buildPrototypeLegacyRedirectUrl({ q: 'hello world' })).toBe('/vedrid?q=hello+world'))

  it('URL-encodes slashes in values', () => {
    const result = buildPrototypeLegacyRedirectUrl({ returnTo: '/auth-mvp/vedrid' })
    expect(result).toBe('/vedrid?returnTo=%2Fauth-mvp%2Fvedrid')
  })

  it('URL-encodes ampersands in values', () =>
    expect(buildPrototypeLegacyRedirectUrl({ q: 'a&b' })).toBe('/vedrid?q=a%26b'))
})

describe('buildPrototypeLegacyRedirectUrl — target is always /vedrid', () => {
  it('never redirects to /auth-mvp/vedrid (middleware handles auth canonicalization)', () =>
    expect(buildPrototypeLegacyRedirectUrl({ restoreRoute: '1' })).toMatch(/^\/vedrid/))

  it('does not contain /auth-mvp in the output', () =>
    expect(buildPrototypeLegacyRedirectUrl({ context: 'route' })).not.toContain('/auth-mvp'))
})
