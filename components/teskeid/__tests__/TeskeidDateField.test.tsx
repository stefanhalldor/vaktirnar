import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { localeMock } = vi.hoisted(() => ({
  localeMock: vi.fn(() => 'is'),
}))

vi.mock('next-intl', () => ({
  useLocale: localeMock,
}))

import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'

describe('TeskeidDateField', () => {
  beforeEach(() => {
    localeMock.mockReturnValue('is')
  })

  it('shows a localized date while keeping the native ISO value and constraints', () => {
    const onChange = vi.fn()
    render(
      <TeskeidDateField
        label="Dagsetning"
        value="2026-08-04"
        onChange={onChange}
        placeholder="Veldu dag"
        min="2026-08-01"
        max="2026-08-31"
        required
      />,
    )

    expect(screen.getByText('4. ágúst 2026')).toBeInTheDocument()
    const input = screen.getByLabelText('Dagsetning')
    expect(input).toHaveAttribute('type', 'date')
    expect(input).toHaveAttribute('lang', 'is-IS')
    expect(input).toHaveValue('2026-08-04')
    expect(input).toHaveAttribute('min', '2026-08-01')
    expect(input).toHaveAttribute('max', '2026-08-31')
    expect(input).toBeRequired()

    fireEvent.change(input, { target: { value: '2026-08-05' } })
    expect(onChange).toHaveBeenCalledWith('2026-08-05')
  })

  it('shows the placeholder for an empty value', () => {
    render(
      <TeskeidDateField
        label="Dagsetning"
        value=""
        onChange={vi.fn()}
        placeholder="Veldu dag"
      />,
    )

    expect(screen.getByText('Veldu dag')).toBeInTheDocument()
  })

  it('uses the shared English date order', () => {
    localeMock.mockReturnValue('en')
    render(
      <TeskeidDateField
        label="Date"
        value="2026-08-04"
        onChange={vi.fn()}
        placeholder="Select date"
      />,
    )

    expect(screen.getByText('4 August 2026')).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toHaveAttribute('lang', 'en-GB')
  })
})
