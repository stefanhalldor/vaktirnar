import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ExpenseDashboardView,
  ExpenseGroupSummaryView,
  ExpenseInvitationView,
  ExpensePaymentProfileV2View,
} from '@/lib/expenses/contracts'

const { mockPush, mockRefresh, mockRespondInvitation } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockRespondInvitation: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
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
  'dashboard.newGroup': 'Nýr hópur',
  'dashboard.relationshipCircles': 'Tengslahringir',
  'dashboard.paymentMethods': 'Greiðsluleiðir',
  'dashboard.editPaymentMethods': 'Breyta',
  'dashboard.paymentProfile': 'Greiðsluleiðin þín',
  'dashboard.noPaymentProfile': 'Engin greiðsluleið hefur verið skráð.',
  'dashboard.entries': 'Færslur',
  'dashboard.viewAriaLabel': 'Veldu hvaða UL-færslur sjást',
  'dashboard.views.active': 'Virkt',
  'dashboard.views.all': 'Allt',
  'dashboard.filterPeople': 'Mótaðilar',
  'dashboard.filterCircles': 'Tengslahringir',
  'dashboard.clearFilters': 'Hreinsa síur',
  'dashboard.noActive': 'Engar virkar færslur.',
  'dashboard.noFilterResults': 'Engar færslur passa við síurnar.',
  'dashboard.needsAttention': 'Þarfnast lagfæringar',
  'dashboard.drafts': 'Drög',
  'dashboard.draftContinue': 'Halda áfram',
  'dashboard.splitNeedsAttention': 'Skipting þarf lagfæringu',
  'dashboard.untitledDraft': 'Ónefnd færsla',
  'dashboard.unallocated': 'Óúthlutað {amount}',
  'dashboard.overallocated': 'Of úthlutað {amount}',
  'dashboard.summary': 'Staðan þín',
  'dashboard.owedToYou': 'Þú átt inni',
  'dashboard.youOwe': 'Þú átt eftir að greiða',
  'dashboard.noBalances': 'Engin opin staða.',
  'dashboard.invitations': 'Boð sem bíða',
  'dashboard.groups': 'Hópar',
  'dashboard.oneOffs': 'Stök útgjöld',
  'dashboard.empty': 'Engin útgjöld hafa verið skráð enn.',
  'dashboard.expenseCount': '{count} útgjöld',
  'dashboard.groupOwedToYou': 'Þú átt inni {amount}',
  'dashboard.groupYouOwe': 'Þú átt eftir að greiða {amount}',
  'dashboard.settled': 'Uppgert',
  'dashboard.cancelled': 'Fellt niður',
  'dashboard.pendingCount': '{count} greiðsla bíður staðfestingar',
  'dashboard.settleAll': 'Gera allt upp',
  'expenseForm.stepNavAriaLabel': 'Skref við skráningu útgjalds',
  'expenseForm.steps.details': 'Útgjald',
  'expenseForm.steps.people': 'Aðilar',
  'expenseForm.steps.split': 'Skipting',
  'expenseForm.steps.review': 'Yfirferð',
  'expenseForm.stepUnavailable': 'Veldu eða stofnaðu útgjald fyrst',
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

vi.mock('next-intl', () => ({
  useTranslations: () => translate,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue(translate),
  getLocale: vi.fn().mockResolvedValue('is'),
}))

vi.mock('@/lib/expenses/actions', () => ({
  respondExpenseGroupInvitation: mockRespondInvitation,
}))

import { ExpenseDashboard } from '@/components/expenses/ExpenseDashboard'
import { ExpenseInvitationActions } from '@/components/expenses/ExpenseInvitationActions'

