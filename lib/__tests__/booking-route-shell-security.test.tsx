import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPathname, mockSearchParams } = vi.hoisted(() => ({
  mockPathname: vi.fn(),
  mockSearchParams: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockPathname,
  useSearchParams: mockSearchParams,
}))
vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => <div data-testid="analytics" />,
}))

import { TeskeidAnalytics } from '@/components/teskeid/TeskeidAnalytics'

describe('private booking route shell', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/')
    mockSearchParams.mockReturnValue(new URLSearchParams())
  })

  it('does not mount third-party analytics on a capability detail page', () => {
    mockPathname.mockReturnValue(
      '/bokanir/kvissbador/fyrirspurn/11111111-1111-4111-8111-111111111111',
    )
    render(<TeskeidAnalytics />)
    expect(screen.queryByTestId('analytics')).toBeNull()
  })

  it('does not mount analytics anywhere in public booking intake', () => {
    mockPathname.mockReturnValue('/bokanir/kvissbador')
    render(<TeskeidAnalytics />)
    expect(screen.queryByTestId('analytics')).toBeNull()
  })

  it.each([
    '/auth-mvp/bokanir',
    '/auth-mvp/bokanir/fyrirspurn/11111111-1111-4111-8111-111111111111',
    '/auth-mvp/bokanir/flaedi/22222222-2222-4222-8222-222222222222',
  ])('does not mount analytics anywhere in the authenticated provider namespace: %s', pathname => {
    mockPathname.mockReturnValue(pathname)
    render(<TeskeidAnalytics />)
    expect(screen.queryByTestId('analytics')).toBeNull()
  })

  it.each([
    '/auth-mvp/vidburdir',
    '/auth-mvp/vidburdir/11111111-1111-4111-8111-111111111111',
    '/auth-mvp/utlagt-og-endurgreitt',
    '/auth-mvp/utlagt-og-endurgreitt/hopar/11111111-1111-4111-8111-111111111111',
  ])('does not mount analytics on private event or expense data: %s', pathname => {
    mockPathname.mockReturnValue(pathname)
    render(<TeskeidAnalytics />)
    expect(screen.queryByTestId('analytics')).toBeNull()
  })

  it.each([
    ['/innskraning', '/bokanir/kvissbador'],
    [
      '/auth-mvp/minn-profill',
      '/bokanir/kvissbador/fyrirspurn/11111111-1111-4111-8111-111111111111',
    ],
  ])('does not retain analytics while returning from %s to Bookings', (pathname, next) => {
    mockPathname.mockReturnValue(pathname)
    mockSearchParams.mockReturnValue(new URLSearchParams({ next }))
    render(<TeskeidAnalytics />)
    expect(screen.queryByTestId('analytics')).toBeNull()
  })

  it('keeps analytics on login for an unrelated or unsafe return path', () => {
    mockPathname.mockReturnValue('/innskraning')
    mockSearchParams.mockReturnValue(new URLSearchParams({ next: '/auth-mvp/heim' }))
    render(<TeskeidAnalytics />)
    expect(screen.getByTestId('analytics')).toBeInTheDocument()
  })

  it('sets no-store, no-referrer and noindex headers on the exact detail route', () => {
    const config = readFileSync(join(process.cwd(), 'next.config.js'), 'utf8')
    const globalStart = config.indexOf("source: '/(.*)'")
    const start = config.indexOf("source: '/bokanir/:slug/fyrirspurn/:publicId'")
    const end = config.indexOf('},\n      {', start)
    const detailHeaders = config.slice(start, end)
    expect(detailHeaders).toContain("{ key: 'Cache-Control', value: 'private, no-store' }")
    expect(detailHeaders).toContain("{ key: 'Referrer-Policy', value: 'no-referrer' }")
    expect(detailHeaders).toContain("{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }")
    expect(readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8')).not.toContain(
      "from '@vercel/analytics/react'",
    )

    const providerStart = config.indexOf("source: '/auth-mvp/bokanir/:path*'")
    const providerHeaders = config.slice(providerStart)
    expect(providerHeaders).toContain("{ key: 'Cache-Control', value: 'private, no-store' }")
    expect(providerHeaders).toContain("{ key: 'Referrer-Policy', value: 'no-referrer' }")
    expect(providerHeaders).toContain("{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }")
    // Next applies matching header rules in order; the exact no-referrer rules
    // must come after the catch-all strict-origin policy so they win.
    expect(globalStart).toBeGreaterThanOrEqual(0)
    expect(start).toBeGreaterThan(globalStart)
    expect(providerStart).toBeGreaterThan(globalStart)

    for (const source of [
      "source: '/auth-mvp/vidburdir/:path*'",
      "source: '/auth-mvp/utlagt-og-endurgreitt/:path*'",
    ]) {
      const privateStart = config.indexOf(source)
      const privateHeaders = config.slice(privateStart)
      expect(privateStart).toBeGreaterThan(globalStart)
      expect(privateHeaders).toContain("{ key: 'Cache-Control', value: 'private, no-store' }")
      expect(privateHeaders).toContain("{ key: 'Referrer-Policy', value: 'no-referrer' }")
      expect(privateHeaders).toContain("{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }")
    }
  })

  it('keeps the workflow editor guarded, pending-visible and retryable on operational errors', () => {
    const routeRoot = join(
      process.cwd(),
      'app',
      'auth-mvp',
      'bokanir',
      'flaedi',
      '[serviceId]',
    )
    const page = readFileSync(join(routeRoot, 'page.tsx'), 'utf8')
    const loading = readFileSync(join(routeRoot, 'loading.tsx'), 'utf8')
    const error = readFileSync(join(routeRoot, 'error.tsx'), 'utf8')
    expect(page).toContain('guardBookingProvider()')
    expect(page).toContain('loadProviderBookingWorkflow')
    expect(page).toContain('if (!workflow) notFound()')
    expect(page).not.toContain('.catch(() => null)')
    expect(loading).toContain('BookingRouteLoading')
    expect(error).toContain('BookingErrorState')
    expect(error).toContain('providerHref="/auth-mvp/bokanir"')
  })
})
