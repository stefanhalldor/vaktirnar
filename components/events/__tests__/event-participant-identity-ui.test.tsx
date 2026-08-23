import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'

const { mockRefresh, mockRepair, mockSetRsvp } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockRepair: vi.fn(),
  mockSetRsvp: vi.fn(),
}))

const copy: Record<string, string> = {
  'repair.title': 'Nafn vantar',
  'repair.ownerEmail': 'Netfang sem þú skráðir',
  'repair.hint': 'Skráðu nafn sem allir á viðburðinum mega sjá.',
  'repair.nameLabel': 'Sameiginlegt nafn',
  'repair.namePlaceholder': 'Nafn gests',
  'repair.invalidName': 'Sláðu inn gilt nafn.',
  'repair.saved': 'Nafnið var vistað.',
  'repair.saving': 'Vista nafn...',
  'repair.save': 'Vista nafn',
  'rsvp.title': 'Kemur þú?',
  'rsvp.hint': 'Svarið breytir ekki aðgangi þínum að viðburðinum.',
  'rsvp.saving': 'Vista...',
  'rsvp.save': 'Vista svar',
  'rsvp.attending': 'Mæti',
  'rsvp.notAttending': 'Kemst ekki',
  'rsvp.noResponse': 'Ekkert svar enn',
  'rsvp.considering': 'Í skoðun',
  'rsvp.noteLabel': 'Skýring til gestgjafa',
  'rsvp.notePlaceholder': 'Er að reyna að redda pössun',
  'rsvp.noteHint': 'Aðeins gestgjafi sér skýringuna.',
  'rsvp.noteCount': '{count}/240',
  'rsvp.noteInvalid': 'Athugaðu skýringuna.',
  'rsvp.conflict': 'Gögnin hafa breyst.',
  'errors.conflict': 'Gögnin hafa breyst.',
  'errors.save_failed': 'Ekki tókst að vista.',
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => copy[key] ?? key,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))
vi.mock('@/lib/events/participant-identity-v2.actions', () => ({
  repairEventPersonLabel: mockRepair,
}))
vi.mock('@/lib/events/participant-identity-v3.actions', () => ({
  setEventRsvpV3Action: mockSetRsvp,
  leaveEventParticipationV3Action: vi.fn(),
}))

import { EventGuestNameRepair } from '../EventGuestNameRepair'
import { EventPersonIdentity } from '../EventPersonIdentity'
import { EventRsvpControl } from '../EventRsvpControl'

