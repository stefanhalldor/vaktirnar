import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'

const {
  mockRefresh,
  mockSaveEventRoster,
  mockInviteEventGuestAttendance,
  mockCancelEventGuestAttendanceInvitation,
  mockRepairEventPersonLabel,
} = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockSaveEventRoster: vi.fn(),
  mockInviteEventGuestAttendance: vi.fn(),
  mockCancelEventGuestAttendanceInvitation: vi.fn(),
  mockRepairEventPersonLabel: vi.fn(),
}))

const copy: Record<string, string> = {
  'list.create': 'Nýr viðburður',
  'list.emptyTitle': 'Engir viðburðir enn',
  'list.emptyDescription': 'Stofnaðu viðburð.',
  'list.heading': 'Viðburðirnir þínir',
  'list.participantCount': '{count} gestir',
  'list.createdAt': 'Stofnað {date}',
  'attendance.ownedHeading': 'Viðburðirnir þínir',
  'attendance.ownedEmpty': 'Engir eigin viðburðir.',
  'attendance.pendingHeading': 'Boð sem bíða',
  'attendance.pendingEmpty': 'Engin boð.',
  'attendance.acceptedHeading': 'Viðburðir sem þú tekur þátt í',
  'attendance.acceptedEmpty': 'Engin samþykkt boð.',
  'attendance.openInvitation': 'Opna boð í {name}',
  'attendance.invitedBy': 'Viðburður stofnaður af {name}',
  'attendance.genericGuest': 'Gestur',
  'invitation.unknownInviter': 'Teskeiðarnotanda',
  'detail.createdAt': 'Stofnað {date}',
  'detail.addExpense': 'Skrá útlagðan kostnað',
  'detail.participants': 'Gestir',
  'detail.editRosterHint': 'Bættu við eða fjarlægðu gesti.',
  'detail.leftParticipants': 'Hætt þátttöku',
  'detail.leftParticipantsHint': 'Þessir gestir hafa ekki lengur aðgang.',
  'detail.noParticipants': 'Engir gestir voru skráðir.',
  'detail.teskeidParticipant': 'Þekktur aðili úr Tengslum',
  'detail.guestParticipant': 'Gestur með nafni',
  'detail.emailParticipant': 'Gestur með netfangi',
  'detail.unsavedEmailParticipant': 'Á eftir að vista gestalistann til að senda boð.',
  'detail.removeParticipant': 'Fjarlægja {name}',
  'detail.participantLimit': 'Hámarki 49 gestum er náð.',
  'detail.unsavedRosterHint': 'Þú átt óvistaðar breytingar.',
  'detail.saveRoster': 'Vista gestalista',
  'detail.savingRoster': 'Vista gestalista...',
  'detail.rosterSaved': 'Gestalistinn var vistaður.',
  'detail.rosterSavedWithInvitations': 'Gestalistinn var vistaður og ný boð bíða svars.',
  'detail.rosterSavedWithDeliveryIssue': 'Gestalistinn var vistaður en einhver boð bíða.',
  'detail.invitationDeliverySummary': '{sentCount} send, {pendingCount} bíða',
  'identityInvitation.acceptedAccessLabel': 'Gesturinn hefur samþykkt lestraraðgang.',
  'identityInvitation.linkAndInviteTriggerLabel': 'Tengja og bjóða aðgang',
  'identityInvitation.reinviteTriggerLabel': 'Endurbjóða',
  'identityInvitation.emailLabel': 'Netfang gestsins',
  'identityInvitation.emailPlaceholder': 'gestur@netfang.is',
  'identityInvitation.submitLabel': 'Senda boð',
  'identityInvitation.submittingLabel': 'Sendi boð...',
  'identityInvitation.entryCancelLabel': 'Hætta við',
  'identityInvitation.resendLabel': 'Senda aftur',
  'identityInvitation.cancelInvitationLabel': 'Afturkalla boð',
  'identityInvitation.cancelledNotice': 'Boðið var afturkallað.',
  'identityInvitation.sentNotice': 'Boðið var sent.',
  'identityInvitation.deliveryIssueNotice': 'Ekki er víst að boðið hafi borist.',
  'identityInvitation.genericError': 'Ekki tókst að vinna með boðið.',
  'picker.trigger': 'Bæta við gesti',
  'picker.title': 'Bæta við gesti',
  'picker.description': 'Veldu þekktan aðila eða skráðu nafn eða netfang.',
  'picker.close': 'Loka gestavali',
  'picker.loadError': 'Ekki tókst að sækja þekkta aðila',
  'picker.searchLabel': 'Leita í Tengslum',
  'picker.searchPlaceholder': 'Nafn eða label',
  'picker.filterLabel': 'Sía eftir labelum',
  'picker.allFilterLabel': 'Allir',
  'picker.noResults': 'Enginn fannst',
  'picker.sourceLabel': 'Hvaðan kemur gesturinn?',
  'picker.knownMode': 'Þekktur aðili',
  'picker.guestMode': 'Nafn eða netfang',
  'picker.guestName': 'Nafn eða netfang',
  'picker.guestPlaceholder': 'Nafn eða netfang',
  'picker.guestHint': 'Ekkert boð er sent.',
  'picker.sharedNameLabel': 'Nafn sem gestir sjá',
  'picker.sharedNamePlaceholder': 'Nafn gests',
  'picker.sharedNameHint': 'Sameiginlegt nafn.',
  'picker.emailOptionalLabel': 'Netfang (valkvætt)',
  'picker.emailPlaceholder': 'gestur@netfang.is',
  'picker.addGuest': 'Bæta við gesti',
  'picker.guestNameInvalid': 'Ógilt nafn',
  'picker.emailInvalid': 'Ógilt netfang',
  'errors.invalid_input': 'Athugaðu gestalistann.',
  'errors.not_allowed': 'Ekki leyfilegt.',
  'errors.not_found': 'Fannst ekki.',
  'errors.conflict': 'Sæki nýjustu stöðu.',
  'errors.feature_disabled': 'Ekki virkt.',
  'errors.not_available': 'Ekki tiltækt.',
  'errors.rate_limited': 'Of margar beiðnir.',
  'errors.save_failed': 'Ekki tókst að vista.',
  'repair.title': 'Nafn vantar',
  'repair.ownerEmail': 'Netfang sem þú skráðir',
  'repair.hint': 'Skráðu sameiginlegt nafn.',
  'repair.nameLabel': 'Sameiginlegt nafn',
  'repair.namePlaceholder': 'Nafn gests',
  'repair.invalidName': 'Ógilt nafn',
  'repair.saved': 'Nafnið var vistað.',
  'repair.saving': 'Vista nafn...',
  'repair.save': 'Vista nafn',
  'personPicker.privateNoteLabel': 'Mín skýring',
  'personPicker.nameMissing': 'Nafn vantar',
  'personPicker.hiddenLabels': '+{count}',
  'rsvp.noResponse': 'Ekkert svar',
  'rsvp.considering': 'Í skoðun',
  'rsvp.attending': 'Mætir',
  'rsvp.notAttending': 'Kemst ekki',
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
vi.mock('@/lib/events/actions', () => ({
  inviteEventGuestAttendance: mockInviteEventGuestAttendance,
  cancelEventGuestAttendanceInvitation: mockCancelEventGuestAttendanceInvitation,
}))
vi.mock('@/lib/events/participant-identity-v2.actions', () => ({
  saveEventRosterV2: mockSaveEventRoster,
  repairEventPersonLabel: mockRepairEventPersonLabel,
}))

import { EventDetail as ProductionEventDetail } from '../EventDetail'
import { EventList } from '../EventList'
import type { EventDetailView } from '@/lib/events/contracts'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'

const EVENT_ID = '70000000-0000-4000-8000-000000000001'
const GUEST_A = '71000000-0000-4000-8000-000000000001'
const GUEST_B = '71000000-0000-4000-8000-000000000002'
const eventSummary = {
  id: EVENT_ID,
  name: 'Kvisskvöld',
  guestCount: 2,
  rosterRevision: 1,
  createdAt: '2026-08-15T20:00:00.000Z',
  updatedAt: '2026-08-15T20:00:00.000Z',
}
const emptyDirectory = {
  owned: [], ownedHasMore: false, participating: [],
  participatingHasMore: false, claimHasMore: false,
}
const emptyDirectoryPage = { events: [], nextCursor: null }
const baseEvent = {
  id: EVENT_ID,
  name: 'Kvisskvöld',
  rosterRevision: 1,
  createdAt: '2026-08-15T20:00:00.000Z',
  updatedAt: '2026-08-15T20:00:00.000Z',
  guests: [
    {
      id: GUEST_A,
      displayName: 'Mamma',
      sourceKind: 'relationship' as const,
      email: null,
      isTeskeidUser: true,
      position: 0,
    },
  ],
}
const option = {
  relationshipId: '72000000-0000-4000-8000-000000000001',
  pickerLabel: 'Bjarni',
  sharedLabel: 'Bjarni Jónsson',
  customLabels: [],
}
const savedNameOnlyEvent = {
  ...baseEvent,
  guests: [{
    id: GUEST_B,
    displayName: 'Biggi',
    sourceKind: 'manual_name' as const,
    email: null,
    isTeskeidUser: false,
    position: 0,
    attendance: {
      status: 'not_invited' as const,
      invitationId: null,
      invitationKind: null,
      recipientLabel: null,
      deliveryStatus: null,
      attemptNumber: null,
      invitedAt: null,
      expiresAt: null,
      acceptedAt: null,
    },
  }],
}

function EventDetail({
  event,
  options,
  optionsError,
  canUseExpenses,
  financialPanel,
}: {
  event: EventDetailView
  options: ExpenseParticipantOption[]
  optionsError: boolean
  canUseExpenses: boolean
  financialPanel?: React.ReactNode
}) {
  const people = [
    {
      personRef: '71000000-0000-4000-8000-000000000099',
      participantKind: 'organizer' as const,
      position: 0 as const,
      isSelf: true,
      shared: {
        labelState: 'resolved' as const,
        displayName: 'Eigandi',
        selectable: true,
        bulkEligible: true,
        disabledReason: null,
      },
    },
    ...event.guests.map((guest, index) => ({
      personRef: guest.id,
      participantKind: 'guest' as const,
      position: index + 1,
      isSelf: false,
      shared: {
        accessState: guest.attendance?.status === 'left' ? 'left' as const : 'active' as const,
        rsvpState: guest.attendance?.status === 'accepted' ? 'attending' as const : 'no_response' as const,
        labelState: 'resolved' as const,
        displayName: guest.displayName.includes('@') ? 'Gestur' : guest.displayName,
        selectable: true,
        bulkEligible: true,
        disabledReason: null,
      },
      labelVersion: '1',
      identityVersion: '1',
      identityGeneration: '1',
      accessVersion: '1',
      rsvp: {
        state: guest.attendance?.status === 'accepted' ? 'attending' as const : 'no_response' as const,
        decisionVersion: '1',
      },
    })),
  ]
  const identityView = {
    eventId: event.id,
    name: event.name,
    rosterRevision: String(event.rosterRevision),
    viewerRole: 'owner' as const,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    eventDate: null,
    eventTime: null,
    description: null,
    agenda: null,
    people,
  }
  const rosterManagement = {
    eventId: event.id,
    name: event.name,
    rosterRevision: String(event.rosterRevision),
    viewerRole: 'owner' as const,
    guests: event.guests.map((guest, index) => ({
      eventGuestId: guest.id,
      position: index,
      labelState: 'resolved' as const,
      sharedDisplayName: guest.displayName.includes('@') ? 'Gestur' : guest.displayName,
      labelVersion: '1',
      administrativeEmail: null,
      recipientState: guest.isTeskeidUser ? 'user_bound' as const : 'name_only' as const,
      identityVersion: '1',
      identityGeneration: '1',
      accessState: guest.attendance?.status === 'left' ? 'left' as const : 'active' as const,
      accessVersion: '1',
      rsvpState: guest.attendance?.status === 'accepted' ? 'attending' as const : 'no_response' as const,
      rsvpVersion: '1',
      invitationStatus: guest.attendance?.status ?? 'not_invited' as const,
    })),
  }
  return <ProductionEventDetail
    event={event}
    identityView={identityView}
    rosterManagement={rosterManagement}
    options={options}
    optionsError={optionsError}
    canCreateExpense={canUseExpenses}
    financialPanel={financialPanel}
  />
}

function addManual(value: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
  fireEvent.click(screen.getByRole('button', { name: 'Nafn eða netfang' }))
  const isEmail = value.includes('@')
  fireEvent.change(screen.getByRole('textbox', { name: /Nafn sem gestir sjá/ }), {
    target: { value: isEmail ? 'Anna' : value },
  })
  if (isEmail) {
    fireEvent.change(screen.getByRole('textbox', { name: 'Netfang (valkvætt)' }), { target: { value } })
  }
  fireEvent.click(screen.getAllByRole('button', { name: 'Bæta við gesti' }).at(-1)!)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSaveEventRoster.mockResolvedValue({
    ok: true,
    data: {
      eventId: EVENT_ID,
      rosterRevision: '2',
      invitationCount: 0,
      deliveredCount: 0,
      deliveryIssue: false,
    },
  })
  mockInviteEventGuestAttendance.mockResolvedValue({
    ok: true,
    data: {
      invitationId: '73000000-0000-4000-8000-000000000001',
      invitationKind: 'identity_and_access',
      rosterRevision: 1,
      delivery: 'sent',
    },
  })
  mockCancelEventGuestAttendanceInvitation.mockResolvedValue({
    ok: true,
    data: { rosterRevision: 1 },
  })
  mockRepairEventPersonLabel.mockResolvedValue({
    ok: true,
    data: { eventId: EVENT_ID, eventGuestId: GUEST_A, rosterRevision: '2', labelVersion: '2' },
  })
})

