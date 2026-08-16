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
  'create.teskeidParticipant': 'Teskeiðarnotandi úr Tengslum',
  'create.guestParticipant': 'Gestur með nafni',
  'create.removeParticipant': 'Fjarlægja {name}',
  'create.noParticipants': 'Má byrja án gesta.',
  'create.participantLimit': 'Hámarki 49 gestum er náð.',
  'create.frozenRosterHint': 'Gestalistinn frýs.',
  'create.createAndExpense': 'Búa til og skrá útgjald',
  'create.createOnly': 'Búa til',
  'create.creating': 'Bý til...',
  'picker.trigger': 'Bæta við gesti',
  'picker.title': 'Bæta við gesti',
  'picker.description': 'Veldu notanda eða gest.',
  'picker.close': 'Loka gestavali',
  'picker.loadError': 'Ekki tókst að sækja notendur',
  'picker.searchLabel': 'Leita í Tengslum',
  'picker.searchPlaceholder': 'Nafn eða label',
  'picker.filterLabel': 'Sía eftir labelum',
  'picker.allFilterLabel': 'Allir',
  'picker.noResults': 'Enginn fannst',
  'picker.sourceLabel': 'Tegund gests',
  'picker.knownMode': 'Teskeiðarnotandi',
  'picker.guestMode': 'Gestur',
  'picker.guestName': 'Nafn gests',
  'picker.guestPlaceholder': 'Nafn',
  'picker.guestHint': 'Ekkert boð er sent.',
  'picker.addGuest': 'Bæta við gesti',
  'picker.guestNameInvalid': 'Ógilt nafn',
  'picker.emailNotSupported': 'Netföng eru ekki notuð hér',
  'errors.invalid_input': 'Athugaðu heitið og gestalistann.',
  'errors.not_allowed': 'Ekki leyfilegt.',
  'errors.not_found': 'Fannst ekki.',
  'errors.conflict': 'Gögnin hafa breyst.',
  'errors.feature_disabled': 'Ekki virkt.',
  'errors.save_failed': 'Ekki tókst að stofna viðburðinn.',
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

function renderForm() {
  return render(<EventCreateForm options={[option]} optionsError={false} />)
}

function enterName(value = 'Kvisskvöld') {
  fireEvent.change(screen.getByRole('textbox', { name: 'Heiti' }), { target: { value } })
}

function addKnown() {
  fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
  fireEvent.click(screen.getByRole('button', { name: /Mamma/ }))
}

function addGuest(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
  fireEvent.click(screen.getByRole('button', { name: 'Gestur' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Nafn gests' }), { target: { value: name } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Bæta við gesti' }).at(-1)!)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateEvent.mockResolvedValue({
    ok: true,
    data: { eventId: '70000000-0000-4000-8000-000000000001' },
  })
})

describe('EventCreateForm', () => {
  it('submits an ordered known-plus-guest payload with no client identity metadata', async () => {
    renderForm()
    enterName('  Kvisskvöld  ')
    addKnown()
    addGuest('  Páll  ')

    expect(screen.getByText('Mamma')).toBeInTheDocument()
    expect(screen.getByText('Páll')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Búa til og skrá útgjald' }))

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalledTimes(1))
    const payload = mockCreateEvent.mock.calls[0]![0]
    expect(payload).toEqual({
      request_id: expect.any(String),
      name: 'Kvisskvöld',
      participants: [
        { type: 'relationship', relationship_id: option.relationshipId },
        { type: 'guest', display_name: 'Páll' },
      ],
    })
    expect(JSON.stringify(payload)).not.toContain('Guðrún')
    expect(JSON.stringify(payload)).not.toContain('pickerLabel')
    expect(JSON.stringify(payload)).not.toContain('userId')
    expect(JSON.stringify(payload)).not.toContain('email')
    expect(mockPush).toHaveBeenCalledWith(
      '/auth-mvp/utlagt-og-endurgreitt/hopar/70000000-0000-4000-8000-000000000001/nytt-utgjald',
    )
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('allows zero participants and sends the secondary action to event detail', async () => {
    renderForm()
    enterName()
    fireEvent.click(screen.getByRole('button', { name: 'Búa til' }))

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalledWith({
      request_id: expect.any(String),
      name: 'Kvisskvöld',
      participants: [],
    }))
    expect(mockPush).toHaveBeenCalledWith(
      '/auth-mvp/vidburdir/70000000-0000-4000-8000-000000000001',
    )
  })

  it('reuses the exact request ID for an unchanged failed retry', async () => {
    mockCreateEvent
      .mockResolvedValueOnce({ ok: false, error: 'save_failed' })
      .mockResolvedValueOnce({
        ok: true,
        data: { eventId: '70000000-0000-4000-8000-000000000001' },
      })
    renderForm()
    enterName()

    fireEvent.click(screen.getByRole('button', { name: 'Búa til og skrá útgjald' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ekki tókst að stofna viðburðinn.')
    fireEvent.click(screen.getByRole('button', { name: 'Búa til og skrá útgjald' }))

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalledTimes(2))
    expect(mockCreateEvent.mock.calls[1]![0].request_id)
      .toBe(mockCreateEvent.mock.calls[0]![0].request_id)
  })

  it('recovers from a thrown action error and keeps the same request ID for retry', async () => {
    mockCreateEvent
      .mockRejectedValueOnce(new Error('transport failed'))
      .mockResolvedValueOnce({
        ok: true,
        data: { eventId: '70000000-0000-4000-8000-000000000001' },
      })
    renderForm()
    enterName()

    fireEvent.click(screen.getByRole('button', { name: 'Búa til og skrá útgjald' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ekki tókst að stofna viðburðinn.')
    fireEvent.click(screen.getByRole('button', { name: 'Búa til og skrá útgjald' }))

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalledTimes(2))
    expect(mockCreateEvent.mock.calls[1]![0].request_id)
      .toBe(mockCreateEvent.mock.calls[0]![0].request_id)
  })

  it('blocks duplicate submission synchronously while the first request is pending', async () => {
    let resolveRequest!: (value: { ok: false; error: string }) => void
    mockCreateEvent.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve }))
    renderForm()
    enterName()
    const button = screen.getByRole('button', { name: 'Búa til og skrá útgjald' })

    fireEvent.click(button)
    fireEvent.click(button)
    expect(mockCreateEvent).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('button', { name: 'Bý til...' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Bý til...' })[0]).toBeDisabled()

    await act(async () => resolveRequest({ ok: false, error: 'save_failed' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('keeps duplicate guest names distinct and enforces the combined 49-person cap', () => {
    renderForm()
    addGuest('Sama nafn')
    addGuest('Sama nafn')
    for (let index = 2; index < 49; index += 1) addGuest(`Gestur ${index + 1}`)

    expect(screen.getAllByText('Sama nafn')).toHaveLength(2)
    expect(screen.getByText('Hámarki 49 gestum er náð.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bæta við gesti' })).toBeDisabled()
  }, 30_000)

  it('excludes an already selected Relationship and re-enables it after removal', () => {
    renderForm()
    addKnown()
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
    expect(screen.queryByRole('button', { name: /Mamma/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Loka gestavali' }))

    fireEvent.click(screen.getByRole('button', { name: 'Fjarlægja Mamma' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
    expect(screen.getByRole('button', { name: /Mamma/ })).toBeInTheDocument()
  })
})
