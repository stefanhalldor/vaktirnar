'use client'

import { useTranslations } from 'next-intl'
import {
  getPlaceSecondaryLabel,
  type PlaceDisplayValue,
} from '@/lib/places/display'

type PlaceResultIdentityProps = {
  place: PlaceDisplayValue
  compact?: boolean
}

export function PlaceResultIdentity({ place, compact = false }: PlaceResultIdentityProps) {
  const t = useTranslations('teskeid.vedrid.placeSearch')
  const secondary = getPlaceSecondaryLabel(place)
  const typeLabel = place.placeType === 'settlement'
    ? t('placeTypeSettlement')
    : place.placeType === 'address'
      ? t('placeTypeAddress')
      : null

  return (
    <span className="block min-w-0 flex-1">
      <span className="flex min-w-0 items-start gap-1.5">
        <span className={`min-w-0 flex-1 break-words font-medium leading-snug ${compact ? 'text-xs' : 'text-sm'}`}>
          {place.name}
        </span>
        {typeLabel && (
          <span className="shrink-0 rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-muted-foreground">
            {typeLabel}
          </span>
        )}
      </span>
      {secondary && (
        <span className="mt-0.5 block break-words text-xs leading-snug text-muted-foreground">
          {secondary}
        </span>
      )}
    </span>
  )
}
