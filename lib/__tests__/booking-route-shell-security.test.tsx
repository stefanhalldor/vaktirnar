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

  it('does not mount analytics on the authenticated provider detail page', () => {
    mockPathname.mockReturnValue(
      '/auth-mvp/bokanir/fyrirspurn/11111111-1111-4111-8111-111111111111',
    )
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

    const providerStart = config.indexOf("source: '/auth-mvp/bokanir/fyrirspurn/:publicId'")
    const providerHeaders = config.slice(providerStart)
    expect(providerHeaders).toContain("{ key: 'Cache-Control', value: 'private, no-store' }")
    expect(providerHeaders).toContain("{ key: 'Referrer-Policy', value: 'no-referrer' }")
    expect(providerHeaders).toContain("{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }")
    // Next applies matching header rules in order; the exact no-referrer rules
    // must come after the catch-all strict-origin policy so they win.
    expect(globalStart).toBeGreaterThanOrEqual(0)
    expect(start).toBeGreaterThan(globalStart)
    expect(providerStart).toBeGreaterThan(globalStart)
  })
})
