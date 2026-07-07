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

// ── Private Krakkavaktin route → /login ────────────────────────────────────

describe('middleware — unauthenticated private route', () => {
  let savedLegacy: string | undefined

  beforeEach(() => {
    savedLegacy = process.env.LEGACY_ENABLED
    // Must enable legacy so /home passes the legacy block and hits the auth check
    process.env.LEGACY_ENABLED = 'true'
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  afterEach(() => {
    if (savedLegacy !== undefined) process.env.LEGACY_ENABLED = savedLegacy
    else delete process.env.LEGACY_ENABLED
  })

  it('unauthenticated request to /home → /login (not /innskraning)', async () => {
    const res = await middleware(makeReq('/home'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/login')
  })

  it('unauthenticated API request → 401 JSON, not redirect', async () => {
    const res = await middleware(makeReq('/api/teskeid/weather/travel'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('unauthenticated place search API → 401 JSON, not redirect', async () => {
    const res = await middleware(makeReq('/api/place/search?q=reykjavik'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
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

