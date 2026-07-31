'use client'

import { useTranslations } from 'next-intl'
import {
  type WindDisplayStatus,
  ALL_WIND_DISPLAY_STATUSES,
} from '@/lib/weather/windDisplayStatus'
import { WIND_STATUS_UI_META } from './windStatusUi'

export type WindStatusFilterMode = 'simple' | 'detailed'

type WindStatusPillGroup = {
  id: string
  statuses: WindDisplayStatus[]
  metaStatus: WindDisplayStatus
}

const SIMPLE_STATUS_GROUPS: WindStatusPillGroup[] = [
  { id: 'simple-within-limits', statuses: ['innan-marka', 'nalgast-othaegindi'], metaStatus: 'innan-marka' },
  { id: 'simple-uncomfortable', statuses: ['othaegilegt', 'nalgast-haettumork'], metaStatus: 'othaegilegt' },
  { id: 'simple-dangerous', statuses: ['haettulegt'], metaStatus: 'haettulegt' },
]

const NO_WIND_MEASUREMENT_GROUP: WindStatusPillGroup = {
  id: 'no-wind-measurement',
  statuses: ['no_data', 'no_wind_data'],
  metaStatus: 'no_wind_data',
}

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
  /**
   * 'simple' collapses near-threshold statuses into the main orange/red pills.
   * 'detailed' shows every WindDisplayStatus separately.
   * Default: 'detailed' to preserve existing behavior for shared callers.
   */
  mode?: WindStatusFilterMode
  /** Render pills without risk colors/icons. Useful when status is a filter, not a warning surface. */
  neutralColors?: boolean
  /** Combine missing and unavailable wind data into one user-facing filter. */
  combineNoWindDataStatuses?: boolean
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
  mode = 'detailed',
  neutralColors = false,
  combineNoWindDataStatuses = false,
}: WindStatusFilterPillsProps) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')

  const noFilter = visibleStatuses.size === 0
  const hasActiveFilter = !noFilter

  const baseGroups: WindStatusPillGroup[] = mode === 'simple'
    ? SIMPLE_STATUS_GROUPS
    : ALL_WIND_DISPLAY_STATUSES.map(st => ({
        id: st,
        statuses: [st],
        metaStatus: st,
      }))
  const groups = combineNoWindDataStatuses
    ? [
        ...baseGroups.filter(group =>
          !group.statuses.some(status => NO_WIND_MEASUREMENT_GROUP.statuses.includes(status)),
        ),
        NO_WIND_MEASUREMENT_GROUP,
      ]
    : baseGroups

  const visibleList = groups.filter(group =>
    (alwaysShowWithinLimits && group.metaStatus === 'innan-marka') ||
    group.statuses.some(st => (counts[st] ?? 0) > 0)
  )

  if (visibleList.length === 0) return null

  function groupCount(group: WindStatusPillGroup) {
    return group.statuses.reduce((sum, st) => sum + (counts[st] ?? 0), 0)
  }

  function groupIsActive(group: WindStatusPillGroup) {
    return group.statuses.some(st => visibleStatuses.has(st))
  }

  function handleToggle(group: WindStatusPillGroup) {
    // When no filter is active (all shown), treat it as if all are individually selected.
    const base = noFilter
      ? new Set<WindDisplayStatus>(ALL_WIND_DISPLAY_STATUSES)
      : new Set(visibleStatuses)
    if (groupIsActive(group) || noFilter) {
      group.statuses.forEach(st => base.delete(st))
    } else {
      group.statuses.forEach(st => base.add(st))
    }
    // Shared callers use an empty set for the neutral "no filter" state. In
    // the combined missing-wind UI, keep an explicit full set so the newly
    // enabled pill remains visibly active as well as aria-pressed.
    const allNowSelected = ALL_WIND_DISPLAY_STATUSES.every(st => base.has(st))
    onVisibleStatusesChange(
      allNowSelected && !combineNoWindDataStatuses ? new Set() : base,
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleList.map(group => {
        const isActive = groupIsActive(group)
        const isVisuallyActive = noFilter || isActive
        const meta = WIND_STATUS_UI_META[group.metaStatus]
        const activeClass = neutralColors
          ? 'border-primary/40 bg-primary/5 text-primary'
          : meta.chipActiveClass
        const dotClass = neutralColors ? 'bg-muted-foreground/50' : meta.dotClass
        return (
          <button
            key={group.id}
            type="button"
            aria-pressed={noFilter || isActive}
            onClick={() => handleToggle(group)}
            className={`flex min-h-10 items-center gap-1 rounded-full border px-3 py-1 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
              isVisuallyActive
                ? activeClass
                : 'border-border bg-transparent text-muted-foreground/30'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${!isVisuallyActive ? 'opacity-30' : ''} ${dotClass}`}
              aria-hidden
            />
            {!neutralColors && <span aria-hidden>{meta.icon}</span>}
            {tf(meta.labelKey as 'statusWithinLimits')} ({groupCount(group)})
          </button>
        )
      })}
      {showAllButton && hasActiveFilter && (
        <button
          type="button"
          onClick={() => onVisibleStatusesChange(new Set())}
          className="min-h-10 rounded-full border border-primary/40 px-3 py-1 text-[10px] text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {showAllLabel}
        </button>
      )}
    </div>
  )
}
