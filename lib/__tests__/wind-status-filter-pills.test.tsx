import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WindStatusFilterPills } from '@/components/weather/WindStatusFilterPills'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('WindStatusFilterPills', () => {
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

    expect(screen.getByRole('button', { name: /statusWithinLimits \(5\)/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
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

    const next = onVisibleStatusesChange.mock.calls[0]?.[0] as Set<string>
    expect(next.size).toBeGreaterThan(0)
    expect(next.has('innan-marka')).toBe(false)
    expect(next.has('nalgast-othaegindi')).toBe(false)
    expect(next.has('othaegilegt')).toBe(true)
  })
})
