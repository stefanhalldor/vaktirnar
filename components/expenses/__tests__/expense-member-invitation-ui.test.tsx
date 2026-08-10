import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseMemberView } from '@/lib/expenses/contracts'

const {
  mockAddMember,
  mockCancelInvitation,
  mockLinkGuest,
  mockPush,
  mockRefresh,
  mockRemoveMember,
  mockResendInvitation,
  mockRespondInvitation,
} = vi.hoisted(() => ({
  mockAddMember: vi.fn(),
  mockCancelInvitation: vi.fn(),
  mockLinkGuest: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockRemoveMember: vi.fn(),
  mockResendInvitation: vi.fn(),
  mockRespondInvitation: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

const translations: Record<string, string> = {
  'common.cancel': 'Hætta við',
  'group.members': 'Aðilar',
  'group.memberActive': 'Virkur',
  'group.memberInvited': 'Boðið',
  'group.registered': 'Teskeiðarnotandi',
  'group.guest': 'Gestur',
  'expenseForm.linkGuest': 'Tengja gest',
  'expenseForm.linkGuestEmail': 'Netfang fyrir {name}',
  'expenseForm.linkGuestEmailPlaceholder': 'nafn@daemi.is',
  'expenseForm.sendMemberInvitation': 'Senda boð',
  'expenseForm.sendingMemberInvitation': 'Sendi boð...',
  'expenseForm.memberInvitationSent': 'Boðið hefur verið sent.',
  'expenseForm.memberInvitationSavedDeliveryIssue': 'Boðið var vistað en sendingin er óviss.',
  'expenseForm.memberInvitationDelivery.not_sent': 'Ósent',
  'expenseForm.memberInvitationDelivery.reserved': 'Í sendingu',
  'expenseForm.memberInvitationDelivery.sent': 'Sent',
  'expenseForm.memberInvitationDelivery.failed': 'Sending mistókst',
  'expenseForm.resendMemberInvitation': 'Senda boð aftur',
  'expenseForm.cancelMemberInvitation': 'Afturkalla boð',
  'expenseForm.cancelMemberInvitationConfirm': 'Viltu afturkalla boðið?',
  'expenseForm.memberInvitationCancelled': 'Boðið hefur verið afturkallað.',
  'memberInvitation.accept': 'Þekki málið',
  'memberInvitation.decline': 'Þekki málið ekki',
  'memberInvitation.accepting': 'Samþykki...',
  'memberInvitation.declining': 'Hafna...',
  'errors.save_failed': 'Ekki tókst að vista.',
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

vi.mock('@/lib/expenses/actions', () => ({
  addExpenseGroupMember: mockAddMember,
  cancelExpenseMemberInvitation: mockCancelInvitation,
  linkExpenseGuestMember: mockLinkGuest,
  removeExpenseGroupMember: mockRemoveMember,
  resendExpenseMemberInvitation: mockResendInvitation,
  respondExpenseMemberInvitation: mockRespondInvitation,
}))

import { ExpenseMemberInvitationActions } from '@/components/expenses/ExpenseMemberInvitationActions'
import { ExpenseMemberManager } from '@/components/expenses/ExpenseMemberManager'

const GROUP_ID = '30000000-0000-4000-8000-000000000001'
const GUEST_MEMBER_ID = '20000000-0000-4000-8000-000000000002'
const INVITATION_ID = '50000000-0000-4000-8000-000000000001'
const EXPENSE_ID = '60000000-0000-4000-8000-000000000001'

function guestMember(overrides: Partial<ExpenseMemberView> = {}): ExpenseMemberView {
  return {
    id: GUEST_MEMBER_ID,
    displayName: 'Martine',
    role: 'member',
    status: 'active',
    isSelf: false,
    isRegistered: false,
    identityInvitation: null,
    ...overrides,
  }
}

function registeredMember(): ExpenseMemberView {
  return {
    id: '20000000-0000-4000-8000-000000000003',
    displayName: 'Aldís',
    role: 'member',
    status: 'active',
    isSelf: false,
    isRegistered: true,
    identityInvitation: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAddMember.mockResolvedValue({ ok: true })
  mockRemoveMember.mockResolvedValue({ ok: true })
  mockLinkGuest.mockResolvedValue({
    ok: true,
    data: { invitationId: INVITATION_ID, delivery: 'sent' },
  })
  mockResendInvitation.mockResolvedValue({ ok: true, data: { delivery: 'sent' } })
  mockCancelInvitation.mockResolvedValue({ ok: true })
  mockRespondInvitation.mockResolvedValue({
    ok: true,
    data: { status: 'accepted', groupId: GROUP_ID, expenseId: EXPENSE_ID },
  })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('ExpenseMemberManager identity invitation controls', () => {
  it('offers email linking only for an active, unregistered guest and submits explicit context', async () => {
    const unsafeGuest = {
      ...guestMember(),
      recipientEmail: 'must-not-render@example.is',
      amountMinor: 85000,
      note: 'must not render',
    } as unknown as ExpenseMemberView
    const { container } = render(
      <ExpenseMemberManager
        groupId={GROUP_ID}
        members={[unsafeGuest, registeredMember()]}
        options={[]}
        optionsError={false}
        canManage={false}
        canLinkGuests
      />,
    )

    expect(screen.getAllByRole('button', { name: 'Tengja gest' })).toHaveLength(1)
    expect(container.textContent).not.toContain('must-not-render@example.is')
    expect(container.textContent).not.toContain('85000')
    expect(container.textContent).not.toContain('must not render')

    fireEvent.click(screen.getByRole('button', { name: 'Tengja gest' }))
    const emailInput = screen.getByRole('textbox', { name: 'Netfang fyrir Martine' })
    expect(emailInput).toHaveAttribute('type', 'email')
    expect(emailInput).toHaveClass('text-base')
    fireEvent.change(emailInput, { target: { value: 'martine@example.is' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Senda boð' }))
    })

    await waitFor(() => expect(mockLinkGuest).toHaveBeenCalledTimes(1))
    expect(mockLinkGuest).toHaveBeenCalledWith({
      group_id: GROUP_ID,
      member_id: GUEST_MEMBER_ID,
      recipient_email: 'martine@example.is',
      request_id: expect.any(String),
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Boðið hefur verið sent.')
    expect(mockRefresh).toHaveBeenCalledOnce()
  })

  it('does not expose guest-linking controls without the server-derived capability', () => {
    render(
      <ExpenseMemberManager
        groupId={GROUP_ID}
        members={[guestMember()]}
        options={[]}
        optionsError={false}
        canManage={false}
        canLinkGuests={false}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Tengja gest' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Netfang fyrir Martine' })).toBeNull()
  })

  it('shows resend/cancel controls for a pending invitation without rendering its address', async () => {
    const pendingGuest = {
      ...guestMember({
        identityInvitation: {
          id: INVITATION_ID,
          status: 'pending',
          delivery: 'sent',
        },
      }),
      recipientEmail: 'must-not-render@example.is',
    } as unknown as ExpenseMemberView
    const { container } = render(
      <ExpenseMemberManager
        groupId={GROUP_ID}
        members={[pendingGuest]}
        options={[]}
        optionsError={false}
        canManage={false}
        canLinkGuests
      />,
    )

    expect(screen.queryByRole('button', { name: 'Tengja gest' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Senda boð aftur' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Afturkalla boð' })).toBeInTheDocument()
    expect(container.textContent).not.toContain('must-not-render@example.is')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Senda boð aftur' }))
    })
    await waitFor(() => expect(mockResendInvitation).toHaveBeenCalledWith({
      invitation_id: INVITATION_ID,
    }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Afturkalla boð' }))
    })
    await waitFor(() => expect(mockCancelInvitation).toHaveBeenCalledWith({
      invitation_id: INVITATION_ID,
      request_id: expect.any(String),
    }))
  })
})

describe('ExpenseMemberInvitationActions explicit consent', () => {
  it('accepts explicitly and navigates only after the server confirms the durable link', async () => {
    render(<ExpenseMemberInvitationActions invitationId={INVITATION_ID} expenseId={EXPENSE_ID} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Þekki málið' }))
    })

    await waitFor(() => expect(mockRespondInvitation).toHaveBeenCalledWith({
      invitation_id: INVITATION_ID,
      action: 'accept',
      expected_expense_id: EXPENSE_ID,
      request_id: expect.any(String),
    }))
    expect(mockPush).toHaveBeenCalledWith(`/auth-mvp/utlagt-og-endurgreitt/utgjold/${EXPENSE_ID}`)
    expect(mockRefresh).toHaveBeenCalledOnce()
  })

  it('stays in place and announces a failed decision', async () => {
    mockRespondInvitation.mockResolvedValueOnce({ ok: false, error: 'save_failed' })
    render(<ExpenseMemberInvitationActions invitationId={INVITATION_ID} expenseId={EXPENSE_ID} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Þekki málið ekki' }))
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Ekki tókst að vista.')
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
