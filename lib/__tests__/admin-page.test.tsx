import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AdminPage from '@/app/(admin)/admin/page'

vi.mock('@/components/teskeid/StatusBadge', () => ({
  StatusBadge: () => null,
}))
vi.mock('@/components/teskeid/MapFeedbackAdminSection', () => ({
  MapFeedbackAdminSection: () => <div data-testid="map-feedback-admin" />,
}))
vi.mock('@/components/teskeid/RoadGraphAdminSection', () => ({
  RoadGraphAdminSection: () => <div data-testid="road-graph-admin" />,
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

const EMPTY_USAGE = {
  fingerprinting_enabled: true,
  summary: {
    total_events: 0,
    unique_users: 0,
    active_features: 0,
    weather_route_calculations: 0,
    weather_distinct_route_pairs: 0,
    weather_final_forecasts: 0,
    weather_route_to_result_conversion: 0,
  },
  features: [],
  weather: {
    route_options_calculated: 0,
    route_options_failed: 0,
    distinct_route_pairs: 0,
    final_forecast_completed: 0,
    final_forecast_failed: 0,
    route_to_result_conversion: 0,
    route_count_buckets: {},
    curated_route_labels: {},
  },
  events_over_time: [],
}

function makeFetch(analyticsCalls: string[]) {
  return vi.fn((url: string) => {
    if (url.includes('/api/admin/analytics')) {
      analyticsCalls.push(url)
      return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_ANALYTICS) })
    }
    if (url.includes('/api/admin/teskeid-usage')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_USAGE) })
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

  it('does not render obsolete per-user Teskeið routing access controls', async () => {
    vi.stubGlobal('fetch', makeFetch([]))
    render(<AdminPage />)
    await waitFor(() => {
      expect(screen.getByText('Umönnun-aðgangur')).toBeInTheDocument()
    })
    expect(screen.queryByText('Teskeiðarleiðakerfi (v1)')).not.toBeInTheDocument()
  })

  it('renders empty list message when feature_access returns []', async () => {
    vi.stubGlobal('fetch', makeFetch([]))
    render(<AdminPage />)
    await waitFor(() => {
      // Two sections (umonnun + tengsl) each show the empty message
      expect(screen.getAllByText('Enginn í lista.').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders Gefa aðgang button', async () => {
    vi.stubGlobal('fetch', makeFetch([]))
    render(<AdminPage />)
    await waitFor(() => {
      // Two sections each have a Gefa aðgang button
      expect(screen.getAllByText('Gefa aðgang').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders the expenses private-beta control and grants the exact feature key', async () => {
    const featureCalls: Array<{ url: string; method: string; body?: string }> = []
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url.includes('/api/admin/feature-access')) {
        featureCalls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined })
      }
      if (url.includes('/api/admin/analytics')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_ANALYTICS) })
      }
      if (url.includes('/api/admin/teskeid-usage')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_USAGE) })
      }
      if (method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, email: 'beta@example.com' }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }))

    render(<AdminPage />)

    expect(await screen.findByRole('heading', { name: 'Útlagt og endurgreitt — private beta' })).toBeInTheDocument()
    await waitFor(() => {
      expect(featureCalls).toContainEqual(expect.objectContaining({
        url: '/api/admin/feature-access?feature=utlagt-og-endurgreitt',
        method: 'GET',
      }))
    })

    fireEvent.change(screen.getByRole('textbox', {
      name: 'Netfang fyrir Útlagt og endurgreitt — private beta',
    }), { target: { value: 'beta@example.com' } })
    fireEvent.click(screen.getByRole('button', {
      name: 'Gefa aðgang að Útlagt og endurgreitt — private beta',
    }))

    await waitFor(() => {
      expect(featureCalls).toContainEqual({
        url: '/api/admin/feature-access?feature=utlagt-og-endurgreitt',
        method: 'POST',
        body: JSON.stringify({ email: 'beta@example.com' }),
      })
    })
    expect(await screen.findByText('Aðgangur veittur: beta@example.com')).toBeInTheDocument()
  })

  it('revokes expenses private-beta access through the exact feature key', async () => {
    const featureCalls: Array<{ url: string; method: string; body?: string }> = []
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url.includes('/api/admin/feature-access')) {
        featureCalls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined })
      }
      if (url.includes('/api/admin/analytics')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_ANALYTICS) })
      }
      if (url.includes('/api/admin/teskeid-usage')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_USAGE) })
      }
      if (url.includes('feature=utlagt-og-endurgreitt') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ email: 'beta@example.com', granted_at: '2026-08-04T00:00:00Z' }]),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(method === 'DELETE' ? { ok: true } : []) })
    }))

    render(<AdminPage />)

    const revokeButton = await screen.findByRole('button', {
      name: 'Fjarlægja beta@example.com úr Útlagt og endurgreitt — private beta',
    })
    fireEvent.click(revokeButton)

    await waitFor(() => {
      expect(featureCalls).toContainEqual({
        url: '/api/admin/feature-access?feature=utlagt-og-endurgreitt',
        method: 'DELETE',
        body: JSON.stringify({ email: 'beta@example.com' }),
      })
    })
    expect(screen.queryByText('beta@example.com')).not.toBeInTheDocument()
  })

  it('renders the bookkeeping private-beta control and grants the exact feature key', async () => {
    const featureCalls: Array<{ url: string; method: string; body?: string }> = []
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url.includes('/api/admin/feature-access')) {
        featureCalls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined })
      }
      if (url.includes('/api/admin/analytics')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_ANALYTICS) })
      }
      if (url.includes('/api/admin/teskeid-usage')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_USAGE) })
      }
      if (method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, email: 'bookkeeper@example.com' }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }))

    render(<AdminPage />)

    const heading = await screen.findByRole('heading', { name: 'Bókhaldið — private beta' })
    expect(heading.parentElement?.textContent).toContain('BOOKKEEPING_ENABLED=true')
    await waitFor(() => {
      expect(featureCalls).toContainEqual(expect.objectContaining({
        url: '/api/admin/feature-access?feature=bokhaldid',
        method: 'GET',
      }))
    })

    fireEvent.change(screen.getByRole('textbox', {
      name: 'Netfang fyrir Bókhaldið — private beta',
    }), { target: { value: 'bookkeeper@example.com' } })
    fireEvent.click(screen.getByRole('button', {
      name: 'Gefa aðgang að Bókhaldið — private beta',
    }))

    await waitFor(() => {
      expect(featureCalls).toContainEqual({
        url: '/api/admin/feature-access?feature=bokhaldid',
        method: 'POST',
        body: JSON.stringify({ email: 'bookkeeper@example.com' }),
      })
    })
    expect(await screen.findByText('Aðgangur veittur: bookkeeper@example.com')).toBeInTheDocument()
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
      // Both sections show the generic load error
      expect(screen.getAllByText(/Náði ekki að sækja aðgangslista/).length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.queryByText('Enginn í lista.')).not.toBeInTheDocument()
  })
})
