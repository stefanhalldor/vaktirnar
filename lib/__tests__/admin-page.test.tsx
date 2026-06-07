import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
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
      return Promise.resolve({ json: () => Promise.resolve(EMPTY_ANALYTICS) })
    }
    return Promise.resolve({ json: () => Promise.resolve([]) })
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
