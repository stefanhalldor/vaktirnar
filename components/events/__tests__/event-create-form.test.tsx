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
  'create.participants': 'Gestir',
  'create.participantsHint': 'Veldu gesti.',
  'create.teskeidParticipant': 'Þekktur aðili úr Tengslum',
  'create.guestParticipant': 'Gestur með nafni',
  'create.emailParticipant': 'Gestur með netfangi',
  'create.removeParticipant': 'Fjarlægja {name}',
  'create.noParticipants': 'Má byrja án gesta.',
  'create.participantLimit': 'Hámarki 49 gestum er náð.',
  'create.createAndExpense': 'Búa til og opna nýjan útlagðan kostnað',
  'create.createOnly': 'Búa til',
  'create.creating': 'Bý til...',
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

function renderForm(canUseExpenses = true) {
  return render(
    <EventCreateForm
      options={[option]}
      optionsError={false}
      canUseExpenses={canUseExpenses}
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
    data: { eventId: '70000000-0000-4000-8000-000000000001', rosterRevision: 1 },
  })
})

describe('EventCreateForm', () => {
  it('submits ordered strict relationship/name/email guests and opens the shared expense form', async () => {
    renderForm()
    enterName('  Kvisskvöld  ')
    addKnown()
    addManual('  Páll  ')
    addManual(' GESTUR@Example.is ')

    fireEvent.click(screen.getByRole('button', { name: 'Búa til og opna nýjan útlagðan kostnað' }))

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
    })
    expect(JSON.stringify(payload)).not.toMatch(/Guðrún|pickerLabel|userId/i)
    expect(mockPush).toHaveBeenCalledWith(
      '/auth-mvp/utlagt-og-endurgreitt/nytt?event=70000000-0000-4000-8000-000000000001',
    )
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('allows zero guests and sends the secondary action to event detail', async () => {
    renderForm()
    enterName()
    fireEvent.click(screen.getByRole('button', { name: 'Búa til' }))

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalledWith({
      request_id: expect.any(String),
      name: 'Kvisskvöld',
      guests: [],
    }))
    expect(mockPush).toHaveBeenCalledWith(
      '/auth-mvp/vidburdir/70000000-0000-4000-8000-000000000001',
    )
  })

  it('renders create-only as the sole default primary action without Expenses access', async () => {
    const { container } = renderForm(false)
    enterName()

    expect(screen.queryByRole('button', {
      name: 'Búa til og opna nýjan útlagðan kostnað',
    })).not.toBeInTheDocument()
    const createButton = screen.getByRole('button', { name: 'Búa til' })
    expect(createButton).toHaveClass('bg-primary')
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalledTimes(1))
    expect(mockPush).toHaveBeenCalledWith(
      '/auth-mvp/vidburdir/70000000-0000-4000-8000-000000000001',
    )
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
    const button = screen.getByRole('button', { name: 'Búa til og opna nýjan útlagðan kostnað' })

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
    const button = screen.getByRole('button', { name: 'Búa til og opna nýjan útlagðan kostnað' })

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