function groupSummary(overrides: Partial<ExpenseGroupSummaryView> = {}): ExpenseGroupSummaryView {
  return {
    id: 'group-1',
    kind: 'group',
    name: 'Sumarferð',
    emoji: '🏕️',
    status: 'active',
    role: 'member',
    selfBalances: [
      {
        memberId: 'member-self',
        displayName: 'Ég',
        currency: 'ISK',
        amountMinor: -12_500,
        isSelf: true,
      },
    ],
    expenseCount: 3,
    pendingConfirmationCount: 0,
    cancelled: false,
    createdAt: '2026-08-04T09:00:00.000Z',
    ...overrides,
  }
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
    groups: [groupSummary()],
    oneOffs: [],
    invitations: [],
    totals: [{ currency: 'ISK', owedToYouMinor: 4_000, youOweMinor: 12_500 }],
    pendingConfirmationCount: 0,
    hasPayAllItems: true,
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

describe('ExpenseDashboard compact and privacy-safe projection', () => {
  it('offers the consolidated settlement only when the signed-in user owes money', async () => {
    const { rerender } = render(await ExpenseDashboard({
      dashboard: dashboard(),
      paymentProfile: emptyPaymentProfile(),
    }))

    expect(screen.getByRole('link', { name: 'Gera allt upp' })).toHaveAttribute(
      'href',
      '/auth-mvp/utlagt-og-endurgreitt/gera-upp',
    )

    rerender(await ExpenseDashboard({
      dashboard: dashboard({
        totals: [{ currency: 'ISK', owedToYouMinor: 4_000, youOweMinor: 0 }],
        hasPayAllItems: false,
      }),
      paymentProfile: emptyPaymentProfile(),
    }))
    expect(screen.queryByRole('link', { name: 'Gera allt upp' })).not.toBeInTheDocument()
  })

  it('shows Active and All dashboard views without the expense step navigation', async () => {
    render(await ExpenseDashboard({ dashboard: dashboard(), paymentProfile: emptyPaymentProfile() }))

    expect(screen.queryByRole('navigation', { name: 'Skref við skráningu útgjalds' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Virkt' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Allt' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Tengslahringir/ })).not.toBeInTheDocument()
  })

  it('renders only compact group aggregates and never arbitrary private detail fields', async () => {
    const privateNote = 'LEYNILEG ATHUGASEMD SEM MÁ EKKI BIRTAST'
    const privatePaymentDetails = '0159-26-123456 / 010180-9999'
    const unsafeDashboard = dashboard({
      groups: [
        {
          ...groupSummary(),
          note: privateNote,
          paymentSnapshot: { accountNumber: privatePaymentDetails },
          members: [{ email: 'private@example.test' }],
        } as unknown as ExpenseGroupSummaryView,
      ],
    })

    const { container } = render(await ExpenseDashboard({ dashboard: unsafeDashboard, paymentProfile: emptyPaymentProfile() }))

    expect(screen.getByText('Sumarferð')).toBeInTheDocument()
    expect(screen.getByText(/Þú átt eftir að greiða 12\.500/)).toBeInTheDocument()
    expect(screen.queryByText(/3 útgjöld/)).not.toBeInTheDocument()
    expect(screen.getByText('Staðan þín')).toBeInTheDocument()
    expect(container.textContent).not.toContain(privateNote)
    expect(container.textContent).not.toContain(privatePaymentDetails)
    expect(container.textContent).not.toContain('private@example.test')
  })

  it('shows an incomplete private draft as a resumable entry with its unallocated remainder', async () => {
    render(await ExpenseDashboard({
      dashboard: dashboard({
        groups: [],
        totals: [],
        incompleteDrafts: [{
          id: '11111111-1111-4111-8111-111111111111',
          contextType: 'one_off',
          groupId: null,
          expenseId: null,
          title: 'Hundrað þúsund',
          totalMinor: 100_000,
          currency: 'ISK',
          differenceMinor: 80_000,
          needsAttention: true,
          savedAt: '2026-08-06T10:00:00.000Z',
        }],
      }),
      paymentProfile: emptyPaymentProfile(),
    }))

    expect(screen.getByText('Skipting þarf lagfæringu')).toBeInTheDocument()
    expect(screen.getByText(/Óúthlutað 80\.000/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Hundrað þúsund/ })).toHaveAttribute(
      'href',
      '/auth-mvp/utlagt-og-endurgreitt/nytt?draft=11111111-1111-4111-8111-111111111111',
    )
  })

  it('keeps a mathematically valid but unfinished private draft recoverable', async () => {
    render(await ExpenseDashboard({
      dashboard: dashboard({
        groups: [],
        totals: [],
        incompleteDrafts: [{
          id: '22222222-2222-4222-8222-222222222222',
          contextType: 'one_off',
          groupId: null,
          expenseId: null,
          title: 'Ólokið kvöldverðaruppkast',
          totalMinor: 85_000,
          currency: 'ISK',
          differenceMinor: null,
          needsAttention: false,
          savedAt: '2026-08-06T10:00:00.000Z',
        }],
      }),
      paymentProfile: emptyPaymentProfile(),
    }))

    expect(screen.getByText('Drög')).toBeInTheDocument()
    expect(screen.getByText('Halda áfram')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ólokið kvöldverðaruppkast/ })).toHaveAttribute(
      'href',
      '/auth-mvp/utlagt-og-endurgreitt/nytt?draft=22222222-2222-4222-8222-222222222222',
    )
  })

  it('filters Active by the signed-in user state and marks cancelled history in All', async () => {
    const globallyOpenButPersonallySettled = groupSummary({
      id: 'personally-settled',
      name: 'Uppgert fyrir mig',
      status: 'active',
      selfBalances: [],
      pendingConfirmationCount: 0,
    })
    const cancelled = groupSummary({
      id: 'cancelled-one-off',
      kind: 'one_off',
      name: 'Martine 30 ára',
      selfBalances: [],
      cancelled: true,
    })
    render(await ExpenseDashboard({
      dashboard: dashboard({
        groups: [groupSummary()],
        oneOffs: [globallyOpenButPersonallySettled, cancelled],
      }),
      paymentProfile: emptyPaymentProfile(),
    }))

    expect(screen.getByText('Sumarferð')).toBeInTheDocument()
    expect(screen.queryByText('Uppgert fyrir mig')).not.toBeInTheDocument()
    expect(screen.queryByText('Martine 30 ára')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Allt' }))

    expect(screen.getByText('Uppgert fyrir mig')).toBeInTheDocument()
    expect(screen.getByText('Martine 30 ára')).toBeInTheDocument()
    expect(screen.getByText('Fellt niður')).toBeInTheDocument()
    expect(screen.getByText('Uppgert')).toBeInTheDocument()
  })

  it('shows an invitation as a consent decision without a pre-acceptance group link', async () => {
    const invited = invitation()
    const { container } = render(await ExpenseDashboard({
      dashboard: dashboard({ groups: [], invitations: [invited], totals: [] }),
      paymentProfile: emptyPaymentProfile(),
    }))

    expect(screen.getByText('Boð sem bíða')).toBeInTheDocument()
    expect(screen.getByText('Viltu taka þátt í Bústaðarferð? Þú sérð ekki fjárhagsupplýsingar hópsins fyrr en þú samþykkir.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Samþykkja boð' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hafna boði' })).toBeInTheDocument()
    expect(container.querySelector('a[href="/auth-mvp/utlagt-og-endurgreitt/hopar/invited-group-1"]')).toBeNull()
  })
})

describe('ExpenseInvitationActions consent transitions', () => {
  it('accepts explicitly and navigates to the group only after success', async () => {
    render(<ExpenseInvitationActions invitation={invitation()} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Samþykkja boð' }))
    })

    await waitFor(() => expect(mockRespondInvitation).toHaveBeenCalledTimes(1))
    expect(mockRespondInvitation).toHaveBeenCalledWith(expect.objectContaining({
      group_id: 'invited-group-1',
      action: 'accept',
      request_id: expect.any(String),
    }))
    expect(mockPush).toHaveBeenCalledWith('/auth-mvp/utlagt-og-endurgreitt/hopar/invited-group-1')
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('declines explicitly and returns to the expense dashboard after success', async () => {
    render(<ExpenseInvitationActions invitation={invitation()} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hafna boði' }))
    })

    await waitFor(() => expect(mockRespondInvitation).toHaveBeenCalledTimes(1))
    expect(mockRespondInvitation).toHaveBeenCalledWith(expect.objectContaining({
      group_id: 'invited-group-1',
      action: 'decline',
      request_id: expect.any(String),
    }))
    expect(mockPush).toHaveBeenCalledWith('/auth-mvp/utlagt-og-endurgreitt')
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('keeps the user in place and exposes an accessible error when consent persistence fails', async () => {
    mockRespondInvitation.mockResolvedValue({ ok: false, error: 'save_failed' })
    render(<ExpenseInvitationActions invitation={invitation()} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Samþykkja boð' }))
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Ekki tókst að vista. Reyndu aftur.')
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
