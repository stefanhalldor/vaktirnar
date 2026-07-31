import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { WindStatusFilterPills } from '@/components/weather/WindStatusFilterPills'
import {
  ALL_WIND_DISPLAY_STATUSES,
  type WindDisplayStatus,
} from '@/lib/weather/windDisplayStatus'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('WindStatusFilterPills', () => {
  it('restores the canonical show-all state after a status is disabled and enabled again', () => {
    function Harness() {
      const [visible, setVisible] = useState(
        () => new Set<WindDisplayStatus>(ALL_WIND_DISPLAY_STATUSES),
      )
      return (
        <WindStatusFilterPills
          counts={{ 'innan-marka': 1, 'nalgast-othaegindi': 1 }}
          visibleStatuses={visible}
          onVisibleStatusesChange={setVisible}
          showAllLabel=""
          mode="detailed"
        />
      )
    }

    render(<Harness />)
    const within = screen.getByRole('button', { name: /statusWithinLimits \(1\)/ })
    fireEvent.click(within)
    expect(within).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(within)
    expect(within).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /statusNearDiscomfort \(1\)/ }))
      .toHaveAttribute('aria-pressed', 'true')
  })

  it('uses the same grouped count as simple-mode route markers', () => {
    render(
      <WindStatusFilterPills
        counts={{ 'innan-marka': 2, 'nalgast-othaegindi': 3 }}
        visibleStatuses={new Set()}
        onVisibleStatusesChange={() => {}}
        showAllLabel=""
        mode="simple"
      />,
    )

    const button = screen.getByRole('button', { name: /statusWithinLimits \(5\)/ })
    expect(button).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(button).not.toHaveClass('text-muted-foreground/30')
  })

  it('does not force a misleading within-limits pill when the count is zero', () => {
    render(
      <WindStatusFilterPills
        counts={{}}
        visibleStatuses={new Set()}
        onVisibleStatusesChange={() => {}}
        showAllLabel=""
        mode="simple"
      />,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('can hide the only visible group instead of collapsing back to show all', () => {
    const onVisibleStatusesChange = vi.fn()
    render(
      <WindStatusFilterPills
        counts={{ 'innan-marka': 1 }}
        visibleStatuses={new Set()}
        onVisibleStatusesChange={onVisibleStatusesChange}
        showAllLabel=""
        mode="simple"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /statusWithinLimits \(1\)/ }))

    const next = onVisibleStatusesChange.mock.calls[0]?.[0] as Set<WindDisplayStatus>
    expect(next.size).toBeGreaterThan(0)
    expect(next.has('innan-marka')).toBe(false)
    expect(next.has('nalgast-othaegindi')).toBe(false)
    expect(next.has('othaegilegt')).toBe(true)
  })

  it('combines both missing-wind statuses into one compact filter', () => {
    render(
      <WindStatusFilterPills
        counts={{ no_data: 2, no_wind_data: 3 }}
        visibleStatuses={new Set([
          'innan-marka',
          'nalgast-othaegindi',
          'othaegilegt',
          'nalgast-haettumork',
          'haettulegt',
        ])}
        onVisibleStatusesChange={() => {}}
        showAllLabel=""
        mode="simple"
        combineNoWindDataStatuses
      />,
    )

    expect(screen.getByRole('button', { name: /noWindData \(5\)/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('shows both missing-wind statuses together without hiding measured statuses', () => {
    const onVisibleStatusesChange = vi.fn()
    const counts = { 'innan-marka': 1, no_data: 1, no_wind_data: 1 } as const
    const { rerender } = render(
      <WindStatusFilterPills
        counts={counts}
        visibleStatuses={new Set([
          'innan-marka',
          'nalgast-othaegindi',
          'othaegilegt',
          'nalgast-haettumork',
          'haettulegt',
        ])}
        onVisibleStatusesChange={onVisibleStatusesChange}
        showAllLabel=""
        mode="simple"
        combineNoWindDataStatuses
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /noWindData \(2\)/ }))

    const next = onVisibleStatusesChange.mock.calls[0]?.[0] as Set<WindDisplayStatus>
    expect(next).toEqual(new Set([
      'innan-marka',
      'nalgast-othaegindi',
      'othaegilegt',
      'nalgast-haettumork',
      'haettulegt',
      'no_data',
      'no_wind_data',
    ]))

    rerender(
      <WindStatusFilterPills
        counts={counts}
        visibleStatuses={next}
        onVisibleStatusesChange={onVisibleStatusesChange}
        showAllLabel=""
        mode="simple"
        combineNoWindDataStatuses
      />,
    )
    expect(screen.getByRole('button', { name: /noWindData \(2\)/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /noWindData \(2\)/ })).not.toHaveClass(
      'text-muted-foreground/30',
    )
  })
})
