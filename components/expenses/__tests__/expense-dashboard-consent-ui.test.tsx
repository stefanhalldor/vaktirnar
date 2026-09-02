import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ExpenseDashboardView,
  ExpenseInvitationView,
  ExpensePaymentProfileV2View,
} from '@/lib/expenses/contracts'
import type {
  ExpenseDashboardPersonFacetView,
  ExpenseDashboardPresentationView,
} from '@/lib/expenses/dashboard-presentations'

const { mockPush, mockRefresh, mockRespondInvitation } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockRespondInvitation: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => React.createElement('a', { href, ...props }, children),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

const translations: Record<string, string> = {
  'dashboard.intro': 'Haltu utan um hver lagði út.',
  'dashboard.addExpense': 'Skrá útgjald',
  'dashboard.paymentMethods': 'Greiðsluleiðir',
  'dashboard.editPaymentMethods': 'Breyta',
  'dashboard.paymentProfile': 'Greiðsluleiðin þín',
  'dashboard.noPaymentProfile': 'Engin greiðsluleið hefur verið skráð.',
  'dashboard.entries': 'Færslur',
  'dashboard.viewAriaLabel': 'Veldu hvaða færslur sjást',
  'dashboard.views.active': 'Í gangi',
  'dashboard.views.closed': 'Lokið',
  'dashboard.filters': 'Sía færslur',
  'dashboard.filtersActive': 'Sía virk',
  'dashboard.filterPeople': 'Fólk',
  'dashboard.filterManualPeople': 'Án netfangs ({count})',
  'dashboard.filterCircles': 'Tengslahringir',
  'dashboard.clearFilters': 'Hreinsa síur',
  'dashboard.noActive': 'Engar virkar færslur.',
  'dashboard.noClosed': 'Engar lokaðar færslur.',
  'dashboard.noFilterMatches': 'Engar færslur passa við síurnar.',
  'dashboard.entriesUnavailable': 'Ekki tókst að sækja færslurnar núna.',
  'dashboard.sections.private_draft': 'Drög fyrir mig',
  'dashboard.sections.shared_draft': 'Drög með öðrum',
  'dashboard.sections.confirmed': 'Staðfest',
  'dashboard.sections.settled': 'Uppgert',
  'dashboard.sections.cancelled': 'Fellt niður',
  'dashboard.needsAttention': 'Þarfnast lagfæringar',
  'dashboard.untitledDraft': 'Ónefnd færsla',
  'dashboard.summary': 'Staðan þín',
  'dashboard.owedToYou': 'Þú átt inni',
  'dashboard.youOwe': 'Þú átt eftir að greiða',
  'dashboard.noBalances': 'Engin opin staða.',
  'dashboard.invitations': 'Boð sem bíða',
  'dashboard.pendingCount': '{count} greiðsla bíður staðfestingar',
  'dashboard.settleAll': 'Gera allt upp',
  'dashboard.guide': 'Leiðbeiningar',
  'invitation.body': 'Viltu taka þátt í {name}? Þú sérð ekki fjárhagsupplýsingar hópsins fyrr en þú samþykkir.',
  'invitation.accept': 'Samþykkja boð',
  'invitation.decline': 'Hafna boði',
  'invitation.accepting': 'Samþykki...',
  'invitation.declining': 'Hafna...',
  'errors.save_failed': 'Ekki tókst að vista. Reyndu aftur.',
}

function translate(rawKey: string, values?: Record<string, string | number>): string {
  const key = rawKey.replace(/^teskeid\.expenses\./, '')
  let value = translations[key] ?? key
  for (const [name, replacement] of Object.entries(values ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

vi.mock('next-intl', () => ({ useTranslations: () => translate }))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue(translate),
  getLocale: vi.fn().mockResolvedValue('is'),
}))
vi.mock('@/lib/expenses/actions', () => ({
  respondExpenseGroupInvitation: mockRespondInvitation,
}))

import { ExpenseDashboard } from '@/components/expenses/ExpenseDashboard'
import { ExpenseInvitationActions } from '@/components/expenses/ExpenseInvitationActions'

