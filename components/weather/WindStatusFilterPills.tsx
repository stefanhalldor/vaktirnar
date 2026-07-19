'use client'

import { useTranslations } from 'next-intl'
import {
  type WindDisplayStatus,
  ALL_WIND_DISPLAY_STATUSES,
} from '@/lib/weather/windDisplayStatus'
import { WIND_STATUS_UI_META } from './windStatusUi'

export type WindStatusFilterPillsProps = {
  /**
   * Count of each status across all visible points.
   * Only statuses with count > 0 are shown, unless alwaysShowWithinLimits is set.
   */
  counts: Partial<Record<WindDisplayStatus, number>>
  /** Currently active filter. Empty set = show all (no filter active). */
  visibleStatuses: Set<WindDisplayStatus>
  /**
   * Called when user toggles a pill or clicks the "show all" reset button.
   * Receives the complete new Set — empty set means "show all".
   */
  onVisibleStatusesChange: (next: Set<WindDisplayStatus>) => void
  /** Label for the "show all" reset button (only shown when showAllButton=true and filter is active). */
  showAllLabel: string
  /** Whether to show a "show all" reset button when a filter is active. Default: false. */
  showAllButton?: boolean
  /**
   * When true, the 'innan-marka' pill is always rendered even when its count is 0.
   * Use for departure-heatmap style UIs where the within-limits pill is always meaningful.
   * Default: false.
   */
  alwaysShowWithinLimits?: boolean
}

/**
 * Reusable wind-status filter pill row.
 *
 * Renders status pills (Innan marka, Nálgast óþægindi, Óþægilegt, etc.) that let users
 * filter visible map markers or departure slots by wind status.
 *
 * Shared between:
 * - TravelAuditMap (/vedrid/ferdalagid route map)
 * - DepartureHeatmap (departure time scrubber)
 * - /vedrid overview station markers (via WeatherOverviewClient renderBelowMap)
 *
 * Driven by ALL_WIND_DISPLAY_STATUSES order and WIND_STATUS_UI_META Tailwind classes.
 * Translates status labels from teskeid.vedrid.ferdalagid so labels are consistent
 * with WindStatusBadge and all other status surfaces.
 *
 * The component handles the toggle internally and calls onVisibleStatusesChange with
 * the new Set. Callers that need side effects (e.g. clearing a selected point when
 * its status is filtered out) should wrap onVisibleStatusesChange to add those effects.
 */
export function WindStatusFilterPills({
  counts,
  visibleStatuses,
  onVisibleStatusesChange,
  showAllLabel,
  showAllButton = false,
  alwaysShowWithinLimits = false,
}: WindStatusFilterPillsProps) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')

  const noFilter = visibleStatuses.size === 0
  const hasActiveFilter = !noFilter

  const visibleList = ALL_WIND_DISPLAY_STATUSES.filter(st =>
    (alwaysShowWithinLimits && st === 'innan-marka') || (counts[st] ?? 0) > 0,
  )

  if (visibleList.length === 0) return null

  function handleToggle(st: WindDisplayStatus) {
    const next = new Set(visibleStatuses)
    if (next.has(st)) {
      next.delete(st)
    } else {
      next.add(st)
    }
    onVisibleStatusesChange(next)
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleList.map(st => {
        const isActive = visibleStatuses.has(st)
        const meta = WIND_STATUS_UI_META[st]
        return (
          <button
            key={st}
            type="button"
            onClick={() => handleToggle(st)}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
              isActive
                ? meta.chipActiveClass
                : noFilter
                  ? 'border-border bg-transparent text-muted-foreground'
                  : 'border-border bg-transparent text-muted-foreground/30'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${!isActive && !noFilter ? 'opacity-30' : ''} ${meta.dotClass}`}
              aria-hidden
            />
            <span aria-hidden>{meta.icon}</span>
            {tf(meta.labelKey as 'statusWithinLimits')} ({counts[st] ?? 0})
          </button>
        )
      })}
      {showAllButton && hasActiveFilter && (
        <button
          type="button"
          onClick={() => onVisibleStatusesChange(new Set())}
          className="text-[10px] px-2 py-1 rounded-full border border-primary/40 text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {showAllLabel}
        </button>
      )}
    </div>
  )
}
