import { render, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import React from 'react'
import type { LoanItem } from '@/lib/loans/types'

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

const mockRefresh = vi.fn()
const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush, refresh: mockRefresh })),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => {
    const T: Record<string, string> = {
      borrowed: 'Ég fékk lánað',
      lent: 'Ég lánaði',
      loanedAtFull: 'Lánað {weekday} {date}',
      dueAtFull: 'Skila fyrir {date}',
      editTitle: 'Breyta færslu',
      deleteItem: 'Eyða',
      inviteSent: 'Boð um sameiginlega sýn á lánið',
      cancelInvite: 'Afturkalla boð',
      sendInvite: 'Senda lánaboð',
      resendInvite: 'Senda aftur',
      markReturned: 'Merkja skilað',
      undoReturn: 'Afturkalla',
      acknowledge: 'Þekki málið',
      declineAcknowledgement: 'Kannast ekki við þetta',
      addParty: 'Bæta við aðila',
      awaitingAcceptance: 'Bíður samþykkis',
      returned: 'Skilað',
      'newEntryFrom': 'Nýtt frá {name}',
      'inviteStatus.pending': 'Bíður svars',
      'inviteStatus.accepted': 'Samþykkt',
      'inviteStatus.declined': 'Hafnað',
      'inviteStatus.cancelled': 'Afturkallað',
      'inviteStatus.expired': 'Útrunnið',
      'errors.saveFailed': 'Villa við vistun',
      'errors.invitationNotAccepted': 'Báðir aðilar þurfa að vera skráðir.',
      'errors.claimFailed': 'Gat ekki skráð þig. Reyndu aftur.',
      'errors.wrongEmail': 'Þetta boð er ekki sent á þig.',
      'errors.alreadyClaimed': 'Þetta lán er þegar skráð.',
      'errors.notClaimable': 'Þetta boð er ekki lengur opið.',
      'errors.expiredInvite': 'Þetta boð er útrunnið.',
      'errors.selfClaim': 'Þú getur ekki samþykkt lán við sjálfan þig.',
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
    }

    return (key: string, values?: Record<string, string | number>) => {
      let text = T[key] ?? key
      for (const [name, value] of Object.entries(values ?? {})) {
        text = text.replace(`{${name}}`, String(value))
      }
      return text
    }
  },
}))

vi.mock('@/lib/loans/actions', () => ({
  markReturned: vi.fn(),
  undoReturn: vi.fn(),
  deleteLoan: vi.fn(),
  sendInvitationEmail: vi.fn(),
  cancelInvitation: vi.fn(),
  claimInvitation: vi.fn(),
  declineInvitation: vi.fn(),
}))

import { claimInvitation, declineInvitation } from '@/lib/loans/actions'
import { LoanCard } from '@/components/loans/LoanCard'
import { LoanSummaryCard } from '@/components/loans/LoanSummaryCard'

beforeEach(() => {
  vi.clearAllMocks()
})

function makeLoanItem(overrides: Partial<LoanItem> = {}): LoanItem {
  return {
    id: 'loan-1',
    item_name: 'Mæk',
    note: null,
    loaned_at: '2026-06-16',
    due_at: '2026-06-17',
    returned_at: null,
    my_role: 'borrower',
    other_display_name: null,
    invitation_id: 'invite-1',
    invitation_status: 'pending',
    invitation_attempt_status: 'sent',
    can_send_invitation: false,
    is_creator: true,
    requires_acknowledgement: false,
    recipient_email: null,
    ...overrides,
  }
}

describe('LoanCard — pending creator status copy', () => {
  it('shows pending response once and does not show old acceptance copy', () => {
    const { container, getByText } = render(<LoanCard item={makeLoanItem()} />)
    const text = container.textContent ?? ''

    expect(text.match(/Bíður svars/g) ?? []).toHaveLength(1)
    expect(text).not.toContain('Bíður samþykkis')
    expect(getByText('Boð um sameiginlega sýn á lánið')).toBeInTheDocument()
    expect(getByText('Afturkalla boð')).toBeInTheDocument()
  })
})

describe('LoanCard — pending creator return controls (#44)', () => {
  it('shows "Merkja skilað" for pending creator before invitation accepted', () => {
    const { getByText } = render(
      <LoanCard item={makeLoanItem({
        is_creator: true,
        invitation_status: 'pending',
        requires_acknowledgement: false,
        returned_at: null,
      })} />,
    )
    expect(getByText('Merkja skilað')).toBeInTheDocument()
  })

  it('does not show "Merkja skilað" for pending recipient', () => {
    const { queryByText } = render(
      <LoanCard item={makeLoanItem({
        is_creator: false,
        invitation_status: 'pending',
        requires_acknowledgement: true,
        returned_at: null,
      })} />,
    )
    expect(queryByText('Merkja skilað')).toBeNull()
  })

  it('shows "Afturkalla" for pending creator when already returned', () => {
    const { getByText } = render(
      <LoanCard item={makeLoanItem({
        is_creator: true,
        invitation_status: 'pending',
        requires_acknowledgement: false,
        returned_at: '2026-06-17T20:00:00Z',
      })} />,
    )
    expect(getByText('Afturkalla')).toBeInTheDocument()
  })
})

// ── LoanCard — recipientDisplay (#53) ─────────────────────────────────────────

