/**
 * RTL integration tests for app/auth-mvp/heim/page.tsx
 *
 * The page is an async server component. We call it directly as an async
 * function and render the returned element, mocking all server-side
 * dependencies (guard, next-intl/server, Supabase, Next.js primitives).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { Idea } from '@/lib/teskeid/types'

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

// next-intl/server
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockImplementation(async (ns: string) => {
    const T: Record<string, Record<string, string>> = {
      'teskeid.home': {
        greeting:             '{firstName}',
        greetingFallback:     'Góðan dag',
        featuresTitle:        'Teskeiðar',
        readyTeskeidarTitle:  'Tilbúnar Teskeiðar',
        readyTeskeidOpen:     'Opna',
        homeIdeasDrawerOpen:  'Skoða hugmyndir',
        homeIdeasDrawerClose: 'Fela hugmyndir',
        loansTitle:           'Lánað og skilað',
        homeIdeasTitle:       'Hugmyndir sem verða líklega að Teskeiðum',
        umonnunTitle:         'Umönnun',
        umonnunInfoHeading:   'Umönnun er í sér appi',
        umonnunOpenLink:      'Opna umonnun.is',
        umonnunBackLink:      'Til baka',
        recent:               'Ólesið',
        recentMarkRead:       'Lesið',
        recentMarkAllRead:    'Allt lesið',
        recentView:           'Skoða',
        recentClose:          'Loka',
        recentDone:           'Allt uppá 10 hjá þér í Teskeiðinni',
        noRecent:             'Engin ólesin atriði.',
        profileLink:          'Minn aðgangur',
        pendingBadgeLabel:    '{count, plural, one {1 boð í bið} other {# boð í bið}}',
        eventLoanCreated:     'Búinn til: {itemName}',
        eventLoanUpdated:         'Breytt: {itemName}',
        eventLoanUpdatedName:     'Breytt nafn: {itemName}',
        eventLoanUpdatedNote:     'Breytt athugasemd: {itemName}',
        eventLoanUpdatedDueAt:    'Breyttur skiladagur: {itemName}',
        eventLoanUpdatedLoanedAt: 'Breytt lánsdagsetning: {itemName}',
        eventLoanReturned:    'Skilað: {itemName}',
        eventLoanReturnUndone: 'Skilað afturkallað: {itemName}',
        eventLoanDeleted:             'Eytt: {itemName}',
        eventLoanInvitationReceived:  'Lánaboð: {itemName}',
        eventLoanInvitationAccepted:  'Lánaboð samþykkt: {itemName}',
        eventLoanInvitationDeclined:  'Lánaboði hafnað: {itemName}',
        eventDetailItemNameChanged:   'Nafni breytt: {oldName} -> {newName}',
        eventDetailReturnDateAdded:   'Skiladegi bætt við: {date}',
        eventDetailReturnDateRemoved: 'Skiladagur fjarlægður: {date}',
        eventDetailReturnDateChanged: 'Skiladegi breytt: {oldDate} -> {newDate}',
        eventDetailLoanedAtChanged:   'Lánsdegi breytt: {oldDate} -> {newDate}',
        eventDetailNoteAdded:         'Athugasemd bætt við: {content}',
        eventDetailNoteRemoved:       'Athugasemd fjarlægð: {content}',
        eventDetailNoteChanged:       'Athugasemd breytt: {oldContent} -> {newContent}',
      },
      'teskeid.loans': {
        lent:     'Ég lánaði',
        borrowed: 'Ég fékk lánað',
        overdue:  'Komið fram yfir skiladag',
        homeLink: 'Fara á heimasíðu',
        'weekdays.0': 'sunnudaginn',
        'weekdays.1': 'mánudaginn',
        'weekdays.2': 'þriðjudaginn',
        'weekdays.3': 'miðvikudaginn',
        'weekdays.4': 'fimmtudaginn',
        'weekdays.5': 'föstudaginn',
        'weekdays.6': 'laugardaginn',
        'months.0': 'janúar',
        'months.1': 'febrúar',
        'months.2': 'mars',
        'months.3': 'apríl',
        'months.4': 'maí',
        'months.5': 'júní',
        'months.6': 'júlí',
        'months.7': 'ágúst',
        'months.8': 'september',
        'months.9': 'október',
        'months.10': 'nóvember',
        'months.11': 'desember',
      },
    }
    return (key: string, params?: Record<string, string | number>) => {
      let val = T[ns]?.[key] ?? key
      if (!params) return val
      val = val.replace(
        /\{(\w+),\s*plural,\s*one\s*\{([^}]*)\}\s*other\s*\{([^}]*)\}\}/g,
        (_: string, varName: string, oneText: string, otherText: string) => {
          const count = Number(params[varName] ?? 0)
          return (count === 1 ? oneText : otherText).replace('#', String(count))
        }
      )
      return val.replace(/\{(\w+)\}/g, (_: string, k: string) =>
        params[k] !== undefined ? String(params[k]) : `{${k}}`
      )
    }
  }),
  getLocale: vi.fn().mockResolvedValue('is'),
}))

// Supabase server client — profile chain + ideas chain mock
const { mockMaybeSingle, mockMaybeSingleEq, mockFrom, mockIdeasResult, mockIdeasEq, mockIdeasNeq, mockIdeasOrder } = vi.hoisted(() => {
  // Profile chain: .from('profiles').select().eq().maybeSingle()
  const mockMaybeSingle = vi.fn()
  const mockMaybeSingleEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
  const mockMaybeSingleSelect = vi.fn(() => ({ eq: mockMaybeSingleEq }))

  // Ideas chain: .from('ideas').select().eq().neq().order().order() → thenable
  const mockIdeasResult = vi.fn().mockResolvedValue({ data: [], error: null })
  const mockIdeasEq = vi.fn()
  const mockIdeasNeq = vi.fn()
  const mockIdeasOrder = vi.fn()
  const ideasChain: Record<string, unknown> = {
    eq: mockIdeasEq,
    neq: mockIdeasNeq,
    order: mockIdeasOrder,
    then: (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => mockIdeasResult().then(f, r),
    catch: (r: (e: unknown) => unknown) => mockIdeasResult().catch(r),
    finally: (f: () => void) => mockIdeasResult().finally(f),
  }
  mockIdeasEq.mockReturnValue(ideasChain)
  mockIdeasNeq.mockReturnValue(ideasChain)
  mockIdeasOrder.mockReturnValue(ideasChain)
  const mockIdeasSelect = vi.fn(() => ideasChain)

  const mockFrom = vi.fn((table: string) =>
    table === 'ideas'
      ? { select: mockIdeasSelect }
      : { select: mockMaybeSingleSelect }
  )
  return { mockMaybeSingle, mockMaybeSingleEq, mockFrom, mockIdeasResult, mockIdeasEq, mockIdeasNeq, mockIdeasOrder }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ from: mockFrom }),
}))

vi.mock('@/components/teskeid/PersonalizedIdeaGrid', () => ({
  PersonalizedIdeaGrid: ({ ideas }: { ideas: Idea[] }) =>
    React.createElement(
      'div',
      { 'data-testid': 'personalized-idea-grid' },
      ...ideas.map((idea) =>
        React.createElement('a', { key: idea.slug, href: `/hugmyndir/${idea.slug}` }, idea.title)
      )
    ),
}))

// Supabase admin — RPC + from chain mock for recent_events query
// The helper conditionally calls .limit() — the terminal node must be thenable
// both when .limit() is chained and when awaited directly.
// Both paths delegate to mockAdminLimit so setupRecentEvents only needs one mock.
const { mockRpc, mockAdminLimit, mockGetAdmin } = vi.hoisted(() => {
  const mockRpc = vi.fn()
  const mockAdminLimit = vi.fn()
  const mockAdminOrder2 = vi.fn(() => {
    // Thenable so `await base` works; also has .limit() for `await base.limit(n)`
    const node: Record<string, unknown> = { limit: mockAdminLimit }
    node.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      mockAdminLimit().then(onFulfilled, onRejected)
    node.catch = (onRejected: (e: unknown) => unknown) =>
      mockAdminLimit().catch(onRejected)
    node.finally = (onFinally: () => void) =>
      mockAdminLimit().finally(onFinally)
    return node
  })
  const mockAdminOrder1 = vi.fn(() => ({ order: mockAdminOrder2 }))
  const mockAdminIs = vi.fn(() => ({ order: mockAdminOrder1 }))
  const mockAdminEq = vi.fn(() => ({ is: mockAdminIs }))
  const mockAdminSelect = vi.fn(() => ({ eq: mockAdminEq }))
  const mockAdminFrom = vi.fn(() => ({ select: mockAdminSelect }))
  const mockGetAdmin = vi.fn(() => ({ rpc: mockRpc, from: mockAdminFrom }))
  return { mockRpc, mockAdminLimit, mockGetAdmin }
})
vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: mockGetAdmin,
}))

// Server action mock
const { mockAckRecentEvents } = vi.hoisted(() => ({
  mockAckRecentEvents: vi.fn(),
}))
vi.mock('@/app/auth-mvp/heim/actions', () => ({
  ackRecentEvents: mockAckRecentEvents,
}))

// next/navigation mock (used by RecentSection)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

// Next.js primitives
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => React.createElement('img', { alt }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))
vi.mock('@/components/teskeid/TeskeidMenu', () => ({
  TeskeidMenu: ({ variant }: { variant: string }) =>
    React.createElement('div', { 'data-testid': `teskeid-menu-${variant}` }),
}))

import HeimPage from '@/app/auth-mvp/heim/page'
import type { PendingInvitation } from '@/lib/loans/types'
import type { RecentEventRow } from '@/lib/recent-events/types'

// ── Fixtures ────────────────────────────────────────────────────────────────

const TEST_USER = { id: 'uid-1', email: 'user@example.com' }

function makeEvent(overrides: Partial<RecentEventRow> = {}): RecentEventRow {
  return {
    id: 1,
    user_id: TEST_USER.id,
    source: 'loans',
    event_type: 'loan_created',
    entity_type: 'loan',
    entity_id: '00000000-0000-0000-0000-000000000001',
    event_key: 'loans:loan:00000000-0000-0000-0000-000000000001:created',
    payload: { itemName: 'Test item' },
    href: '/auth-mvp/lanad-og-skilad',
    occurred_at: '2026-06-09T20:00:00Z',
    ack_at: null,
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

function makeSoftAckLoan(overrides: Record<string, unknown> = {}) {
  return { requires_acknowledgement: true, invitation_status: 'pending', returned_at: null, ...overrides }
}

function makeIdea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: 'idea-1',
    title: 'Test idea',
    slug: 'test-idea',
    short_description: 'A test idea',
    problem_description: null,
    possible_solution: null,
    category: 'Annað',
    status: 'idea',
    source: 'seed',
    votes_count: 0,
    followers_count: 0,
    is_public: true,
    is_featured: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const LAUNCHED_LOAN_IDEA    = makeIdea({ id: 'idea-loans',   slug: 'lanad-og-skilad', title: 'Lánað og skilað', status: 'launched' })
const LAUNCHED_UMONNUN_IDEA = makeIdea({ id: 'idea-umonnun', slug: 'umonnun',          title: 'Umönnun',         status: 'launched' })

// ── Setup helpers ────────────────────────────────────────────────────────────

function setupGuard(loansAccess = true, umonnunAccess = false) {
  mockGuardTeskeidSession.mockResolvedValue({ user: TEST_USER })
  mockCheckFeatureAccess.mockImplementation(
    async (_uid: string, _email: string, featureKey: string) => {
      if (featureKey === 'lanad-og-skilad') return loansAccess
      if (featureKey === 'umonnun') return umonnunAccess
      return false
    },
  )
}

function setupProfile(displayName: string | null) {
  mockMaybeSingle.mockResolvedValue({ data: displayName ? { display_name: displayName } : null })
}

function setupRpcs(softAckLoans: Array<Record<string, unknown>> = []) {
  mockRpc.mockImplementation((fn: string) => {
    if (fn === 'get_my_loans') return Promise.resolve({ data: softAckLoans, error: null })
    return Promise.resolve({ data: null, error: { code: 'unknown' } })
  })
}

function setupRecentEvents(events: RecentEventRow[]) {
  mockAdminLimit.mockResolvedValue({ data: events, error: null })
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
  setupRecentEvents([])
  mockAckRecentEvents.mockResolvedValue({ ok: true })
  mockIdeasResult.mockResolvedValue({ data: [LAUNCHED_LOAN_IDEA, LAUNCHED_UMONNUN_IDEA], error: null })
})

afterEach(() => {
  if (savedLoans !== undefined) process.env.LOANS_ENABLED = savedLoans
  else delete process.env.LOANS_ENABLED
  if (savedAuth !== undefined) process.env.AUTH_MVP_ENABLED = savedAuth
  else delete process.env.AUTH_MVP_ENABLED
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('HeimPage — greeting', () => {
  it('shows first name only when display_name is set', async () => {
    setupGuard()
    setupProfile('Stefán Haraldsson')
    setupRpcs([])
    render(await HeimPage())
    expect(screen.getByText('Stefán')).toBeDefined()
    expect(screen.queryByText('Stefán Haraldsson')).toBeNull()
  })

  it('shows fallback greeting when display_name is null', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    render(await HeimPage())
    expect(screen.getByText('Góðan dag')).toBeDefined()
  })

  it('shows fallback greeting when profile fetch throws', async () => {
    setupGuard()
    mockMaybeSingle.mockRejectedValue(new Error('db error'))
    setupRpcs([])
    render(await HeimPage())
    expect(screen.getByText('Góðan dag')).toBeDefined()
  })
})

describe('HeimPage — Teskeiðar section', () => {
  it('renders "Tilbúnar Teskeiðar" heading', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    render(await HeimPage())
    expect(screen.getByText('Tilbúnar Teskeiðar')).toBeDefined()
  })

  it('renders "Tilbúnar Teskeiðar" heading even when feature access is false', async () => {
    setupGuard(false)
    setupProfile(null)
    render(await HeimPage())
    expect(screen.getByText('Tilbúnar Teskeiðar')).toBeDefined()
  })

  it('shows "Lánað og skilað" ready card when feature access is granted', async () => {
    setupGuard(true)
    setupProfile(null)
    setupRpcs([])
    render(await HeimPage())
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
  })

  it('hides "Lánað og skilað" card when feature access is denied', async () => {
    setupGuard(false)
    setupProfile(null)
    render(await HeimPage())
    expect(screen.queryByText('Lánað og skilað')).toBeNull()
  })

  it('Teskeiðar section has id="teskeidar" for anchor navigation', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    const { container } = render(await HeimPage())
    expect(container.querySelector('section#teskeidar')).not.toBeNull()
  })
})

describe('HeimPage — home ideas section', () => {
  it('renders homeIdeasTitle as drawer toggle', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    render(await HeimPage())
    expect(screen.getByText('Hugmyndir sem verða líklega að Teskeiðum')).toBeDefined()
  })

  it('drawer is collapsed by default — future ideas not visible', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    mockIdeasResult.mockResolvedValueOnce({ data: [makeIdea({ slug: 'borvél', title: 'Borvél', status: 'idea' })], error: null })
    render(await HeimPage())
    expect(screen.queryByText('Borvél')).toBeNull()
  })

  it('renders future ideas in PersonalizedIdeaGrid after opening drawer', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    mockIdeasResult.mockResolvedValueOnce({ data: [makeIdea({ slug: 'borvél', title: 'Borvél', status: 'idea' })], error: null })
    render(await HeimPage())
    fireEvent.click(screen.getByText('Hugmyndir sem verða líklega að Teskeiðum'))
    expect(screen.getByText('Borvél')).toBeDefined()
  })

  it('renders canonical link to /hugmyndir/[slug] after opening drawer', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    mockIdeasResult.mockResolvedValueOnce({ data: [makeIdea({ slug: 'my-idea', title: 'My Idea', status: 'idea' })], error: null })
    const { container } = render(await HeimPage())
    fireEvent.click(screen.getByText('Hugmyndir sem verða líklega að Teskeiðum'))
    expect(container.querySelector('a[href="/hugmyndir/my-idea"]')).not.toBeNull()
  })

  it('query uses is_public=true filter', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    render(await HeimPage())
    expect(mockIdeasEq).toHaveBeenCalledWith('is_public', true)
  })

  it('query does not filter out launched status (split happens in JS)', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    render(await HeimPage())
    expect(mockIdeasNeq).not.toHaveBeenCalledWith('status', 'launched')
  })

  it('query orders by is_featured desc then votes_count desc', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    render(await HeimPage())
    expect(mockIdeasOrder).toHaveBeenCalledWith('is_featured', { ascending: false })
    expect(mockIdeasOrder).toHaveBeenCalledWith('votes_count', { ascending: false })
  })

  it('drawer toggle visible when feature access is false', async () => {
    setupGuard(false)
    setupProfile(null)
    render(await HeimPage())
    expect(screen.getByText('Hugmyndir sem verða líklega að Teskeiðum')).toBeDefined()
  })

  it('ideas section still renders when query returns error', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    mockIdeasResult.mockResolvedValueOnce({ data: null, error: { code: 'PGRST301' } })
    render(await HeimPage())
    expect(screen.getByText('Hugmyndir sem verða líklega að Teskeiðum')).toBeDefined()
    expect(screen.queryByText('Test idea')).toBeNull()
  })

  it('launched idea appears as ready card, not in drawer', async () => {
    setupGuard(true)
    setupProfile(null)
    setupRpcs([])
    // LAUNCHED_LOAN_IDEA is launched — should show as ready card, not in drawer
    mockIdeasResult.mockResolvedValueOnce({ data: [LAUNCHED_LOAN_IDEA], error: null })
    const { container } = render(await HeimPage())
    // Ready card is visible without opening drawer
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
    expect(container.querySelector('a[href="/auth-mvp/lanad-og-skilad"]')).not.toBeNull()
    // Drawer toggle is visible
    expect(screen.getByText('Hugmyndir sem verða líklega að Teskeiðum')).toBeDefined()
    // Opening drawer does NOT show the launched idea there
    fireEvent.click(screen.getByText('Hugmyndir sem verða líklega að Teskeiðum'))
    const grid = screen.getByTestId('personalized-idea-grid')
    expect(grid.querySelector('a[href="/hugmyndir/lanad-og-skilad"]')).toBeNull()
  })
})

describe('HeimPage — pending invitations badge', () => {
  it('shows badge with accessible label for count 1', async () => {
    setupGuard()
    setupProfile('Anna')
    setupRpcs([makeSoftAckLoan()])
    render(await HeimPage())
    expect(screen.getByText('1')).toBeDefined()
    expect(screen.getByLabelText('1 boð í bið')).toBeDefined()
  })

  it('shows badge with accessible label for count 2', async () => {
    setupGuard()
    setupProfile('Anna')
    setupRpcs([makeSoftAckLoan(), makeSoftAckLoan()])
    render(await HeimPage())
    expect(screen.getByText('2')).toBeDefined()
    expect(screen.getByLabelText('2 boð í bið')).toBeDefined()
  })

  it('does not show badge for loan without requires_acknowledgement', async () => {
    setupGuard()
    setupProfile('Anna')
    setupRpcs([{ requires_acknowledgement: false, invitation_status: 'pending' }])
    render(await HeimPage())
    expect(document.querySelector('[aria-label*="boð í bið"]')).toBeNull()
  })

  it('does not show badge when pending count is zero', async () => {
    setupGuard()
    setupProfile('Anna')
    setupRpcs([])
    render(await HeimPage())
    expect(document.querySelector('[aria-label*="boð í bið"]')).toBeNull()
  })

  it('does not show badge when invitations RPC fails', async () => {
    setupGuard()
    setupProfile('Anna')
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST301' } })
    render(await HeimPage())
    expect(document.querySelector('[aria-label*="boð í bið"]')).toBeNull()
  })

  it('does not show badge for pending acknowledgement loan that is already returned (#55)', async () => {
    setupGuard()
    setupProfile('Anna')
    setupRpcs([makeSoftAckLoan({ returned_at: '2026-06-22T21:33:08Z' })])
    render(await HeimPage())
    expect(document.querySelector('[aria-label*="boð í bið"]')).toBeNull()
  })

  it('still shows badge for open (not returned) pending acknowledgement loan (#55)', async () => {
    setupGuard()
    setupProfile('Anna')
    setupRpcs([makeSoftAckLoan({ returned_at: null })])
    render(await HeimPage())
    expect(screen.getByLabelText('1 boð í bið')).toBeDefined()
  })
})

describe('HeimPage — Ólesið section (event-based)', () => {
  it('shows done banner when there are no events', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([])
    render(await HeimPage())
    expect(screen.getByText('Allt uppá 10 hjá þér í Teskeiðinni')).toBeDefined()
  })

  it('shows "Ólesið" heading and "Allt lesið" button when events exist', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ payload: { itemName: 'Bók' } })])
    render(await HeimPage())
    expect(screen.getByText('Ólesið')).toBeDefined()
    expect(screen.getByText('Allt lesið')).toBeDefined()
  })

  it('renders loan_created event label', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ event_type: 'loan_created', payload: { itemName: 'Borvél' } })])
    render(await HeimPage())
    expect(screen.getByText('Búinn til: Borvél')).toBeDefined()
  })

  it('renders loan_returned event label', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ id: 2, event_type: 'loan_returned', payload: { itemName: 'Hjól' } })])
    render(await HeimPage())
    expect(screen.getByText('Skilað: Hjól')).toBeDefined()
  })

  it('renders loan_deleted event label', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ id: 3, event_type: 'loan_deleted', payload: { itemName: 'Kassi' } })])
    render(await HeimPage())
    expect(screen.getByText('Eytt: Kassi')).toBeDefined()
  })

  it('renders loan_invitation_received event label', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ id: 5, event_type: 'loan_invitation_received', entity_type: 'invitation', entity_id: 'inv-uuid-1234', payload: { itemName: 'Borvél' } })])
    render(await HeimPage())
    expect(screen.getByText('Lánaboð: Borvél')).toBeDefined()
  })


  it('renders all unread events when 3 events exist', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([
      makeEvent({ id: 1, payload: { itemName: 'Item 1' } }),
      makeEvent({ id: 2, payload: { itemName: 'Item 2' } }),
      makeEvent({ id: 3, payload: { itemName: 'Item 3' } }),
    ])
    render(await HeimPage())
    expect(screen.getByText('Búinn til: Item 1')).toBeDefined()
    expect(screen.getByText('Búinn til: Item 2')).toBeDefined()
    expect(screen.getByText('Búinn til: Item 3')).toBeDefined()
  })

  it('renders all 4 unread events when more than 3 exist', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([
      makeEvent({ id: 1, payload: { itemName: 'Item 1' } }),
      makeEvent({ id: 2, payload: { itemName: 'Item 2' } }),
      makeEvent({ id: 3, payload: { itemName: 'Item 3' } }),
      makeEvent({ id: 4, payload: { itemName: 'Item 4' } }),
    ])
    render(await HeimPage())
    expect(screen.getByText('Búinn til: Item 1')).toBeDefined()
    expect(screen.getByText('Búinn til: Item 2')).toBeDefined()
    expect(screen.getByText('Búinn til: Item 3')).toBeDefined()
    expect(screen.getByText('Búinn til: Item 4')).toBeDefined()
  })

  it('adds scroll container when more than 5 rows', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([1, 2, 3, 4, 5, 6].map((i) =>
      makeEvent({ id: i, payload: { itemName: `Item ${i}` } }),
    ))
    const { container } = render(await HeimPage())
    const list = container.querySelector('[data-testid="recent-list"]')
    expect(list?.className).toContain('max-h-72')
    expect(list?.className).toContain('overflow-y-auto')
  })

  it('no scroll container when 5 or fewer rows', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([1, 2, 3, 4, 5].map((i) =>
      makeEvent({ id: i, payload: { itemName: `Item ${i}` } }),
    ))
    const { container } = render(await HeimPage())
    const list = container.querySelector('[data-testid="recent-list"]')
    expect(list?.className).not.toContain('max-h-72')
    expect(list?.className).not.toContain('overflow-y-auto')
  })

  it('hides Ólesið section when feature access is denied', async () => {
    setupGuard(false)
    setupProfile('Guðrún')
    render(await HeimPage())
    expect(screen.queryByText('Ólesið')).toBeNull()
    expect(screen.getByText('Guðrún')).toBeDefined()
    expect(screen.getByText('Tilbúnar Teskeiðar')).toBeDefined()
  })

  it('hides Ólesið when events query fails', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    mockAdminLimit.mockResolvedValue({ data: null, error: { code: 'PGRST301' } })
    render(await HeimPage())
    expect(screen.queryByText('Ólesið')).toBeNull()
    expect(screen.queryByText('Allt uppá 10 hjá þér í Teskeiðinni')).toBeNull()
  })

  it('regression: home page contains no link to /auth-mvp/lanad-og-skilad/ny', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    const { container } = render(await HeimPage())
    expect(container.querySelectorAll('a[href*="/lanad-og-skilad/ny"]').length).toBe(0)
  })
})

describe('HeimPage — Lesið / ack events', () => {
  it('clicking "Allt lesið" shows done banner optimistically', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ payload: { itemName: 'Bók' } })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Allt lesið'))
    expect(screen.getByText('Allt uppá 10 hjá þér í Teskeiðinni')).toBeDefined()
    expect(screen.queryByText('Allt lesið')).toBeNull()
  })

  it('clicking "Allt lesið" sends all fetched event IDs to ackRecentEvents', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([
      makeEvent({ id: 1, payload: { itemName: 'Item 1' } }),
      makeEvent({ id: 2, payload: { itemName: 'Item 2' } }),
      makeEvent({ id: 3, payload: { itemName: 'Item 3' } }),
      makeEvent({ id: 4, payload: { itemName: 'Item 4' } }),
    ])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Allt lesið'))
    expect(mockAckRecentEvents).toHaveBeenCalledWith({ event_ids: [1, 2, 3, 4] })
  })

  it('regression: acked event does not reappear after new event is added', async () => {
    // When events query returns only unread events (server-side filter),
    // an acked event should never appear in the rendered list.
    // This simulates: eventA was acked, eventB is new unread — only B renders.
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([
      makeEvent({ id: 2, payload: { itemName: 'Nýja' }, event_type: 'loan_created' }),
      // eventA (id:1) is not in this list — it was acked and filtered server-side
    ])
    render(await HeimPage())
    expect(screen.getByText('Búinn til: Nýja')).toBeDefined()
    // Old acked event is not present
    expect(screen.queryByText('Búinn til: Test item')).toBeNull()
  })
})

describe('HeimPage — partial error resilience', () => {
  it('shows generic greeting but keeps loan section when profile fails', async () => {
    setupGuard()
    mockMaybeSingle.mockRejectedValue(new Error('profile db error'))
    setupRpcs([])
    render(await HeimPage())
    expect(screen.getByText('Góðan dag')).toBeDefined()
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
  })

  it('shows Teskeiðar section but hides Ólesið when events query fails', async () => {
    setupGuard()
    setupProfile('Stebbi')
    setupRpcs([])
    mockAdminLimit.mockResolvedValue({ data: null, error: { code: 'PGRST301' } })
    render(await HeimPage())
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
    expect(screen.queryByText('Ólesið')).toBeNull()
  })
})

// ── HeimPage — getAdmin / RPC rejection resilience ───────────────────────────

describe('HeimPage — getAdmin / RPC rejection resilience', () => {
  it('renders greeting and Teskeiðar link when getAdmin() throws, hiding Ólesið and badge', async () => {
    setupGuard()
    setupProfile('Brynja')
    mockGetAdmin.mockImplementationOnce(() => { throw new Error('admin init failed') })
    render(await HeimPage())
    expect(screen.getByText('Brynja')).toBeDefined()
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
    expect(screen.queryByText('Ólesið')).toBeNull()
    expect(document.querySelector('[aria-label*="boð í bið"]')).toBeNull()
  })

  it('hides Ólesið but shows badge when events query throws and loans RPC succeeds', async () => {
    setupGuard()
    setupProfile('Hildur')
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'get_my_loans') return Promise.resolve({ data: [makeSoftAckLoan()], error: null })
      return Promise.resolve({ data: null, error: { code: 'unknown' } })
    })
    mockAdminLimit.mockResolvedValue({ data: null, error: { code: 'PGRST301' } })
    render(await HeimPage())
    expect(screen.queryByText('Ólesið')).toBeNull()
    expect(screen.getByLabelText('1 boð í bið')).toBeDefined()
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
  })

  it('shows Ólesið but hides badge when get_my_loans rejects and events succeed', async () => {
    setupGuard()
    setupProfile(null)
    mockRpc.mockRejectedValue(new Error('loans rpc failed'))
    setupRecentEvents([makeEvent({ payload: { itemName: 'Sykur' } })])
    render(await HeimPage())
    expect(screen.getByText('Ólesið')).toBeDefined()
    expect(screen.getByText('Búinn til: Sykur')).toBeDefined()
    expect(document.querySelector('[aria-label*="boð í bið"]')).toBeNull()
  })
})

// ── HeimPage — DOM order ──────────────────────────────────────────────────────

describe('HeimPage — DOM order', () => {
  it('greeting appears before "Tilbúnar Teskeiðar" heading in DOM', async () => {
    setupGuard()
    setupProfile('Jón')
    setupRpcs([])
    render(await HeimPage())
    const greeting = screen.getByText('Jón')
    const featuresHeading = screen.getByText('Tilbúnar Teskeiðar')
    expect(
      greeting.compareDocumentPosition(featuresHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('"Ólesið" appears before "Tilbúnar Teskeiðar" in DOM', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent()])
    render(await HeimPage())
    const nylegt = screen.getByText('Ólesið')
    const teskeidar = screen.getByText('Tilbúnar Teskeiðar')
    expect(
      nylegt.compareDocumentPosition(teskeidar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('page contains no <header> element', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    const { container } = render(await HeimPage())
    expect(container.querySelector('header')).toBeNull()
  })

  it('renders authenticated TeskeidMenu in greeting row', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    const { container } = render(await HeimPage())
    expect(container.querySelector('[data-testid="teskeid-menu-authenticated"]')).not.toBeNull()
  })
})

// ── HeimPage — drawer ────────────────────────────────────────────────────────

describe('HeimPage — event drawer', () => {
  it('clicking an event row opens the drawer', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ event_type: 'loan_created', payload: { itemName: 'Borvél' } })])
    const { container } = render(await HeimPage())
    fireEvent.click(screen.getByText('Búinn til: Borvél'))
    expect(container.querySelector('[data-testid="recent-drawer"]')).not.toBeNull()
  })

  it('drawer shows "Skoða" link for loan_invitation_received pointing to detail route when loan matches (#52)', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([{ id: 'loan-xyz', invitation_id: 'inv-uuid-1234', requires_acknowledgement: true, invitation_status: 'pending', returned_at: null, item_name: 'Borvél' }])
    setupRecentEvents([makeEvent({ id: 5, event_type: 'loan_invitation_received', entity_type: 'invitation', entity_id: 'inv-uuid-1234', payload: { itemName: 'Borvél' } })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Lánaboð: Borvél'))
    const link = screen.getByRole('link', { name: 'Skoða' })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).getAttribute('href')).toBe('/auth-mvp/lanad-og-skilad/loan-xyz?from=heim')
  })

  it('drawer Skoða for loan_invitation_received falls back to ?invitation= when no matching loan (#52)', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ id: 5, event_type: 'loan_invitation_received', entity_type: 'invitation', entity_id: 'inv-uuid-1234', payload: { itemName: 'Borvél' } })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Lánaboð: Borvél'))
    const link = screen.getByRole('link', { name: 'Skoða' })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).getAttribute('href')).toBe('/auth-mvp/lanad-og-skilad?invitation=inv-uuid-1234&from=heim')
  })

  it('clicking "Skoða" acks the event so it disappears from Ólesið (#52)', async () => {
    mockAckRecentEvents.mockResolvedValue({ ok: true })
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ id: 5, event_type: 'loan_invitation_received', entity_type: 'invitation', entity_id: 'inv-uuid-1234', payload: { itemName: 'Borvél' } })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Lánaboð: Borvél'))
    fireEvent.click(screen.getByRole('link', { name: 'Skoða' }))
    expect(mockAckRecentEvents).toHaveBeenCalledWith({ event_ids: [5] })
  })

  it('drawer shows "Skoða" link pointing to detail route for loan_created event (#52)', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ id: 1, event_type: 'loan_created', entity_type: 'loan', entity_id: 'aaa-bbb-ccc', payload: { itemName: 'Borvél' } })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Búinn til: Borvél'))
    const link = screen.getByRole('link', { name: 'Skoða' })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).getAttribute('href')).toBe('/auth-mvp/lanad-og-skilad/aaa-bbb-ccc?from=heim')
  })

  it('drawer shows "Skoða" link pointing to detail route for loan_invitation_accepted event (#52)', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ id: 6, event_type: 'loan_invitation_accepted', entity_type: 'loan', entity_id: 'loan-uuid-5678', payload: { itemName: 'Reiðhjól' } })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Lánaboð samþykkt: Reiðhjól'))
    const link = screen.getByRole('link', { name: 'Skoða' })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).getAttribute('href')).toBe('/auth-mvp/lanad-og-skilad/loan-uuid-5678?from=heim')
  })

  it('drawer does not show "Skoða" for deleted events', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ id: 3, event_type: 'loan_deleted', payload: { itemName: 'Kassi' } })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Eytt: Kassi'))
    expect(screen.getByTestId('recent-drawer')).not.toBeNull()
    expect(screen.queryByRole('link', { name: 'Skoða' })).toBeNull()
  })

  it('drawer shows per-event "Lesið" button for all event types', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ event_type: 'loan_created', payload: { itemName: 'Bók' } })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Búinn til: Bók'))
    const drawer = screen.getByTestId('recent-drawer')
    expect(drawer.querySelector('button')).not.toBeNull()
  })

  it('drawer renders detailLines for loan_updated event with changes payload', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({
      id: 1,
      event_type: 'loan_updated',
      payload: {
        itemName: 'Bók',
        changes: [{ field: 'item_name', changeType: 'changed', oldValue: 'Gamla nafn', newValue: 'Bók' }],
      },
    })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Breytt nafn: Bók'))
    expect(screen.getByText('Nafni breytt: Gamla nafn -> Bók')).toBeDefined()
  })

  it('loan_updated with single note change shows "Breytt athugasemd" label (#37)', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({
      event_type: 'loan_updated',
      payload: {
        itemName: 'Bók',
        changes: [{ field: 'note', changeType: 'changed', oldValue: 'Gömul', newValue: 'Ný' }],
      },
    })])
    render(await HeimPage())
    expect(screen.getByText('Breytt athugasemd: Bók')).toBeDefined()
  })

  it('loan_updated with single due_at change shows "Breyttur skiladagur" label (#37)', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({
      event_type: 'loan_updated',
      payload: {
        itemName: 'Bók',
        changes: [{ field: 'due_at', changeType: 'changed', oldValue: '2026-06-01', newValue: '2026-07-01' }],
      },
    })])
    render(await HeimPage())
    expect(screen.getByText('Breyttur skiladagur: Bók')).toBeDefined()
  })

  it('loan_updated with single loaned_at change shows "Breytt lánsdagsetning" label (#37)', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({
      event_type: 'loan_updated',
      payload: {
        itemName: 'Bók',
        changes: [{ field: 'loaned_at', changeType: 'changed', oldValue: '2026-05-01', newValue: '2026-05-15' }],
      },
    })])
    render(await HeimPage())
    expect(screen.getByText('Breytt lánsdagsetning: Bók')).toBeDefined()
  })

  it('loan_updated with multiple changes falls back to generic "Breytt" label (#37)', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({
      event_type: 'loan_updated',
      payload: {
        itemName: 'Bók',
        changes: [
          { field: 'item_name', changeType: 'changed', oldValue: 'Gamla', newValue: 'Bók' },
          { field: 'note', changeType: 'added', newValue: 'Athugasemd' },
        ],
      },
    })])
    render(await HeimPage())
    expect(screen.getByText('Breytt: Bók')).toBeDefined()
  })

  it('occurredAtLabel rendered in list row (#37)', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    // occurred_at: '2026-06-09T20:00:00Z' — Tuesday June 9, UTC hour 20
    setupRecentEvents([makeEvent({ event_type: 'loan_created', payload: { itemName: 'Bók' } })])
    render(await HeimPage())
    expect(screen.getByText('Þriðjudaginn 9. júní kl. 20:00')).toBeDefined()
  })

  it('occurredAtLabel rendered in drawer (#37)', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ event_type: 'loan_created', payload: { itemName: 'Bók' } })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Búinn til: Bók'))
    const drawer = screen.getByTestId('recent-drawer')
    expect(drawer.textContent).toContain('Þriðjudaginn 9. júní kl. 20:00')
  })

  it('clicking per-event "Lesið" removes that event from the list', async () => {
    mockAckRecentEvents.mockResolvedValue({ ok: true })
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ id: 1, event_type: 'loan_created', payload: { itemName: 'Bók' } })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Búinn til: Bók'))
    // "Lesið" appears in the drawer (header has "Allt lesið")
    fireEvent.click(screen.getByRole('button', { name: 'Lesið' }))
    expect(screen.queryByTestId('recent-drawer')).toBeNull()
    expect(screen.getByText('Allt uppá 10 hjá þér í Teskeiðinni')).toBeDefined()
  })
})

// ── HeimPage — bottom logo link ───────────────────────────────────────────────

describe('HeimPage — bottom logo link', () => {
  it('bottom logo link points to /auth-mvp/heim', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    const { container } = render(await HeimPage())
    const logoLink = container.querySelector('a[href="/auth-mvp/heim"]')
    expect(logoLink).not.toBeNull()
  })

  it('bottom logo SVGs are decorative (aria-hidden=true)', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    const { container } = render(await HeimPage())
    const logoLink = container.querySelector('a[href="/auth-mvp/heim"]')!
    const svgs = logoLink.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
    svgs.forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    })
  })
})

// ── HeimPage — Umönnun feature flag (#41) ─────────────────────────────────────

describe('HeimPage — Umönnun feature flag (#41)', () => {
  it('hides Umönnun card when flag is off (default)', async () => {
    // Default mockIdeasResult includes LAUNCHED_UMONNUN_IDEA but umonnunEnabled=false → no card
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    render(await HeimPage())
    expect(screen.queryByText('Umönnun')).toBeNull()
  })

  it('shows Umönnun card when flag is on', async () => {
    // Default mockIdeasResult includes LAUNCHED_UMONNUN_IDEA and umonnunEnabled=true → card shows
    setupGuard(true, true)
    setupProfile(null)
    setupRpcs([])
    render(await HeimPage())
    expect(screen.getByText('Umönnun')).toBeDefined()
  })

  it('Umönnun card links to internal informational route', async () => {
    setupGuard(true, true)
    setupProfile(null)
    setupRpcs([])
    const { container } = render(await HeimPage())
    expect(container.querySelector('a[href="/auth-mvp/umonnun"]')).not.toBeNull()
  })

  it('Umönnun card does not link directly to external umonnun.is from home', async () => {
    setupGuard(true, true)
    setupProfile(null)
    setupRpcs([])
    const { container } = render(await HeimPage())
    expect(container.querySelector('a[href^="https://umonnun.is"]')).toBeNull()
  })

  it('Umönnun card is visible even when loansEnabled is false', async () => {
    setupGuard(false, true)
    setupProfile(null)
    render(await HeimPage())
    expect(screen.getByText('Umönnun')).toBeDefined()
  })
})

// ── HeimPage — active vs upcoming separation (#42) ────────────────────────────

describe('HeimPage — active vs upcoming separation (#42)', () => {
  it('active Teskeid ready card appears before drawer ideas grid in DOM', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    const { container } = render(await HeimPage())
    // Open the drawer to get the grid in the DOM
    fireEvent.click(screen.getByText('Hugmyndir sem verða líklega að Teskeiðum'))
    const loansLink = container.querySelector('a[href="/auth-mvp/lanad-og-skilad"]')
    const ideasGrid = container.querySelector('[data-testid="personalized-idea-grid"]')
    expect(loansLink).not.toBeNull()
    expect(ideasGrid).not.toBeNull()
    expect(
      loansLink!.compareDocumentPosition(ideasGrid!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('homeIdeasTitle drawer toggle is always visible', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    render(await HeimPage())
    expect(screen.getByText('Hugmyndir sem verða líklega að Teskeiðum')).toBeDefined()
  })

  it('homeIdeasTitle drawer toggle visible even when feature access is false', async () => {
    setupGuard(false)
    setupProfile(null)
    render(await HeimPage())
    expect(screen.getByText('Hugmyndir sem verða líklega að Teskeiðum')).toBeDefined()
  })
})
