import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { TeskeidNumberField } from '@/components/teskeid/TeskeidNumberField'
import { validateIntegerDraft } from '@/lib/forms/numeric-draft'

describe('validateIntegerDraft', () => {
  it('keeps empty drafts transient and validates required whitespace', () => {
    expect(validateIntegerDraft('')).toEqual({ valid: true, value: null, error: null })
    expect(validateIntegerDraft('', { required: true })).toEqual({
      valid: false,
      value: null,
      error: 'required',
    })
    expect(validateIntegerDraft('   ', { required: true })).toEqual({
      valid: false,
      value: null,
      error: 'required',
    })
  })

  it('rejects non-numbers, non-finite values, and fractions', () => {
    expect(validateIntegerDraft('abc')).toEqual({
      valid: false,
      value: null,
      error: 'not-a-number',
    })
    expect(validateIntegerDraft('1e309')).toEqual({
      valid: false,
      value: null,
      error: 'not-a-number',
    })
    expect(validateIntegerDraft('1.5')).toEqual({
      valid: false,
      value: null,
      error: 'not-an-integer',
    })
    expect(validateIntegerDraft('9007199254740992')).toEqual({
      valid: false,
      value: null,
      error: 'not-an-integer',
    })
  })

  it('reports min and max failures without clamping the value', () => {
    expect(validateIntegerDraft('4', { min: 5 })).toEqual({
      valid: false,
      value: null,
      error: 'below-minimum',
    })
    expect(validateIntegerDraft('21', { max: 20 })).toEqual({
      valid: false,
      value: null,
      error: 'above-maximum',
    })
  })

  it('returns a valid finite integer inside the configured range', () => {
    expect(validateIntegerDraft(' 10 ', { required: true, min: 5, max: 20 })).toEqual({
      valid: true,
      value: 10,
      error: null,
    })
  })
})
describe('TeskeidNumberField', () => {
  it('keeps the raw controlled value empty while the user clears and replaces it', () => {
    function ControlledField() {
      const [value, setValue] = useState('10')
      return <TeskeidNumberField label="Tími í sekúndum" value={value} onValueChange={setValue} />
    }

    render(<ControlledField />)
    const input = screen.getByLabelText('Tími í sekúndum')
    expect(input).toHaveClass('min-h-11', 'text-base', 'border-input', 'bg-background')

    fireEvent.change(input, { target: { value: '' } })
    expect(input).toHaveValue('')

    fireEvent.change(input, { target: { value: '-' } })
    expect(input).toHaveValue('-')

    fireEvent.change(input, { target: { value: '25' } })
    expect(input).toHaveValue('25')
  })

  it('uses accessible hint and error relationships with Teskeið mobile sizing', () => {
    render(
      <TeskeidNumberField
        id="duration"
        label="Tími í sekúndum"
        value="4"
        onValueChange={() => undefined}
        hint="Minnst 5 sekúndur"
        error="Tíminn þarf að vera minnst 5 sekúndur"
        aria-describedby="duration-context"
        min={5}
        max={60}
        step={1}
        required
      />,
    )

    const input = screen.getByLabelText('Tími í sekúndum')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('min', '5')
    expect(input).toHaveAttribute('max', '60')
    expect(input).toHaveAttribute('step', '1')
    expect(input).toBeRequired()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-errormessage', 'duration-error')
    expect(input).toHaveAttribute(
      'aria-describedby',
      'duration-context duration-hint duration-error',
    )
    expect(input).toHaveClass('min-h-11', 'text-base', 'border-destructive', 'bg-background')
    expect(screen.getByText('Minnst 5 sekúndur')).toHaveAttribute('id', 'duration-hint')
    expect(screen.getByText('Tíminn þarf að vera minnst 5 sekúndur')).toHaveAttribute(
      'id',
      'duration-error',
    )
  })
})
