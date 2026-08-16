import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import React from 'react'

const copy: Record<string, string> = {
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
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => copy[key] ?? key,
}))

import {
  EventParticipantPicker,
  parseEventGuestName,
} from '../EventParticipantPicker'

const option = {
  relationshipId: 'relationship-1',
  pickerLabel: 'Mamma',
  sharedLabel: 'Guðrún Jónsdóttir',
  customLabels: [{ id: 'family', name: 'Fjölskylda' }],
}

describe('EventParticipantPicker', () => {
  it('normalizes a guest name and rejects unsafe, overlong, and email-like input', () => {
    expect(parseEventGuestName('  Páll  ')).toEqual({ ok: true, displayName: 'Páll' })
    expect(parseEventGuestName('')).toEqual({ ok: false, error: 'invalid' })
    expect(parseEventGuestName('a'.repeat(121))).toEqual({ ok: false, error: 'invalid' })
    expect(parseEventGuestName('Anna\u202e')).toEqual({ ok: false, error: 'invalid' })
    expect(parseEventGuestName('anna@example.is')).toEqual({ ok: false, error: 'email_not_supported' })
  })

  it('returns the exact known Relationship option while keeping its shared label search-only', () => {
    const onAddKnown = vi.fn(() => true)
    render(
      <EventParticipantPicker
        options={[option]}
        onAddKnown={onAddKnown}
        onAddGuest={vi.fn(() => true)}
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

  it('uses a 120-character name-only manual path with no email or circle contract', () => {
    const onAddGuest = vi.fn(() => true)
    render(
      <EventParticipantPicker
        options={[option]}
        onAddKnown={vi.fn(() => true)}
        onAddGuest={onAddGuest}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gestur' }))
    const input = screen.getByRole('textbox', { name: 'Nafn gests' })
    expect(input).toHaveAttribute('maxlength', '120')
    expect(screen.queryByText('Tengslahringir')).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'anna@example.is' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Bæta við gesti' }).at(-1)!)
    expect(screen.getByRole('alert')).toHaveTextContent('Netföng eru ekki notuð hér')
    expect(onAddGuest).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '  Páll  ' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Bæta við gesti' }).at(-1)!)
    expect(onAddGuest).toHaveBeenCalledWith('Páll')
  })

  it('honors known exclusions and keeps guest entry available after an option-load error', () => {
    render(
      <EventParticipantPicker
        options={[option]}
        excludedRelationshipIds={[option.relationshipId]}
        optionsError
        onAddKnown={vi.fn(() => true)}
        onAddGuest={vi.fn(() => true)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við gesti' }))
    expect(screen.getByText('Ekki tókst að sækja notendur')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Teskeiðarnotandi' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Gestur' }))
    expect(screen.getByRole('textbox', { name: 'Nafn gests' })).toBeInTheDocument()
    expect(screen.queryByText('Mamma')).not.toBeInTheDocument()
  })
})
