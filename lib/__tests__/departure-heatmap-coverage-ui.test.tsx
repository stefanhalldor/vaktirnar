import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DepartureHeatmap } from '@/components/weather/DepartureHeatmap'
import type { ProviderRouteSlotAssessment } from '@/lib/road-intelligence/routeSlotStatuses'
import type { TravelCandidate } from '@/lib/weather/types'

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => Object.assign(
    (key: string, values?: Record<string, unknown>) => {
      if (typeof values?.count === 'number') return `${key}:${values.count}`
      if (typeof values?.status === 'string') return `${key}:${values.status}`
      if (typeof values?.distance === 'string') return `${key}:${values.distance}`
      return key
    },
    { rich: (key: string) => key },
  ),
}))

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const CANDIDATE: TravelCandidate = {
  departureIso: '2026-07-31T15:00:00.000Z',
  arrivalIso: '2026-07-31T18:00:00.000Z',
  status: 'graent',
}

function assessment(
  coverageStatus: 'complete' | 'incomplete',
): ProviderRouteSlotAssessment {
  const diagnostics = {
    usableStationCount: 1,
    usableRouteFractions: [0.5],
    measurementGaps: coverageStatus === 'complete'
      ? []
      : [{ startFraction: 0, endFraction: 0.25, distanceKm: 25 }],
    largestGapKm: coverageStatus === 'complete' ? 0 : 25,
    totalGapKm: coverageStatus === 'complete' ? 0 : 25,
    invalidRouteFractionCount: 0,
    temporalGapCount: 0,
    missingWindCount: 0,
  }
  return {
    hazardStatus: coverageStatus === 'complete' ? 'innan-marka' : 'othaegilegt',
    displayStatus: coverageStatus === 'complete' ? 'innan-marka' : 'othaegilegt',
    statusCounts: coverageStatus === 'complete'
      ? { 'innan-marka': 1 }
      : { othaegilegt: 1 },
    coverage: coverageStatus === 'complete'
      ? { ...diagnostics, status: 'complete', reason: null }
      : { ...diagnostics, status: 'incomplete', reason: 'spatial_gap' },
  }
}

describe('DepartureHeatmap provider coverage', () => {
  it('counts departure times explicitly and shows known risk beside incomplete coverage', () => {
    render(
      <DepartureHeatmap
        candidates={[CANDIDATE]}
        originName="Garðabær"
        selectedIdx={0}
        onSelectIdx={vi.fn()}
        visibleStatuses={new Set()}
        onVisibleStatusesChange={vi.fn()}
        showSelectedDetail={false}
        slotAssessments={[assessment('incomplete')]}
      />,
    )

    expect(screen.getByRole('button', {
      name: 'statusUncomfortable (heatmapDepartureCount:1)',
    })).toBeInTheDocument()
    expect(screen.queryByRole('button', {
      name: /heatmapNotAssessed \(heatmapDepartureCount:1\)/,
    })).not.toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: /statusUncomfortable · heatmapCoverageIncompleteShort/,
    })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'heatmapCoverageIncompleteWithHazard:statusUncomfortable',
    )
    expect(screen.getByRole('status')).toHaveTextContent('heatmapCoverageGapDistance:25')
  })

  it('does not show a coverage warning for a fully covered calm slot', () => {
    render(
      <DepartureHeatmap
        candidates={[CANDIDATE]}
        originName="Garðabær"
        selectedIdx={0}
        onSelectIdx={vi.fn()}
        visibleStatuses={new Set()}
        onVisibleStatusesChange={vi.fn()}
        showSelectedDetail={false}
        slotAssessments={[assessment('complete')]}
      />,
    )

    expect(screen.getByRole('button', {
      name: 'statusWithinLimits (heatmapDepartureCount:1)',
    })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('never describes an incomplete calm slot as within limits', () => {
    const incompleteCalm: ProviderRouteSlotAssessment = {
      ...assessment('incomplete'),
      hazardStatus: 'innan-marka',
      displayStatus: 'no_data',
      statusCounts: { 'innan-marka': 1 },
    }

    render(
      <DepartureHeatmap
        candidates={[CANDIDATE]}
        originName="Garðabær"
        selectedIdx={0}
        onSelectIdx={vi.fn()}
        visibleStatuses={new Set()}
        onVisibleStatusesChange={vi.fn()}
        showSelectedDetail={false}
        slotAssessments={[incompleteCalm]}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('heatmapCoverageIncompleteDetail')
    expect(screen.getByRole('status')).not.toHaveTextContent('statusWithinLimits')
  })

  it('does not mark an incomplete slot as best even when a legacy best window includes it', () => {
    render(
      <DepartureHeatmap
        candidates={[CANDIDATE]}
        bestWindow={{
          fromIso: CANDIDATE.departureIso,
          toIso: CANDIDATE.departureIso,
          status: 'gult',
        }}
        originName="Garðabær"
        selectedIdx={null}
        onSelectIdx={vi.fn()}
        visibleStatuses={new Set()}
        onVisibleStatusesChange={vi.fn()}
        showSelectedDetail={false}
        slotAssessments={[assessment('incomplete')]}
      />,
    )

    expect(screen.queryByText('heatmapBestSlot')).not.toBeInTheDocument()
  })
})
