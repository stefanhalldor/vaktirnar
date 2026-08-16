import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseMemberView } from '@/lib/expenses/contracts'

const mocks = vi.hoisted(() => ({
  cancelInvitation: vi.fn(),
  linkGuest: vi.fn(),
  refresh: vi.fn(),
  renameGuest: vi.fn(),
  resendInvitation: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

const translations: Record<string, string> = {
  'common.cancel': 'Hætta við',
  'common.save': 'Vista',
  'expenseForm.guestMarker': 'gestur',
  'expenseForm.registeredMarker': 'Teskeiðarnotandi',
  'expenseForm.invitationPending': 'boð bíður',
  'expenseForm.linkToTeskeidUser': 'Tengja við Teskeiðarnotanda',
  'expenseForm.linkGuestEmail': 'Netfang fyrir {name}',
  'expenseForm.linkGuestEmailPlaceholder': 'nafn@daemi.is',
  'expenseForm.sendMemberInvitation': 'Senda boð',
  'expenseForm.sendingMemberInvitation': 'Sendi boð...',
  'expenseForm.resendMemberInvitation': 'Senda boð aftur',
  'expenseForm.cancelMemberInvitation': 'Afturkalla boð',
  'expenseForm.cancellingMemberInvitation': 'Afturkalla boð...',
  'expenseForm.cancelMemberInvitationConfirm': 'Viltu afturkalla boðið?',
  'expenseForm.memberInvitationCancelled': 'Boðið hefur verið afturkallað.',
  'expenseForm.memberInvitationSent': 'Boðið hefur verið sent.',
  'expenseForm.memberInvitationSavedDeliveryIssue': 'Sendingin er óviss.',
  'expenseForm.renameGuest': 'Breyta nafni',
  'expenseForm.guestDisplayName': 'Nafn óskráðs aðila',
  'expenseForm.savingGuestName': 'Vista nafn...',
  'expenseForm.guestNameUpdated': 'Nafnið var uppfært.',
  'errors.invalid_input': 'Athugaðu upplýsingarnar.',
  'errors.save_failed': 'Ekki tókst að vista.',
}

function translate(rawKey: string, values?: Record<string, string | number>): string {
  const key = rawKey.replace(/^teskeid\.expenses\./, '')
  let result = translations[key] ?? key
  for (const [name, value] of Object.entries(values ?? {})) {
    result = result.replace(`{${name}}`, String(value))
  }
  return result
}

vi.mock('next-intl', () => ({ useTranslations: () => translate }))
vi.mock('@/lib/expenses/actions', () => ({
  cancelExpenseMemberInvitation: mocks.cancelInvitation,
  linkExpenseGuestMember: mocks.linkGuest,
  renameExpenseGuestMember: mocks.renameGuest,
  resendExpenseMemberInvitation: mocks.resendInvitation,
}))

import { ExpenseSettlementIdentityActions } from '@/components/expenses/ExpenseSettlementIdentityActions'

const GROUP_ID = '30000000-0000-4000-8000-000000000001'
const MEMBER_ID = '20000000-0000-4000-8000-000000000002'
const INVITATION_ID = '50000000-0000-4000-8000-000000000001'

function guestMember(overrides: Partial<ExpenseMemberView> = {}): ExpenseMemberView {
  return {
    id: MEMBER_ID,
    displayName: 'Anna',
    role: 'member',
    status: 'active',
    isSelf: false,
    isRegistered: false,
    identityInvitation: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.linkGuest.mockResolvedValue({
    ok: true,
    data: { invitationId: INVITATION_ID, delivery: 'sent' },
  })
  mocks.resendInvitation.mockResolvedValue({ ok: true, data: { delivery: 'sent' } })
  mocks.cancelInvitation.mockResolvedValue({ ok: true })
  mocks.renameGuest.mockResolvedValue({ ok: true, data: { displayName: 'Anna María' } })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('ExpenseSettlementIdentityActions shared invitation adapter', () => {
  it('submits only explicit expense context and preserves success feedback', async () => {
    render(
      <ExpenseSettlementIdentityActions
        groupId={GROUP_ID}
        member={guestMember()}
        canLinkGuests
        canRenameGuest
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tengja við Teskeiðarnotanda' }))
    const input = screen.getByRole('textbox', { name: 'Netfang fyrir Anna' })
    fireEvent.change(input, { target: { value: '  anna@example.is  ' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Senda boð' }))
    })

    await waitFor(() => expect(mocks.linkGuest).toHaveBeenCalledOnce())
    expect(mocks.linkGuest).toHaveBeenCalledWith({
      group_id: GROUP_ID,
      member_id: MEMBER_ID,
      recipient_email: 'anna@example.is',
      request_id: expect.any(String),
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Boðið hefur verið sent.')
    expect(screen.queryByRole('textbox', { name: 'Netfang fyrir Anna' })).toBeNull()
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it('keeps rename and email entry mutually exclusive without losing either action', async () => {
    render(
      <ExpenseSettlementIdentityActions
        groupId={GROUP_ID}
        member={guestMember()}
        canLinkGuests
        canRenameGuest
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tengja við Teskeiðarnotanda' }))
    expect(screen.getByRole('textbox', { name: 'Netfang fyrir Anna' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Breyta nafni' }))
    expect(screen.getByRole('textbox', { name: 'Nafn óskráðs aðila' })).toHaveValue('Anna')
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Netfang fyrir Anna' })).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Tengja við Teskeiðarnotanda' }))
    expect(screen.queryByRole('textbox', { name: 'Nafn óskráðs aðila' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Netfang fyrir Anna' })).toBeInTheDocument()
  })

  it('preserves the existing rename payload and completion behavior', async () => {
    render(
      <ExpenseSettlementIdentityActions
        groupId={GROUP_ID}
        member={guestMember()}
        canLinkGuests
        canRenameGuest
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Breyta nafni' }))
    const input = screen.getByRole('textbox', { name: 'Nafn óskráðs aðila' })
    fireEvent.change(input, { target: { value: '  Anna María  ' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vista' }))
    })

    expect(mocks.renameGuest).toHaveBeenCalledWith({
      group_id: GROUP_ID,
      member_id: MEMBER_ID,
      display_name: 'Anna María',
      request_id: expect.any(String),
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Nafnið var uppfært.')
    expect(screen.queryByRole('textbox', { name: 'Nafn óskráðs aðila' })).toBeNull()
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it('adapts pending resend and confirmed cancellation without exposing an address', async () => {
    const member = {
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
      <ExpenseSettlementIdentityActions
        groupId={GROUP_ID}
        member={member}
        canLinkGuests
      />,
    )

    expect(container.textContent).not.toContain('must-not-render@example.is')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Senda boð aftur' }))
    })
    expect(mocks.resendInvitation).toHaveBeenCalledWith({ invitation_id: INVITATION_ID })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Afturkalla boð' }))
    })
    expect(window.confirm).toHaveBeenCalledWith('Viltu afturkalla boðið?')
    expect(mocks.cancelInvitation).toHaveBeenCalledWith({
      invitation_id: INVITATION_ID,
      request_id: expect.any(String),
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Boðið hefur verið afturkallað.')
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
  })

  it('announces an allowlisted action failure and does not refresh', async () => {
    mocks.linkGuest.mockResolvedValueOnce({ ok: false, error: 'invalid_input' })
    render(
      <ExpenseSettlementIdentityActions
        groupId={GROUP_ID}
        member={guestMember()}
        canLinkGuests
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tengja við Teskeiðarnotanda' }))
    const input = screen.getByRole('textbox', { name: 'Netfang fyrir Anna' })
    fireEvent.change(input, { target: { value: 'anna@example.is' } })
    fireEvent.submit(input.closest('form')!)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Athugaðu upplýsingarnar.')
    await waitFor(() => expect(alert).toHaveFocus())
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
