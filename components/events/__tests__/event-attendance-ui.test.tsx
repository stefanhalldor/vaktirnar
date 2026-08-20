import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'

const {
  mockCancel,
  mockInvite,
  mockLeave,
  mockPush,
  mockRefresh,
  mockReplace,
  mockResend,
  mockRespond,
} = vi.hoisted(() => ({
  mockCancel: vi.fn(),
  mockInvite: vi.fn(),
  mockLeave: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockReplace: vi.fn(),
  mockResend: vi.fn(),
  mockRespond: vi.fn(),
}))

const copy: Record<string, string> = {
  'identityInvitation.linkAndInviteTriggerLabel': 'Tengja og bjóða aðgang',
  'identityInvitation.accessInviteTriggerLabel': 'Bjóða aðgang',
  'identityInvitation.emailLabel': 'Netfang gestsins',
  'identityInvitation.emailPlaceholder': 'gestur@netfang.is',
  'identityInvitation.submitLabel': 'Senda boð',
  'identityInvitation.submittingLabel': 'Sendi boð...',
  'identityInvitation.entryCancelLabel': 'Hætta við',
  'identityInvitation.resendLabel': 'Senda aftur',
  'identityInvitation.resendPendingLabel': 'Sendi aftur...',
  'identityInvitation.cancelInvitationLabel': 'Afturkalla boð',
  'identityInvitation.cancellingLabel': 'Afturkalla...',
  'identityInvitation.cancelInvitationConfirm': 'Afturkalla?',
  'identityInvitation.cancelledNotice': 'Boðið var afturkallað.',
  'identityInvitation.sentNotice': 'Boðið var sent.',
  'identityInvitation.deliveryIssueNotice': 'Ekki er víst að boðið hafi borist.',
  'identityInvitation.genericError': 'Ekki tókst að vinna með boðið.',
  'identityInvitation.acceptedAccessLabel': 'Gesturinn hefur samþykkt lestraraðgang.',
  'identityInvitation.pendingRecipient': 'Boð bíður svars frá {label}.',
  'identityInvitation.unsentRecipient': 'Boðið á {label} bíður sendingar.',
  'identityInvitation.failedRecipient': 'Ekki tókst að senda boðið á {label}.',
  'identityInvitation.uncertainRecipient': 'Ekki er víst að boðið á {label} hafi borist.',
  'identityInvitation.unavailableRelationship': 'Ekki er hægt að senda boð fyrir þessa gömlu tengingu.',
  'attendance.declined': 'Hafnað',
  'attendance.cancelled': 'Boð afturkallað',
  'attendance.expired': 'Boð útrunnið',
  'attendance.left': 'Hætt þátttöku',
  'attendance.revoked': 'Aðgangur afturkallaður',
  'attendance.invitedBy': 'Viðburður stofnaður af {name}',
  'detail.addExpense': 'Skrá útlagðan kostnað',
  'attendance.participants': 'Gestir',
  'attendance.noParticipants': 'Engir gestir.',
  'attendance.genericGuest': 'Gestur',
  'attendance.you': 'þú',
  'attendance.leave': 'Hætta þátttöku',
  'attendance.leaving': 'Hætti þátttöku...',
  'attendance.leaveConfirm': 'Hætta þátttöku?',
  'invitation.accept': 'Samþykkja',
  'invitation.accepting': 'Samþykki...',
  'invitation.decline': 'Hafna',
  'invitation.declining': 'Hafna...',
  'invitation.acceptedStatus': 'Þú hefur samþykkt lestraraðgang.',
  'invitation.unknownInviter': 'Teskeiðarnotanda',
  'errors.invalid_input': 'Ógilt.',
  'errors.not_allowed': 'Ekki leyfilegt.',
  'errors.not_found': 'Fannst ekki.',
  'errors.conflict': 'Árekstur.',
  'errors.feature_disabled': 'Ekki opið.',
  'errors.save_failed': 'Ekki tókst að vista.',
}

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    let value = copy[key] ?? key
    for (const [name, replacement] of Object.entries(values ?? {})) {
      value = value.replace(`{${name}}`, String(replacement))
    }
    return value
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: mockRefresh }),
}))
vi.mock('@/lib/events/actions', () => ({
  cancelEventGuestAttendanceInvitation: mockCancel,
  inviteEventGuestAttendance: mockInvite,
  leaveEventAttendance: mockLeave,
  resendEventGuestAttendanceInvitation: mockResend,
  respondEventGuestAttendanceInvitation: mockRespond,
}))

