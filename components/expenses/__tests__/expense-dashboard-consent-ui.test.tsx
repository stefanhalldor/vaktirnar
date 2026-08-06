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
  'dashboard.summary': 'Staðan þín',
  'dashboard.owedToYou': 'Þú átt inni',
  'dashboard.youOwe': 'Þú átt eftir að greiða',
  'dashboard.noBalances': 'Engin opin staða.',
  'dashboard.invitations': 'Boð sem bíða',
  'dashboard.groups': 'Hópar',
  'dashboard.oneOffs': 'Stök útgjöld',
  'dashboard.empty': 'Engin útgjöld hafa verið skráð enn.',
  'dashboard.expenseCount': '{count} útgjöld',
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
  it('shows Active and All dashboard views without the expense step navigation', async () => {
    render(await ExpenseDashboard({ dashboard: dashboard(), paymentProfile: emptyPaymentProfile(), canUseCircles: true }))

    expect(screen.queryByRole('navigation', { name: 'Skref við skráningu útgjalds' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Virkt' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Allt' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tengslahringir/ })).toHaveAttribute('href', '/stillingar/tengsl/hringir')
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

    const { container } = render(await ExpenseDashboard({ dashboard: unsafeDashboard, paymentProfile: emptyPaymentProfile(), canUseCircles: false }))

    expect(screen.getByText('Sumarferð')).toBeInTheDocument()
    expect(screen.getByText('3 útgjöld', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Staðan þín')).toBeInTheDocument()
    expect(container.textContent).not.toContain(privateNote)
    expect(container.textContent).not.toContain(privatePaymentDetails)
    expect(container.textContent).not.toContain('private@example.test')
  })

  it('shows an invitation as a consent decision without a pre-acceptance group link', async () => {
    const invited = invitation()
    const { container } = render(await ExpenseDashboard({
      dashboard: dashboard({ groups: [], invitations: [invited], totals: [] }),
      paymentProfile: emptyPaymentProfile(),
      canUseCircles: false,
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