describe('LoanCard — recipientDisplay', () => {
  it('shows recipientDisplay email in header when no other_display_name', () => {
    const { container } = render(
      <LoanCard
        item={makeLoanItem({ other_display_name: null, invitation_status: 'pending' })}
        recipientDisplay="jon@example.com"
      />,
    )
    expect(container.textContent).toContain('· jon@example.com')
  })

  it('shows "Bíður svars" as standalone status line when recipientDisplay is set', () => {
    const { getAllByText } = render(
      <LoanCard
        item={makeLoanItem({ other_display_name: null, invitation_status: 'pending' })}
        recipientDisplay="jon@example.com"
      />,
    )
    // "Bíður svars" appears once as the standalone invitation status section
    expect(getAllByText('Bíður svars')).toHaveLength(1)
  })

  it('prefers other_display_name over recipientDisplay', () => {
    const { container } = render(
      <LoanCard
        item={makeLoanItem({ other_display_name: 'Jón', invitation_status: 'accepted' })}
        recipientDisplay="jon@example.com"
      />,
    )
    expect(container.textContent).toContain('· Jón')
    expect(container.textContent).not.toContain('jon@example.com')
  })
})

// ── LoanSummaryCard — recipient_email (#53) ───────────────────────────────────

describe('LoanSummaryCard — recipient_email', () => {
  function makeSummaryItem(overrides: Partial<Parameters<typeof makeLoanItem>[0]> = {}) {
    return makeLoanItem({ ...overrides })
  }

  it('shows recipient_email when other_display_name is null and invite is pending', () => {
    const { container } = render(
      <LoanSummaryCard item={makeSummaryItem({
        other_display_name: null,
        recipient_email: 'jon@example.com',
        invitation_status: 'pending',
      })} />,
    )
    expect(container.textContent).toContain('jon@example.com')
  })

  it('does not show "Bíður svars" when invite is pending and recipient_email is set', () => {
    const { container } = render(
      <LoanSummaryCard item={makeSummaryItem({
        other_display_name: null,
        recipient_email: 'jon@example.com',
        invitation_status: 'pending',
      })} />,
    )
    expect(container.textContent).not.toContain('Bíður svars')
  })

  it('does not show "Bíður svars" when invite is pending and recipient_email is null', () => {
    const { container } = render(
      <LoanSummaryCard item={makeSummaryItem({
        other_display_name: null,
        recipient_email: null,
        invitation_status: 'pending',
      })} />,
    )
    expect(container.textContent).not.toContain('Bíður svars')
  })

  it('prefers other_display_name over recipient_email', () => {
    const { container } = render(
      <LoanSummaryCard item={makeSummaryItem({
        other_display_name: 'Jón',
        recipient_email: 'jon@example.com',
        invitation_status: 'accepted',
      })} />,
    )
    expect(container.textContent).toContain('Jón')
    expect(container.textContent).not.toContain('jon@example.com')
  })
})

// ── LoanSummaryCard — pending recipient actions (#55) ─────────────────────────

describe('LoanSummaryCard — pending recipient actions (#55)', () => {
  function makePendingRecipient(overrides: Partial<LoanItem> = {}): LoanItem {
    return makeLoanItem({
      is_creator: false,
      invitation_status: 'pending',
      requires_acknowledgement: true,
      invitation_id: 'invite-55',
      ...overrides,
    })
  }

  it('shows Þekki málið and Kannast ekki við þetta for pending recipient row', () => {
    const { getByText } = render(<LoanSummaryCard item={makePendingRecipient()} />)
    expect(getByText('Þekki málið')).toBeInTheDocument()
    expect(getByText('Kannast ekki við þetta')).toBeInTheDocument()
  })

  it('does not show action buttons for creator pending row', () => {
    const { queryByText } = render(
      <LoanSummaryCard item={makeLoanItem({
        is_creator: true,
        invitation_status: 'pending',
        requires_acknowledgement: false,
      })} />,
    )
    expect(queryByText('Þekki málið')).toBeNull()
    expect(queryByText('Kannast ekki við þetta')).toBeNull()
  })

  it('does not show action buttons for accepted loan', () => {
    const { queryByText } = render(
      <LoanSummaryCard item={makeLoanItem({
        invitation_status: 'accepted',
        requires_acknowledgement: false,
      })} />,
    )
    expect(queryByText('Þekki málið')).toBeNull()
    expect(queryByText('Kannast ekki við þetta')).toBeNull()
  })

  it('clicking Þekki málið calls claimInvitation and router.refresh on success', async () => {
    vi.mocked(claimInvitation).mockResolvedValue({ ok: true })

    const { getByText } = render(<LoanSummaryCard item={makePendingRecipient()} />)

    await act(async () => {
      fireEvent.click(getByText('Þekki málið'))
    })

    expect(claimInvitation).toHaveBeenCalledWith('invite-55')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('clicking Kannast ekki við þetta calls declineInvitation and router.refresh on success', async () => {
    vi.mocked(declineInvitation).mockResolvedValue({ ok: true })

    const { getByText } = render(<LoanSummaryCard item={makePendingRecipient()} />)

    await act(async () => {
      fireEvent.click(getByText('Kannast ekki við þetta'))
    })

    expect(declineInvitation).toHaveBeenCalledWith('invite-55')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('shows error text and does not refresh on claimInvitation failure', async () => {
    vi.mocked(claimInvitation).mockResolvedValue({ ok: false, error: 'claim_failed' })

    const { getByText, queryByText } = render(<LoanSummaryCard item={makePendingRecipient()} />)

    await act(async () => {
      fireEvent.click(getByText('Þekki málið'))
    })

    expect(getByText('Gat ekki skráð þig. Reyndu aftur.')).toBeInTheDocument()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('shows error text and does not refresh on declineInvitation failure', async () => {
    vi.mocked(declineInvitation).mockResolvedValue({ ok: false, error: 'save_failed' })

    const { getByText, queryByText } = render(<LoanSummaryCard item={makePendingRecipient()} />)

    await act(async () => {
      fireEvent.click(getByText('Kannast ekki við þetta'))
    })

    expect(getByText('Villa við vistun')).toBeInTheDocument()
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