import { EventAttendanceInvitationActions } from '../EventAttendanceInvitationActions'
import { EventAttendeeDetail } from '../EventAttendeeDetail'
import { EventGuestAttendanceControl } from '../EventGuestAttendanceControl'
import type { EventGuestAttendanceView } from '@/lib/events/contracts'

const EVENT_ID = '30000000-0000-4000-8000-000000000001'
const GUEST_ID = '40000000-0000-4000-8000-000000000001'
const INVITATION_ID = '50000000-0000-4000-8000-000000000001'

const notInvited: EventGuestAttendanceView = {
  status: 'not_invited',
  invitationId: null,
  invitationKind: null,
  recipientLabel: null,
  deliveryStatus: null,
  attemptNumber: null,
  invitedAt: null,
  expiresAt: null,
  acceptedAt: null,
}

function pending(deliveryStatus: 'not_sent' | 'reserved' | 'sent' | 'failed'): EventGuestAttendanceView {
  return {
    status: 'pending',
    invitationId: INVITATION_ID,
    invitationKind: 'identity_and_access',
    recipientLabel: 'g***@example.is',
    deliveryStatus,
    attemptNumber: deliveryStatus === 'not_sent' ? 0 : 1,
    invitedAt: '2026-08-16T09:00:00.000Z',
    expiresAt: '2026-08-23T09:00:00.000Z',
    acceptedAt: null,
  }
}

type ControlInput = {
  sourceKind?: 'relationship' | 'manual_name' | 'manual_email'
  isTeskeidUser?: boolean
  attendance?: EventGuestAttendanceView
}

function control(input: ControlInput = {}) {
  return (
    <EventGuestAttendanceControl
      eventId={EVENT_ID}
      eventGuestId={GUEST_ID}
      rosterRevision={2}
      partyLabel="Anna"
      sourceKind={input.sourceKind ?? 'manual_name'}
      isTeskeidUser={input.isTeskeidUser ?? false}
      attendance={input.attendance ?? notInvited}
      disabled={false}
      onPendingChange={vi.fn()}
    />
  )
}

function renderControl(input: ControlInput = {}) {
  return render(control(input))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  mockInvite.mockResolvedValue({
    ok: true,
    data: {
      invitationId: INVITATION_ID,
      invitationKind: 'identity_and_access',
      rosterRevision: 2,
      delivery: 'sent',
    },
  })
  mockResend.mockResolvedValue({ ok: true, data: { delivery: 'sent' } })
  mockCancel.mockResolvedValue({ ok: true, data: { rosterRevision: 2 } })
  mockRespond.mockResolvedValue({ ok: true, data: { status: 'accepted' } })
  mockLeave.mockResolvedValue({ ok: true, data: { status: 'left' } })
})

