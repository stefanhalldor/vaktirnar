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
        greeting:             '{firstName}, þú ert með allt í teskeið!',
        greetingFallback:     'Góðan dag',
        featuresTitle:        'Teskeiðar',
        loansTitle:           'Lánað og skilað',
        upcoming:             'Væntanlegt',
        upcomingEmail:        'Póstflóðið einfaldað',
        upcomingExpenses:     'Útlagt og endurgreitt',
        upcomingPartner:      'Maki/kæró',
        upcomingWeather:      'Veðrið',
        upcomingKidsShift:    'Fyrsta vakt krakkanna',
        upcomingThirdShift:   'Þriðja vaktin',
        upcomingOutToPlay:    'Út að leika',
        recent:               'Ólesið',
        recentMarkRead:       'Lesið',
        recentMarkAllRead:    'Allt lesið',
        recentView:           'Skoða',
        recentClose:          'Loka',
        recentDone:           'Njóttu lífsins með allt í Teskeið...',
        noRecent:             'Engin ólesin atriði.',
        profileLink:          'Minn aðgangur',
        pendingBadgeLabel:    '{count, plural, one {1 boð í bið} other {# boð í bið}}',
        eventLoanCreated:     'Búinn til: {itemName}',
        eventLoanUpdated:     'Breytt: {itemName}',
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

// Supabase server client — profile chain mock
const { mockMaybeSingle, mockMaybeSingleEq, mockFrom } = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn()
  const mockMaybeSingleEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
  const mockMaybeSingleSelect = vi.fn(() => ({ eq: mockMaybeSingleEq }))
  const mockFrom = vi.fn(() => ({ select: mockMaybeSingleSelect }))
  return { mockMaybeSingle, mockMaybeSingleEq, mockFrom }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ from: mockFrom }),
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

// ── Setup helpers ────────────────────────────────────────────────────────────

function setupGuard(featureAccess = true) {
  mockGuardTeskeidSession.mockResolvedValue({ user: TEST_USER })
  mockCheckFeatureAccess.mockResolvedValue(featureAccess)
}

function setupProfile(displayName: string | null) {
  mockMaybeSingle.mockResolvedValue({ data: displayName ? { display_name: displayName } : null })
}

function setupRpcs(invitations: PendingInvitation[]) {
  mockRpc.mockImplementation((fn: string) => {
    if (fn === 'get_my_pending_invitations') return Promise.resolve({ data: invitations, error: null })
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
    setupRpcs([])
    render(await HeimPage())
    expect(screen.getByText('Jón, þú ert með allt í teskeið!')).toBeDefined()
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
  it('renders "Teskeiðar" heading', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
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
    setupRpcs([])
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
    setupRpcs([])
    render(await HeimPage())
    for (const label of UPCOMING_LABELS) {
      expect(screen.getByText(label)).toBeDefined()
    }
  })

  it('all upcoming rows are disabled buttons', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    const { container } = render(await HeimPage())
    const disabledButtons = container.querySelectorAll('button[disabled]')
    expect(disabledButtons.length).toBe(UPCOMING_LABELS.length)
  })

  it('renders all 7 upcoming rows in correct order', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
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
    setupRpcs([])
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
    setupRpcs([makeInvitation()])
    render(await HeimPage())
    expect(screen.getByText('1')).toBeDefined()
    expect(screen.getByLabelText('1 boð í bið')).toBeDefined()
  })

  it('shows badge with accessible label for count 2', async () => {
    setupGuard()
    setupProfile('Anna')
    setupRpcs([makeInvitation(), makeInvitation({ invitation_id: 'inv-2' })])
    render(await HeimPage())
    expect(screen.getByText('2')).toBeDefined()
    expect(screen.getByLabelText('2 boð í bið')).toBeDefined()
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
})