describe('event presentational components', () => {
  it('separates a left guest from the active-access roster section', () => {
    render(<EventDetail
      event={{
        ...baseEvent,
        guests: [{
          ...baseEvent.guests[0]!,
          attendance: {
            status: 'left',
            invitationId: '73000000-0000-4000-8000-000000000001',
            invitationKind: 'access_only',
            recipientLabel: null,
            deliveryStatus: null,
            attemptNumber: null,
            invitedAt: '2026-08-16T09:00:00.000Z',
            expiresAt: null,
            acceptedAt: '2026-08-16T09:05:00.000Z',
          },
        }],
      }}
      options={[]}
      optionsError={false}
      canUseExpenses={false}
    />)

    const activeSection = screen.getByRole('region', { name: 'Gestir' })
    const leftSection = screen.getByRole('region', { name: 'Hætt þátttöku' })
    expect(within(activeSection).queryByText('Mamma')).not.toBeInTheDocument()
    expect(within(leftSection).getByText('Mamma')).toBeInTheDocument()
    expect(within(leftSection).getByRole('button', { name: 'Endurbjóða' })).toBeInTheDocument()
  })

  it('renders an independent event list without expense counts', () => {
    const { rerender } = render(<EventList
      dashboard={{ owned: [], pending: [], attending: [] }}
      directory={emptyDirectory}
      initialPage={emptyDirectoryPage}
      canManageEvents
    />)
    expect(screen.getByText('Engir eigin viðburðir.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nýr viðburður' }))
      .toHaveAttribute('href', '/auth-mvp/vidburdir/nyr')

    rerender(<EventList
      dashboard={{ owned: [{ ...eventSummary, viewerRole: 'owner' }], pending: [], attending: [] }}
      directory={{ ...emptyDirectory, owned: [{
        id: EVENT_ID, name: 'Kvisskvöld', activeGuestCount: 2,
        rosterRevision: '1', viewerRole: 'owner' as const,
        createdAt: eventSummary.createdAt, updatedAt: eventSummary.updatedAt,
      }] }}
      initialPage={{ events: [{
        id: EVENT_ID, name: 'Kvisskvöld', rosterRevision: '1', viewerRole: 'owner' as const,
        activePersonCount: 3,
      }], nextCursor: null }}
      canManageEvents
    />)
    expect(screen.getByRole('link', { name: /Kvisskvöld/ }))
      .toHaveAttribute('href', `/auth-mvp/vidburdir/${EVENT_ID}`)
    expect(screen.getByText('2 gestir')).toBeInTheDocument()
    expect(screen.queryByText(/útgjöld/)).not.toBeInTheDocument()
  })

  it('localizes null pending-invitation labels without exposing an email fallback', () => {
    render(<EventList
      dashboard={{ owned: [], pending: [{
        invitationId: '74000000-0000-4000-8000-000000000001',
        eventId: EVENT_ID,
        name: 'Matarboð',
        guestDisplayName: null,
        inviterDisplayName: null,
        invitationKind: 'access_only',
        status: 'pending',
        invitedAt: '2026-08-16T09:00:00.000Z',
        expiresAt: '2026-08-23T09:00:00.000Z',
      }], attending: [] }}
      directory={emptyDirectory}
      initialPage={emptyDirectoryPage}
      canManageEvents
    />)
    expect(screen.getByText('Nafn vantar')).toBeInTheDocument()
    expect(screen.getByText('Viðburður stofnaður af Teskeiðarnotanda')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Matarboð/ }))
      .toHaveAttribute('href', `/auth-mvp/vidburdir/${EVENT_ID}`)
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()
  })

  it('shows only exact active participation controls to a scoped attendee', () => {
    render(<EventList
      dashboard={null}
      directory={{
        ...emptyDirectory,
        participating: [{
          id: EVENT_ID, name: 'Kvisskvöld', activeGuestCount: 1,
          rosterRevision: '1', viewerRole: 'attendee' as const,
          rsvpState: 'considering' as const, decisionVersion: '2',
          createdAt: eventSummary.createdAt, updatedAt: eventSummary.updatedAt,
        }],
      }}
      initialPage={{
        events: [{
          id: EVENT_ID, name: 'Kvisskvöld', rosterRevision: '1',
          viewerRole: 'attendee' as const, activePersonCount: 2,
          rsvpState: 'considering' as const, decisionVersion: '2',
        }],
        nextCursor: null,
      }}
      canManageEvents={false}
    />)

    expect(screen.getByRole('link', { name: /Kvisskvöld/ }))
      .toHaveAttribute('href', `/auth-mvp/vidburdir/${EVENT_ID}`)
    expect(screen.getByText(/Í skoðun/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Nýr viðburður' })).not.toBeInTheDocument()
    expect(screen.queryByText('Viðburðirnir þínir')).not.toBeInTheDocument()
    expect(screen.queryByText('Boð sem bíða')).not.toBeInTheDocument()
  })

  it('renders owner-only repair for an unresolved legacy email guest and never uses the email as the shared name', async () => {
    const legacyEvent = {
      ...baseEvent,
      guests: [{
        ...baseEvent.guests[0],
        displayName: 'legacy@example.is',
        sourceKind: 'manual_email' as const,
        isTeskeidUser: false,
      }],
    }
    const identityView = {
      eventId: EVENT_ID,
      name: legacyEvent.name,
      rosterRevision: '1',
      viewerRole: 'owner' as const,
      createdAt: legacyEvent.createdAt,
      updatedAt: legacyEvent.updatedAt,
      eventDate: null,
      eventTime: null,
      description: null,
      agenda: null,
      people: [{
        personRef: '71000000-0000-4000-8000-000000000099',
        participantKind: 'organizer' as const,
        position: 0 as const,
        isSelf: true,
        shared: { labelState: 'resolved' as const, displayName: 'Eigandi', selectable: true, bulkEligible: true, disabledReason: null },
      }, {
        personRef: GUEST_A,
        participantKind: 'guest' as const,
        position: 1,
        isSelf: false,
        shared: {
          accessState: 'active' as const, rsvpState: 'no_response' as const,
          labelState: 'needs_owner_input' as const, displayName: null,
          selectable: false, bulkEligible: false, disabledReason: 'name_required' as const,
        },
        labelVersion: '1', identityVersion: '1', identityGeneration: '1',
        accessVersion: '1', rsvp: { state: 'no_response' as const, decisionVersion: '1' },
      }],
    }
    const rosterManagement = {
      eventId: EVENT_ID,
      name: legacyEvent.name,
      rosterRevision: '1',
      viewerRole: 'owner' as const,
      guests: [{
        eventGuestId: GUEST_A, position: 0, labelState: 'needs_owner_input' as const,
        sharedDisplayName: null, labelVersion: '1', administrativeEmail: 'legacy@example.is',
        recipientState: 'email_unbound' as const, identityVersion: '1', identityGeneration: '1',
        accessState: 'active' as const, accessVersion: '1', rsvpState: 'no_response' as const,
        rsvpVersion: '1', invitationStatus: 'pending' as const,
      }],
    }

    render(<ProductionEventDetail
      event={legacyEvent}
      identityView={identityView}
      rosterManagement={rosterManagement}
      options={[]}
      optionsError={false}
      canCreateExpense={false}
    />)
    expect(screen.getAllByText('Nafn vantar').length).toBeGreaterThan(0)
    expect(screen.getByText(/legacy@example\.is/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fjarlægja legacy@example.is' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Sameiginlegt nafn' }), {
      target: { value: 'Anna Gestur' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Vista nafn' }))
    await waitFor(() => expect(mockRepairEventPersonLabel).toHaveBeenCalledWith({
      event_id: EVENT_ID,
      event_guest_id: GUEST_A,
      expected_roster_revision: '1',
      expected_label_version: '1',
      shared_display_name: 'Anna Gestur',
      request_id: expect.any(String),
    }))
  })

  it('saves one full ordered roster with retained IDs and new strict sources', async () => {
    render(
      <EventDetail
        event={baseEvent}
        options={[option]}
        optionsError={false}
        canUseExpenses={false}
      />,
    )
    addManual(' Anna@example.is ')
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
    fireEvent.click(screen.getByRole('button', { name: /Bjarni/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vista gestalista' }))

    await waitFor(() => expect(mockSaveEventRoster).toHaveBeenCalledTimes(1))
    expect(mockSaveEventRoster).toHaveBeenCalledWith({
      event_id: EVENT_ID,
      request_id: expect.any(String),
      expected_roster_revision: '1',
      guests: [
        { event_guest_id: GUEST_A },
        { source_kind: 'manual_email', email: 'anna@example.is', shared_display_name: 'Anna' },
        { source_kind: 'relationship', relationship_id: option.relationshipId },
      ],
    })
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Vista gestalista...' })).toBeDisabled()
  })

  it('shows the pending invitation step for an unsaved email and no type label for a named guest', () => {
    render(
      <EventDetail
        event={baseEvent}
        options={[]}
        optionsError={false}
        canUseExpenses={false}
      />,
    )

    addManual('anna@example.is')
    expect(screen.getByText('Á eftir að vista gestalistann til að senda boð.')).toBeInTheDocument()

    addManual('Anna')
    expect(screen.queryByText('Gestur með nafni')).not.toBeInTheDocument()
  })

  it('submits a saved name-only guest invitation without nesting or saving the roster form', async () => {
    render(
      <EventDetail
        event={savedNameOnlyEvent}
        options={[]}
        optionsError={false}
        canUseExpenses={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tengja og bjóða aðgang' }))
    const emailInput = screen.getByRole('textbox', { name: 'Netfang gestsins' })
    const emailForm = emailInput.closest('form')
    expect(emailForm).not.toBeNull()
    expect(emailForm?.parentElement?.closest('form')).toBeNull()

    fireEvent.change(emailInput, { target: { value: ' biggi@example.is ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Senda boð' }))

    await waitFor(() => expect(mockInviteEventGuestAttendance).toHaveBeenCalledTimes(1))
    expect(mockInviteEventGuestAttendance).toHaveBeenCalledWith({
      event_id: EVENT_ID,
      event_guest_id: GUEST_B,
      expected_roster_revision: 1,
      request_id: expect.any(String),
      recipient_email: 'biggi@example.is',
    })
    expect(mockSaveEventRoster).not.toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Boðið var sent.')).toBeInTheDocument()
  })

  it('keeps a failed name-only guest invitation open without refreshing or saving the roster', async () => {
    mockInviteEventGuestAttendance.mockResolvedValueOnce({ ok: false, error: 'save_failed' })
    render(
      <EventDetail
        event={savedNameOnlyEvent}
        options={[]}
        optionsError={false}
        canUseExpenses={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tengja og bjóða aðgang' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Netfang gestsins' }), {
      target: { value: 'biggi@example.is' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Senda boð' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ekki tókst að vista.')
    expect(screen.getByRole('textbox', { name: 'Netfang gestsins' })).toBeInTheDocument()
    expect(mockInviteEventGuestAttendance).toHaveBeenCalledTimes(1)
    expect(mockSaveEventRoster).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('keeps email-delivery counts out of the durable roster-save receipt', async () => {
    mockSaveEventRoster.mockResolvedValueOnce({
      ok: true,
      data: {
        eventId: EVENT_ID,
        rosterRevision: 2,
        invitationCount: 21,
        deliveredCount: 20,
        deliveryIssue: true,
      },
    })
    render(
      <EventDetail
        event={baseEvent}
        options={[]}
        optionsError={false}
        canUseExpenses={false}
      />,
    )
    addManual('Anna')
    fireEvent.click(screen.getByRole('button', { name: 'Vista gestalista' }))

    expect(await screen.findByText('Gestalistinn var vistaður og ný boð bíða svars.'))
      .toBeInTheDocument()
    expect(screen.queryByText('20 send, 1 bíða')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vista gestalista...' })).toBeDisabled()
  })

  it('refreshes a stale revision and rebases without dropping local additions or removals', async () => {
    mockSaveEventRoster.mockResolvedValueOnce({ ok: false, error: 'conflict' })
    const { rerender } = render(
      <EventDetail
        event={baseEvent}
        options={[]}
        optionsError={false}
        canUseExpenses={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fjarlægja Mamma' }))
    addManual('Staðbundinn gestur')
    fireEvent.click(screen.getByRole('button', { name: 'Vista gestalista' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sæki nýjustu stöðu.')
    expect(screen.getByText('Staðbundinn gestur')).toBeInTheDocument()
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    rerender(<EventDetail event={{
      ...baseEvent,
      rosterRevision: 2,
      updatedAt: '2026-08-16T08:00:00.000Z',
      guests: [
        baseEvent.guests[0]!,
        {
          id: GUEST_B,
          displayName: 'Nýr gestur annars staðar',
          sourceKind: 'manual_name',
          email: null,
          isTeskeidUser: false,
          position: 1,
        },
      ],
    }} options={[]} optionsError={false} canUseExpenses={false} />)

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.queryByText('Mamma')).not.toBeInTheDocument()
    expect(screen.getByText('Staðbundinn gestur')).toBeInTheDocument()
    expect(screen.getByText('Nýr gestur annars staðar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vista gestalista' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Vista gestalista' }))
    await waitFor(() => expect(mockSaveEventRoster).toHaveBeenCalledTimes(2))
    expect(mockSaveEventRoster.mock.calls[1]![0]).toMatchObject({
      expected_roster_revision: '2',
      guests: [
        { source_kind: 'manual_name', display_name: 'Staðbundinn gestur' },
        { event_guest_id: GUEST_B },
      ],
    })
  })

  it('rebases unsaved roster edits over an unrelated newer server revision', async () => {
    const { rerender } = render(
      <EventDetail
        event={baseEvent}
        options={[]}
        optionsError={false}
        canUseExpenses={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fjarlægja Mamma' }))
    addManual('Óvistaður gestur')

    rerender(<EventDetail event={{
      ...baseEvent,
      rosterRevision: 2,
      updatedAt: '2026-08-16T08:30:00.000Z',
      guests: [
        baseEvent.guests[0]!,
        {
          id: GUEST_B,
          displayName: 'Nýr gestur annars staðar',
          sourceKind: 'manual_name',
          email: null,
          isTeskeidUser: false,
          position: 1,
        },
      ],
    }} options={[]} optionsError={false} canUseExpenses={false} />)

    await waitFor(() => expect(screen.getByText('Nýr gestur annars staðar')).toBeInTheDocument())
    expect(screen.queryByText('Mamma')).not.toBeInTheDocument()
    expect(screen.getByText('Óvistaður gestur')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vista gestalista' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Vista gestalista' }))
    await waitFor(() => expect(mockSaveEventRoster).toHaveBeenCalledTimes(1))
    expect(mockSaveEventRoster).toHaveBeenCalledWith(expect.objectContaining({
      expected_roster_revision: '2',
      guests: [
        { source_kind: 'manual_name', display_name: 'Óvistaður gestur' },
        { event_guest_id: GUEST_B },
      ],
    }))
  })

  it('replaces a clean roster when a newer canonical revision arrives', async () => {
    const { rerender } = render(
      <EventDetail
        event={baseEvent}
        options={[]}
        optionsError={false}
        canUseExpenses={false}
      />,
    )

    rerender(<EventDetail event={{
      ...baseEvent,
      rosterRevision: 2,
      updatedAt: '2026-08-16T08:45:00.000Z',
      guests: [{
        id: GUEST_B,
        displayName: 'Canonical gestur',
        sourceKind: 'manual_name',
        email: null,
        isTeskeidUser: false,
        position: 0,
      }],
    }} options={[]} optionsError={false} canUseExpenses={false} />)

    await waitFor(() => expect(screen.getByText('Canonical gestur')).toBeInTheDocument())
    expect(screen.queryByText('Mamma')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vista gestalista' })).toBeDisabled()
  })

  it('releases a same-revision conflict refresh without discarding the local draft', async () => {
    mockSaveEventRoster.mockResolvedValueOnce({ ok: false, error: 'conflict' })
    const { rerender } = render(
      <EventDetail
        event={baseEvent}
        options={[]}
        optionsError={false}
        canUseExpenses={false}
      />,
    )
    addManual('Leiðréttanlegur gestur')
    fireEvent.click(screen.getByRole('button', { name: 'Vista gestalista' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sæki nýjustu stöðu.')
    expect(screen.getByRole('button', { name: 'Vista gestalista...' })).toBeDisabled()

    rerender(
      <EventDetail
        event={{ ...baseEvent }}
        options={[]}
        optionsError={false}
        canUseExpenses={false}
      />,
    )

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Vista gestalista' }),
    ).toBeEnabled())
    expect(screen.getByText('Leiðréttanlegur gestur')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Vista gestalista' }))
    await waitFor(() => expect(mockSaveEventRoster).toHaveBeenCalledTimes(2))
  })

  it('rebases same-revision attendance refreshes without losing a dirty roster draft', async () => {
    const eventWithAttendance = {
      ...baseEvent,
      guests: [{
        ...baseEvent.guests[0]!,
        attendance: {
          status: 'not_invited' as const,
          invitationId: null,
          invitationKind: null,
          recipientLabel: null,
          deliveryStatus: null,
          attemptNumber: null,
          invitedAt: null,
          expiresAt: null,
          acceptedAt: null,
        },
      }],
    }
    const view = render(
      <EventDetail
        event={eventWithAttendance}
        options={[]}
        optionsError={false}
        canUseExpenses={false}
      />,
    )
    addManual('Óvistaður gestur')

    view.rerender(
      <EventDetail
        event={{
          ...eventWithAttendance,
          guests: [{
            ...eventWithAttendance.guests[0]!,
            attendance: {
              status: 'accepted',
              invitationId: '73000000-0000-4000-8000-000000000001',
              invitationKind: 'access_only',
              recipientLabel: null,
              deliveryStatus: null,
              attemptNumber: null,
              invitedAt: '2026-08-16T09:00:00.000Z',
              expiresAt: null,
              acceptedAt: '2026-08-16T09:05:00.000Z',
            },
          }],
        }}
        options={[]}
        optionsError={false}
        canUseExpenses={false}
      />,
    )

    await waitFor(() => expect(
      screen.queryByText('Gesturinn hefur samþykkt lestraraðgang.'),
    ).not.toBeInTheDocument())
    expect(screen.getByText('Óvistaður gestur')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vista gestalista' })).toBeEnabled()
  })

  it('keeps Event-scoped activity independent from the Expense create capability', () => {
    const { rerender } = render(
      <EventDetail
        event={baseEvent}
        options={[]}
        optionsError={false}
        canUseExpenses={false}
        financialPanel={<div data-testid="financial-panel" />}
      />,
    )
    expect(screen.queryByRole('link', { name: 'Skrá útlagðan kostnað' })).not.toBeInTheDocument()
    expect(screen.getByTestId('financial-panel')).toBeInTheDocument()

    rerender(
      <EventDetail
        event={baseEvent}
        options={[]}
        optionsError={false}
        canUseExpenses
        financialPanel={<div data-testid="financial-panel" />}
      />,
    )
    const expenseLink = screen.getByRole('link', { name: 'Skrá útlagðan kostnað' })
    const financialPanel = screen.getByTestId('financial-panel')
    const rosterHeading = screen.getByRole('heading', { name: 'Gestir' })
    expect(expenseLink).toHaveAttribute(
      'href',
      `/auth-mvp/utlagt-og-endurgreitt/nytt?event=${EVENT_ID}`,
    )
    expect(expenseLink.compareDocumentPosition(financialPanel) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy()
    expect(financialPanel.compareDocumentPosition(rosterHeading) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy()
  })

  it('does not expose retained relationship IDs; the server rejects a duplicate re-add without losing local state', async () => {
    const samePersonOption = { ...option, pickerLabel: 'Mamma' }
    mockSaveEventRoster.mockResolvedValueOnce({ ok: false, error: 'invalid_input' })
    render(
      <EventDetail
        event={baseEvent}
        options={[samePersonOption]}
        optionsError={false}
        canUseExpenses={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
    fireEvent.click(screen.getByRole('button', { name: /^Mamma/ }))
    expect(screen.getAllByText('Mamma')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Vista gestalista' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Athugaðu gestalistann.')
    expect(screen.getAllByText('Mamma')).toHaveLength(2)
    expect(mockSaveEventRoster.mock.calls[0]![0].guests).toEqual([
      { event_guest_id: GUEST_A },
      { source_kind: 'relationship', relationship_id: option.relationshipId },
    ])
  })
})
