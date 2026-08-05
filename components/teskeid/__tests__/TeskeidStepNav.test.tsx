import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TeskeidStepNav } from '@/components/teskeid/TeskeidStepNav'

describe('TeskeidStepNav', () => {
  it('exposes current, completed, attention and disabled steps without relying on color', () => {
    const onStepChange = vi.fn()
    render(
      <TeskeidStepNav
        ariaLabel="Skráningarskref"
        items={[
          { id: 'details', label: 'Útgjald', status: 'complete' },
          { id: 'people', label: 'Aðilar', status: 'current' },
          { id: 'split', label: 'Skipting', status: 'attention', statusLabel: 'Þarf yfirferð' },
          { id: 'review', label: 'Yfirferð', status: 'disabled' },
        ]}
        onStepChange={onStepChange}
      />,
    )

    const nav = screen.getByRole('navigation', { name: 'Skráningarskref' })
    expect(within(nav).getByRole('button', { name: 'Aðilar' })).toHaveAttribute('aria-current', 'step')
    expect(within(nav).getByRole('button', { name: 'Skipting, Þarf yfirferð' })).toBeEnabled()
    expect(within(nav).getByRole('button', { name: 'Yfirferð' })).toBeDisabled()

    fireEvent.click(within(nav).getByRole('button', { name: 'Útgjald' }))
    fireEvent.click(within(nav).getByRole('button', { name: 'Yfirferð' }))
    expect(onStepChange).toHaveBeenCalledTimes(1)
    expect(onStepChange).toHaveBeenCalledWith('details')
  })
})
