/**
 * RTL integration tests for app/auth-mvp/heim/page.tsx
 *
 * The page is an async server component. We call it directly as an async
 * function and render the returned element, mocking all server-side
 * dependencies (guard, next-intl/server, Supabase, Next.js primitives).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// ── Mocks (declared before dynamic import) ──────────────────────────────────

const { mockGuardTeskeidAccess } = vi.hoisted(() => ({
  mockGuardTeskeidAccess: vi.fn(),
}))
vi.mock('@/lib/auth/guard', () => ({
  guardTeskeidAccess: mockGuardTeskeidAccess,
}))

// next-intl/server: getTranslations returns a sync translator keyed by namespace
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockImplementation(async (ns: string) => {
    const T: Record<string, Record<string, string>> = {
      'teskeid.home': {
        greeting: 'Góðan dag, {displayName}',
        greetingFallback: 'Góðan dag',
        agenda: 'Hvað er á dagskrá?',
        loansTitle: 'Lánað og skilað',
        loansNewItem: 'Skrá nýjan hlut',
        recent: 'Nýlegt',
        recentSeeAll: 'Sjá allt',
        noRecent: 'Engin lán skráð enn.',
        noRecentCta: 'Skrá fyrsta lán',
        profileLink: 'Minn aðgangur',
        pendingBadgeLabel: '{count} boð í bið',
      },
      'teskeid.loans': {
        lent: 'Ég lánaði',
        borrowed: 'Ég fékk lánað',
        overdue: 'Komið fram yfir skiladag',
      },
    }
    return (key: string, params?: Record<string, string | number>) => {
      let val = T[ns]?.[key] ?? key
      if (!params) return val
      // ICU plural: {varName, plural, one {oneText} other {otherText}}
      val = val.replace(
        /\{(\w+),\s*plural,\s*one\s*\{([^}]*)\}\s*other\s*\{([^}]*)\}\}/g,
        (_: string, varName: string, oneText: string, otherText: string) => {
          const count = Number(params[varName] ?? 0)
          return (count === 1 ? oneText : otherText).replace('#', String(count))
        }
      )
      // Simple {key} substitution
      return val.replace(/\{(\w+)\}/g, (_: string, k: string) =>
        params[k] !== undefined ? String(params[k]) : `{${k}}`
      )
    }
  }),
  getLocale: vi.fn().mockResolvedValue('is'),
}))

// Supabase server client — profile chain mock
const { mockMaybeSingle, mockEq, mockSelect, mockFrom } = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn()
  const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
  const mockSelect = vi.fn(() => ({ eq: mockEq }))
  const mockFrom = vi.fn(() => ({ select: mockSelect }))
  return { mockMaybeSingle, mockEq, mockSelect, mockFrom }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: mockFrom,
  }),
}))

// Supabase admin — RPC mock and getAdmin mock
const { mockRpc, mockGetAdmin } = vi.hoisted(() => {
  const mockRpc = vi.fn()
  const mockGetAdmin = vi.fn(() => ({ rpc: mockRpc }))
  return { mockRpc, mockGetAdmin }
})
vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: mockGetAdmin,
}))

// Next.js primitives
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => React.createElement('img', { alt }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

import HeimPage from '@/app/auth-mvp/heim/page'
import { sortLoansForHome } from '@/lib/loans/sort'
import type { LoanItem, PendingInvitation } from '@/lib/loans/types'

// ── Fixtures ────────────────────────────────────────────────────────────────

const TEST_USER = { id: 'uid-1', email: 'user@example.com' }

function makeLoan(overrides: Partial<LoanItem> = {}): LoanItem {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    item_name: 'Test item',
    note: null,
    loaned_at: '2026-05-01',
    due_at: null,
    returned_at: null,
    my_role: 'lender',
    other_display_name: null,
    invitation_id: null,
    invitation_status: null,
    invitation_attempt_status: null,
    can_send_invitation: false,
    is_creator: true,
    ...overrides,
  }
}

function makeInvitation(overrides: Partial<PendingInvitation> = {}): PendingInvitation {
  return {
    invitation_id: 'inv-1',
    loan_id: 'loan-1',
    item_name: 'Test item',
    recipient_role: 'borrower',
    loaned_at: '2026-05-01',
    due_at: null,
    status: 'pending',
    expires_at: '2099-12-31T00:00:00Z',
    creator_display_name: 'Anna',
    ...overrides,
  }
}

// ── Setup helpers ────────────────────────────────────────────────────────────

function setupGuard() {
  mockGuardTeskeidAccess.mockResolvedValue({ user: TEST_USER })
}

function setupProfile(displayName: string | null) {
  mockMaybeSingle.mockResolvedValue({ data: displayName ? { display_name: displayName } : null })
}

function setupRpcs(loans: LoanItem[], invitations: PendingInvitation[]) {
  mockRpc.mockImplementation((fn: string) => {
    if (fn === 'get_my_loans') return Promise.resolve({ data: loans, error: null })
    if (fn === 'get_my_pending_invitations') return Promise.resolve({ data: invitations, error: null })
    return Promise.resolve({ data: null, error: { code: 'unknown' } })
  })
}

function setupRpcError(fn: 'get_my_loans' | 'get_my_pending_invitations') {
  mockRpc.mockImplementation((name: string) => {
    if (name === fn) return Promise.resolve({ data: null, error: { code: 'PGRST301' } })
    if (name === 'get_my_loans') return Promise.resolve({ data: [], error: null })
    if (name === 'get_my_pending_invitations') return Promise.resolve({ data: [], error: null })
    return Promise.resolve({ data: null, error: { code: 'unknown' } })
  })
}

// ── Env helpers ──────────────────────────────────────────────────────────────

let savedLoans: string | undefined
let savedAuth: string | undefined

beforeEach(() => {
  savedLoans = process.env.LOANS_ENABLED
  savedAuth = process.env.AUTH_MVP_ENABLED
  process.env.LOANS_ENABLED = 'true'
  process.env.AUTH_MVP_ENABLED = 'true'
  vi.clearAllMocks()
})

afterEach(() => {
  if (savedLoans !== undefined) process.env.LOANS_ENABLED = savedLoans
  else delete process.env.LOANS_ENABLED
  if (savedAuth !== undefined) process.env.AUTH_MVP_ENABLED = savedAuth
  else delete process.env.AUTH_MVP_ENABLED
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('HeimPage — greeting', () => {
  it('shows personalised greeting when display_name is set', async () => {
    setupGuard()
    setupProfile('Jón')
    setupRpcs([], [])
    render(await HeimPage())
    expect(screen.getByText('Góðan dag, Jón')).toBeDefined()
  })

  it('shows fallback greeting when display_name is null', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([], [])
    render(await HeimPage())
    expect(screen.getByText('Góðan dag')).toBeDefined()
  })

  it('shows fallback greeting when profile fetch throws', async () => {
    setupGuard()
    mockMaybeSingle.mockRejectedValue(new Error('db error'))
    setupRpcs([], [])
    render(await HeimPage())
    expect(screen.getByText('Góðan dag')).toBeDefined()
  })
})

describe('HeimPage — pending invitations badge', () => {
  it('shows badge with accessible label for count 1', async () => {
    setupGuard()
    setupProfile('Anna')
    setupRpcs([], [makeInvitation()])
    render(await HeimPage())
    expect(screen.getByText('1')).toBeDefined()
    expect(screen.getByLabelText('1 boð í bið')).toBeDefined()
  })

  it('shows badge with accessible label for count 2', async () => {
    setupGuard()
    setupProfile('Anna')
    setupRpcs([], [makeInvitation(), makeInvitation({ invitation_id: 'inv-2' })])
    render(await HeimPage())
    expect(screen.getByText('2')).toBeDefined()
    expect(screen.getByLabelText('2 boð í bið')).toBeDefined()
  })

  it('does not show badge when pending count is zero', async () => {
    setupGuard()
    setupProfile('Anna')
    setupRpcs([], [])
    render(await HeimPage())
    // No badge element with pending aria-label should be present
    expect(document.querySelector('[aria-label*="boð í bið"]')).toBeNull()
  })

  it('does not show badge when invitations RPC fails', async () => {
    setupGuard()
    setupProfile('Anna')
    setupRpcError('get_my_pending_invitations')
    render(await HeimPage())
    // Badge element should not be in the DOM
    expect(document.querySelector('[aria-label*="boð í bið"]')).toBeNull()
  })
})

describe('HeimPage — Nýlegt section', () => {
  it('shows at most 3 loans even when more are provided', async () => {
    setupGuard()
    setupProfile(null)
    const loans = [
      makeLoan({ id: 'a1', item_name: 'Item 1', loaned_at: '2026-05-05' }),
      makeLoan({ id: 'a2', item_name: 'Item 2', loaned_at: '2026-05-04' }),
      makeLoan({ id: 'a3', item_name: 'Item 3', loaned_at: '2026-05-03' }),
      makeLoan({ id: 'a4', item_name: 'Item 4', loaned_at: '2026-05-02' }),
    ]
    setupRpcs(loans, [])
    render(await HeimPage())
    expect(screen.getByText('Item 1')).toBeDefined()
    expect(screen.getByText('Item 2')).toBeDefined()
    expect(screen.getByText('Item 3')).toBeDefined()
    expect(screen.queryByText('Item 4')).toBeNull()
  })

  it('shows empty state when there are no loans', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([], [])
    render(await HeimPage())
    expect(screen.getByText('Engin lán skráð enn.')).toBeDefined()
  })

  it('hides Nýlegt section when loans RPC fails', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcError('get_my_loans')
    render(await HeimPage())
    expect(screen.queryByText('Nýlegt')).toBeNull()
    expect(screen.queryByText('Engin lán skráð enn.')).toBeNull()
  })

  it('hides Nýlegt section when LOANS_ENABLED is not true', async () => {
    process.env.LOANS_ENABLED = 'false'
    setupGuard()
    setupProfile('Guðrún')
    render(await HeimPage())
    expect(screen.queryByText('Nýlegt')).toBeNull()
    expect(screen.queryByText('Lánað og skilað')).toBeNull()
    // Greeting still shows
    expect(screen.getByText('Góðan dag, Guðrún')).toBeDefined()
  })
})

describe('HeimPage — sort order: loaned_at DESC, id DESC tie-breaker', () => {
  it('places the loan with the later loaned_at first', async () => {
    setupGuard()
    setupProfile(null)
    const loans = [
      makeLoan({ id: 'b1', item_name: 'Older', loaned_at: '2026-04-01' }),
      makeLoan({ id: 'b2', item_name: 'Newer', loaned_at: '2026-05-01' }),
    ]
    // Provide in reverse order to verify sorting is applied
    setupRpcs([loans[0], loans[1]], [])
    const { container } = render(await HeimPage())
    const items = container.querySelectorAll('[class*="truncate"]')
    expect(items[0].textContent).toContain('Newer')
    expect(items[1].textContent).toContain('Older')
  })

  it('uses id DESC as tie-breaker when loaned_at is equal', async () => {
    setupGuard()
    setupProfile(null)
    // '...0002' > '...0001' lexicographically → should come first
    const loans = [
      makeLoan({ id: '00000000-0000-0000-0000-000000000001', item_name: 'ID 001', loaned_at: '2026-05-01' }),
      makeLoan({ id: '00000000-0000-0000-0000-000000000002', item_name: 'ID 002', loaned_at: '2026-05-01' }),
    ]
    setupRpcs(loans, [])
    const { container } = render(await HeimPage())
    const items = container.querySelectorAll('[class*="truncate"]')
    expect(items[0].textContent).toContain('ID 002')
    expect(items[1].textContent).toContain('ID 001')
  })
})

describe('HeimPage — partial error resilience', () => {
  it('shows generic greeting but keeps loan section when profile fails', async () => {
    setupGuard()
    mockMaybeSingle.mockRejectedValue(new Error('profile db error'))
    setupRpcs([makeLoan({ item_name: 'Bók' })], [])
    render(await HeimPage())
    expect(screen.getByText('Góðan dag')).toBeDefined()
    expect(screen.getByText('Bók')).toBeDefined()
  })

  it('shows agenda section but hides Nýlegt when only loans RPC fails', async () => {
    setupGuard()
    setupProfile('Stebbi')
    setupRpcError('get_my_loans')
    render(await HeimPage())
    // Agenda section still renders (invitations RPC succeeded)
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
    // Nýlegt hidden
    expect(screen.queryByText('Nýlegt')).toBeNull()
  })
})

// ── HeimPage — getAdmin / RPC promise rejection resilience ───────────────────

describe('HeimPage — getAdmin / RPC rejection resilience', () => {
  it('renders greeting and agenda link when getAdmin() throws, hiding Nýlegt and badge', async () => {
    setupGuard()
    setupProfile('Brynja')
    mockGetAdmin.mockImplementationOnce(() => { throw new Error('admin init failed') })
    render(await HeimPage())
    // Greeting and agenda section still render
    expect(screen.getByText('Góðan dag, Brynja')).toBeDefined()
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
    // Nýlegt hidden (loansError = true)
    expect(screen.queryByText('Nýlegt')).toBeNull()
    // Badge hidden (invitationsError = true)
    expect(document.querySelector('[aria-label*="boð í bið"]')).toBeNull()
  })

  it('hides Nýlegt but shows badge when get_my_loans rejects and invitations succeed', async () => {
    setupGuard()
    setupProfile('Hildur')
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'get_my_loans') return Promise.reject(new Error('loans rpc failed'))
      if (fn === 'get_my_pending_invitations') return Promise.resolve({ data: [makeInvitation()], error: null })
      return Promise.resolve({ data: null, error: { code: 'unknown' } })
    })
    render(await HeimPage())
    // Nýlegt hidden (loansError = true)
    expect(screen.queryByText('Nýlegt')).toBeNull()
    // Badge visible (invitations succeeded with 1 item)
    expect(screen.getByLabelText('1 boð í bið')).toBeDefined()
    // Agenda link still renders
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
  })

  it('shows Nýlegt but hides badge when get_my_pending_invitations rejects and loans succeed', async () => {
    setupGuard()
    setupProfile(null)
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'get_my_loans') return Promise.resolve({ data: [makeLoan({ item_name: 'Sykur' })], error: null })
      if (fn === 'get_my_pending_invitations') return Promise.reject(new Error('invitations rpc failed'))
      return Promise.resolve({ data: null, error: { code: 'unknown' } })
    })
    render(await HeimPage())
    // Nýlegt shows (loansError = false)
    expect(screen.getByText('Nýlegt')).toBeDefined()
    expect(screen.getByText('Sykur')).toBeDefined()
    // Badge hidden (invitationsError = true)
    expect(document.querySelector('[aria-label*="boð í bið"]')).toBeNull()
  })
})

// ── sortLoansForHome — pure unit tests ────────────────────────────────────────

describe('sortLoansForHome', () => {
  it('sorts by loaned_at DESC', () => {
    const items = [
      makeLoan({ id: 'c1', loaned_at: '2026-03-01' }),
      makeLoan({ id: 'c2', loaned_at: '2026-05-01' }),
      makeLoan({ id: 'c3', loaned_at: '2026-04-01' }),
    ]
    const sorted = sortLoansForHome(items)
    expect(sorted.map((i) => i.loaned_at)).toEqual(['2026-05-01', '2026-04-01', '2026-03-01'])
  })

  it('uses id DESC as tie-breaker for equal loaned_at', () => {
    const items = [
      makeLoan({ id: '00000000-0000-0000-0000-000000000001', loaned_at: '2026-05-01' }),
      makeLoan({ id: '00000000-0000-0000-0000-000000000003', loaned_at: '2026-05-01' }),
      makeLoan({ id: '00000000-0000-0000-0000-000000000002', loaned_at: '2026-05-01' }),
    ]
    const sorted = sortLoansForHome(items)
    expect(sorted.map((i) => i.id)).toEqual([
      '00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000001',
    ])
  })

  it('does not mutate the original array', () => {
    const items = [
      makeLoan({ id: 'x1', loaned_at: '2026-03-01' }),
      makeLoan({ id: 'x2', loaned_at: '2026-05-01' }),
    ]
    const original = [...items]
    sortLoansForHome(items)
    expect(items[0].id).toBe(original[0].id)
  })
})
