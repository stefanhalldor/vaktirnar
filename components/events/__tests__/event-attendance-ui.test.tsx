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
  mockSetRsvp,
  mockLeaveV3,
} = vi.hoisted(() => ({
  mockCancel: vi.fn(),
  mockInvite: vi.fn(),
  mockLeave: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockReplace: vi.fn(),
  mockResend: vi.fn(),
  mockRespond: vi.fn(),
  mockSetRsvp: vi.fn(),
  mockLeaveV3: vi.fn(),
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
  'identityInvitation.acceptedAccessLabel': 'Gesturinn hefur aðgang að viðburðinum.',
  'identityInvitation.reinviteTriggerLabel': 'Endurbjóða',
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
  'attendance.leaveTitle': 'Hætta þátttöku',
  'attendance.leaveConfirm': 'Hætta þátttöku?',
  'attendance.leaveConfirmAction': 'Já, hætta þátttöku',
  'attendance.leaveKeep': 'Halda þátttöku',
  'attendance.leaveClose': 'Loka',
  'attendance.leaveSuccess': 'Þú hefur hætt þátttöku.',
  'attendance.leaveError': 'Ekki tókst að hætta þátttöku.',
  'attendance.leaveConflict': 'Staðan breyttist.',
  'rsvp.title': 'Kemurðu?',
  'rsvp.hint': 'Svar breytir ekki aðgangi.',
  'rsvp.noResponse': 'Ekkert svar',
  'rsvp.considering': 'Í skoðun',
  'rsvp.attending': 'Mæti',
  'rsvp.notAttending': 'Kemst ekki',
  'rsvp.noteLabel': 'Skýring til gestgjafa',
  'rsvp.notePlaceholder': 'Er að reyna að redda pössun',
  'rsvp.noteHint': 'Aðeins gestgjafi sér skýringuna.',
  'rsvp.noteCount': '{count}/240',
  'rsvp.noteInvalid': 'Athugaðu skýringuna.',
  'rsvp.save': 'Vista svar',
  'rsvp.saving': 'Vista...',
  'rsvp.saved': 'Svar vistað.',
  'rsvp.saveError': 'Ekki tókst að vista svarið.',
  'rsvp.conflict': 'Svarið breyttist.',
  'personPicker.privateNoteLabel': 'Mín skýring',
  'personPicker.hiddenLabels': '+{count}',
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
vi.mock('@/lib/events/participant-identity-v3.actions', () => ({
  setEventRsvpV3Action: mockSetRsvp,
  leaveEventParticipationV3Action: mockLeaveV3,
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
  accessState?: 'active' | 'left' | 'revoked'
  recipientState?: 'name_only' | 'email_unbound' | 'user_bound' | 'identity_tombstone'
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
      accessState={input.accessState ?? 'active'}
      recipientState={input.recipientState ?? 'name_only'}
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
  mockLeaveV3.mockResolvedValue({ ok: true, data: {
    status: 'left', requestId: '60000000-0000-4000-8000-000000000001', eventId: EVENT_ID,
    eventGuestId: GUEST_ID, identityGeneration: '1', identityVersion: '1', accessVersion: '2',
  } })
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

  it('does not repeat active user-bound access beneath each guest', () => {
    renderControl({ recipientState: 'user_bound', attendance: {
      ...pending('sent'),
      status: 'accepted',
      recipientLabel: null,
      deliveryStatus: null,
      attemptNumber: null,
      expiresAt: null,
      acceptedAt: '2026-08-16T09:05:00.000Z',
    } })
    expect(screen.queryByText('Gesturinn hefur aðgang að viðburðinum.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Bjóða aðgang/ })).not.toBeInTheDocument()
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

  it('reinvites one left user-bound guest through the persisted identity action', async () => {
    mockInvite.mockResolvedValueOnce({ ok: true, data: {
      invitationId: INVITATION_ID,
      invitationKind: 'access_only',
      rosterRevision: 3,
      delivery: 'sent',
    } })
    renderControl({
      accessState: 'left',
      recipientState: 'user_bound',
      isTeskeidUser: true,
      attendance: {
        ...notInvited,
        status: 'left',
        invitationId: INVITATION_ID,
        invitationKind: 'access_only',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Endurbjóða' }))
    await waitFor(() => expect(mockInvite).toHaveBeenCalledWith(expect.objectContaining({
      event_guest_id: GUEST_ID,
      recipient_email: null,
    })))
    expect(mockRefresh).toHaveBeenCalledTimes(1)
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
    eventId: EVENT_ID,
    name: 'Kvisskvöld',
    rosterRevision: '2',
    viewerRole: 'attendee' as const,
    createdAt: '2026-08-16T09:00:00.000Z',
    updatedAt: '2026-08-16T09:00:00.000Z',
    eventDate: null,
    eventTime: null,
    description: null,
    agenda: null,
    selfRsvp: { state: 'no_response' as const, decisionVersion: '1' },
    people: [
      {
        personRef: '30000000-0000-4000-8000-000000000099',
        participantKind: 'organizer' as const,
        position: 0 as const,
        isSelf: false,
        shared: {
          labelState: 'resolved' as const,
          displayName: 'Eigandi',
          selectable: true,
          bulkEligible: true,
          disabledReason: null,
        },
      },
      {
        personRef: GUEST_ID,
        participantKind: 'guest' as const,
        position: 1,
        isSelf: true,
        shared: {
          accessState: 'active' as const,
          rsvpState: 'no_response' as const,
          labelState: 'resolved' as const,
          displayName: 'Gestur',
          selectable: true,
          bulkEligible: true,
          disabledReason: null,
        },
        labelVersion: '1',
        identityVersion: '1',
        identityGeneration: '1',
        accessVersion: '1',
        rsvp: { state: 'no_response' as const, decisionVersion: '1' },
      },
    ],
  }

  it('renders the safe roster and keeps no-response access independent from RSVP', async () => {
    mockSetRsvp.mockResolvedValue({ ok: true, data: {
      status: 'updated', requestId: '60000000-0000-4000-8000-000000000001',
      eventId: EVENT_ID, eventGuestId: GUEST_ID, identityGeneration: '1',
      accessState: 'active', accessVersion: '1', rsvpState: 'attending', decisionVersion: '2',
    } })
    render(<EventAttendeeDetail event={attendeeEvent} canUseExpenses={false} />)
    expect(screen.getByText('Gestur')).toBeInTheDocument()
    expect(screen.getByText('Viðburður stofnaður af Eigandi')).toBeInTheDocument()
    expect(screen.getAllByText('Ekkert svar').length).toBeGreaterThan(0)
    expect(screen.queryByText(/lestraraðgang|útgjöld né skuldir/)).not.toBeInTheDocument()
    expect(screen.queryByText(/netfang|breyta|útlagður/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Mæti' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vista svar' }))
    await waitFor(() => expect(mockSetRsvp).toHaveBeenCalledWith(expect.objectContaining({
      event_id: EVENT_ID,
      event_guest_id: GUEST_ID,
      identity_generation: '1',
      rsvp_state: 'attending',
      private_note: null,
      expected_decision_version: '1',
    })))
    expect(mockRefresh).toHaveBeenCalled()
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

  it('keeps a considering note private, single-paragraph and explicit-save only', async () => {
    mockSetRsvp.mockResolvedValueOnce({ ok: true, data: {
      status: 'updated', requestId: '60000000-0000-4000-8000-000000000001',
      eventId: EVENT_ID, eventGuestId: GUEST_ID, identityGeneration: '1',
      accessState: 'active', accessVersion: '1', rsvpState: 'considering', decisionVersion: '2',
    } })
    render(<EventAttendeeDetail event={attendeeEvent} canUseExpenses={false} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Í skoðun' }))
    const note = screen.getByRole('textbox', { name: 'Skýring til gestgjafa' })
    fireEvent.change(note, { target: { value: 'Fyrri lína\nÖnnur lína' } })
    expect(screen.getAllByText('Athugaðu skýringuna.').length).toBeGreaterThan(0)
    expect(note).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining('event-rsvp-private-note-error'),
    )
    expect(screen.getByText('Athugaðu skýringuna.')).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('button', { name: 'Vista svar' })).toBeDisabled()

    fireEvent.change(note, { target: { value: '  Er að reyna að redda pössun  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vista svar' }))
    await waitFor(() => expect(mockSetRsvp).toHaveBeenCalledWith(expect.objectContaining({
      identity_generation: '1',
      rsvp_state: 'considering',
      private_note: 'Er að reyna að redda pössun',
      expected_decision_version: '1',
    })))
  })

  it('keeps self-leave distinct from RSVP and confirms the exact current generation', async () => {
    render(<EventAttendeeDetail event={attendeeEvent} canUseExpenses={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Hætta þátttöku' }))
    expect(await screen.findByRole('dialog', { name: 'Hætta þátttöku' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Já, hætta þátttöku' }))

    await waitFor(() => expect(mockLeaveV3).toHaveBeenCalledWith(expect.objectContaining({
      event_id: EVENT_ID,
      event_guest_id: GUEST_ID,
      identity_generation: '1',
      expected_identity_version: '1',
      expected_access_version: '1',
    })))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth-mvp/vidburdir'))
  })
})
