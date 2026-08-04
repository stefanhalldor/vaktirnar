/**
 * Regression tests for middleware.ts
 *
 * Tests alias redirects (Teskeið login route canonicalization) and the
 * unauthenticated private-route redirect. No mobile user-agent is involved;
 * the logic is purely pathname and session based.
 *
 * NextRequest is not imported here. Instead we build a minimal request-
 * compatible object (NextRequest is a thin wrapper over Request), which lets
 * us test the middleware in jsdom without the Edge Runtime.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}))

import { middleware } from '@/middleware'
import { config } from '@/middleware'

// ── Request helper ─────────────────────────────────────────────────────────

/**
 * Builds a minimal NextRequest-compatible object.
 * pathname is used verbatim (may be percent-encoded or Unicode),
 * mirroring how Next.js passes the raw request pathname to middleware.
 */
function makeReq(pathAndQuery: string): NextRequest {
  const origin = 'https://teskeid.is'
  const url = `${origin}${pathAndQuery}`
  const parsed = new URL(url)
  return {
    nextUrl: {
      // pathname is the path-only part (no query), mirroring NextURL.pathname
      pathname: parsed.pathname,
      clone(): URL {
        // clone() returns a mutable URL with full href (path + query)
        return new URL(parsed.href)
      },
    },
    url: parsed.href,
    cookies: { getAll: () => [], set: () => {} },
    headers: new Headers(),
  } as unknown as NextRequest
}

// ── Helpers ────────────────────────────────────────────────────────────────

function redirectedTo(res: Response): string {
  const loc = res.headers.get('location') ?? ''
  return new URL(loc).pathname
}

describe('middleware — public static and road-intelligence boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('excludes manifest.json from auth middleware so the static JSON is served', () => {
    expect(config.matcher[0]).toContain('manifest.json')
  })

  it.each([
    '/api/teskeid/road-intelligence/station-markers',
    '/api/teskeid/road-intelligence/road-segments?bbox=-24,63,-13,67',
    '/api/teskeid/road-intelligence/road-surface?bbox=-24,63,-13,67',
    '/api/teskeid/road-intelligence/map-proxy?source=vegakerfi&bbox=1,2,3,4',
    '/api/teskeid/road-intelligence/lmi-tile?z=1&x=1&y=1',
    '/api/teskeid/weather/forecast-history',
    '/api/cron/warm-metno-points',
    '/api/cron/refresh-hms-places',
  ])('lets exact public weather read reach its own handler: %s', async path => {
    const res = await middleware(makeReq(path))
    expect(res.status).toBe(200)
  })

  it('lets weather route-candidate reach its authenticated route handler', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/travel/route-candidate'))
    expect(res.status).toBe(200)
  })

  it('does not open road-intelligence subpaths by prefix', async () => {
    const res = await middleware(makeReq('/api/teskeid/road-intelligence/road-segments/private'))
    expect(res.status).toBe(401)
  })

  it('does not open forecast-history subpaths by prefix', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/forecast-history/private'))
    expect(res.status).toBe(401)
  })
})

// ── Teskeið login alias redirects ──────────────────────────────────────────

