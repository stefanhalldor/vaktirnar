'use client'

import { useLocale } from 'next-intl'
import { WIND_STATUS_MARKER_COLOR } from '@/lib/weather/windDisplayStatus'
import type { ForecastTimeScrubberSlot } from '@/components/weather/ForecastTimeScrubber'
import { formatLongDepartureDateTime } from '@/components/weather/travelAuditMap.helpers'
import { groupSlotsByDay } from '@/lib/weather/forecastSlotHelpers'

interface WeatherSourceTimeSelectorProps {
  // Vegagerðin / current-observations group
  vegagerdinGroupLabel: string
  nowLabel: string
  /** Formatted measurement time label, e.g. "Mælt 10:27". Omitted when no data yet. */
  nowMeasuredAtLabel?: string
  nowStatusColor: string
  nowStatusLabel: string
  nowLoading: boolean
  nowLoadingLabel: string
  /** Disable the Núna button — only when access is restricted. Stale data remains clickable. */
  nowDisabled: boolean

  // Forecast provider group (Veðurstofan forecast slots; Yr not yet wired)
  forecastGroupLabel: string
  forecastLabel: string
  forecastSlots: ForecastTimeScrubberSlot[]
  forecastLoading: boolean
  forecastLoadingLabel: string

  // Unified selection
  activeMode: 'now' | number
  onModeChange: (mode: 'now' | number) => void
}

/**
 * Compact horizontal source/time selector combining:
 * - A fixed left section: Vegagerðin "Núna" with newest measurement time and status dot
 * - A scrollable right section: forecast provider time slots with status dots
 *
 * Only one mode is active at a time. Selecting "Núna" shows the Vegagerðin current layer;
 * selecting a forecast slot shows the Veðurstofan layer for that time.
 * Scroll is contained within the component — no page-level overflow.
 */
export function WeatherSourceTimeSelector({
  vegagerdinGroupLabel,
  nowLabel,
  nowMeasuredAtLabel,
  nowStatusColor,
  nowStatusLabel,
  nowLoading,
  nowLoadingLabel,
  nowDisabled,
  forecastGroupLabel,
  forecastLabel,
  forecastSlots,
  forecastLoading,
  forecastLoadingLabel,
  activeMode,
  onModeChange,
}: WeatherSourceTimeSelectorProps) {
  const locale = useLocale()
  const nowActive = activeMode === 'now'

  return (
    <div className="flex border border-border rounded-lg overflow-hidden text-xs">

      {/* Left: Vegagerðin / Núna — fixed width, does not scroll */}
      <div className="flex-shrink-0 border-r border-border">
        <div className="px-2 pt-1 pb-0.5 text-[10px] text-muted-foreground leading-none text-center">
          {vegagerdinGroupLabel}
        </div>
        <div className="px-1 pb-1">
          <div className="flex flex-col items-center gap-0.5">
            {/* "Núna" as a day-header label, matching the day label style on the right */}
            <span className="text-[10px] text-muted-foreground px-1 leading-none text-center">{nowLabel}</span>
            {nowLoading ? (
              <span className="block px-1.5 py-1 text-muted-foreground">{nowLoadingLabel}</span>
            ) : (
              <button
                type="button"
                disabled={nowDisabled}
                onClick={() => onModeChange('now')}
                aria-pressed={nowActive}
                aria-label={`${vegagerdinGroupLabel} ${nowLabel}${nowMeasuredAtLabel ? `, ${nowMeasuredAtLabel}` : ''}, ${nowStatusLabel}`}
                className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded transition-colors min-w-[32px] min-h-[32px] ${
                  nowActive
                    ? 'bg-foreground/10 ring-1 ring-foreground/30'
                    : nowDisabled
                      ? 'opacity-40 cursor-default'
                      : 'hover:bg-foreground/5 active:bg-foreground/10'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: nowStatusColor }}
                  aria-hidden
                />
                {nowMeasuredAtLabel && (
                  <span className="text-[10px] font-mono text-muted-foreground leading-none">{nowMeasuredAtLabel}</span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right: forecast provider slots (Veðurstofan forecast; Yr not yet wired) — scrollable */}
      <div className="flex-1 min-w-0">
        <div className="px-2 pt-1 pb-0.5 text-[10px] text-muted-foreground leading-none text-center">
          {forecastGroupLabel}
        </div>
        <div className="px-1 pb-1">
          {forecastLoading && forecastSlots.length === 0 ? (
            <span className="block px-1.5 py-1 text-muted-foreground">{forecastLoadingLabel}</span>
          ) : forecastSlots.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="flex gap-2 pb-0.5" style={{ minWidth: 'max-content' }}>
                {groupSlotsByDay(forecastSlots, locale).map(({ dayKey, dayLabel, slots: daySlots }) => (
                  <div key={dayKey} className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground px-1 leading-none text-center">{dayLabel}</span>
                    <div className="flex gap-0.5">
                      {daySlots.map(slot => {
                        const isActive = activeMode === slot.timeMs
                        const hourLabel = new Date(slot.timeMs).toISOString().slice(11, 13)
                        const ariaLabel = `${forecastGroupLabel} ${forecastLabel} ${formatLongDepartureDateTime(new Date(slot.timeMs).toISOString(), locale)}, ${slot.worstStatusLabel}`
                        return (
                          <button
                            key={slot.timeMs}
                            type="button"
                            onClick={() => onModeChange(slot.timeMs)}
                            aria-pressed={isActive}
                            aria-label={ariaLabel}
                            className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded min-w-[32px] transition-colors ${
                              isActive
                                ? 'bg-foreground/10 ring-1 ring-foreground/30'
                                : 'hover:bg-foreground/5 active:bg-foreground/10'
                            }`}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ background: WIND_STATUS_MARKER_COLOR[slot.worstStatus] }}
                              aria-hidden
                            />
                            <span className="text-[10px] font-mono text-muted-foreground leading-none">
                              {hourLabel}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

    </div>
  )
}