const durableAnna: ExpenseDashboardPersonFacetView = {
  key: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  label: 'Anna vinkona',
  kind: 'durable',
}
const durableBjarni: ExpenseDashboardPersonFacetView = {
  key: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  label: 'Bjarni',
  kind: 'durable',
}
const manualSiggiOne: ExpenseDashboardPersonFacetView = {
  key: 'cccccccccccccccccccccccccccccccc',
  label: 'Siggi',
  kind: 'manual',
}
const manualSiggiTwo: ExpenseDashboardPersonFacetView = {
  key: 'dddddddddddddddddddddddddddddddd',
  label: 'Siggi',
  kind: 'manual',
}

function presentation(
  state: ExpenseDashboardPresentationView['presentationState'],
  key: string,
  title: string | null,
  facets: ExpenseDashboardPersonFacetView[],
  circleKey?: string,
): ExpenseDashboardPresentationView {
  const isDraft = state === 'private_draft' || state === 'shared_draft'
  const id = `${key.slice(0, 8)}-${key.slice(8, 12)}-4${key.slice(13, 16)}-8${key.slice(17, 20)}-${key.slice(20, 32)}`
  return {
    presentationKey: key,
    presentationState: state,
    title,
    needsAttention: false,
    totalMinor: 12_500,
    currency: 'ISK',
    href: isDraft
      ? `/auth-mvp/utlagt-og-endurgreitt/nytt?draft=${id}`
      : `/auth-mvp/utlagt-og-endurgreitt/utgjold/${id}`,
    order: {
      basis: isDraft ? 'visible_updated_at' : 'incurred_on',
      primary: isDraft ? '2026-08-31T20:00:00.000Z' : '2026-08-31',
      secondary: '2026-08-31T20:00:00.000Z',
      tieBreaker: key,
    },
    personFacets: facets,
    circleFacets: circleKey ? [{ key: circleKey, label: circleKey.startsWith('e') ? 'Fjölskylda' : 'Vinir' }] : [],
  }
}