const EVENT_ID = '10000000-0000-4000-8000-000000000001'
const GUEST_ID = '20000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Event participant identity UI', () => {
  it('lets only the owner repair an unresolved shared label without guessing from email', async () => {
    mockRepair.mockResolvedValueOnce({ ok: false, error: 'conflict' })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          eventId: EVENT_ID,
          eventGuestId: GUEST_ID,
          rosterRevision: '8',
          labelVersion: '2',
        },
      })

    render(<EventGuestNameRepair
      eventId={EVENT_ID}
      eventGuestId={GUEST_ID}
      rosterRevision="7"
      labelVersion="1"
      administrativeEmail="legacy@example.is"
    />)

    expect(screen.getByText('Nafn vantar')).toBeInTheDocument()
    expect(screen.getByText(/legacy@example\.is/)).toBeInTheDocument()
    const input = screen.getByRole('textbox', { name: 'Sameiginlegt nafn' })
    fireEvent.change(input, { target: { value: 'legacy@example.is' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vista nafn' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Sláðu inn gilt nafn.')
    expect(mockRepair).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '  Anna Gestur  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vista nafn' }))
    await waitFor(() => expect(mockRepair).toHaveBeenCalledTimes(1))
    const requestId = mockRepair.mock.calls[0]![0].request_id
    expect(mockRepair).toHaveBeenLastCalledWith({
      event_id: EVENT_ID,
      event_guest_id: GUEST_ID,
      expected_roster_revision: '7',
      expected_label_version: '1',
      shared_display_name: 'Anna Gestur',
      request_id: requestId,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Vista nafn' }))
    await waitFor(() => expect(mockRepair).toHaveBeenCalledTimes(2))
    expect(mockRepair.mock.calls[1]![0].request_id).toBe(requestId)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows the shared name to everyone and the actor-private overlay only when supplied', () => {
    const shared = {
      personRef: GUEST_ID,
      participantKind: 'guest' as const,
      position: 1,
      isSelf: false,
      shared: {
        accessState: 'active' as const,
        rsvpState: 'no_response' as const,
        labelState: 'resolved' as const,
        displayName: 'Anna Jónsdóttir',
        selectable: true,
        bulkEligible: true,
        disabledReason: null,
      },
      labelVersion: '1', identityVersion: '1', identityGeneration: '1',
      accessVersion: '1', rsvp: { state: 'no_response' as const, decisionVersion: '1' },
    }
    const props = {
      fallbackLabel: 'Nafn vantar',
      rsvpLabels: {
        no_response: 'Ekkert svar', considering: 'Í skoðun',
        attending: 'Mætir', not_attending: 'Kemst ekki',
      },
      privateNoteLabel: 'Mín skýring',
      rsvpPrivateNoteLabel: 'Skýring til gestgjafa',
      hiddenLabels: (count: number) => `+${count}`,
      builtInTagLabel: (tag: 'unclassified' | 'family' | 'friends' | 'recipients') => ({
        unclassified: 'Óflokkað', family: 'Fjölskylda', friends: 'Vinir', recipients: 'Viðtakendur',
      })[tag],
    }

    const { rerender } = render(<EventPersonIdentity person={shared} {...props} />)
    expect(screen.getByText('Anna Jónsdóttir')).toBeInTheDocument()
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()

    rerender(<EventPersonIdentity person={{
      ...shared,
      viewerPrivate: {
        kind: 'relationship',
        alias: 'Mín Anna',
        email: 'anna@example.is',
        builtInTags: ['family'],
        customLabels: ['Golf'],
        hiddenCustomLabelCount: 2,
        note: 'Hittumst í klúbbnum',
      },
    }} {...props} />)
    expect(screen.getByText('Mín Anna')).toBeInTheDocument()
    expect(screen.getByText('Anna Jónsdóttir')).toBeInTheDocument()
    expect(screen.getByText('anna@example.is')).toBeInTheDocument()
    expect(screen.getByText('Fjölskylda')).toBeInTheDocument()
    expect(screen.getByText('Golf')).toBeInTheDocument()
    expect(screen.getByText('Mín skýring: Hittumst í klúbbnum')).toBeInTheDocument()

    rerender(<EventPersonIdentity person={{
      ...shared,
      viewerPrivate: {
        kind: 'relationship',
        alias: null,
        email: null,
        builtInTags: ['unclassified'],
        customLabels: ['prófunarlabel'],
        hiddenCustomLabelCount: 0,
        note: null,
      },
    }} {...props} />)
    expect(screen.queryByText('Óflokkað')).not.toBeInTheDocument()
    expect(screen.getByText('prófunarlabel')).toBeInTheDocument()
  })

  it('keeps RSVP separate from access and reuses the exact request id on retry', async () => {
    mockSetRsvp.mockResolvedValueOnce({ ok: false, error: 'conflict' })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          status: 'updated', requestId: '60000000-0000-4000-8000-000000000001',
          eventId: EVENT_ID, eventGuestId: GUEST_ID, identityGeneration: '1',
          accessState: 'active', accessVersion: '1', rsvpState: 'attending', decisionVersion: '2',
        },
      })
    render(<EventRsvpControl
      eventId={EVENT_ID}
      eventGuestId={GUEST_ID}
      identityGeneration="1"
      rsvpState="no_response"
      decisionVersion="1"
    />)

    expect(screen.getByText('Ekkert svar enn')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Mæti' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vista svar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Gögnin hafa breyst.')
    const firstRequestId = mockSetRsvp.mock.calls[0]![0].request_id
    fireEvent.click(screen.getByRole('button', { name: 'Vista svar' }))
    await waitFor(() => expect(mockSetRsvp).toHaveBeenCalledTimes(2))
    expect(mockSetRsvp.mock.calls[1]![0].request_id).toBe(firstRequestId)
    expect(mockRefresh).toHaveBeenCalledTimes(2)
  })
})
