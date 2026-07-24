import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { WeatherChaseTimeSelector } from '@/components/weather/WeatherChaseTimeSelector'

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
}))

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

describe('WeatherChaseTimeSelector', () => {
  const slots = [
    {
      timeMs: Date.parse('2026-07-24T06:00:00Z'),
      worstStatus: 'innan-marka' as const,
      worstStatusLabel: 'Innan marka',
    },
    {
      timeMs: Date.parse('2026-07-24T12:00:00Z'),
      worstStatus: 'innan-marka' as const,
      worstStatusLabel: 'Innan marka',
    },
  ]

  it('shows compact dates and time-only choices without provider headings or status dots', () => {
    render(
      <WeatherChaseTimeSelector
        slots={slots}
        loading={false}
        loadingLabel="Hleður"
        activeTimeMs={slots[1].timeMs}
        onTimeChange={() => {}}
        previousLabel="Fyrri"
        nextLabel="Næsti"
        forecastLabel="Spá"
      />,
    )

    expect(screen.getByText('Fös.')).toBeInTheDocument()
    expect(screen.getByText('24.7')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Spá.*06:00/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Spá.*12:00/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/Vegagerðin/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Veðurstofan/i)).not.toBeInTheDocument()
  })

  it('selects a time directly', () => {
    const onTimeChange = vi.fn()
    render(
      <WeatherChaseTimeSelector
        slots={slots}
        loading={false}
        loadingLabel="Hleður"
        activeTimeMs={slots[1].timeMs}
        onTimeChange={onTimeChange}
        previousLabel="Fyrri"
        nextLabel="Næsti"
        forecastLabel="Spá"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Spá.*06:00/i }))
    expect(onTimeChange).toHaveBeenCalledWith(slots[0].timeMs)
  })
})