function dashboardRows(): ExpenseDashboardPresentationView[] {
  return [
    presentation('private_draft', '11111111111111111111111111111111', 'Private Anna', [durableAnna]),
    presentation('shared_draft', '22222222222222222222222222222222', 'Shared Anna og Bjarni', [durableAnna, durableBjarni], 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'),
    presentation('confirmed', '33333333333333333333333333333333', 'Confirmed Siggi eitt', [manualSiggiOne], 'ffffffffffffffffffffffffffffffff'),
    presentation('settled', '44444444444444444444444444444444', 'Settled Bjarni', [durableBjarni], 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'),
    presentation('cancelled', '55555555555555555555555555555555', 'Cancelled Siggi tvö', [manualSiggiTwo]),
  ]
}

function invitation(overrides: Partial<ExpenseInvitationView> = {}): ExpenseInvitationView {
  return {
    groupId: 'invited-group-1',
    kind: 'group',
    name: 'Bústaðarferð',
    emoji: '🏡',
    invitedAt: '2026-08-04T10:00:00.000Z',
    ...overrides,
  }
}

function dashboard(overrides: Partial<ExpenseDashboardView> = {}): ExpenseDashboardView {
  return {
    groups: [],
    oneOffs: [],
    invitations: [],
    memberInvitations: [],
    totals: [{ currency: 'ISK', owedToYouMinor: 4_000, youOweMinor: 12_500 }],
    pendingConfirmationCount: 0,
    hasPayAllItems: true,
    privateDrafts: { status: 'ready', items: [] },
    sharedDrafts: { status: 'ready', items: [] },
    dashboardPresentations: { status: 'ready', rows: dashboardRows() },
    ...overrides,
  }
}

function emptyPaymentProfile(): ExpensePaymentProfileV2View {
  return {
    id: null,
    version: null,
    details: null,
    storageReady: true,
    cryptoReady: true,
    decryptFailed: false,
    legacyActiveCount: 0,
    legacySnapshotCount: 0,
    legacyNeedsChoice: false,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRespondInvitation.mockResolvedValue({ ok: true })
})

describe('ExpenseDashboard authoritative presentation directory', () => {
  it('keeps the guide and pay-all actions while using full mobile touch targets', async () => {
    render(await ExpenseDashboard({ dashboard: dashboard(), paymentProfile: emptyPaymentProfile() }))

    expect(screen.getByRole('link', { name: 'Leiðbeiningar' })).toHaveAttribute(
      'href', '/auth-mvp/utlagt-og-endurgreitt/leidbeiningar',
    )
    expect(screen.getByRole('link', { name: 'Leiðbeiningar' })).toHaveClass('min-h-11')
    expect(screen.getByRole('link', { name: 'Gera allt upp' })).toHaveAttribute(
      'href', '/auth-mvp/utlagt-og-endurgreitt/gera-upp',
    )
  })

  it('shows the three active sections by default and the two closed sections on demand', async () => {
    render(await ExpenseDashboard({ dashboard: dashboard(), paymentProfile: emptyPaymentProfile() }))

    const controls = screen.getByRole('group', { name: 'Veldu hvaða færslur sjást' })
    expect(within(controls).getAllByRole('button').map((button) => button.textContent)).toEqual(['Í gangi', 'Lokið'])
    expect(screen.getByRole('button', { name: 'Í gangi' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Drög fyrir mig' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Drög með öðrum' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Staðfest' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Drög fyrir mig', 'Drög með öðrum', 'Staðfest',
    ])
    expect(screen.queryByText('Settled Bjarni')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Lokið' }))
    expect(screen.getByRole('heading', { name: 'Uppgert' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fellt niður' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Uppgert', 'Fellt niður',
    ])
    expect(screen.getByText('Settled Bjarni')).toBeInTheDocument()
    expect(screen.getByText('Cancelled Siggi tvö')).toBeInTheDocument()
    expect(screen.queryByText('Private Anna')).not.toBeInTheDocument()
  })

  it('derives global durable/manual/circle filters from all visible rows', async () => {
    render(await ExpenseDashboard({ dashboard: dashboard(), paymentProfile: emptyPaymentProfile() }))

    fireEvent.click(screen.getByText('Sía færslur'))
    expect(screen.getByText('Fólk')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anna vinkona' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bjarni' })).toBeInTheDocument()
    expect(screen.getByText('Án netfangs (2)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fjölskylda' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vinir' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Anna vinkona' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bjarni' }))
    expect(screen.queryByText('Private Anna')).not.toBeInTheDocument()
    expect(screen.getByText('Shared Anna og Bjarni')).toBeInTheDocument()
  })

  it('keeps same-name manual guests as distinct entry-scoped filter choices', async () => {
    render(await ExpenseDashboard({ dashboard: dashboard(), paymentProfile: emptyPaymentProfile() }))

    fireEvent.click(screen.getByText('Sía færslur'))
    fireEvent.click(screen.getByText('Án netfangs (2)'))
    const siggiButtons = screen.getAllByRole('button', { name: 'Siggi' })
    expect(siggiButtons).toHaveLength(2)
    fireEvent.click(siggiButtons[0]!)
    expect(screen.getByText('Confirmed Siggi eitt')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lokið' }))
    expect(screen.queryByText('Cancelled Siggi tvö')).not.toBeInTheDocument()
    expect(screen.getByText('Engar færslur passa við síurnar.')).toBeInTheDocument()
  })

  it('keeps circle selection OR while combining it with people using AND', async () => {
    render(await ExpenseDashboard({ dashboard: dashboard(), paymentProfile: emptyPaymentProfile() }))

    fireEvent.click(screen.getByText('Sía færslur'))
    fireEvent.click(screen.getByRole('button', { name: 'Fjölskylda' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vinir' }))
    expect(screen.getByText('Shared Anna og Bjarni')).toBeInTheDocument()
    expect(screen.getByText('Confirmed Siggi eitt')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Bjarni' }))
    expect(screen.getByText('Shared Anna og Bjarni')).toBeInTheDocument()
    expect(screen.queryByText('Confirmed Siggi eitt')).not.toBeInTheDocument()
  })

  it('renders a bounded unavailable state without falling back to legacy rows', async () => {
    render(await ExpenseDashboard({
      dashboard: dashboard({ dashboardPresentations: { status: 'unavailable', rows: [] } }),
      paymentProfile: emptyPaymentProfile(),
    }))

    expect(screen.getByText('Ekki tókst að sækja færslurnar núna.')).toBeInTheDocument()
    expect(screen.queryByText('Private Anna')).not.toBeInTheDocument()
  })

  it('renders an authorized href as a link and a null href as a non-link row', async () => {
    const rows = dashboardRows()
    rows[2] = { ...rows[2]!, title: 'No route', href: null }
    render(await ExpenseDashboard({
      dashboard: dashboard({ dashboardPresentations: { status: 'ready', rows } }),
      paymentProfile: emptyPaymentProfile(),
    }))

    expect(screen.getByRole('link', { name: /Private Anna/ }).getAttribute('href')).toContain('/nytt?draft=')
    expect(screen.getByText('No route').closest('a')).toBeNull()
  })

  it('renders the localized untitled fallback and textual attention state for a recoverable private draft', async () => {
    const rows = dashboardRows()
    rows[0] = {
      ...rows[0]!,
      title: null,
      needsAttention: true,
      totalMinor: null,
      currency: null,
      personFacets: [],
      circleFacets: [],
    }
    const { container } = render(await ExpenseDashboard({
      dashboard: dashboard({ dashboardPresentations: { status: 'ready', rows } }),
      paymentProfile: emptyPaymentProfile(),
    }))

    expect(screen.getByText('Ónefnd færsla')).toBeInTheDocument()
    expect(screen.getByText('Þarfnast lagfæringar')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ónefnd færsla/ }).getAttribute('href'))
      .toContain('/nytt?draft=')
    expect(container.querySelector('.text-amber-700')).not.toBeNull()
    expect(screen.queryByText('Ekki tókst að sækja færslurnar núna.')).not.toBeInTheDocument()
  })

  it('shows an invitation as a consent decision outside the entry filters', async () => {
    const invited = invitation()
    const { container } = render(await ExpenseDashboard({
      dashboard: dashboard({ invitations: [invited] }),
      paymentProfile: emptyPaymentProfile(),
    }))

    expect(screen.getByText('Boð sem bíða')).toBeInTheDocument()
    expect(screen.getByText(/Viltu taka þátt í Bústaðarferð/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Samþykkja boð' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hafna boði' })).toBeInTheDocument()
    expect(container.querySelector('a[href="/auth-mvp/utlagt-og-endurgreitt/hopar/invited-group-1"]')).toBeNull()
  })
})

describe('ExpenseInvitationActions consent transitions', () => {
  it('accepts explicitly and navigates to the group only after success', async () => {
    render(<ExpenseInvitationActions invitation={invitation()} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Samþykkja boð' })) })
    await waitFor(() => expect(mockRespondInvitation).toHaveBeenCalledTimes(1))
    expect(mockRespondInvitation).toHaveBeenCalledWith(expect.objectContaining({
      group_id: 'invited-group-1', action: 'accept', request_id: expect.any(String),
    }))
    expect(mockPush).toHaveBeenCalledWith('/auth-mvp/utlagt-og-endurgreitt/hopar/invited-group-1')
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('declines explicitly and returns to the expense dashboard after success', async () => {
    render(<ExpenseInvitationActions invitation={invitation()} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Hafna boði' })) })
    await waitFor(() => expect(mockRespondInvitation).toHaveBeenCalledTimes(1))
    expect(mockRespondInvitation).toHaveBeenCalledWith(expect.objectContaining({
      group_id: 'invited-group-1', action: 'decline', request_id: expect.any(String),
    }))
    expect(mockPush).toHaveBeenCalledWith('/auth-mvp/utlagt-og-endurgreitt')
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('keeps the user in place and exposes an accessible error when consent persistence fails', async () => {
    mockRespondInvitation.mockResolvedValue({ ok: false, error: 'save_failed' })
    render(<ExpenseInvitationActions invitation={invitation()} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Samþykkja boð' })) })
    expect(await screen.findByRole('alert')).toHaveTextContent('Ekki tókst að vista. Reyndu aftur.')
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
