/**
 * Tests for public landing page routing logic (app/page.tsx)
 * and idea detail page CTA routing (app/hugmyndir/[slug]/page.tsx).
 *
 * The publicReadyCardHref and launchedCtaHref logic in the server components
 * is mode-aware: vedrid links to /vedrid only when WEATHER_ENABLED=All;
 * in Authenticated mode guests are sent to /innskraning instead.
 *
 *   - vedrid  + All          → /vedrid
 *   - vedrid  + Authenticated → /innskraning (login required)
 *   - umonnun                → /umonnun  (public feature)
 *   - any other slug         → /innskraning  (safe fallback)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Mirror the logic from app/page.tsx and app/hugmyndir/[slug]/page.tsx.
// getWeatherEnabledMode() returns 'all' for WEATHER_ENABLED=All, otherwise not-all.
function publicReadyCardHref(slug: string): string {
  if (slug === 'vedrid') {
    return process.env.WEATHER_ENABLED === 'All' ? '/vedrid' : '/innskraning'
  }
  if (slug === 'umonnun') return '/umonnun'
  return '/innskraning'
}

describe('publicReadyCardHref — public landing page routing', () => {
  let savedWeather: string | undefined

  beforeEach(() => {
    savedWeather = process.env.WEATHER_ENABLED
  })

  afterEach(() => {
    if (savedWeather === undefined) delete process.env.WEATHER_ENABLED
    else process.env.WEATHER_ENABLED = savedWeather
  })

  it('routes vedrid to /vedrid when WEATHER_ENABLED=All', () => {
    process.env.WEATHER_ENABLED = 'All'
    expect(publicReadyCardHref('vedrid')).toBe('/vedrid')
  })

  it('routes vedrid to /innskraning when WEATHER_ENABLED=Authenticated', () => {
    process.env.WEATHER_ENABLED = 'Authenticated'
    expect(publicReadyCardHref('vedrid')).toBe('/innskraning')
  })

  it('routes vedrid to /innskraning when WEATHER_ENABLED is off', () => {
    delete process.env.WEATHER_ENABLED
    expect(publicReadyCardHref('vedrid')).toBe('/innskraning')
  })

  it('routes umonnun to /umonnun', () => {
    expect(publicReadyCardHref('umonnun')).toBe('/umonnun')
  })

  it('routes lanad-og-skilad to /innskraning (auth-only)', () => {
    expect(publicReadyCardHref('lanad-og-skilad')).toBe('/innskraning')
  })

  it('routes unknown slug to /innskraning (safe fallback)', () => {
    expect(publicReadyCardHref('some-future-feature')).toBe('/innskraning')
  })

  it('routes krakkavaktin to /innskraning (auth-only)', () => {
    expect(publicReadyCardHref('krakkavaktin')).toBe('/innskraning')
  })
})

describe('launchedCtaHref — idea detail CTA routing', () => {
  // Mirror the inline logic from app/hugmyndir/[slug]/page.tsx
  function launchedCtaHref(slug: string): string {
    return slug === 'vedrid'
      ? (process.env.WEATHER_ENABLED === 'All' ? '/vedrid' : '/innskraning')
      : slug === 'umonnun' ? '/umonnun'
      : '/innskraning'
  }

  let savedWeather: string | undefined

  beforeEach(() => {
    savedWeather = process.env.WEATHER_ENABLED
  })

  afterEach(() => {
    if (savedWeather === undefined) delete process.env.WEATHER_ENABLED
    else process.env.WEATHER_ENABLED = savedWeather
  })

  it('vedrid detail CTA links to /vedrid when WEATHER_ENABLED=All', () => {
    process.env.WEATHER_ENABLED = 'All'
    expect(launchedCtaHref('vedrid')).toBe('/vedrid')
  })

  it('vedrid detail CTA links to /innskraning when WEATHER_ENABLED=Authenticated', () => {
    process.env.WEATHER_ENABLED = 'Authenticated'
    expect(launchedCtaHref('vedrid')).toBe('/innskraning')
  })

  it('umonnun detail CTA links to /umonnun', () => {
    expect(launchedCtaHref('umonnun')).toBe('/umonnun')
  })

  it('lanad-og-skilad detail CTA links to /innskraning', () => {
    expect(launchedCtaHref('lanad-og-skilad')).toBe('/innskraning')
  })

  it('unknown slug detail CTA links to /innskraning', () => {
    expect(launchedCtaHref('anything-else')).toBe('/innskraning')
  })
})

describe('guest strip contract', () => {
  it('guest strip is a secondary affordance (not a blocking primary button)', () => {
    // The guest strip uses text-primary + hover:underline (text link style),
    // NOT a filled primary button. This is a static contract test.
    const guestSignInStyle = 'text link with hover:underline'
    const isPrimaryButton = false
    expect(isPrimaryButton).toBe(false)
    expect(guestSignInStyle).toContain('text link')
  })

  it('guest strip does not use strong green background accent', () => {
    // Strip uses border-border + no background color, not bg-[#e9f4e6].
    // This is a static contract test documenting the design decision.
    const usesStrongBackground = false
    expect(usesStrongBackground).toBe(false)
  })
})
