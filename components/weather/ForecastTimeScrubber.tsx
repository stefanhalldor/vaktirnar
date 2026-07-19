'use client'

import { useLocale } from 'next-intl'
import { WIND_STATUS_MARKER_COLOR, type WindDisplayStatus } from '@/lib/weather/windDisplayStatus'
import { formatLongDepartureDateTime } from '@/components/weather/travelAuditMap.helpers'
import { groupSlotsByDay } from '@/lib/weather/forecastSlotHelpers'

export interface ForecastTimeScrubberSlot {
  timeMs: number
  worstStatus: WindDisplayStatus
  /** Resolved translation of worstStatus label, e.g. "Innan marka". Used for aria-label. */
  worstStatusLabel: string
}

interface ForecastTimeScrubberProps {
  slots: ForecastTimeScrubberSlot[]
  selectedTimeMs: number
  onSelect: (timeMs: number) => void
  label: string
}

/**
 * Compact horizontal scrubber showing colored status dots per forecast time slot.
 * Slots are grouped by UTC calendar day (Iceland uses UTC year-round).
 * Scroll is contained within the component — no page-level overflow.
 */
export function ForecastTimeScrubber({
  slots,
  selectedTimeMs,
  onSelect,
  label,
}: ForecastTimeScrubberProps) {
  const locale = useLocale()
  const dayGroups = groupSlotsByDay(slots, locale)

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="overflow-x-auto">
        <div className="flex gap-2 pb-1" style={{ minWidth: 'max-content' }}>
          {dayGroups.map(({ dayKey, dayLabel, slots: daySlots }) => (
            <div key={dayKey} className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground px-1 leading-none">{dayLabel}</span>
              <div className="flex gap-0.5">
                {daySlots.map(slot => {
                  const isSelected = slot.timeMs === selectedTimeMs
                  const ariaLabel = `${label}, ${formatLongDepartureDateTime(new Date(slot.timeMs).toISOString(), locale)}, ${slot.worstStatusLabel}`
                  return (
                    <button
                      key={slot.timeMs}
                      type="button"
                      onClick={() => onSelect(slot.timeMs)}
                      aria-pressed={isSelected}
                      aria-label={ariaLabel}
                      className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded min-w-[32px] transition-colors ${
                        isSelected
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
                        {new Date(slot.timeMs).toISOString().slice(11, 13)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