describe('Event guest attendance owner adapter', () => {
  it('uses the shared email flow only for an unlinked name-only guest', async () => {
    renderControl()
    fireEvent.click(screen.getByRole('button', { name: 'Tengja og bjóða aðgang' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Netfang gestsins' }), {
      target: { value: 'anna@example.is' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Senda boð' }))

    await waitFor(() => expect(mockInvite).toHaveBeenCalledWith(expect.objectContaining({
      event_id: EVENT_ID,
      event_guest_id: GUEST_ID,
      expected_roster_revision: 2,
      recipient_email: 'anna@example.is',
    })))
  })

  it.each([
    ['relationship', true],
    ['manual_email', false],
    ['manual_name', true],
  ] as const)('sends a direct access invitation for %s linked=%s', async (sourceKind, isTeskeidUser) => {
    renderControl({ sourceKind, isTeskeidUser })
    fireEvent.click(screen.getByRole('button', { name: 'Bjóða aðgang' }))
    await waitFor(() => expect(mockInvite).toHaveBeenCalledWith(expect.objectContaining({
      recipient_email: null,
    })))
  })

  it('keeps an orphaned legacy relationship non-actionable', () => {
    renderControl({ sourceKind: 'relationship', isTeskeidUser: false })
    expect(screen.getByText(/gömlu tengingu/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Bjóða aðgang/ })).not.toBeInTheDocument()
  })

  it.each(['sent', 'not_sent', 'failed', 'reserved'] as const)(
    'keeps email delivery details out of the pending invitation UI for %s',
    (deliveryStatus) => {
    renderControl({ attendance: pending(deliveryStatus) })
    expect(screen.getByText('Boð bíður svars frá g***@example.is.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Senda aftur' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Afturkalla boð' })).toBeInTheDocument()
  })

  it('supports cancelling a pending invitation without exposing email resend', async () => {
    renderControl({ attendance: pending('sent') })
    fireEvent.click(screen.getByRole('button', { name: 'Afturkalla boð' }))
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith(expect.objectContaining({
      invitation_id: INVITATION_ID,
      expected_roster_revision: 2,
    })))
  })

  it('renders accepted read access without claiming an identity relationship', () => {
    renderControl({ attendance: {
      ...pending('sent'),
      status: 'accepted',
      recipientLabel: null,
      deliveryStatus: null,
      attemptNumber: null,
      expiresAt: null,
      acceptedAt: '2026-08-16T09:05:00.000Z',
    } })
    expect(screen.getByText('Gesturinn hefur samþykkt lestraraðgang.')).toBeInTheDocument()
    expect(screen.queryByText(/tengdur/i)).not.toBeInTheDocument()
  })

  it('re-enables the email invitation flow after a name-only guest leaves', () => {
    renderControl({ attendance: {
      ...notInvited,
      status: 'left',
      invitationId: INVITATION_ID,
      invitationKind: 'identity_and_access',
      invitedAt: '2026-08-16T09:00:00.000Z',
    } })
    expect(screen.getByText('Hætt þátttöku')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tengja og bjóða aðgang' })).toBeInTheDocument()
  })

  it('focuses a direct action error and blocks synchronous double submission', async () => {
    let resolveInvite!: (value: unknown) => void
    mockInvite.mockReturnValue(new Promise((resolve) => { resolveInvite = resolve }))
    renderControl({ sourceKind: 'manual_email' })
    const button = screen.getByRole('button', { name: 'Bjóða aðgang' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(mockInvite).toHaveBeenCalledTimes(1)
    resolveInvite({ ok: false, error: 'save_failed' })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveFocus()
  })

  it('refreshes a stale invite conflict while retaining focused feedback for retry', async () => {
    mockInvite.mockResolvedValueOnce({ ok: false, error: 'conflict' })
    renderControl({ sourceKind: 'manual_email' })
    fireEvent.click(screen.getByRole('button', { name: 'Bjóða aðgang' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveFocus()
    expect(alert).toHaveTextContent('Árekstur.')
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })
})

describe('scoped attendance consent and management', () => {
  it('never navigates an expired accept response to event detail', async () => {
    mockRespond.mockResolvedValueOnce({ ok: true, data: { status: 'expired' } })
    render(
      <EventAttendanceInvitationActions
        invitationId={INVITATION_ID}
        eventId={EVENT_ID}
        hasEventAccess
        status="pending"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Samþykkja' }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth-mvp/vidburdir'))
    expect(mockPush).not.toHaveBeenCalledWith(`/auth-mvp/vidburdir/${EVENT_ID}`)
  })

  it('keeps a no-flag accepter on the scoped URL, unlocks accepted management, then leaves', async () => {
    const view = render(
      <EventAttendanceInvitationActions
        invitationId={INVITATION_ID}
        eventId={EVENT_ID}
        hasEventAccess={false}
        status="pending"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Samþykkja' }))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(
      `/auth-mvp/vidburdir/bod/thattaka/${INVITATION_ID}`,
    ))

    view.rerender(
      <EventAttendanceInvitationActions
        invitationId={INVITATION_ID}
        eventId={EVENT_ID}
        hasEventAccess={false}
        status="accepted"
      />,
    )
    const leaveButton = await screen.findByRole('button', { name: 'Hætta þátttöku' })
    expect(leaveButton).toBeEnabled()
    fireEvent.click(leaveButton)
    fireEvent.click(leaveButton)
    await waitFor(() => expect(mockLeave).toHaveBeenCalledTimes(1))
    expect(mockLeave).toHaveBeenCalledWith(expect.objectContaining({ event_id: EVENT_ID }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth-mvp/heim'))
  })

  it('focuses thrown consent errors', async () => {
    mockRespond.mockRejectedValueOnce(new Error('transport'))
    render(
      <EventAttendanceInvitationActions
        invitationId={INVITATION_ID}
        eventId={EVENT_ID}
        hasEventAccess={false}
        status="pending"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Samþykkja' }))
    expect(await screen.findByRole('alert')).toHaveFocus()
  })
})

describe('read-only attendee detail', () => {
  const attendeeEvent = {
    id: EVENT_ID,
    name: 'Kvisskvöld',
    rosterRevision: 2,
    viewerRole: 'attendee' as const,
    ownerDisplayName: null,
    createdAt: '2026-08-16T09:00:00.000Z',
    updatedAt: '2026-08-16T09:00:00.000Z',
    guests: [{ id: GUEST_ID, displayName: null, position: 0, isSelf: true }],
  }

  it('renders only the safe roster and blocks a double leave click through navigation handoff', async () => {
    let resolveLeave!: (value: unknown) => void
    mockLeave.mockReturnValue(new Promise((resolve) => { resolveLeave = resolve }))
    render(<EventAttendeeDetail event={attendeeEvent} canUseExpenses={false} />)
    expect(screen.getByText('Gestur')).toBeInTheDocument()
    expect(screen.getByText('Viðburður stofnaður af Teskeiðarnotanda')).toBeInTheDocument()
    expect(screen.queryByText(/lestraraðgang|útgjöld né skuldir/)).not.toBeInTheDocument()
    expect(screen.queryByText(/netfang|breyta|útlagður/i)).not.toBeInTheDocument()
    const leaveButton = screen.getByRole('button', { name: 'Hætta þátttöku' })
    fireEvent.click(leaveButton)
    fireEvent.click(leaveButton)
    expect(mockLeave).toHaveBeenCalledTimes(1)
    resolveLeave({ ok: true, data: { status: 'left' } })
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth-mvp/vidburdir'))
    expect(leaveButton).toBeDisabled()
  })

  it('focuses a leave error', async () => {
    mockLeave.mockRejectedValueOnce(new Error('transport'))
    render(<EventAttendeeDetail event={attendeeEvent} canUseExpenses={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hætta þátttöku' }))
    expect(await screen.findByRole('alert')).toHaveFocus()
  })

  it('shows the event expense action only with separate Expense access', () => {
    const { rerender } = render(
      <EventAttendeeDetail event={attendeeEvent} canUseExpenses={false} />,
    )
    expect(screen.queryByRole('link', { name: 'Skrá útlagðan kostnað' })).not.toBeInTheDocument()
    rerender(<EventAttendeeDetail event={attendeeEvent} canUseExpenses />)
    expect(screen.getByRole('link', { name: 'Skrá útlagðan kostnað' })).toHaveAttribute(
      'href',
      `/auth-mvp/utlagt-og-endurgreitt/nytt?event=${EVENT_ID}`,
    )
  })
})
