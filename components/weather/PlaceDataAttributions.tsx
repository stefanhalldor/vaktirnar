'use client'

import { useTranslations } from 'next-intl'
import type { PlaceDisplayValue } from '@/lib/places/display'
import type { PlaceSource } from '@/lib/places/types'
import { HMS_PLACE_DIRECTORY_ATTRIBUTION } from '@/lib/places/hmsAttribution'
import { OFFICIAL_PLACE_DIRECTORY_RETRIEVED_DATE } from '@/lib/places/officialPlaceAttribution.generated'

const HAGSTOFA_SETTLEMENT_METADATA_URL =
  'https://gatt.natt.is/geonetwork/srv/api/records/95c2ff71-c776-462a-8b23-d50cdeb7cb4f'
const LMI_SETTLEMENT_SOURCE_URL = 'https://www-gamli.lmi.is/landupplysingar/mannvirki/'
const POSTAL_LOCALITY_METADATA_URL =
  'https://gatt.natt.is/geonetwork/srv/api/records/22e98d21-a86b-4b62-ad58-a6d17703b612'
const OFFICIAL_TOPONYM_METADATA_URL =
  'https://gatt.natt.is/geonetwork/srv/api/records/635230d9-de00-4d68-ac6d-ab382e40ad94'

type AttributionPlace = PlaceDisplayValue & {
  source?: PlaceSource
  sourceId?: string
  labelSource?: PlaceSource
}

type PlaceDataAttributionsProps = {
  places: readonly AttributionPlace[]
  className?: string
}

export function PlaceDataAttributions({ places, className = '' }: PlaceDataAttributionsProps) {
  const t = useTranslations('teskeid.vedrid.placeSearch')
  const hasHms = places.some(
    place => place.source === 'hms' || place.labelSource === 'hms',
  )
  const hasOfficialSettlement = places.some(
    place => place.source === 'official' && place.placeType === 'settlement',
  )
  const hasOfficialToponym = places.some(
    place => place.source === 'official' && place.sourceId?.startsWith('toponym:'),
  )
  const hasPostalLocality = hasOfficialSettlement || places.some(
    place => Boolean(place.postalLocality?.trim()),
  )

  if (!hasHms && !hasOfficialSettlement && !hasOfficialToponym && !hasPostalLocality) return null

  const linkClass =
    'rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div
      aria-label={t('dataAttributionLabel')}
      className={`flex flex-wrap gap-x-2 gap-y-1 text-[11px] leading-tight text-muted-foreground ${className}`}
    >
      {hasHms && (
        <a
          href={HMS_PLACE_DIRECTORY_ATTRIBUTION.termsUrl}
          target="_blank"
          rel="noreferrer"
          className={linkClass}
        >
          {t('hmsAttribution')}
        </a>
      )}
      {hasOfficialSettlement && (
        <>
          <a
            href={HAGSTOFA_SETTLEMENT_METADATA_URL}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            {t('settlementAttributionHagstofa')}
          </a>
          <a
            href={LMI_SETTLEMENT_SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            {t('settlementAttributionLmi', {
              date: OFFICIAL_PLACE_DIRECTORY_RETRIEVED_DATE,
            })}
          </a>
        </>
      )}
      {hasOfficialToponym && (
        <a
          href={OFFICIAL_TOPONYM_METADATA_URL}
          target="_blank"
          rel="noreferrer"
          className={linkClass}
        >
          {t('toponymAttribution')}
        </a>
      )}
      {hasPostalLocality && (
        <a
          href={POSTAL_LOCALITY_METADATA_URL}
          target="_blank"
          rel="noreferrer"
          className={linkClass}
        >
          {t('postalLocalityAttribution')}
        </a>
      )}
    </div>
  )
}