describe('middleware — Teskeið login alias redirects', () => {
  let savedAuthMvp: string | undefined

  beforeEach(() => {
    savedAuthMvp = process.env.AUTH_MVP_ENABLED
    // Enable auth-mvp so /auth-mvp/* aliases pass the feature-flag check
    process.env.AUTH_MVP_ENABLED = 'true'
  })

  afterEach(() => {
    if (savedAuthMvp !== undefined) process.env.AUTH_MVP_ENABLED = savedAuthMvp
    else delete process.env.AUTH_MVP_ENABLED
  })

  it('/auth-mvp/innskraning (no accent) → /innskraning', async () => {
    const res = await middleware(makeReq('/auth-mvp/innskraning'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/innskraning')
  })

  it('/auth-mvp/innskráning (Unicode á) → /innskraning', async () => {
    const res = await middleware(makeReq('/auth-mvp/innskráning'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/innskraning')
  })

  it('/auth-mvp/innskr%C3%A1ning (percent-encoded) → /innskraning', async () => {
    // pathname arrives percent-encoded when some proxies/browsers encode it
    const res = await middleware(makeReq('/auth-mvp/innskr%C3%A1ning'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/innskraning')
  })

  it('/innskráning (Unicode á) → /innskraning', async () => {
    const res = await middleware(makeReq('/innskráning'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/innskraning')
  })

  it('query string is preserved through the alias redirect', async () => {
    const res = await middleware(makeReq('/auth-mvp/innskraning?next=%2Fminn-profill'))
    expect(res.status).toBe(307)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.pathname).toBe('/innskraning')
    expect(loc.search).toBe('?next=%2Fminn-profill')
  })
})

// ── Feature flag takes priority over alias redirect ────────────────────────

describe('middleware — feature flag takes priority over alias redirect', () => {
  let savedAuthMvp: string | undefined

  beforeEach(() => {
    savedAuthMvp = process.env.AUTH_MVP_ENABLED
    process.env.AUTH_MVP_ENABLED = 'false'
  })

  afterEach(() => {
    if (savedAuthMvp !== undefined) process.env.AUTH_MVP_ENABLED = savedAuthMvp
    else delete process.env.AUTH_MVP_ENABLED
  })

  it('AUTH_MVP_ENABLED=false + /auth-mvp/innskr%C3%A1ning → / (not canonical login)', async () => {
    const res = await middleware(makeReq('/auth-mvp/innskr%C3%A1ning'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })
})

describe('middleware — agent collaboration emergency switch', () => {
  let savedAuthMvp: string | undefined
  let savedAgentCollaboration: string | undefined

  beforeEach(() => {
    savedAuthMvp = process.env.AUTH_MVP_ENABLED
    savedAgentCollaboration = process.env.AGENT_COLLABORATION_ENABLED
    process.env.AUTH_MVP_ENABLED = 'true'
    process.env.AGENT_COLLABORATION_ENABLED = 'false'
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  afterEach(() => {
    if (savedAuthMvp === undefined) delete process.env.AUTH_MVP_ENABLED
    else process.env.AUTH_MVP_ENABLED = savedAuthMvp
    if (savedAgentCollaboration === undefined) delete process.env.AGENT_COLLABORATION_ENABLED
    else process.env.AGENT_COLLABORATION_ENABLED = savedAgentCollaboration
  })

  it('hides the UI and browser API before session work when disabled', async () => {
    const page = await middleware(makeReq('/auth-mvp/samvinna'))
    expect(page.status).toBe(307)
    expect(redirectedTo(page)).toBe('/')

    const api = await middleware(makeReq('/api/auth-mvp/agent-collaboration/bootstrap'))
    expect(api.status).toBe(404)
    expect(api.headers.get('cache-control')).toBe('private, no-store')
    expect(await api.json()).toEqual({ error: 'not_found' })
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('blocks every exact bearer bridge path before session work when disabled', async () => {
    for (const action of ['pair', 'claim', 'heartbeat', 'complete', 'fail']) {
      const response = await middleware(makeReq(`/api/agent-bridge/v1/${action}`))
      expect(response.status).toBe(404)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    }
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('accepts only exact lowercase true and keeps sibling routes out of the gate', async () => {
    process.env.AGENT_COLLABORATION_ENABLED = 'TRUE'
    expect((await middleware(makeReq('/api/agent-bridge/v1/claim'))).status).toBe(404)

    const sibling = await middleware(makeReq('/api/agent-bridge/v1-extra/claim'))
    expect(sibling.status).toBe(401)

    process.env.AGENT_COLLABORATION_ENABLED = 'true'
    expect((await middleware(makeReq('/api/agent-bridge/v1/claim'))).status).toBe(200)
  })
})

// ── Private Krakkavaktin route → /login ────────────────────────────────────

describe('middleware — unauthenticated private route', () => {
  let savedLegacy: string | undefined
  let savedAgentCollaboration: string | undefined

  beforeEach(() => {
    savedLegacy = process.env.LEGACY_ENABLED
    savedAgentCollaboration = process.env.AGENT_COLLABORATION_ENABLED
    // Must enable legacy so /home passes the legacy block and hits the auth check
    process.env.LEGACY_ENABLED = 'true'
    process.env.AGENT_COLLABORATION_ENABLED = 'true'
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  afterEach(() => {
    if (savedLegacy !== undefined) process.env.LEGACY_ENABLED = savedLegacy
    else delete process.env.LEGACY_ENABLED
    if (savedAgentCollaboration !== undefined) process.env.AGENT_COLLABORATION_ENABLED = savedAgentCollaboration
    else delete process.env.AGENT_COLLABORATION_ENABLED
  })

  it('unauthenticated request to /home → /login (not /innskraning)', async () => {
    const res = await middleware(makeReq('/home'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/login')
  })

  it('unauthenticated API request → 401 JSON, not redirect', async () => {
    const res = await middleware(makeReq('/api/teskeid/lanad-og-skilad'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('allows the exact public place search API to reach its own access gates', async () => {
    const res = await middleware(makeReq('/api/place/search?q=reykjavik'))
    expect(res.status).toBe(200)
  })

  it('keeps place-search subpaths private', async () => {
    const res = await middleware(makeReq('/api/place/search/private?q=reykjavik'))
    expect(res.status).toBe(401)
  })

  it('opens only the exact bearer-auth agent bridge routes', async () => {
    for (const action of ['pair', 'claim', 'heartbeat', 'complete', 'fail']) {
      expect((await middleware(makeReq(`/api/agent-bridge/v1/${action}`))).status).toBe(200)
    }
    expect((await middleware(makeReq('/api/agent-bridge/v1/claim/private'))).status).toBe(401)
    expect((await middleware(makeReq('/api/agent-bridge/v1-extra/claim'))).status).toBe(401)
  })

  it('allows only the exact current-location label API through', async () => {
    expect((await middleware(makeReq('/api/place/reverse-geocode'))).status).toBe(200)
    expect((await middleware(makeReq('/api/place/reverse-geocode/private'))).status).toBe(401)
    expect((await middleware(makeReq('/api/place/reverse-geocode-extra'))).status).toBe(401)
  })
})

// ── /auth-mvp/heim and private route redirects ─────────────────────────────

describe('middleware — /auth-mvp/heim route', () => {
  let savedAuthMvp: string | undefined
  let savedLoans: string | undefined

  beforeEach(() => {
    savedAuthMvp = process.env.AUTH_MVP_ENABLED
    savedLoans = process.env.LOANS_ENABLED
    process.env.AUTH_MVP_ENABLED = 'true'
    process.env.LOANS_ENABLED = 'true'
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (savedAuthMvp !== undefined) process.env.AUTH_MVP_ENABLED = savedAuthMvp
    else delete process.env.AUTH_MVP_ENABLED
    if (savedLoans !== undefined) process.env.LOANS_ENABLED = savedLoans
    else delete process.env.LOANS_ENABLED
  })

  it('unauthenticated /auth-mvp/heim → /innskraning', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await middleware(makeReq('/auth-mvp/heim'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/innskraning')
  })

  it('unauthenticated /auth-mvp/minn-profill → /innskraning', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await middleware(makeReq('/auth-mvp/minn-profill'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/innskraning')
  })

  it('unauthenticated /auth-mvp/lanad-og-skilad → /innskraning', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await middleware(makeReq('/auth-mvp/lanad-og-skilad'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/innskraning')
  })

  it('authenticated user on /innskraning passes through (session check is page-level)', async () => {
    // Middleware no longer redirects authenticated users from /innskraning.
    // Redirect to /auth-mvp/heim runs in the page server component when AUTH_MVP_ENABLED=true.
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await middleware(makeReq('/innskraning'))
    expect(res.status).toBe(200)
  })

  it('authenticated user on /auth-mvp/nyr-adgangur passes through', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await middleware(makeReq('/auth-mvp/nyr-adgangur'))
    expect(res.status).toBe(200)
  })

  it('unauthenticated /auth-mvp/minn-profill → /innskraning with ?next= preserving full path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await middleware(makeReq('/auth-mvp/minn-profill'))
    expect(res.status).toBe(307)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.pathname).toBe('/innskraning')
    expect(loc.searchParams.get('next')).toBe('/auth-mvp/minn-profill')
  })

  it('unauthenticated /auth-mvp/minn-profill?tab=lyklar → /innskraning?next= preserving query', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await middleware(makeReq('/auth-mvp/minn-profill?tab=lyklar'))
    expect(res.status).toBe(307)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.pathname).toBe('/innskraning')
    expect(loc.searchParams.get('next')).toBe('/auth-mvp/minn-profill?tab=lyklar')
  })

  it('unauthenticated /auth-mvp/lanad-og-skilad → /innskraning with ?next= preserving full path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await middleware(makeReq('/auth-mvp/lanad-og-skilad'))
    expect(res.status).toBe(307)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.pathname).toBe('/innskraning')
    expect(loc.searchParams.get('next')).toBe('/auth-mvp/lanad-og-skilad')
  })

  it('unauthenticated /auth-mvp/vedrid/puls/stod/1234 → /innskraning with ?next= preserving full path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await middleware(makeReq('/auth-mvp/vedrid/puls/stod/1234'))
    expect(res.status).toBe(307)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.pathname).toBe('/innskraning')
    expect(loc.searchParams.get('next')).toBe('/auth-mvp/vedrid/puls/stod/1234')
  })

  it('unauthenticated /auth-mvp/vedrid/puls/stod/1234?returnTo=... → /innskraning?next= preserving query', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const returnTo = encodeURIComponent('/vedrid?stationId=1234')
    const res = await middleware(makeReq(`/auth-mvp/vedrid/puls/stod/1234?returnTo=${returnTo}`))
    expect(res.status).toBe(307)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.pathname).toBe('/innskraning')
    const next = loc.searchParams.get('next')
    // next should contain the full original path+query
    expect(next).toBe(`/auth-mvp/vedrid/puls/stod/1234?returnTo=${returnTo}`)
  })
})

// ── / (root): authenticated users → /auth-mvp/heim ────────────────────────

describe('middleware — root / redirect for authenticated users', () => {
  let savedAuthMvp: string | undefined

  beforeEach(() => {
    savedAuthMvp = process.env.AUTH_MVP_ENABLED
    process.env.AUTH_MVP_ENABLED = 'true'
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (savedAuthMvp !== undefined) process.env.AUTH_MVP_ENABLED = savedAuthMvp
    else delete process.env.AUTH_MVP_ENABLED
  })

  it('authenticated user on / → /auth-mvp/heim', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await middleware(makeReq('/'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/auth-mvp/heim')
  })

  it('unauthenticated user on / → passes through (200)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await middleware(makeReq('/'))
    expect(res.status).toBe(200)
  })

  it('authenticated user on / with AUTH_MVP_ENABLED=false → passes through (200)', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await middleware(makeReq('/'))
    expect(res.status).toBe(200)
  })
})

// ── /stillingar/tengsl — TENGSL_ENABLED kill + auth guard ─────────────────

describe('middleware — expenses global switch and auth boundary', () => {
  let savedAuthMvp: string | undefined
  let savedExpenses: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedAuthMvp = process.env.AUTH_MVP_ENABLED
    savedExpenses = process.env.EXPENSES_ENABLED
    process.env.AUTH_MVP_ENABLED = 'true'
  })

  afterEach(() => {
    if (savedAuthMvp === undefined) delete process.env.AUTH_MVP_ENABLED
    else process.env.AUTH_MVP_ENABLED = savedAuthMvp
    if (savedExpenses === undefined) delete process.env.EXPENSES_ENABLED
    else process.env.EXPENSES_ENABLED = savedExpenses
  })

  it('redirects an expense deep-link when the global switch is not exactly true', async () => {
    delete process.env.EXPENSES_ENABLED
    const res = await middleware(makeReq('/auth-mvp/utlagt-og-endurgreitt/hopar/group-id'))
    expect(redirectedTo(res)).toBe('/')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('preserves an unauthenticated expense deep-link in the login next parameter', async () => {
    process.env.EXPENSES_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await middleware(makeReq('/auth-mvp/utlagt-og-endurgreitt/hopar/group-id'))
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/innskraning')
    expect(location.searchParams.get('next')).toBe('/auth-mvp/utlagt-og-endurgreitt/hopar/group-id')
  })

  it('lets an authenticated request reach the server-side per-user guard', async () => {
    process.env.EXPENSES_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const res = await middleware(makeReq('/auth-mvp/utlagt-og-endurgreitt'))
    expect(res.status).toBe(200)
  })
})

describe('middleware — /stillingar/tengsl kill-switch and auth guard', () => {
  let savedAuthMvp: string | undefined
  let savedTengsl: string | undefined

  beforeEach(() => {
    savedAuthMvp = process.env.AUTH_MVP_ENABLED
    savedTengsl  = process.env.TENGSL_ENABLED
    process.env.AUTH_MVP_ENABLED = 'true'
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (savedAuthMvp !== undefined) process.env.AUTH_MVP_ENABLED = savedAuthMvp
    else delete process.env.AUTH_MVP_ENABLED
    if (savedTengsl !== undefined) process.env.TENGSL_ENABLED = savedTengsl
    else delete process.env.TENGSL_ENABLED
  })

  it('TENGSL_ENABLED=false + /stillingar/tengsl → / (kill-switch, before auth check)', async () => {
    process.env.TENGSL_ENABLED = 'false'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await middleware(makeReq('/stillingar/tengsl'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })

  it('TENGSL_ENABLED=true + unauthenticated /stillingar/tengsl → /innskraning', async () => {
    process.env.TENGSL_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await middleware(makeReq('/stillingar/tengsl'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/innskraning')
  })

  it('TENGSL_ENABLED=true + unauthenticated /stillingar/tengsl/some-id → /innskraning with ?next= preserving full path', async () => {
    process.env.TENGSL_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await middleware(makeReq('/stillingar/tengsl/some-id'))
    expect(res.status).toBe(307)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.pathname).toBe('/innskraning')
    expect(loc.searchParams.get('next')).toBe('/stillingar/tengsl/some-id')
  })

  it('TENGSL_ENABLED=true + authenticated /stillingar/tengsl → passes through (200)', async () => {
    process.env.TENGSL_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await middleware(makeReq('/stillingar/tengsl'))
    expect(res.status).toBe(200)
  })

  it('TENGSL_ENABLED=true + authenticated /stillingar/tengsl/some-id → passes through (200)', async () => {
    process.env.TENGSL_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await middleware(makeReq('/stillingar/tengsl/some-id'))
    expect(res.status).toBe(200)
  })
})

// ── Canonical /innskraning passes through without redirect ─────────────────

describe('middleware — canonical /innskraning passes through', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('/innskraning (canonical, unauthenticated) — no redirect loop, returns 200', async () => {
    const res = await middleware(makeReq('/innskraning'))
    // Canonical is in PUBLIC_PATHS and not in alias block — passes through.
    expect(res.status).toBe(200)
  })
})

// ── /api/cron/warm-vedurstofan — no browser session required ───────────────

describe('middleware — /api/cron/warm-vedurstofan is public (no browser session)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('unauthenticated request passes through middleware (200)', async () => {
    // Route handler enforces CRON_SECRET; middleware must not block first
    const res = await middleware(makeReq('/api/cron/warm-vedurstofan'))
    expect(res.status).toBe(200)
  })

  it('does not open /api/cron/* broadly — unknown cron paths still get 401', async () => {
    const res = await middleware(makeReq('/api/cron/some-unknown-cron'))
    expect(res.status).toBe(401)
  })

  it('prefix variant /api/cron/warm-vedurstofan/foo is not public — gets 401', async () => {
    const res = await middleware(makeReq('/api/cron/warm-vedurstofan/foo'))
    expect(res.status).toBe(401)
  })

  it('prefix variant /api/cron/warm-vedurstofan-extra is not public — gets 401', async () => {
    const res = await middleware(makeReq('/api/cron/warm-vedurstofan-extra'))
    expect(res.status).toBe(401)
  })
})

// ── /api/teskeid/weather/vedurstofan/stations — public (exact match only) ──

describe('middleware — /api/teskeid/weather/vedurstofan/stations is public (exact match)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('unauthenticated request to exact path passes through (200)', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/vedurstofan/stations'))
    expect(res.status).toBe(200)
  })

  it('sub-path /stations/foo is not public — gets 401', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/vedurstofan/stations/foo'))
    expect(res.status).toBe(401)
  })

  it('prefix variant /stations-extra is not public — gets 401', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/vedurstofan/stations-extra'))
    expect(res.status).toBe(401)
  })
})

// ── /api/teskeid/weather/vegagerdin/current — public (exact match only) ─────

describe('middleware — /api/teskeid/weather/vegagerdin/current is public (exact match)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('unauthenticated request to exact path passes through (200)', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/vegagerdin/current'))
    expect(res.status).toBe(200)
  })

  it('sub-path /current/foo is not public — gets 401', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/vegagerdin/current/foo'))
    expect(res.status).toBe(401)
  })

  it('prefix variant /current-extra is not public — gets 401', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/vegagerdin/current-extra'))
    expect(res.status).toBe(401)
  })
})

