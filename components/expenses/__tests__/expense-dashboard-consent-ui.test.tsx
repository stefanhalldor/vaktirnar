import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  'dashboard.views.all': 'Allt',
  'dashboard.views.active': 'Virkt',
  'dashboard.views.settled': 'Uppgert',
  'dashboard.views.cancelled': 'Fellt niður',
  'dashboard.filterPeople': 'Mótaðilar',
  'dashboard.filterCircles': 'Tengslahringir',
  'dashboard.clearFilters': 'Hreinsa síur',
  'dashboard.noAll': 'Engar staðfestar færslur.',
  'dashboard.noActive': 'Engar virkar færslur.',
  'dashboard.noSettled': 'Engar uppgerðar færslur.',
  'dashboard.noCancelled': 'Engar niðurfelldar færslur.',
  'dashboard.noFilterResults': 'Engar færslur passa við síurnar.',
  'dashboard.privateDrafts': 'Drög fyrir mig',
  'dashboard.privateDraftsHelper': 'Aðeins þú sérð þessi drög. Þau hafa ekki áhrif á stöður eða uppgjör.',
  'dashboard.privateDraftsUnavailable': 'Ekki tókst að sækja drögin þín núna.',
  'dashboard.sharedDrafts': 'Drög með öðrum',
  'dashboard.sharedDraftsHelper': 'Þetta er enn í vinnslu og hefur ekki áhrif á stöðuna þína.',
  'dashboard.sharedDraftsUnavailable': 'Ekki tókst að sækja sameiginleg drög núna.',
  'dashboard.sharedDraftIncomplete': 'Skiptingin er enn í vinnslu.',
  'dashboard.sharedDraftInProgress': 'Drögin bíða staðfestingar höfundar.',
  'dashboard.unsharedChanges': 'Ódeildar breytingar',
  'dashboard.confirmed': 'Staðfest',
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
    privateDrafts: { status: 'ready', items: [] },
    sharedDrafts: { status: 'ready', items: [] },
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

  it('shows the four accessible presentation controls with Active selected by default', async () => {
    render(await ExpenseDashboard({ dashboard: dashboard(), paymentProfile: emptyPaymentProfile() }))

    expect(screen.queryByRole('navigation', { name: 'Skref við skráningu útgjalds' })).not.toBeInTheDocument()
    const lifecycleGroup = screen.getByRole('group', { name: 'Veldu hvaða UL-færslur sjást' })
    expect(lifecycleGroup).toHaveClass('grid-cols-2')
    expect(screen.getByRole('button', { name: 'Allt' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Virkt' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Virkt' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('button', { name: 'Virkt' })).toHaveClass('min-h-11', 'focus-visible:ring-2')
    expect(screen.getByRole('button', { name: 'Uppgert' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Fellt niður' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(lifecycleGroup).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Allt',
      'Virkt',
      'Uppgert',
      'Fellt niður',
    ])
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
        privateDrafts: {
          status: 'ready',
          items: [{
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
        },
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
        privateDrafts: {
          status: 'ready',
          items: [{
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
        },
      }),
      paymentProfile: emptyPaymentProfile(),
    }))

    expect(screen.getByText('Drög fyrir mig')).toBeInTheDocument()
    expect(screen.getByText('Halda áfram')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ólokið kvöldverðaruppkast/ })).toHaveAttribute(
      'href',
      '/auth-mvp/utlagt-og-endurgreitt/nytt?draft=22222222-2222-4222-8222-222222222222',
    )
  })

  it('keeps a private draft with no valid amount visible without inventing an amount', async () => {
    render(await ExpenseDashboard({
      dashboard: dashboard({
        groups: [],
        totals: [],
        privateDrafts: {
          status: 'ready',
          items: [{
            id: '33333333-3333-4333-8333-333333333333',
            contextType: 'one_off',
            groupId: null,
            expenseId: null,
            title: '',
            totalMinor: null,
            currency: 'ISK',
            differenceMinor: null,
            needsAttention: true,
            savedAt: '2026-08-06T10:00:00.000Z',
          }],
        },
      }),
      paymentProfile: emptyPaymentProfile(),
    }))

    const draftLink = screen.getByRole('link', { name: /Ónefnd færsla/ })
    expect(draftLink).toHaveAttribute(
      'href',
      '/auth-mvp/utlagt-og-endurgreitt/nytt?draft=33333333-3333-4333-8333-333333333333',
    )
    expect(draftLink).toHaveTextContent('Skipting þarf lagfæringu')
    expect(draftLink).not.toHaveTextContent('0 kr.')
  })

  it('shows shared drafts separately and links each exact viewer to its authorized detail', async () => {
    const authorDraftId = '44444444-4444-4444-8444-444444444444'
    const participantPublicationId = '66666666-6666-4666-8666-666666666666'
    const { container } = render(await ExpenseDashboard({
      dashboard: dashboard({
        groups: [],
        totals: [],
        privateDrafts: {
          status: 'ready',
          items: [{
            id: authorDraftId,
            contextType: 'one_off',
            groupId: null,
            expenseId: null,
            title: 'Ódeild sameiginleg drög',
            totalMinor: 24_000,
            currency: 'ISK',
            differenceMinor: null,
            needsAttention: false,
            savedAt: '2026-08-06T10:00:00.000Z',
          }],
        },
        sharedDrafts: {
          status: 'ready',
          items: [{
            lifecycleState: 'shared_draft',
            publicationId: '55555555-5555-4555-8555-555555555555',
            publicationVersion: 2,
            title: 'Ódeild sameiginleg drög',
            totalMinor: 24_000,
            currency: 'ISK',
            incurredOn: '2026-08-25',
            allocationState: 'balanced_unconfirmed',
            viewerRole: 'author',
            hasUnsharedChanges: true,
            detailTarget: { kind: 'private_draft', draftId: authorDraftId },
            authorDraft: { contextType: 'one_off', groupId: null, expenseId: null },
          }, {
            lifecycleState: 'shared_draft',
            publicationId: participantPublicationId,
            publicationVersion: 1,
            title: 'Sameiginleg drög frá öðrum',
            totalMinor: 8_500,
            currency: 'ISK',
            incurredOn: '2026-08-25',
            allocationState: 'incomplete',
            viewerRole: 'participant',
            hasUnsharedChanges: null,
            detailTarget: { kind: 'shared_draft', publicationId: participantPublicationId },
            authorDraft: null,
          }],
        },
      }),
      paymentProfile: emptyPaymentProfile(),
    }))

    expect(screen.getByRole('heading', { name: 'Drög með öðrum' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Drög fyrir mig' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Ódeild sameiginleg drög')).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Ódeild sameiginleg drög/ })).toHaveAttribute(
      'href',
      `/auth-mvp/utlagt-og-endurgreitt/nytt?draft=${authorDraftId}`,
    )
    expect(screen.getByText('Ódeildar breytingar')).toBeInTheDocument()
    expect(screen.getByText('Skiptingin er enn í vinnslu.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Sameiginleg drög frá öðrum/ })).toHaveAttribute(
      'href',
      `/auth-mvp/utlagt-og-endurgreitt/drog/${participantPublicationId}`,
    )
    expect(container.querySelectorAll(`a[href="/auth-mvp/utlagt-og-endurgreitt/drog/${participantPublicationId}"]`)).toHaveLength(1)
  })

  it('reports independent draft-source failures without hiding confirmed financial data', async () => {
    render(await ExpenseDashboard({
      dashboard: dashboard({
        privateDrafts: { status: 'unavailable', items: [] },
        sharedDrafts: { status: 'unavailable', items: [] },
      }),
      paymentProfile: emptyPaymentProfile(),
    }))

    expect(screen.getByText('Ekki tókst að sækja drögin þín núna.')).toBeInTheDocument()
    expect(screen.getByText('Ekki tókst að sækja sameiginleg drög núna.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Staðfest' })).toBeInTheDocument()
    expect(screen.getByText('Sumarferð')).toBeInTheDocument()
    expect(screen.getByText(/Þú átt eftir að greiða 12\.500/)).toBeInTheDocument()
  })

  it('partitions every confirmed context exactly once by actor-relative lifecycle', async () => {
    const activeBalance = groupSummary({
      id: 'active-balance',
      name: 'Opin staða',
    })
    const activePending = groupSummary({
      id: 'active-pending',
      name: 'Bíður staðfestingar',
      selfBalances: [],
      pendingConfirmationCount: 1,
    })
    const settled = groupSummary({
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
      selfBalances: [{
        memberId: 'stale-self',
        displayName: 'Ég',
        currency: 'ISK',
        amountMinor: -5_000,
        isSelf: true,
      }],
      pendingConfirmationCount: 2,
      cancelled: true,
    })
    const noConfirmedExpense = groupSummary({
      id: 'no-confirmed-expense',
      name: 'Tómt samhengi',
      expenseCount: 0,
      selfBalances: [],
      pendingConfirmationCount: 0,
    })
    render(await ExpenseDashboard({
      dashboard: dashboard({
        groups: [activeBalance, activePending, settled, noConfirmedExpense],
        oneOffs: [cancelled],
      }),
      paymentProfile: emptyPaymentProfile(),
    }))

    expect(screen.getByText('Opin staða')).toBeInTheDocument()
    expect(screen.getByText('Bíður staðfestingar')).toBeInTheDocument()
    expect(screen.queryByText('Uppgert fyrir mig')).not.toBeInTheDocument()
    expect(screen.queryByText('Martine 30 ára')).not.toBeInTheDocument()
    expect(screen.queryByText('Tómt samhengi')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Allt' }))

    expect(screen.getByText('Opin staða')).toBeInTheDocument()
    expect(screen.getByText('Bíður staðfestingar')).toBeInTheDocument()
    expect(screen.getByText('Uppgert fyrir mig')).toBeInTheDocument()
    expect(screen.getByText('Martine 30 ára')).toBeInTheDocument()
    expect(screen.queryByText('Tómt samhengi')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Uppgert' }))

    expect(screen.getByText('Uppgert fyrir mig')).toBeInTheDocument()
    expect(screen.queryByText('Opin staða')).not.toBeInTheDocument()
    expect(screen.queryByText('Bíður staðfestingar')).not.toBeInTheDocument()
    expect(screen.queryByText('Martine 30 ára')).not.toBeInTheDocument()
    expect(screen.queryByText('Tómt samhengi')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Fellt niður' }))

    expect(screen.getByText('Martine 30 ára')).toBeInTheDocument()
    expect(screen.queryByText('Opin staða')).not.toBeInTheDocument()
    expect(screen.queryByText('Bíður staðfestingar')).not.toBeInTheDocument()
    expect(screen.queryByText('Uppgert fyrir mig')).not.toBeInTheDocument()
    expect(screen.queryByText('Tómt samhengi')).not.toBeInTheDocument()
  })

  it('derives filters from the lifecycle base and preserves only valid selections on view changes', async () => {
    const matchingContext = {
      counterparties: [
        { key: 'anna', label: 'Anna' },
        { key: 'bjarni', label: 'Bjarni' },
      ],
      relationshipCircles: [{ id: 'circle-a', name: 'Fjölskylda' }],
    }
    render(await ExpenseDashboard({
      dashboard: dashboard({
        groups: [
          groupSummary({ id: 'active-match', name: 'Virkt passar', ...matchingContext }),
          groupSummary({
            id: 'active-missing-person',
            name: 'Virkt vantar Bjarna',
            counterparties: [{ key: 'anna', label: 'Anna' }],
            relationshipCircles: [{ id: 'circle-b', name: 'Vinir' }],
          }),
          groupSummary({
            id: 'settled-match',
            name: 'Uppgert passar',
            selfBalances: [],
            pendingConfirmationCount: 0,
            counterparties: [{ key: 'anna', label: 'Anna' }],
            relationshipCircles: [{ id: 'circle-a', name: 'Fjölskylda' }],
          }),
          groupSummary({
            id: 'cancelled-match',
            name: 'Fellt niður passar',
            cancelled: true,
            ...matchingContext,
          }),
        ],
      }),
      paymentProfile: emptyPaymentProfile(),
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bjarni' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fjölskylda' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vinir' }))

    expect(screen.getByText('Virkt passar')).toBeInTheDocument()
    expect(screen.queryByText('Virkt vantar Bjarna')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Uppgert' }))
    expect(screen.getByText('Uppgert passar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anna' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Fjölskylda' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Bjarni' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Vinir' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Virkt' }))
    expect(screen.getByText('Virkt passar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anna' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Fjölskylda' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Bjarni' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Vinir' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Allt' }))
    expect(screen.getByRole('button', { name: 'Bjarni' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Vinir' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Hreinsa síur' }))
    expect(screen.getByRole('button', { name: 'Anna' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Fjölskylda' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('prunes stale people and circle state after refresh so options cannot resurrect selected', async () => {
    const activeItems = (includeTransient: boolean) => [
      groupSummary({
        id: 'refresh-match',
        name: 'Refresh passar',
        counterparties: [
          { key: 'anna', label: 'Anna' },
          ...(includeTransient ? [{ key: 'biggi', label: 'Biggi' }] : []),
        ],
        relationshipCircles: [
          { id: 'circle-stable', name: 'Varandi hringur' },
          ...(includeTransient ? [{ id: 'circle-transient', name: 'Tímabundinn hringur' }] : []),
        ],
      }),
    ]
    const renderDashboard = (includeTransient: boolean) => ExpenseDashboard({
      dashboard: dashboard({ groups: activeItems(includeTransient) }),
      paymentProfile: emptyPaymentProfile(),
    })
    const { rerender } = render(await renderDashboard(true))

    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    fireEvent.click(screen.getByRole('button', { name: 'Biggi' }))
    fireEvent.click(screen.getByRole('button', { name: 'Varandi hringur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tímabundinn hringur' }))
    expect(screen.getByText('Refresh passar')).toBeInTheDocument()

    rerender(await renderDashboard(false))

    expect(screen.queryByRole('button', { name: 'Biggi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tímabundinn hringur' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anna' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Varandi hringur' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Hreinsa síur' })).toBeInTheDocument()
    expect(screen.getByText('Refresh passar')).toBeInTheDocument()
    expect(screen.queryByText('Engar færslur passa við síurnar.')).not.toBeInTheDocument()

    rerender(await renderDashboard(true))

    expect(screen.getByRole('button', { name: 'Biggi' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Tímabundinn hringur' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Anna' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Varandi hringur' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Refresh passar')).toBeInTheDocument()
  })

  it('distinguishes lifecycle empty states from filter-empty results', async () => {
    render(await ExpenseDashboard({
      dashboard: dashboard({
        groups: [
          groupSummary({
            id: 'active-anna',
            name: 'Virkt með Önnu',
            counterparties: [{ key: 'anna', label: 'Anna' }],
          }),
          groupSummary({
            id: 'active-bjarni',
            name: 'Virkt með Bjarna',
            counterparties: [{ key: 'bjarni', label: 'Bjarni' }],
          }),
          groupSummary({
            id: 'settled-bjarni',
            name: 'Uppgert með Bjarna',
            selfBalances: [],
            pendingConfirmationCount: 0,
            counterparties: [{ key: 'bjarni', label: 'Bjarni' }],
          }),
        ],
      }),
      paymentProfile: emptyPaymentProfile(),
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bjarni' }))
    expect(screen.getByText('Engar færslur passa við síurnar.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hreinsa síur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fellt niður' }))
    expect(screen.getByText('Engar niðurfelldar færslur.')).toBeInTheDocument()
  })

  it('uses the confirmed-union empty state when Allt has no classified rows', async () => {
    render(await ExpenseDashboard({
      dashboard: dashboard({
        groups: [groupSummary({ expenseCount: 0 })],
        totals: [],
      }),
      paymentProfile: emptyPaymentProfile(),
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Allt' }))
    expect(screen.getByText('Engar staðfestar færslur.')).toBeInTheDocument()
    expect(screen.queryByText('Engar færslur passa við síurnar.')).not.toBeInTheDocument()
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
