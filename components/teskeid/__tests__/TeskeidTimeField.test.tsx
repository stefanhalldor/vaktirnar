import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TeskeidTimeField } from '../TeskeidTimeField'

describe('TeskeidTimeField', () => {
  it('keeps the native mobile input and offers a reusable 24-hour desktop control', async () => {
    const onChange = vi.fn()
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    const { container } = render(
      <TeskeidTimeField
        label="Óskaður tími"
        hourLabel="Klukkustund"
        minuteLabel="Mínútur"
        value=""
        onChange={onChange}
        step={900}
        required
      />,
    )

    expect(container.querySelector('input[type="time"]')?.closest('label')).toHaveClass('md:hidden')
    expect(screen.getByRole('group', { name: 'Óskaður tími' })).toHaveClass('md:block')
    await waitFor(() => expect(container.querySelector('input[type="time"]')).toBeDisabled())
    expect(screen.getByRole('group', { name: 'Óskaður tími' })).not.toBeDisabled()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Klukkustund' }), '21')
    expect(onChange).toHaveBeenLastCalledWith('')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Mínútur' }), '15')
    expect(onChange).toHaveBeenLastCalledWith('21:15')
  })

  it('preserves a valid minute outside the normal step when editing existing data', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    render(
      <TeskeidTimeField
        label="Óskaður tími"
        hourLabel="Klukkustund"
        minuteLabel="Mínútur"
        value="09:13"
        onChange={() => undefined}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'Klukkustund' })).toHaveValue('09')
    expect(screen.getByRole('combobox', { name: 'Mínútur' })).toHaveValue('13')
  })
})
