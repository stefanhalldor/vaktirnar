import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'

const { mockPush, mockRefresh } = vi.hoisted(() => ({ mockPush: vi.fn(), mockRefresh: vi.fn() }))

const copy: Record<string, string> = {
  'contextChooser.title': 'Hvar á útgjaldið heima?',
  'contextChooser.description': 'Veldu samhengi.',
  'contextChooser.standalone': 'Stakt útgjald',
  'contextChooser.standaloneHint': 'Án viðburðar.',
  'contextChooser.eventHint': 'Skrá á {name}.',
  'contextChooser.noEvents': 'Enginn viðburður er tiltækur.',
  'contextChooser.loadError': 'Ekki tókst að sækja viðburði.',
  'contextChooser.continue': 'Áfram',
  'contextChooser.continuing': 'Opna...',
  'contextChooser.retrying': 'Sæki aftur...',
  'errors.retry': 'Reyna aftur',
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }))

import { ExpenseEventContextChooser } from '../ExpenseEventContextChooser'

const event = {
  id: '70000000-0000-4000-8000-000000000001',
  name: 'Kvisskvöld',
  participantCount: 3,
  expenseCount: 1,
  createdAt: '2026-08-15T20:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('ExpenseEventContextChooser', () => {
  it('preselects standalone but waits for an explicit continue', () => {
    render(<ExpenseEventContextChooser events={[event]} />)

    expect(screen.getByRole('radio', { name: /Stakt útgjald/ })).toBeChecked()
    expect(mockPush).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Áfram' }))

    expect(mockPush).toHaveBeenCalledWith(
      '/auth-mvp/utlagt-og-endurgreitt/nytt?context=standalone',
    )
  })

  it('navigates directly to the selected event expense form and locks pending controls', () => {
    render(<ExpenseEventContextChooser events={[event]} />)
    fireEvent.click(screen.getByRole('radio', { name: /Kvisskvöld/ }))
    const button = screen.getByRole('button', { name: 'Áfram' })
    fireEvent.click(button)
    fireEvent.click(button)

    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith(
      `/auth-mvp/utlagt-og-endurgreitt/hopar/${event.id}/nytt-utgjald`,
    )
    expect(screen.getByRole('button', { name: 'Opna...' })).toBeDisabled()
    expect(screen.getAllByRole('radio').every((radio) => radio.hasAttribute('disabled'))).toBe(true)
  })

  it('keeps standalone usable when there are no events', () => {
    render(<ExpenseEventContextChooser events={[]} />)
    expect(screen.getByText('Enginn viðburður er tiltækur.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Áfram' })).toBeEnabled()
  })

  it('blocks silent standalone fallback when the owner event list cannot load', () => {
    render(<ExpenseEventContextChooser events={[]} eventsError />)
    expect(screen.getByRole('alert')).toHaveTextContent('Ekki tókst að sækja viðburði.')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Reyna aftur' })
    fireEvent.click(retry)
    fireEvent.click(retry)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Sæki aftur...' })).toBeDisabled()
  })
})
