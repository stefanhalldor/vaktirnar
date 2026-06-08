/**
 * RTL integration tests for app/auth-mvp/heim/page.tsx
 *
 * The page is an async server component. We call it directly as an async
 * function and render the returned element, mocking all server-side
 * dependencies (guard, next-intl/server, Supabase, Next.js primitives).
 */

import { createHash } from 'crypto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ── Mocks (declared before dynamic import) ──────────────────────────────────

const { mockGuardTeskeidSession } = vi.hoisted(() => ({
  mockGuardTeskeidSession: vi.fn(),
}))
vi.mock('@/lib/auth/guard', () => ({
  guardTeskeidSession: mockGuardTeskeidSession,
}))

const { mockCheckFeatureAccess } = vi.hoisted(() => ({
  mockCheckFeatureAccess: vi.fn(),
}))
vi.mock('@/lib/loans/guard', () => ({
  checkFeatureAccess: mockCheckFeatureAccess,
}))

// next-intl/server: getTranslations returns a sync translator keyed by namespace
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockImplementation(async (ns: string) => {
    const T: Record<string, Record<string, string>> = {
      'teskeid.home': {
        greeting: 'Góðan dag, {displayName}',
        greetingFallback: 'Góðan dag',
        featuresTitle: 'Teskeiðar',
        loansTitle: 'Lánað og skilað',
        upcoming: 'Væntanlegt',
        upcomingEmail: 'Póstflóðið einfaldað',
        upcomingExpenses: 'Útlagt og endurgreitt',
        upcomingPartner: 'Maki/kæró',
        upcomingWeather: 'Veðrið',
        upcomingKidsShift: 'Fyrsta vakt krakkanna',
        upcomingThirdShift: 'Þriðja vaktin',
        upcomingOutToPlay: 'Út að leika',
        recent: 'Nýlegt',
        recentMarkRead: 'Lesið',
        recentDone: 'Þú getur slakað á því þú ert með allt í Teskeið, vel gert!',
        recentSeeAll: 'Sjá allt',
        noRecent: 'Engin lán skráð enn.',
        profileLink: 'Minn aðgangur',
        pendingBadgeLabel: '{count, plural, one {1 boð í bið} other {# boð í bið}}',
      },
      'teskeid.loans': {
        lent: 'Ég lánaði',
        borrowed: 'Ég fékk lánað',
        overdue: 'Komið fram yfir skiladag',
        homeLink: 'Fara á heimasíðu',
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

// next/headers — cookies mock
const { mockCookiesGet } = vi.hoisted(() => ({
  mockCookiesGet: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: mockCookiesGet }),
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

function setupGuard(featureAccess = true) {
  mockGuardTeskeidSession.mockResolvedValue({ user: TEST_USER })
  mockCheckFeatureAccess.mockResolvedValue(featureAccess)
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

// Mirror the server-side computeRecentSignature logic exactly.
// overdueOverrides lets tests force the overdue flag to a specific value
// (e.g. to simulate what the signature was before a loan became overdue).
function computeTestSignature(
  loans: LoanItem[],
  overdueOverrides?: Map<string, boolean>,
): string {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })
  const sorted = sortLoansForHome(loans).slice(0, 3)
  const payload = sorted
    .map((l) => {
      const overdue = overdueOverrides?.has(l.id)
        ? overdueOverrides.get(l.id)!
        : (!!l.due_at && !l.returned_at && l.due_at < today)
      return [
        l.id,
        l.item_name,
        l.loaned_at,
        l.due_at ?? '',
        l.returned_at ?? '',
        l.my_role,
        l.other_display_name ?? '',
        overdue ? '1' : '0',
      ].join('|')
    })
    .join('\n')
  return createHash('sha256').update(payload).digest('hex')
}

function setupCookie(sig: string | null) {
  mockCookiesGet.mockReturnValue(sig ? { value: sig } : undefined)
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
  mockCookiesGet.mockReturnValue(undefined)
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

describe('HeimPage — Teskeiðar section', () => {
  it('renders "Teskeiðar" heading', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([], [])
    render(await HeimPage())
    expect(screen.getByText('Teskeiðar')).toBeDefined()
  })

  it('renders "Teskeiðar" heading even when feature access is false', async () => {
    setupGuard(false)
    setupProfile(null)
    render(await HeimPage())
    expect(screen.getByText('Teskeiðar')).toBeDefined()
  })

  it('shows "Lánað og skilað" link when feature access is granted', async () => {
    setupGuard(true)
    setupProfile(null)
    setupRpcs([], [])
    render(await HeimPage())
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
  })

  it('hides "Lánað og skilað" link when feature access is denied', async () => {
    setupGuard(false)
    setupProfile(null)
    render(await HeimPage())
    expect(screen.queryByText('Lánað og skilað')).toBeNull()
  })
})

describe('HeimPage — upcoming rows', () => {
  const UPCOMING_LABELS = [
    'Póstflóðið einfaldað',
    'Útlagt og endurgreitt',
    'Maki/kæró',
    'Veðrið',
    'Fyrsta vakt krakkanna',
    'Þriðja vaktin',
    'Út að leika',
  ]

  it('renders all 7 upcoming rows', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([], [])
    render(await HeimPage())
    for (const label of UPCOMING_LABELS) {
      expect(screen.getByText(label)).toBeDefined()
    }
  })

  it('all upcoming rows are disabled buttons', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([], [])
    const { container } = render(await HeimPage())
    const disabledButtons = container.querySelectorAll('button[disabled]')
    expect(disabledButtons.length).toBe(UPCOMING_LABELS.length)
  })

  it('renders all 7 upcoming rows in correct order', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([], [])
    const { container } = render(await HeimPage())
    const buttons = container.querySelectorAll('button[disabled]')
    UPCOMING_LABELS.forEach((label, i) => {
      expect(buttons[i].textContent).toContain(label)
    })
  })

  it('renders upcoming rows even when feature access is false', async () => {
    setupGuard(false)
    setupProfile(null)
    render(await HeimPage())
    for (const label of UPCOMING_LABELS) {
      expect(screen.getByText(label)).toBeDefined()
    }
  })

  it('each upcoming row shows "Væntanlegt" status', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([], [])
    const { container } = render(await HeimPage())
    const statusSpans = container.querySelectorAll('button[disabled] span:last-child')
    statusSpans.forEach((span) => {
      expect(span.textContent).toBe('Væntanlegt')
    })
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
    expect(document.querySelector('[aria-label*="boð í bið"]')).toBeNull()
  })

  it('does not show badge when invitations RPC fails', async () => {
    setupGuard()
    setupProfile('Anna')
    setupRpcError('get_my_pending_invitations')
    render(await HeimPage())
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

  it('shows done banner when there are no loans', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([], [])
    render(await HeimPage())
    expect(screen.getByText('Þú getur slakað á því þú ert með allt í Teskeið, vel gert!')).toBeDefined()
  })

  it('regression: home page contains no direct link to /auth-mvp/lanad-og-skilad/ny', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([], [])
    const { container } = render(await HeimPage())
    const nyLinks = container.querySelectorAll('a[href*="/lanad-og-skilad/ny"]')
    expect(nyLinks.length).toBe(0)
  })

  it('regression: home page contains no link to /auth-mvp/lanad-og-skilad/ny even with loans present', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([makeLoan({ item_name: 'Bók' })], [])
    const { container } = render(await HeimPage())
    const nyLinks = container.querySelectorAll('a[href*="/lanad-og-skilad/ny"]')
    expect(nyLinks.length).toBe(0)
  })

  it('hides Nýlegt section when loans RPC fails', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcError('get_my_loans')
    render(await HeimPage())
    expect(screen.queryByText('Nýlegt')).toBeNull()
    expect(screen.queryByText('Þú getur slakað á því þú ert með allt í Teskeið, vel gert!')).toBeNull()
  })

  it('hides Nýlegt section when feature access is denied', async () => {
    setupGuard(false)
    setupProfile('Guðrún')
    render(await HeimPage())
    expect(screen.queryByText('Nýlegt')).toBeNull()
    expect(screen.queryByText('Lánað og skilað')).toBeNull()
    // Greeting and Teskeiðar still show
    expect(screen.getByText('Góðan dag, Guðrún')).toBeDefined()
    expect(screen.getByText('Teskeiðar')).toBeDefined()
  })
})

