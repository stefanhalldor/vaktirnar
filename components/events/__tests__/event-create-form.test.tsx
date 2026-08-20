import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'

const { mockCreateEvent, mockPush, mockRefresh } = vi.hoisted(() => ({
  mockCreateEvent: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
}))

const copy: Record<string, string> = {
  'create.details': 'Viðburður',
  'create.detailsHint': 'Heitið dugar.',
  'create.name': 'Heiti',
  'create.namePlaceholder': 'Kvisskvöld',
  'create.date': 'Dagsetning (valkvætt)',
  'create.datePlaceholder': 'Veldu dag',
  'create.time': 'Tími (valkvætt)',
  'create.hour': 'Klukkustund',
  'create.minute': 'Mínútur',
  'create.dateTimePair': 'Veldu bæði dagsetningu og tíma.',
  'create.description': 'Lýsing (valkvætt)',
  'create.descriptionPlaceholder': 'Lýsing',
  'create.agenda': 'Dagskrá (valkvætt)',
  'create.agendaPlaceholder': 'Dagskrá',
  'create.participants': 'Gestir',
  'create.participantsHint': 'Veldu gesti.',
  'create.teskeidParticipant': 'Þekktur aðili úr Tengslum',
  'create.guestParticipant': 'Gestur með nafni',
  'create.emailParticipant': 'Gestur með netfangi',
  'create.removeParticipant': 'Fjarlægja {name}',
  'create.noParticipants': 'Má byrja án gesta.',
  'create.participantLimit': 'Hámarki 49 gestum er náð.',
  'create.createOnly': 'Búa til viðburð',
  'create.creating': 'Bý til...',
  'create.createdTitle': 'Viðburðurinn var stofnaður',
  'create.createdWithInvitations': 'Viðburðurinn var stofnaður og ný boð bíða svars.',
  'create.createdWithDeliveryIssue': 'Viðburðurinn var stofnaður en einhver boð bíða.',
  'create.continueToDetail': 'Opna viðburðinn',
  'create.continuing': 'Opna...',
  'detail.rosterSavedWithInvitations': 'Gestalistinn var vistaður og ný boð voru send.',
  'detail.rosterSavedWithDeliveryIssue': 'Gestalistinn var vistaður en einhver boð bíða.',
  'detail.invitationDeliverySummary': '{sentCount} sent, {pendingCount} pending',
  'picker.trigger': 'Bæta við gesti',
  'picker.title': 'Bæta við gesti',
  'picker.description': 'Veldu þekktan aðila eða skráðu nafn eða netfang.',
  'picker.close': 'Loka gestavali',
  'picker.loadError': 'Ekki tókst að sækja notendur',
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
  'picker.addGuest': 'Bæta við gesti',
  'picker.guestNameInvalid': 'Ógilt nafn',
  'picker.emailInvalid': 'Ógilt netfang',
  'errors.invalid_input': 'Athugaðu heitið og gestalistann.',
  'errors.not_allowed': 'Ekki leyfilegt.',
  'errors.not_found': 'Fannst ekki.',
  'errors.conflict': 'Gögnin hafa breyst.',
  'errors.feature_disabled': 'Ekki virkt.',
  'errors.save_failed': 'Ekki tókst að vista viðburðinn.',
}

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    let value = copy[key] ?? key
    for (const [name, replacement] of Object.entries(values ?? {})) {
      value = value.replace(`{${name}}`, String(replacement))
    }
    return value
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))
vi.mock('@/lib/events/actions', () => ({ createEvent: mockCreateEvent }))

import { EventCreateForm } from '../EventCreateForm'

const option = {
  relationshipId: '60000000-0000-4000-8000-000000000001',
  pickerLabel: 'Mamma',
  sharedLabel: 'Guðrún Jónsdóttir',
  customLabels: [{ id: 'family', name: 'Fjölskylda' }],
}

function renderForm() {
  return render(
    <EventCreateForm
      options={[option]}
      optionsError={false}
    />,
  )
}

