import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import React from 'react'

const copy: Record<string, string> = {
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
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => copy[key] ?? key,
}))

import {
  EventParticipantPicker,
  parseEventManualGuest,
} from '../EventParticipantPicker'

const option = {
  relationshipId: 'relationship-1',
  pickerLabel: 'Mamma',
  sharedLabel: 'Guðrún Jónsdóttir',
  customLabels: [{ id: 'family', name: 'Fjölskylda' }],
}

describe('EventParticipantPicker', () => {
  it('parses the exact manual name/email source shapes and rejects unsafe input', () => {
    expect(parseEventManualGuest('  Páll  ')).toEqual({
      ok: true,
      label: 'Páll',
      input: { source_kind: 'manual_name', display_name: 'Páll' },
    })
    expect(parseEventManualGuest(' GESTUR@Example.is ')).toEqual({
      ok: true,
      label: 'gestur@example.is',
      input: { source_kind: 'manual_email', email: 'gestur@example.is' },
    })
    expect(parseEventManualGuest('')).toEqual({ ok: false, error: 'invalid_name' })
    expect(parseEventManualGuest('a'.repeat(121))).toEqual({ ok: false, error: 'invalid_name' })
    expect(parseEventManualGuest('Anna\u202e')).toEqual({ ok: false, error: 'invalid_name' })
    expect(parseEventManualGuest('anna@')).toEqual({ ok: false, error: 'invalid_email' })
  })

  it('returns the exact known Relationship option while keeping its shared label search-only', () => {
    const onAddKnown = vi.fn(() => true)
    render(
      <EventParticipantPicker
        options={[option]}
        onAddKnown={onAddKnown}
        onAddManual={vi.fn(() => true)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Leita í Tengslum' }), {
      target: { value: 'Jónsdóttir' },
    })
    expect(screen.getByText('Mamma')).toBeInTheDocument()
    expect(screen.queryByText('Guðrún Jónsdóttir')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mamma/ }))

    expect(onAddKnown).toHaveBeenCalledWith(option)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('uses the exact two source labels and returns manual name/email inputs', () => {
    const onAddManual = vi.fn(() => true)
    render(
      <EventParticipantPicker
        options={[option]}
        onAddKnown={vi.fn(() => true)}
        onAddManual={onAddManual}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
    expect(screen.getByRole('button', { name: 'Þekktur aðili' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Nafn eða netfang' }))
    const input = screen.getByRole('textbox', { name: 'Nafn eða netfang' })
    expect(input).toHaveAttribute('maxlength', '320')

    fireEvent.change(input, { target: { value: 'anna@' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Bæta við gesti' }).at(-1)!)
    expect(screen.getByRole('alert')).toHaveTextContent('Ógilt netfang')
    expect(onAddManual).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '  Anna@example.is  ' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Bæta við gesti' }).at(-1)!)
    expect(onAddManual).toHaveBeenCalledWith(
      { source_kind: 'manual_email', email: 'anna@example.is' },
      'anna@example.is',
    )
  })

  it('honors known exclusions while manual entry stays available after an option-load error', () => {
    render(
      <EventParticipantPicker
        options={[option]}
        excludedRelationshipIds={[option.relationshipId]}
        optionsError
        onAddKnown={vi.fn(() => true)}
        onAddManual={vi.fn(() => true)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
    expect(screen.getByText('Ekki tókst að sækja þekkta aðila')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mamma/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Nafn eða netfang' }))
    expect(screen.getByRole('textbox', { name: 'Nafn eða netfang' })).toBeInTheDocument()
  })
})
