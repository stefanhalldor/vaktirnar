import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}))

const copy: Record<string, string> = {
  'contextChooser.title': 'Hvar á útgjaldið heima?',
  'contextChooser.description': 'Veldu samhengi áður en formið opnast.',
  'contextChooser.standalone': 'Stakt útgjald',
  'contextChooser.standaloneHint': 'Skrá útgjald án viðburðar.',
  'contextChooser.eventHint': 'Skrá útgjaldið á {name}.',
  'contextChooser.continue': 'Áfram',
  'contextChooser.continuing': 'Opna...',
}

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { name?: string }) => (
    copy[key].replace('{name}', values?.name ?? '')
  ),
}))

import { ExpenseEventContextChooser } from '../ExpenseEventContextChooser'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ExpenseEventContextChooser', () => {
  it('uses a native grouped form with standalone preselected and submits through router.push', () => {
    render(<ExpenseEventContextChooser events={[{ id: 'event-a', name: 'Sumarferð' }]} />)

    const form = screen.getByRole('form', { name: 'Hvar á útgjaldið heima?' })
    const group = screen.getByRole('group', { name: 'Hvar á útgjaldið heima?' })
    const standalone = screen.getByRole('radio', { name: /Stakt útgjald/ })
    const event = screen.getByRole('radio', { name: /Sumarferð/ })
    const action = screen.getByRole('button', { name: 'Áfram' })

    expect(group).toContainElement(standalone)
    expect(group).toContainElement(event)
    expect(standalone).toHaveAttribute('name', 'expense-context')
    expect(event).toHaveAttribute('name', 'expense-context')
    expect(standalone).toBeChecked()
    expect(event).not.toBeChecked()
    expect(action).toHaveAttribute('type', 'submit')
    expect(navigation.push).not.toHaveBeenCalled()

    event.focus()
    expect(event).toHaveFocus()
    fireEvent.submit(form)

    expect(navigation.push).toHaveBeenCalledTimes(1)
    expect(navigation.push).toHaveBeenCalledWith(
      '/auth-mvp/utlagt-og-endurgreitt/nytt?context=standalone',
    )
    expect(navigation.replace).not.toHaveBeenCalled()
  })

  it('URL-encodes the Event route and synchronously locks repeat navigation', () => {
    const eventId = 'event/id?source=a&mode=b'
    render(<ExpenseEventContextChooser events={[{ id: eventId, name: 'Sumarferð' }]} />)

    const form = screen.getByRole('form', { name: 'Hvar á útgjaldið heima?' })
    const event = screen.getByRole('radio', { name: /Sumarferð/ })
    fireEvent.click(event)
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(navigation.push).toHaveBeenCalledTimes(1)
    expect(navigation.push).toHaveBeenCalledWith(
      `/auth-mvp/utlagt-og-endurgreitt/nytt?event=${encodeURIComponent(eventId)}`,
    )
    expect(navigation.replace).not.toHaveBeenCalled()
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Opna...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Opna...' })).toHaveAttribute('aria-busy', 'true')
  })

  it('keeps both renderings of a long Event name mobile-safe', () => {
    const longName = 'MjögLangtViðburðarheitiÁnBilaSemÞarfAðBrotnaÁMjóumSkjá'
    render(
      <ExpenseEventContextChooser events={[{ id: 'event-a', name: longName }]} />,
    )

    expect(screen.getByText(longName, { selector: '.break-words' })).toHaveClass('break-words')
    expect(screen.getByText(`Skrá útgjaldið á ${longName}.`)).toHaveClass('break-words')
    expect(screen.getByRole('radio', { name: new RegExp(longName) }).nextElementSibling).toHaveClass(
      'min-w-0',
      'break-words',
    )
  })
})
