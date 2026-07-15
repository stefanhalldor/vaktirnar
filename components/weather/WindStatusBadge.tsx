'use client'

import { useTranslations } from 'next-intl'
import type { WindDisplayStatus } from '@/lib/weather/windDisplayStatus'
import { WIND_STATUS_UI_META } from '@/components/weather/windStatusUi'

/**
 * Shared wind/weather status label.
 *
 * Variants:
 *   'chip'   — rounded-full pill with color dot (default; for point rows and cards)
 *   'line'   — text-sm with icon left, labelClass color (for summary sections)
 *   'badge'  — small rounded badge with icon inline (for card header chips)
 */
export function WindStatusBadge({
  status,
  variant = 'chip',
  className,
}: {
  status: WindDisplayStatus
  variant?: 'chip' | 'line' | 'badge'
  className?: string
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const meta = WIND_STATUS_UI_META[status]
  const label = tf(meta.labelKey as 'statusWithinLimits')

  if (variant === 'line') {
    return (
      <span className={`text-sm font-medium flex items-center gap-1.5 ${meta.labelClass}${className ? ` ${className}` : ''}`}>
        <span aria-hidden>{meta.icon}</span>
        {label}
      </span>
    )
  }

  if (variant === 'badge') {
    return (
      <span className={`px-1.5 py-0.5 rounded font-medium text-[10px] ${meta.chipActiveClass}${className ? ` ${className}` : ''}`}>
        {meta.icon} {label}
      </span>
    )
  }

  // chip (default)
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${meta.chipActiveClass}${className ? ` ${className}` : ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} aria-hidden />
      <span aria-hidden>{meta.icon}</span>
      {label}
    </span>
  )
}