function enterName(value = 'Kvisskvöld') {
  fireEvent.change(screen.getByRole('textbox', { name: 'Heiti' }), { target: { value } })
}

function addKnown() {
  fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
  fireEvent.click(screen.getByRole('button', { name: /Mamma/ }))
}

function addManual(value: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
  fireEvent.click(screen.getByRole('button', { name: 'Nafn eða netfang' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Nafn eða netfang' }), { target: { value } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Bæta við gesti' }).at(-1)!)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateEvent.mockResolvedValue({
    ok: true,
    data: {
      eventId: '70000000-0000-4000-8000-000000000001',
      rosterRevision: 1,
      invitationCount: 0,
      deliveredCount: 0,
      deliveryIssue: false,
    },
  })
})

describe('EventCreateForm', () => {
  it('submits ordered strict relationship/name/email guests and opens the event detail', async () => {
    renderForm()
    enterName('  Kvisskvöld  ')
    addKnown()
    addManual('  Páll  ')
    addManual(' GESTUR@Example.is ')

    fireEvent.click(screen.getByRole('button', { name: 'Búa til viðburð' }))

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalledTimes(1))
    const payload = mockCreateEvent.mock.calls[0]![0]
    expect(payload).toEqual({
      request_id: expect.any(String),
      name: 'Kvisskvöld',
      guests: [
        { source_kind: 'relationship', relationship_id: option.relationshipId },
        { source_kind: 'manual_name', display_name: 'Páll' },
        { source_kind: 'manual_email', email: 'gestur@example.is' },
      ],
      event_date: null,
      event_time: null,
      description: '',
      agenda: '',
    })
    expect(JSON.stringify(payload)).not.toMatch(/Guðrún|pickerLabel|userId/i)
    expect(mockPush).toHaveBeenCalledWith(
      '/auth-mvp/vidburdir/70000000-0000-4000-8000-000000000001',
    )
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('allows zero guests and opens the event detail', async () => {
    renderForm()
    enterName()
    fireEvent.click(screen.getByRole('button', { name: 'Búa til viðburð' }))

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalledWith({
      request_id: expect.any(String),
      name: 'Kvisskvöld',
      guests: [],
      event_date: null,
      event_time: null,
      description: '',
      agenda: '',
    }))
    expect(mockPush).toHaveBeenCalledWith(
      '/auth-mvp/vidburdir/70000000-0000-4000-8000-000000000001',
    )
  })

  it('shows an honest post-commit receipt before continuing to the event detail', async () => {
    mockCreateEvent.mockResolvedValueOnce({
      ok: true,
      data: {
        eventId: '70000000-0000-4000-8000-000000000001',
        rosterRevision: 1,
        invitationCount: 3,
        deliveredCount: 2,
        deliveryIssue: true,
      },
    })
    renderForm()
    enterName()
    fireEvent.click(screen.getByRole('button', { name: 'Búa til viðburð' }))

    expect(await screen.findByRole('heading', { name: 'Viðburðurinn var stofnaður' }))
      .toBeInTheDocument()
    expect(screen.getByText('Viðburðurinn var stofnaður og ný boð bíða svars.'))
      .toBeInTheDocument()
    expect(screen.queryByText('2 sent, 1 pending')).not.toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()

    const continueButton = screen.getByRole('button', { name: 'Opna viðburðinn' })
    fireEvent.click(continueButton)
    fireEvent.click(continueButton)
    expect(mockPush).toHaveBeenCalledWith(
      '/auth-mvp/vidburdir/70000000-0000-4000-8000-000000000001',
    )
    expect(mockPush).toHaveBeenCalledTimes(1)
  })

  it('renders one primary submit before the Guests section and defaults to event detail', async () => {
    const { container } = renderForm()
    enterName()

    expect(screen.queryByRole('button', {
      name: 'Búa til og opna nýjan útlagðan kostnað',
    })).not.toBeInTheDocument()
    const createButton = screen.getByRole('button', { name: 'Búa til viðburð' })
    const guestsHeading = screen.getByRole('heading', { name: 'Gestir' })
    expect(createButton).toHaveClass('bg-primary')
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(1)
    expect(
      createButton.compareDocumentPosition(guestsHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalledTimes(1))
    expect(mockPush).toHaveBeenCalledWith(
      '/auth-mvp/vidburdir/70000000-0000-4000-8000-000000000001',
    )
  })

  it('submits optional date, time, description and agenda as one event payload', async () => {
    const { container } = renderForm()
    enterName()
    expect(screen.getByText('Veldu dag')).toBeInTheDocument()
    expect(screen.getByLabelText('Klukkustund')).toBeInTheDocument()
    expect(screen.getByLabelText('Mínútur')).toBeInTheDocument()
    expect(screen.getByLabelText('Lýsing (valkvætt)')).toHaveClass('py-3')
    expect(screen.getByLabelText('Dagskrá (valkvætt)')).toHaveClass('py-3')
    expect(container.querySelector('input[type="date"]')).toHaveClass('opacity-0')
    fireEvent.change(screen.getByLabelText('Dagsetning (valkvætt)'), {
      target: { value: '2026-09-12' },
    })
    expect(screen.getByRole('button', { name: 'Búa til viðburð' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Veldu bæði dagsetningu og tíma.')
    fireEvent.change(screen.getByLabelText('Tími (valkvætt)'), {
      target: { value: '18:30' },
    })
    fireEvent.change(screen.getByLabelText('Lýsing (valkvætt)'), {
      target: { value: '  Komið með hlý föt.  ' },
    })
    fireEvent.change(screen.getByLabelText('Dagskrá (valkvætt)'), {
      target: { value: '18:30 Mæting\n19:00 Matur' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Búa til viðburð' }))

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_date: '2026-09-12',
      event_time: '18:30',
      description: '  Komið með hlý föt.  ',
      agenda: '18:30 Mæting\n19:00 Matur',
    })))
  })

  it('reuses the exact request ID for unchanged returned and thrown retries', async () => {
    mockCreateEvent
      .mockResolvedValueOnce({ ok: false, error: 'save_failed' })
      .mockRejectedValueOnce(new Error('transport failed'))
      .mockResolvedValueOnce({
        ok: true,
        data: { eventId: '70000000-0000-4000-8000-000000000001', rosterRevision: 1 },
      })
    renderForm()
    enterName()
    const button = screen.getByRole('button', { name: 'Búa til viðburð' })

    fireEvent.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('Ekki tókst að vista viðburðinn.')
    fireEvent.click(button)
    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalledTimes(2))
    fireEvent.click(button)
    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalledTimes(3))
    expect(new Set(mockCreateEvent.mock.calls.map((call) => call[0].request_id)).size).toBe(1)
  })

  it('blocks duplicate submission synchronously while the first request is pending', async () => {
    let resolveRequest!: (value: { ok: false; error: 'save_failed' }) => void
    mockCreateEvent.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve }))
    renderForm()
    enterName()
    const button = screen.getByRole('button', { name: 'Búa til viðburð' })

    fireEvent.click(button)
    fireEvent.click(button)
    expect(mockCreateEvent).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('button', { name: 'Bý til...' })[0]).toBeDisabled()

    await act(async () => resolveRequest({ ok: false, error: 'save_failed' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('keeps duplicate guest names distinct and excludes a selected Relationship until removal', () => {
    renderForm()
    addManual('Sama nafn')
    addManual('Sama nafn')
    expect(screen.getAllByText('Sama nafn')).toHaveLength(2)

    addKnown()
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
    expect(screen.queryByRole('button', { name: /Mamma/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Loka gestavali' }))

    fireEvent.click(screen.getByRole('button', { name: 'Fjarlægja Mamma' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
    expect(screen.getByRole('button', { name: /Mamma/ })).toBeInTheDocument()
  })
})
