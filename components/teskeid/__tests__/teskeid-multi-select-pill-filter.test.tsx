import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TeskeidMultiSelectPillFilter } from '../TeskeidMultiSelectPillFilter'

describe('TeskeidMultiSelectPillFilter', () => {
  it('is controlled, keyboard-clickable and reports exact selected ids', () => {
    const onChange = vi.fn()
    render(
      <TeskeidMultiSelectPillFilter
        options={[
          { id: 'emil', label: 'Emil' },
          { id: 'berglind', label: 'Berglind' },
        ]}
        selectedIds={['emil']}
        onChange={onChange}
        ariaLabel="Sía fólk"
        clearLabel="Hreinsa"
      />,
    )
    expect(screen.getByRole('button', { name: 'Emil' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Berglind' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Berglind' }))
    expect(onChange).toHaveBeenLastCalledWith(['emil', 'berglind'])
    fireEvent.click(screen.getByRole('button', { name: 'Emil' }))
    expect(onChange).toHaveBeenLastCalledWith([])
    fireEvent.click(screen.getByRole('button', { name: 'Hreinsa' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })
})