// ── /api/teskeid/weather/vedurpuls/route-preview — public (exact match only) ──

describe('middleware — /api/teskeid/weather/vedurpuls/route-preview is public (exact match)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('unauthenticated request to exact path passes through (200)', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/vedurpuls/route-preview'))
    expect(res.status).toBe(200)
  })

  it('sub-path /route-preview/foo is not public — gets 401', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/vedurpuls/route-preview/foo'))
    expect(res.status).toBe(401)
  })

  it('prefix variant /route-preview-extra is not public — gets 401', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/vedurpuls/route-preview-extra'))
    expect(res.status).toBe(401)
  })
})

// ── /dashboard is not public — requires authentication ─────────────────────

describe('middleware — /dashboard requires authentication', () => {
  let savedLegacy: string | undefined

  beforeEach(() => {
    savedLegacy = process.env.LEGACY_ENABLED
    process.env.LEGACY_ENABLED = 'true'
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (savedLegacy !== undefined) process.env.LEGACY_ENABLED = savedLegacy
    else delete process.env.LEGACY_ENABLED
  })

  it('unauthenticated /dashboard → /login (not in PUBLIC_PATHS)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await middleware(makeReq('/dashboard'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/login')
  })

  it('LEGACY_ENABLED=false + /dashboard → / (legacy block takes priority)', async () => {
    process.env.LEGACY_ENABLED = 'false'
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await middleware(makeReq('/dashboard'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })

  it('/s/[id] is still public (session viewer route)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await middleware(makeReq('/s/abc123'))
    expect(res.status).toBe(200)
  })
})

