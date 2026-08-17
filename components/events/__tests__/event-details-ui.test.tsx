import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'

const { mockRefresh, mockSaveDetails } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockSaveDetails: vi.fn(),
}))

const copy: Record<string, string> = {
  'detail.details': 'Upplýsingar um viðburð',
  'detail.detailsHint': 'Dagsetning og tími fara saman.',
  'detail.when': 'Hvenær',
  'detail.description': 'Lýsing',
  'detail.agenda': 'Dagskrá',
  'detail.saveDetails': 'Vista upplýsingar',
  'detail.savingDetails': 'Vista upplýsingar...',
  'detail.detailsSaved': 'Upplýsingarnar voru vistaðar.',
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
  'errors.save_failed': 'Ekki tókst að vista.',
}

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => (key: string) => copy[key] ?? key,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
vi.mock('@/lib/events/actions', () => ({ saveEventDetails: mockSaveDetails }))

import { EventDetailsEditor } from '../EventDetailsEditor'
import { EventDetailsSummary } from '../EventDetailsSummary'

const EVENT_ID = '30000000-0000-4000-8000-000000000001'
const emptyDetails = {
  eventId: EVENT_ID,
  eventDate: null,
  eventTime: null,
  description: null,
  agenda: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSaveDetails.mockResolvedValue({ ok: true, data: { eventId: EVENT_ID } })
})

describe('Event details UI', () => {
  it('hides an empty attendee summary and displays populated multiline details', () => {
    const { rerender } = render(<EventDetailsSummary details={emptyDetails} />)
    expect(screen.queryByRole('heading', { name: 'Upplýsingar um viðburð' })).not.toBeInTheDocument()

    rerender(<EventDetailsSummary details={{
      eventId: EVENT_ID,
      eventDate: '2026-09-12',
      eventTime: '18:30',
      description: 'Komið með hlý föt.',
      agenda: '18:30 Mæting\n19:00 Matur',
    }} />)
    expect(screen.getByText(/12\. september 2026, 18:30/)).toBeInTheDocument()
    expect(screen.getByText('Komið með hlý föt.')).toBeInTheDocument()
    expect(screen.getByText(/18:30 Mæting/)).toHaveClass('whitespace-pre-wrap')
  })

  it('requires date and time together before saving', () => {
    const { container } = render(<EventDetailsEditor details={emptyDetails} />)
    expect(screen.getByText('Veldu dag')).toBeInTheDocument()
    expect(screen.getByLabelText('Klukkustund')).toBeInTheDocument()
    expect(screen.getByLabelText('Mínútur')).toBeInTheDocument()
    expect(screen.getByLabelText('Lýsing (valkvætt)')).toHaveClass('py-3')
    expect(screen.getByLabelText('Dagskrá (valkvætt)')).toHaveClass('py-3')
    expect(container.querySelector('input[type="date"]')).toHaveClass('opacity-0')
    fireEvent.change(screen.getByLabelText('Dagsetning (valkvætt)'), {
      target: { value: '2026-09-12' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Veldu bæði dagsetningu og tíma.')
    expect(screen.getByRole('button', { name: 'Vista upplýsingar' })).toBeDisabled()
  })

  it('saves one strict details payload and refreshes canonical state', async () => {
    render(<EventDetailsEditor details={emptyDetails} />)
    fireEvent.change(screen.getByLabelText('Dagsetning (valkvætt)'), {
      target: { value: '2026-09-12' },
    })
    fireEvent.change(screen.getByLabelText('Tími (valkvætt)'), {
      target: { value: '18:30' },
    })
    fireEvent.change(screen.getByLabelText('Lýsing (valkvætt)'), {
      target: { value: 'Komið með hlý föt.' },
    })
    fireEvent.change(screen.getByLabelText('Dagskrá (valkvætt)'), {
      target: { value: '18:30 Mæting\n19:00 Matur' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Vista upplýsingar' }))

    await waitFor(() => expect(mockSaveDetails).toHaveBeenCalledWith({
      event_id: EVENT_ID,
      request_id: expect.any(String),
      event_date: '2026-09-12',
      event_time: '18:30',
      description: 'Komið með hlý föt.',
      agenda: '18:30 Mæting\n19:00 Matur',
    }))
    expect(mockRefresh).toHaveBeenCalledOnce()
  })
})
