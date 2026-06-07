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

  it('/auth-mvp/innskráning (Unicode á) → /auth-mvp/innskraning', async () => {
    const res = await middleware(makeReq('/auth-mvp/innskráning'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/auth-mvp/innskraning')
  })

  it('/auth-mvp/innskr%C3%A1ning (percent-encoded) → /auth-mvp/innskraning', async () => {
    // pathname arrives percent-encoded when some proxies/browsers encode it
    const res = await middleware(makeReq('/auth-mvp/innskr%C3%A1ning'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/auth-mvp/innskraning')
  })

  it('/innskraning (no accent) → /auth-mvp/innskraning', async () => {
    const res = await middleware(makeReq('/innskraning'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/auth-mvp/innskraning')
  })

  it('/innskráning (Unicode á) → /auth-mvp/innskraning', async () => {
    const res = await middleware(makeReq('/innskráning'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/auth-mvp/innskraning')
  })

  it('query string is preserved through the alias redirect', async () => {
    const res = await middleware(makeReq('/innskraning?next=%2Fminn-profill'))
    expect(res.status).toBe(307)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.pathname).toBe('/auth-mvp/innskraning')
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
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('unauthenticated request to /home → /login (not /auth-mvp/innskraning)', async () => {
    const res = await middleware(makeReq('/home'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/login')
  })
})

// ── Canonical route is not redirected ──────────────────────────────────────

describe('middleware — canonical route passes through alias check', () => {
  let savedAuthMvp: string | undefined

  beforeEach(() => {
    savedAuthMvp = process.env.AUTH_MVP_ENABLED
    process.env.AUTH_MVP_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  afterEach(() => {
    if (savedAuthMvp !== undefined) process.env.AUTH_MVP_ENABLED = savedAuthMvp
    else delete process.env.AUTH_MVP_ENABLED
  })

  it('/auth-mvp/innskraning (canonical, public) passes through alias check — no redirect loop', async () => {
    const res = await middleware(makeReq('/auth-mvp/innskraning'))
    // Canonical is in PUBLIC_PATHS: no auth redirect. Alias block does not fire.
    // NextResponse.next() returns 200.
    expect(res.status).toBe(200)
  })
})

