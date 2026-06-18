import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AdminPage from '@/app/(admin)/admin/page'

vi.mock('@/components/teskeid/StatusBadge', () => ({
  StatusBadge: () => null,
}))

const EMPTY_ANALYTICS = {
  summary: {
    unique_visitors: 0,
    total_page_views: 0,
    total_votes: 0,
    total_follows: 0,
    total_submissions: 0,
  },
  top_ideas: [],
  devices: {},
  browsers: {},
  countries: {},
  top_referrers: {},
  paths: {},
}

function makeFetch(analyticsCalls: string[]) {
  return vi.fn((url: string) => {
    if (url.includes('/api/admin/analytics')) {
      analyticsCalls.push(url)
      return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_ANALYTICS) })
    }
    // feature-access and other admin endpoints return empty arrays
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
  })
}

const MIN = 60 * 1000

describe('AdminPage initialization', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('first visit: exactly one analytics request with period=5min, never period=7d', async () => {
    const analyticsCalls: string[] = []
    vi.stubGlobal('fetch', makeFetch(analyticsCalls))

    render(<AdminPage />)

    await waitFor(() => {
      expect(analyticsCalls.length).toBeGreaterThan(0)
    })

    expect(analyticsCalls).toHaveLength(1)
    expect(analyticsCalls[0]).toContain('period=5min')
    expect(analyticsCalls.every((u) => !u.includes('period=7d'))).toBe(true)
  })

  it('stored 59 min ago: exactly one analytics request with period=1h', async () => {
    localStorage.setItem('admin_last_opened', String(Date.now() - 59 * MIN))

    const analyticsCalls: string[] = []
    vi.stubGlobal('fetch', makeFetch(analyticsCalls))

    render(<AdminPage />)

    await waitFor(() => {
      expect(analyticsCalls.length).toBeGreaterThan(0)
    })

    expect(analyticsCalls).toHaveLength(1)
    expect(analyticsCalls[0]).toContain('period=1h')
  })
})

describe('AdminPage — FeatureAccessSection', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders Umönnun-aðgangur heading', async () => {
    vi.stubGlobal('fetch', makeFetch([]))
    render(<AdminPage />)
    await waitFor(() => {
      expect(screen.getByText('Umönnun-aðgangur')).toBeInTheDocument()
    })
  })

  it('renders empty list message when feature_access returns []', async () => {
    vi.stubGlobal('fetch', makeFetch([]))
    render(<AdminPage />)
    await waitFor(() => {
      expect(screen.getByText('Enginn í lista.')).toBeInTheDocument()
    })
  })

  it('renders Gefa aðgang button', async () => {
    vi.stubGlobal('fetch', makeFetch([]))
    render(<AdminPage />)
    await waitFor(() => {
      expect(screen.getByText('Gefa aðgang')).toBeInTheDocument()
    })
  })

  it('shows load error message when feature-access API returns 500', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/api/admin/analytics')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_ANALYTICS) })
      }
      if (url.includes('/api/admin/feature-access')) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Query failed' }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }))
    render(<AdminPage />)
    await waitFor(() => {
      expect(screen.getByText(/Náði ekki að sækja Umönnun-aðgang/)).toBeInTheDocument()
    })
    expect(screen.queryByText('Enginn í lista.')).not.toBeInTheDocument()
  })
})
