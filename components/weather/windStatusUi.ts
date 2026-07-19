/**
 * UI display metadata for WindDisplayStatus — Tailwind class strings live here
 * so they are picked up by Tailwind's content scan (components/ is scanned; lib/ is not).
 *
 * Import WIND_STATUS_UI_META from this file wherever you need dotClass, borderClass,
 * chipActiveClass, labelClass, icon, or labelKey for rendering.
 */

import type { WindDisplayStatus } from '@/lib/weather/windDisplayStatus'

export type WindStatusUiMeta = {
  labelKey: string
  icon: string
  dotClass: string
  borderClass: string
  labelClass: string
  chipActiveClass: string
}

export const WIND_STATUS_UI_META: Record<WindDisplayStatus, WindStatusUiMeta> = {
  'innan-marka':        { labelKey: 'statusWithinLimits',   icon: '✓',  dotClass: 'bg-[#2d5a27]',          borderClass: 'border-[#2d5a27]',          labelClass: 'text-[#2d5a27]',        chipActiveClass: 'border-[#2d5a27] bg-[#2d5a27]/10 text-[#2d5a27]'          },
  'nalgast-othaegindi': { labelKey: 'statusNearDiscomfort', icon: '😬', dotClass: 'bg-amber-400',           borderClass: 'border-amber-400',           labelClass: 'text-amber-700',        chipActiveClass: 'border-amber-400 bg-amber-50 text-amber-700'               },
  'othaegilegt':        { labelKey: 'statusUncomfortable',  icon: '😟', dotClass: 'bg-orange-500',          borderClass: 'border-orange-500',          labelClass: 'text-orange-600',       chipActiveClass: 'border-orange-500 bg-orange-50 text-orange-700'            },
  'nalgast-haettumork': { labelKey: 'statusNearDanger',     icon: '😰', dotClass: 'bg-destructive',         borderClass: 'border-destructive',         labelClass: 'text-destructive',      chipActiveClass: 'border-destructive bg-destructive/10 text-destructive'     },
  'haettulegt':         { labelKey: 'statusDangerous',      icon: '⚠️',  dotClass: 'bg-destructive',         borderClass: 'border-destructive',         labelClass: 'text-destructive',      chipActiveClass: 'border-destructive bg-destructive/10 text-destructive'     },
  'no_data':            { labelKey: 'heatmapNotAssessed',   icon: '–',  dotClass: 'bg-muted-foreground/30', borderClass: 'border-muted-foreground/30', labelClass: 'text-muted-foreground', chipActiveClass: 'border-muted-foreground/30 bg-muted text-muted-foreground' },
  'no_wind_data':       { labelKey: 'noWindData',           icon: '–',  dotClass: 'bg-muted-foreground/30', borderClass: 'border-muted-foreground/30', labelClass: 'text-muted-foreground', chipActiveClass: 'border-muted-foreground/30 bg-muted text-muted-foreground' },
}
