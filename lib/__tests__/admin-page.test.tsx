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
