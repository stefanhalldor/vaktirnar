import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'

const { mockRefresh, mockSaveEventRoster } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockSaveEventRoster: vi.fn(),
}))

const copy: Record<string, string> = {
  'list.create': 'Nýr viðburður',
  'list.emptyTitle': 'Engir viðburðir enn',
  'list.emptyDescription': 'Stofnaðu viðburð.',
  'list.heading': 'Viðburðirnir þínir',
  'list.participantCount': '{count} gestir',
  'list.createdAt': 'Stofnað {date}',
  'detail.createdAt': 'Stofnað {date}',
  'detail.privateRosterHint': 'Þetta er þitt einkayfirlit.',
  'detail.addExpense': 'Nýr útlagður kostnaður',
  'detail.participants': 'Gestir',
  'detail.editRosterHint': 'Bættu við eða fjarlægðu gesti.',
  'detail.noParticipants': 'Engir gestir voru skráðir.',
  'detail.teskeidParticipant': 'Þekktur aðili úr Tengslum',
  'detail.guestParticipant': 'Gestur með nafni',
  'detail.emailParticipant': 'Gestur með netfangi',
  'detail.removeParticipant': 'Fjarlægja {name}',
  'detail.participantLimit': 'Hámarki 49 gestum er náð.',
  'detail.unsavedRosterHint': 'Þú átt óvistaðar breytingar.',
  'detail.saveRoster': 'Vista gestalista',
  'detail.savingRoster': 'Vista gestalista...',
  'detail.rosterSaved': 'Gestalistinn var vistaður.',
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
  'picker.addGuest': 'Bæta við gesti',
  'picker.guestNameInvalid': 'Ógilt nafn',
  'picker.emailInvalid': 'Ógilt netfang',
  'errors.invalid_input': 'Athugaðu gestalistann.',
  'errors.not_allowed': 'Ekki leyfilegt.',
  'errors.not_found': 'Fannst ekki.',
  'errors.conflict': 'Sæki nýjustu stöðu.',
  'errors.feature_disabled': 'Ekki virkt.',
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
vi.mock('@/lib/events/actions', () => ({ saveEventRoster: mockSaveEventRoster }))

import { EventDetail } from '../EventDetail'
import { EventList } from '../EventList'

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

function addManual(value: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
  fireEvent.click(screen.getByRole('button', { name: 'Nafn eða netfang' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Nafn eða netfang' }), { target: { value } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Bæta við gesti' }).at(-1)!)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSaveEventRoster.mockResolvedValue({
    ok: true,
    data: { eventId: EVENT_ID, rosterRevision: 2 },
  })
})

describe('event presentational components', () => {
  it('renders an independent event list without expense counts', () => {
    const { rerender } = render(<EventList events={[]} />)
    expect(screen.getByText('Engir viðburðir enn')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nýr viðburður' }))
      .toHaveAttribute('href', '/auth-mvp/vidburdir/nyr')

    rerender(<EventList events={[eventSummary]} />)
    expect(screen.getByRole('link', { name: /Kvisskvöld/ }))
      .toHaveAttribute('href', `/auth-mvp/vidburdir/${EVENT_ID}`)
    expect(screen.getByText('2 gestir')).toBeInTheDocument()
    expect(screen.queryByText(/útgjöld/)).not.toBeInTheDocument()
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
      expected_roster_revision: 1,
      guests: [
        { event_guest_id: GUEST_A },
        { source_kind: 'manual_email', email: 'anna@example.is' },
        { source_kind: 'relationship', relationship_id: option.relationshipId },
      ],
    })
    expect(mockRefresh).toHaveBeenCalledTimes(1)
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
      expected_roster_revision: 2,
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
      expected_roster_revision: 2,
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

  it('keeps event CRUD usable without Expenses and exposes only an optional financial seam', () => {
    const { rerender } = render(
      <EventDetail
        event={baseEvent}
        options={[]}
        optionsError={false}
        canUseExpenses={false}
      />,
    )
    expect(screen.queryByRole('link', { name: 'Nýr útlagður kostnaður' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('financial-panel')).not.toBeInTheDocument()

    rerender(
      <EventDetail
        event={baseEvent}
        options={[]}
        optionsError={false}
        canUseExpenses
        financialPanel={<div data-testid="financial-panel" />}
      />,
    )
    const expenseLink = screen.getByRole('link', { name: 'Nýr útlagður kostnaður' })
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