// ── Preview path pattern matching ──────────────────────────────────────────

describe('middleware — Veðurpúls station preview routes are public (regex match)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('Veðurstofan station preview is public for unauthenticated users', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/vedurpuls/stations/31392/preview'))
    expect(res.status).toBe(200)
  })

  it('Vegagerðin station preview is public for unauthenticated users', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/vedurpuls/vegagerdin/stations/V1234/preview'))
    expect(res.status).toBe(200)
  })

  it('non-preview Veðurstofan station sub-path is NOT public (returns 401 for API)', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/vedurpuls/stations/31392/other'))
    expect(res.status).toBe(401)
  })

  it('non-preview Vegagerðin station sub-path is NOT public (returns 401 for API)', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/vedurpuls/vegagerdin/stations/V1234/other'))
    expect(res.status).toBe(401)
  })

  it('Veðurstofan stations listing without stationId segment is NOT matched (returns 401)', async () => {
    // /stations/preview without a stationId segment does not match the pattern
    const res = await middleware(makeReq('/api/teskeid/weather/vedurpuls/stations/preview'))
    expect(res.status).toBe(401)
  })
})

// ── Authenticated /vedrid canonicalization → /auth-mvp/vedrid ──────────────

describe('middleware — authenticated /vedrid canonicalization', () => {
  let savedAuthMvp: string | undefined

  beforeEach(() => {
    savedAuthMvp = process.env.AUTH_MVP_ENABLED
    process.env.AUTH_MVP_ENABLED = 'true'
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (savedAuthMvp !== undefined) process.env.AUTH_MVP_ENABLED = savedAuthMvp
    else delete process.env.AUTH_MVP_ENABLED
  })

  it('authenticated /vedrid → /auth-mvp/vedrid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await middleware(makeReq('/vedrid'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/auth-mvp/vedrid')
  })

  it('authenticated /vedrid?saveDefaults=10%2C13 → /auth-mvp/vedrid preserving query string', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await middleware(makeReq('/vedrid?saveDefaults=10%2C13'))
    expect(res.status).toBe(307)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.pathname).toBe('/auth-mvp/vedrid')
    expect(loc.search).toBe('?saveDefaults=10%2C13')
  })

  it('unauthenticated /vedrid passes through (200)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await middleware(makeReq('/vedrid'))
    expect(res.status).toBe(200)
  })

  it('authenticated /vedrid/ferdalagid → /auth-mvp/vedrid/ferdalagid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await middleware(makeReq('/vedrid/ferdalagid'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/auth-mvp/vedrid/ferdalagid')
  })

  it('authenticated /auth-mvp/vedrid does not redirect (no loop)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await middleware(makeReq('/auth-mvp/vedrid'))
    expect(res.status).toBe(200)
  })
})