describe('HeimPage — Ólesið section (event-based)', () => {
  it('shows done banner when there are no events', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([])
    render(await HeimPage())
    expect(screen.getByText('Njóttu lífsins með allt í Teskeið...')).toBeDefined()
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
    expect(screen.getByText('Guðrún, þú ert með allt í teskeið!')).toBeDefined()
    expect(screen.getByText('Teskeiðar')).toBeDefined()
  })

  it('hides Ólesið when events query fails', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    mockAdminLimit.mockResolvedValue({ data: null, error: { code: 'PGRST301' } })
    render(await HeimPage())
    expect(screen.queryByText('Ólesið')).toBeNull()
    expect(screen.queryByText('Njóttu lífsins með allt í Teskeið...')).toBeNull()
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
    expect(screen.getByText('Njóttu lífsins með allt í Teskeið...')).toBeDefined()
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
    expect(screen.getByText('Brynja, þú ert með allt í teskeið!')).toBeDefined()
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
    expect(screen.queryByText('Ólesið')).toBeNull()
    expect(document.querySelector('[aria-label*="boð í bið"]')).toBeNull()
  })

  it('hides Ólesið but shows badge when events query throws and invitations succeed', async () => {
    setupGuard()
    setupProfile('Hildur')
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'get_my_pending_invitations') return Promise.resolve({ data: [makeInvitation()], error: null })
      return Promise.resolve({ data: null, error: { code: 'unknown' } })
    })
    mockAdminLimit.mockResolvedValue({ data: null, error: { code: 'PGRST301' } })
    render(await HeimPage())
    expect(screen.queryByText('Ólesið')).toBeNull()
    expect(screen.getByLabelText('1 boð í bið')).toBeDefined()
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
  })

  it('shows Ólesið but hides badge when get_my_pending_invitations rejects and events succeed', async () => {
    setupGuard()
    setupProfile(null)
    mockRpc.mockRejectedValue(new Error('invitations rpc failed'))
    setupRecentEvents([makeEvent({ payload: { itemName: 'Sykur' } })])
    render(await HeimPage())
    expect(screen.getByText('Ólesið')).toBeDefined()
    expect(screen.getByText('Búinn til: Sykur')).toBeDefined()
    expect(document.querySelector('[aria-label*="boð í bið"]')).toBeNull()
  })
})

// ── HeimPage — DOM order ──────────────────────────────────────────────────────

describe('HeimPage — DOM order', () => {
  it('greeting appears before Teskeiðar heading in DOM', async () => {
    setupGuard()
    setupProfile('Jón')
    setupRpcs([])
    render(await HeimPage())
    const greeting = screen.getByText('Jón, þú ert með allt í teskeið!')
    const featuresHeading = screen.getByText('Teskeiðar')
    expect(
      greeting.compareDocumentPosition(featuresHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('"Ólesið" appears before "Teskeiðar" in DOM', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent()])
    render(await HeimPage())
    const nylegt = screen.getByText('Ólesið')
    const teskeidar = screen.getByText('Teskeiðar')
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

  it('drawer shows "Skoða" link for non-deleted events', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ id: 1, event_type: 'loan_created', entity_id: 'aaa-bbb-ccc', payload: { itemName: 'Borvél' } })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Búinn til: Borvél'))
    expect(screen.getByRole('link', { name: 'Skoða' })).toBeDefined()
  })

  it('drawer "Skoða" link for invitation event points to loan list with ?invitation= param', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ id: 5, event_type: 'loan_invitation_received', entity_type: 'invitation', entity_id: 'inv-uuid-1234', payload: { itemName: 'Borvél' } })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Lánaboð: Borvél'))
    const skoðaLink = screen.getByRole('link', { name: 'Skoða' })
    expect(skoðaLink.getAttribute('href')).toBe('/auth-mvp/lanad-og-skilad?invitation=inv-uuid-1234')
  })

  it('drawer "Skoða" link for loan_invitation_accepted points to loan list', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ id: 6, event_type: 'loan_invitation_accepted', entity_type: 'loan', entity_id: 'loan-uuid-5678', payload: { itemName: 'Reiðhjól' } })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Lánaboð samþykkt: Reiðhjól'))
    const skoðaLink = screen.getByRole('link', { name: 'Skoða' })
    expect(skoðaLink.getAttribute('href')).toBe('/auth-mvp/lanad-og-skilad')
    expect(skoðaLink.getAttribute('href')).not.toContain('/breyta/')
  })

  it('drawer "Skoða" link for loan_invitation_declined points to loan list', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ id: 7, event_type: 'loan_invitation_declined', entity_type: 'loan', entity_id: 'loan-uuid-9999', payload: { itemName: 'Kassi' } })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Lánaboði hafnað: Kassi'))
    const skoðaLink = screen.getByRole('link', { name: 'Skoða' })
    expect(skoðaLink.getAttribute('href')).toBe('/auth-mvp/lanad-og-skilad')
    expect(skoðaLink.getAttribute('href')).not.toContain('/breyta/')
  })

  it('drawer "Skoða" link for loan_updated does not point to edit route', async () => {
    setupGuard()
    setupProfile(null)
    setupRpcs([])
    setupRecentEvents([makeEvent({ id: 8, event_type: 'loan_updated', entity_type: 'loan', entity_id: 'loan-uuid-updated', payload: { itemName: 'Borvél' } })])
    render(await HeimPage())
    fireEvent.click(screen.getByText('Breytt: Borvél'))
    const skoðaLink = screen.getByRole('link', { name: 'Skoða' })
    expect(skoðaLink.getAttribute('href')).toBe('/auth-mvp/lanad-og-skilad')
    expect(skoðaLink.getAttribute('href')).not.toContain('/breyta/')
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
    fireEvent.click(screen.getByText('Breytt: Bók'))
    expect(screen.getByText('Nafni breytt: Gamla nafn -> Bók')).toBeDefined()
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
    expect(screen.getByText('Njóttu lífsins með allt í Teskeið...')).toBeDefined()
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
