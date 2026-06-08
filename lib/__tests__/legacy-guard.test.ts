/**
 * Phase B tests for legacy route guarding.
 *
 * Covers:
 *  - lib/legacy/guard.ts — legacyGuard() unit tests
 *  - middleware.ts — LEGACY_ENABLED=false blocks UI and API legacy paths
 *  - defense-in-depth: actual legacy API handlers return 404 before
 *    Supabase/store is reached when LEGACY_ENABLED is unset
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ── Middleware mock ────────────────────────────────────────────────────────────

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}))

// ── Supabase server mock (used by legacy API handlers) ────────────────────────

const { mockSupabaseGetUser, mockFrom } = vi.hoisted(() => ({
  mockSupabaseGetUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockSupabaseGetUser },
    from: mockFrom,
  })),
}))

// ── Store mock (used by session API handlers) ─────────────────────────────────

const { mockCreateSession, mockGetSession } = vi.hoisted(() => ({
  mockCreateSession: vi.fn(),
  mockGetSession: vi.fn(),
}))

vi.mock('@/lib/store', () => ({
  store: {
    createSession: mockCreateSession,
    getSession: mockGetSession,
    getKidsBySession: vi.fn(),
    getLogsBySession: vi.fn(),
    createKid: vi.fn(),
    createLog: vi.fn(),
    getLog: vi.fn(),
    updateLog: vi.fn(),
    deleteLog: vi.fn(),
  },
}))

import { middleware } from '@/middleware'

// ── Request helpers ────────────────────────────────────────────────────────────

function makeReq(pathAndQuery: string): NextRequest {
  const origin = 'https://teskeid.is'
  const url = `${origin}${pathAndQuery}`
  const parsed = new URL(url)
  return {
    nextUrl: {
      pathname: parsed.pathname,
      clone(): URL { return new URL(parsed.href) },
    },
    url: parsed.href,
    cookies: { getAll: () => [], set: () => {} },
    headers: new Headers(),
  } as unknown as NextRequest
}

function makeNextReq(path: string): NextRequest {
  return new (require('next/server').NextRequest)(`https://teskeid.is${path}`)
}

function redirectedTo(res: Response): string {
  return new URL(res.headers.get('location') ?? '').pathname
}

// ── legacyGuard() unit tests ───────────────────────────────────────────────────

describe('legacyGuard()', () => {
  let legacyGuard: () => import('next/server').NextResponse | null

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('@/lib/legacy/guard')
    legacyGuard = mod.legacyGuard
  })

  it('returns 404 NextResponse when LEGACY_ENABLED is not set', () => {
    const saved = process.env.LEGACY_ENABLED
    delete process.env.LEGACY_ENABLED
    try {
      const res = legacyGuard()
      expect(res).not.toBeNull()
      expect(res?.status).toBe(404)
    } finally {
      if (saved !== undefined) process.env.LEGACY_ENABLED = saved
    }
  })

  it('returns 404 NextResponse when LEGACY_ENABLED is "false"', () => {
    const saved = process.env.LEGACY_ENABLED
    process.env.LEGACY_ENABLED = 'false'
    try {
      expect(legacyGuard()?.status).toBe(404)
    } finally {
      if (saved !== undefined) process.env.LEGACY_ENABLED = saved
      else delete process.env.LEGACY_ENABLED
    }
  })

  it('returns null when LEGACY_ENABLED is "true"', () => {
    const saved = process.env.LEGACY_ENABLED
    process.env.LEGACY_ENABLED = 'true'
    try {
      expect(legacyGuard()).toBeNull()
    } finally {
      if (saved !== undefined) process.env.LEGACY_ENABLED = saved
      else delete process.env.LEGACY_ENABLED
    }
  })
})

// ── middleware — LEGACY_ENABLED=false: legacy UI routes redirect to / ──────────

describe('middleware — LEGACY_ENABLED=false: legacy UI routes redirect to /', () => {
  let savedLegacy: string | undefined

  beforeEach(() => {
    savedLegacy = process.env.LEGACY_ENABLED
    process.env.LEGACY_ENABLED = 'false'
    process.env.AUTH_MVP_ENABLED = 'true'
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  afterEach(() => {
    if (savedLegacy !== undefined) process.env.LEGACY_ENABLED = savedLegacy
    else delete process.env.LEGACY_ENABLED
  })

  it('/home → /', async () => {
    const res = await middleware(makeReq('/home'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })

  it('/children/new → /', async () => {
    const res = await middleware(makeReq('/children/new'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })

  it('/chat/abc123 → /', async () => {
    const res = await middleware(makeReq('/chat/abc123'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })

  it('/contacts → /', async () => {
    const res = await middleware(makeReq('/contacts'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })

  it('/settings → /', async () => {
    const res = await middleware(makeReq('/settings'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })

  it('/login → /', async () => {
    const res = await middleware(makeReq('/login'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })

  it('/signup → /', async () => {
    const res = await middleware(makeReq('/signup'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })

  it('/forgot-password → /', async () => {
    const res = await middleware(makeReq('/forgot-password'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })

  it('/reset-password → /', async () => {
    const res = await middleware(makeReq('/reset-password'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })

  it('/dashboard (UI) → /', async () => {
    const res = await middleware(makeReq('/dashboard'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })

  it('/auth/callback → /', async () => {
    const res = await middleware(makeReq('/auth/callback'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })
})

// ── middleware — LEGACY_ENABLED=false: legacy API routes return 404 ────────────

describe('middleware — LEGACY_ENABLED=false: legacy API routes return 404', () => {
  let savedLegacy: string | undefined

  beforeEach(() => {
    savedLegacy = process.env.LEGACY_ENABLED
    process.env.LEGACY_ENABLED = 'false'
    process.env.AUTH_MVP_ENABLED = 'true'
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  afterEach(() => {
    if (savedLegacy !== undefined) process.env.LEGACY_ENABLED = savedLegacy
    else delete process.env.LEGACY_ENABLED
  })

  it('/api/chats → 404', async () => {
    expect((await middleware(makeReq('/api/chats'))).status).toBe(404)
  })

  it('/api/chats/abc/messages → 404', async () => {
    expect((await middleware(makeReq('/api/chats/abc/messages'))).status).toBe(404)
  })

  it('/api/children/join → 404', async () => {
    expect((await middleware(makeReq('/api/children/join'))).status).toBe(404)
  })

  it('/api/contacts → 404', async () => {
    expect((await middleware(makeReq('/api/contacts'))).status).toBe(404)
  })

  it('/api/dashboard → 404', async () => {
    expect((await middleware(makeReq('/api/dashboard'))).status).toBe(404)
  })

  it('/api/push/subscribe → 404', async () => {
    expect((await middleware(makeReq('/api/push/subscribe'))).status).toBe(404)
  })

  it('/api/cron/cleanup-chats → 404', async () => {
    expect((await middleware(makeReq('/api/cron/cleanup-chats'))).status).toBe(404)
  })
})

// ── middleware — /s and /api/sessions are legacy-blocked when disabled ────────

describe('middleware — LEGACY_ENABLED=false: /s/* and /api/sessions/* blocked', () => {
  let savedLegacy: string | undefined

  beforeEach(() => {
    savedLegacy = process.env.LEGACY_ENABLED
    delete process.env.LEGACY_ENABLED   // unset = default-deny for legacy
    process.env.AUTH_MVP_ENABLED = 'true'
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  afterEach(() => {
    if (savedLegacy !== undefined) process.env.LEGACY_ENABLED = savedLegacy
    else delete process.env.LEGACY_ENABLED
  })

  it('/s/example → / when LEGACY_ENABLED is unset', async () => {
    const res = await middleware(makeReq('/s/example'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })

  it('/s (exact) → / when LEGACY_ENABLED is unset', async () => {
    const res = await middleware(makeReq('/s'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/')
  })

  it('/api/sessions → 404 when LEGACY_ENABLED is unset', async () => {
    expect((await middleware(makeReq('/api/sessions'))).status).toBe(404)
  })

  it('/api/sessions/abc123 → 404 when LEGACY_ENABLED is unset', async () => {
    expect((await middleware(makeReq('/api/sessions/abc123'))).status).toBe(404)
  })

  it('/api/sessions/abc123/kids → 404 when LEGACY_ENABLED is unset', async () => {
    expect((await middleware(makeReq('/api/sessions/abc123/kids'))).status).toBe(404)
  })
})

// ── middleware — /s and /api/sessions pass through when LEGACY_ENABLED=true ──

describe('middleware — LEGACY_ENABLED=true: /s/* and /api/sessions/* allowed', () => {
  let savedLegacy: string | undefined

  beforeEach(() => {
    savedLegacy = process.env.LEGACY_ENABLED
    process.env.LEGACY_ENABLED = 'true'
    process.env.AUTH_MVP_ENABLED = 'true'
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  afterEach(() => {
    if (savedLegacy !== undefined) process.env.LEGACY_ENABLED = savedLegacy
    else delete process.env.LEGACY_ENABLED
  })

  it('GET /api/sessions/abc123 passes through (200, public — no auth required)', async () => {
    // /api/sessions/ (trailing slash) is in PUBLIC_PATHS so nested paths are public
    const res = await middleware(makeReq('/api/sessions/abc123'))
    expect(res.status).toBe(200)
  })

  it('POST /api/sessions (exact) requires auth → 307 to /login when unauthenticated', async () => {
    // Exact /api/sessions is NOT in PUBLIC_PATHS (only /api/sessions/ is)
    const res = await middleware(makeReq('/api/sessions'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/login')
  })

  it('/s/example passes through (200, public)', async () => {
    // /s/ is in PUBLIC_PATHS; session viewer is public when legacy is on
    const res = await middleware(makeReq('/s/example'))
    expect(res.status).toBe(200)
  })
})

// ── middleware — narrow cron: only /api/cron/cleanup-chats is blocked ─────────

describe('middleware — narrow cron: only cleanup-chats is blocked', () => {
  let savedLegacy: string | undefined

  beforeEach(() => {
    savedLegacy = process.env.LEGACY_ENABLED
    process.env.LEGACY_ENABLED = 'false'
    process.env.AUTH_MVP_ENABLED = 'true'
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  afterEach(() => {
    if (savedLegacy !== undefined) process.env.LEGACY_ENABLED = savedLegacy
    else delete process.env.LEGACY_ENABLED
  })

  it('/api/cron/cleanup-chats → 404', async () => {
    expect((await middleware(makeReq('/api/cron/cleanup-chats'))).status).toBe(404)
  })

  it('/api/cron/some-future-job is NOT blocked by legacy guard', async () => {
    // A future cron job should not be blocked by legacy; it will fall through
    // to the auth check → passes through (returns 200 via supabase middleware)
    const res = await middleware(makeReq('/api/cron/some-future-job'))
    expect(res.status).not.toBe(404)
  })
})

// ── middleware — segment-safe: similar-prefix paths are NOT blocked ────────────

describe('middleware — LEGACY_ENABLED=false: segment-safe prefix matching', () => {
  let savedLegacy: string | undefined

  beforeEach(() => {
    savedLegacy = process.env.LEGACY_ENABLED
    process.env.LEGACY_ENABLED = 'false'
    process.env.AUTH_MVP_ENABLED = 'true'
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  afterEach(() => {
    if (savedLegacy !== undefined) process.env.LEGACY_ENABLED = savedLegacy
    else delete process.env.LEGACY_ENABLED
  })

  it('/chatty is NOT blocked (/chat prefix does not match /chatty)', async () => {
    // Falls through to auth check → /login (unauthenticated)
    const res = await middleware(makeReq('/chatty'))
    expect(redirectedTo(res)).toBe('/login')
  })

  it('/contact-us is NOT blocked (/contacts prefix does not match /contact-us)', async () => {
    const res = await middleware(makeReq('/contact-us'))
    expect(redirectedTo(res)).toBe('/login')
  })
})

// ── middleware — protected Teskeið routes unaffected ──────────────────────────

describe('middleware — LEGACY_ENABLED=false: Teskeið routes unaffected', () => {
  let savedLegacy: string | undefined

  beforeEach(() => {
    savedLegacy = process.env.LEGACY_ENABLED
    process.env.LEGACY_ENABLED = 'false'
    process.env.AUTH_MVP_ENABLED = 'true'
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  afterEach(() => {
    if (savedLegacy !== undefined) process.env.LEGACY_ENABLED = savedLegacy
    else delete process.env.LEGACY_ENABLED
  })

  it('/auth-mvp/heim (unauthenticated) → /innskraning, not /', async () => {
    const res = await middleware(makeReq('/auth-mvp/heim'))
    expect(redirectedTo(res)).toBe('/innskraning')
  })

  it('/innskraning passes through (200)', async () => {
    expect((await middleware(makeReq('/innskraning'))).status).toBe(200)
  })

  it('/api/auth-mvp/request-code passes through (200)', async () => {
    expect((await middleware(makeReq('/api/auth-mvp/request-code'))).status).toBe(200)
  })
})

// ── middleware — LEGACY_ENABLED=true passthrough ──────────────────────────────

describe('middleware — LEGACY_ENABLED=true: legacy routes are NOT blocked', () => {
  let savedLegacy: string | undefined

  beforeEach(() => {
    savedLegacy = process.env.LEGACY_ENABLED
    process.env.LEGACY_ENABLED = 'true'
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  afterEach(() => {
    if (savedLegacy !== undefined) process.env.LEGACY_ENABLED = savedLegacy
    else delete process.env.LEGACY_ENABLED
  })

  it('/home passes legacy check → auth redirect to /login', async () => {
    const res = await middleware(makeReq('/home'))
    expect(res.status).toBe(307)
    expect(redirectedTo(res)).toBe('/login')
  })

  it('/api/chats passes legacy check (not 404)', async () => {
    expect((await middleware(makeReq('/api/chats'))).status).not.toBe(404)
  })
})

// ── Defense-in-depth: actual handlers return 404 when LEGACY_ENABLED is unset ─

describe('defense-in-depth: legacy API handlers return 404 before touching Supabase', () => {
  let savedLegacy: string | undefined

  beforeEach(() => {
    savedLegacy = process.env.LEGACY_ENABLED
    delete process.env.LEGACY_ENABLED
    vi.clearAllMocks()
    // If Supabase were reached, getUser would return a user — but it must NOT be called
    mockSupabaseGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  afterEach(() => {
    if (savedLegacy !== undefined) process.env.LEGACY_ENABLED = savedLegacy
    else delete process.env.LEGACY_ENABLED
  })

  it('GET /api/chats → 404, Supabase never called', async () => {
    const { GET } = await import('@/app/api/chats/route')
    const req = makeNextReq('/api/chats')
    const res = await GET()
    expect(res.status).toBe(404)
    expect(mockSupabaseGetUser).not.toHaveBeenCalled()
  })

  it('POST /api/chats → 404, Supabase never called', async () => {
    const { POST } = await import('@/app/api/chats/route')
    const req = makeNextReq('/api/chats')
    const res = await POST(req)
    expect(res.status).toBe(404)
    expect(mockSupabaseGetUser).not.toHaveBeenCalled()
  })

  it('PATCH /api/chats/[id] → 404, Supabase never called', async () => {
    const { PATCH } = await import('@/app/api/chats/[id]/route')
    const req = makeNextReq('/api/chats/some-id')
    const res = await PATCH(req, { params: Promise.resolve({ id: 'some-id' }) })
    expect(res.status).toBe(404)
    expect(mockSupabaseGetUser).not.toHaveBeenCalled()
  })

  it('PUT /api/children/[id] → 404, Supabase never called', async () => {
    const { PUT } = await import('@/app/api/children/[id]/route')
    const req = makeNextReq('/api/children/child-id')
    const res = await PUT(req, { params: Promise.resolve({ id: 'child-id' }) })
    expect(res.status).toBe(404)
    expect(mockSupabaseGetUser).not.toHaveBeenCalled()
  })

  it('DELETE /api/contacts/[id] → 404, Supabase never called', async () => {
    const { DELETE } = await import('@/app/api/contacts/[id]/route')
    const req = makeNextReq('/api/contacts/contact-id')
    const res = await DELETE(req, { params: Promise.resolve({ id: 'contact-id' }) })
    expect(res.status).toBe(404)
    expect(mockSupabaseGetUser).not.toHaveBeenCalled()
  })

  it('POST /api/children/join → 404, Supabase never called', async () => {
    const { POST } = await import('@/app/api/children/join/route')
    const req = makeNextReq('/api/children/join')
    const res = await POST(req)
    expect(res.status).toBe(404)
    expect(mockSupabaseGetUser).not.toHaveBeenCalled()
  })

  it('DELETE /api/push/subscribe → 404, Supabase never called', async () => {
    const { DELETE } = await import('@/app/api/push/subscribe/route')
    const req = makeNextReq('/api/push/subscribe')
    const res = await DELETE(req)
    expect(res.status).toBe(404)
    expect(mockSupabaseGetUser).not.toHaveBeenCalled()
  })
})

// ── Defense-in-depth: session handlers return 404 before touching store ───────

describe('defense-in-depth: session API handlers return 404 before touching store', () => {
  let savedLegacy: string | undefined

  beforeEach(() => {
    savedLegacy = process.env.LEGACY_ENABLED
    delete process.env.LEGACY_ENABLED
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (savedLegacy !== undefined) process.env.LEGACY_ENABLED = savedLegacy
    else delete process.env.LEGACY_ENABLED
  })

  it('POST /api/sessions → 404, store.createSession never called', async () => {
    const { POST } = await import('@/app/api/sessions/route')
    const req = makeNextReq('/api/sessions')
    const res = await POST(req)
    expect(res.status).toBe(404)
    expect(mockCreateSession).not.toHaveBeenCalled()
  })

  it('GET /api/sessions/[id] → 404, store.getSession never called', async () => {
    const { GET } = await import('@/app/api/sessions/[id]/route')
    const req = makeNextReq('/api/sessions/abc123')
    const res = await GET(req, { params: Promise.resolve({ id: 'abc123' }) })
    expect(res.status).toBe(404)
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('POST /api/sessions/[id]/kids → 404, store.getSession never called', async () => {
    const { POST } = await import('@/app/api/sessions/[id]/kids/route')
    const req = makeNextReq('/api/sessions/abc123/kids')
    const res = await POST(req, { params: Promise.resolve({ id: 'abc123' }) })
    expect(res.status).toBe(404)
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('POST /api/sessions/[id]/logs → 404, store.getSession never called', async () => {
    const { POST } = await import('@/app/api/sessions/[id]/logs/route')
    const req = makeNextReq('/api/sessions/abc123/logs')
    const res = await POST(req, { params: Promise.resolve({ id: 'abc123' }) })
    expect(res.status).toBe(404)
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('PATCH /api/sessions/[id]/logs/[logId] → 404, store.getSession never called', async () => {
    const { PATCH } = await import('@/app/api/sessions/[id]/logs/[logId]/route')
    const req = makeNextReq('/api/sessions/abc123/logs/some-log-id')
    const res = await PATCH(req, { params: Promise.resolve({ id: 'abc123', logId: 'some-log-id' }) })
    expect(res.status).toBe(404)
    expect(mockGetSession).not.toHaveBeenCalled()
  })
})