describe('HeimPage — Lesið / read state', () => {
  it('shows "Lesið" button when loans exist and cookie is unset', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([makeLoan()], [])
    setupCookie(null)
    render(await HeimPage())
    expect(screen.getByText('Lesið')).toBeDefined()
  })

  it('clicking "Lesið" shows done banner', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([makeLoan({ item_name: 'Bók' })], [])
    setupCookie(null)
    render(await HeimPage())
    const btn = screen.getByText('Lesið')
    fireEvent.click(btn)
    expect(screen.getByText('Þú getur slakað á því þú ert með allt í Teskeið, vel gert!')).toBeDefined()
    expect(screen.queryByText('Lesið')).toBeNull()
  })

  it('shows done banner immediately when cookie matches current signature', async () => {
    const loan = makeLoan({ item_name: 'Skór' })
    const sig = computeTestSignature([loan])
    setupGuard()
    setupProfile(null)
    setupRpcs([loan], [])
    setupCookie(sig)
    render(await HeimPage())
    expect(screen.getByText('Þú getur slakað á því þú ert með allt í Teskeið, vel gert!')).toBeDefined()
    expect(screen.queryByText('Lesið')).toBeNull()
  })

  it('shows loan list (not done banner) when cookie has stale signature', async () => {
    const loan = makeLoan({ item_name: 'Jakki' })
    setupGuard()
    setupProfile(null)
    setupRpcs([loan], [])
    setupCookie('stale-signature-that-does-not-match')
    render(await HeimPage())
    expect(screen.getByText('Jakki')).toBeDefined()
    expect(screen.queryByText('Þú getur slakað á því þú ert með allt í Teskeið, vel gert!')).toBeNull()
  })

  it('cookie signature is an opaque SHA-256 hex string (not loan data)', async () => {
    const loan = makeLoan({ item_name: 'Leikur' })
    const sig = computeTestSignature([loan])
    // Verify it is a 64-char hex string
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
    // Verify it does not contain the item name
    expect(sig).not.toContain('Leikur')
  })

  it('does not show "Lesið" button when there are no loans', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([], [])
    setupCookie(null)
    render(await HeimPage())
    expect(screen.queryByText('Lesið')).toBeNull()
  })

  it('regression: cookie becomes stale when loan transitions from current to overdue', async () => {
    // Loan with a past due date — currently overdue
    const loan = makeLoan({ id: 'overdue-loan', item_name: 'Bók', due_at: '2020-01-01' })

    // Compute what the signature was when this loan had not yet passed its due date
    const sigWhenCurrent = computeTestSignature([loan], new Map([['overdue-loan', false]]))

    setupGuard()
    setupProfile(null)
    setupRpcs([loan], [])
    setupCookie(sigWhenCurrent) // cookie was written when loan was "current"

    render(await HeimPage())

    // Loan is now overdue → signature includes overdue=1 → cookie no longer matches
    expect(screen.queryByText('Þú getur slakað á því þú ert með allt í Teskeið, vel gert!')).toBeNull()
    expect(screen.getByText('Bók')).toBeDefined()
  })

  it('signature differs between current and overdue state of the same loan', () => {
    const loan = makeLoan({ id: 'sig-diff', item_name: 'Kassi', due_at: '2026-06-01' })
    const sigCurrent = computeTestSignature([loan], new Map([['sig-diff', false]]))
    const sigOverdue = computeTestSignature([loan], new Map([['sig-diff', true]]))
    expect(sigCurrent).not.toBe(sigOverdue)
    expect(sigCurrent).toMatch(/^[0-9a-f]{64}$/)
    expect(sigOverdue).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ── HeimPage — Lesið cookie write ────────────────────────────────────────────
// Tests in this block intercept document.cookie writes by shadowing the
// property on the document instance. afterEach deletes the own property so
// the jsdom prototype implementation is restored for other test suites.

describe('HeimPage — Lesið cookie write', () => {
  const cookieWrites: string[] = []

  beforeEach(() => {
    cookieWrites.length = 0
    Object.defineProperty(document, 'cookie', {
      set(val: string) { cookieWrites.push(val) },
      get() { return '' },
      configurable: true,
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(document, 'cookie')
  })

  it('clicking "Lesið" writes teskeid_recent_read with expected SHA-256, required attributes, and no raw loan data', async () => {
    const loan = makeLoan({ id: 'write-test-id', item_name: 'Teppi' })
    const expectedSig = computeTestSignature([loan])

    setupGuard()
    setupProfile(null)
    setupRpcs([loan], [])
    setupCookie(null)

    render(await HeimPage())
    fireEvent.click(screen.getByText('Lesið'))

    expect(cookieWrites.length).toBeGreaterThan(0)
    const written = cookieWrites[cookieWrites.length - 1]

    // Value is the expected opaque SHA-256 hex
    expect(written).toContain(`teskeid_recent_read=${expectedSig}`)
    expect(written).toMatch(/teskeid_recent_read=[0-9a-f]{64}/)

    // Required cookie attributes
    expect(written).toContain('path=/auth-mvp/heim')
    expect(written).toContain('SameSite=Lax')
    expect(written).toContain('Max-Age=')

    // Does not contain item name, loan ID, or any user-facing text
    expect(written).not.toContain('Teppi')
    expect(written).not.toContain('write-test-id')
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

  it('shows Teskeiðar section but hides Nýlegt when only loans RPC fails', async () => {
    setupGuard()
    setupProfile('Stebbi')
    setupRpcError('get_my_loans')
    render(await HeimPage())
    // Teskeiðar section still renders (invitations RPC succeeded)
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
    // Nýlegt hidden
    expect(screen.queryByText('Nýlegt')).toBeNull()
  })
})

// ── HeimPage — getAdmin / RPC promise rejection resilience ───────────────────

describe('HeimPage — getAdmin / RPC rejection resilience', () => {
  it('renders greeting and Teskeiðar link when getAdmin() throws, hiding Nýlegt and badge', async () => {
    setupGuard()
    setupProfile('Brynja')
    mockGetAdmin.mockImplementationOnce(() => { throw new Error('admin init failed') })
    render(await HeimPage())
    // Greeting and Teskeiðar section still render
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
    // Teskeiðar link still renders
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

// ── HeimPage — DOM order ──────────────────────────────────────────────────────

describe('HeimPage — DOM order', () => {
  it('greeting appears before Teskeiðar heading in DOM', async () => {
    setupGuard()
    setupProfile('Jón')
    setupRpcs([], [])
    render(await HeimPage())
    const greeting = screen.getByText('Góðan dag, Jón')
    const featuresHeading = screen.getByText('Teskeiðar')
    expect(
      greeting.compareDocumentPosition(featuresHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('logo SVG appears after Teskeiðar heading in DOM', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([], [])
    const { container } = render(await HeimPage())
    const featuresHeading = screen.getByText('Teskeiðar')
    const svgs = container.querySelectorAll('svg')
    const lastSvg = svgs[svgs.length - 1]
    expect(
      featuresHeading.compareDocumentPosition(lastSvg) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('"Nýlegt" appears before "Teskeiðar" in DOM', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([makeLoan()], [])
    render(await HeimPage())
    const nylegt = screen.getByText('Nýlegt')
    const teskeidar = screen.getByText('Teskeiðar')
    expect(
      nylegt.compareDocumentPosition(teskeidar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('page contains no <header> element', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([], [])
    const { container } = render(await HeimPage())
    expect(container.querySelector('header')).toBeNull()
  })

  it('profile link points to /auth-mvp/minn-profill', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([], [])
    render(await HeimPage())
    const link = screen.getByLabelText('Minn aðgangur')
    expect((link as HTMLAnchorElement).getAttribute('href')).toBe('/auth-mvp/minn-profill')
  })
})

// ── HeimPage — bottom logo link ───────────────────────────────────────────────

describe('HeimPage — bottom logo link', () => {
  it('bottom logo link points to /auth-mvp/heim', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([], [])
    const { container } = render(await HeimPage())
    const logoLink = container.querySelector('a[href="/auth-mvp/heim"]')
    expect(logoLink).toBeDefined()
    expect(logoLink).not.toBeNull()
  })

  it('bottom logo SVGs are decorative (aria-hidden=true)', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([], [])
    const { container } = render(await HeimPage())
    const logoLink = container.querySelector('a[href="/auth-mvp/heim"]')!
    const svgs = logoLink.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
    svgs.forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    })
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
