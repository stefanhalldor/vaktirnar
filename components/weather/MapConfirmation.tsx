'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { MapPin, RefreshCw } from 'lucide-react'

type MapConfirmationProps = {
  placeName: string
  staticMapUrl: string
  onChangePlace: () => void
}

export function MapConfirmation({ placeName, staticMapUrl, onChangePlace }: MapConfirmationProps) {
  const t = useTranslations('teskeid.vedrid.mapConfirmation')
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin size={12} aria-hidden />
          <span>{placeName}</span>
        </div>
        <button
          type="button"
          onClick={onChangePlace}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <RefreshCw size={12} aria-hidden />
          {t('changePlace')}
        </button>
      </div>
      {imgFailed ? (
        <div
          className="w-full rounded-lg border border-border bg-muted flex items-center justify-center"
          style={{ aspectRatio: '2/1' }}
          aria-label={t('mapAlt', { place: placeName })}
        >
          <MapPin size={24} className="text-muted-foreground" aria-hidden />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={staticMapUrl}
          alt={t('mapAlt', { place: placeName })}
          className="w-full rounded-lg border border-border"
          style={{ aspectRatio: '2/1', objectFit: 'cover' }}
          onError={() => setImgFailed(true)}
        />
      )}
      <p className="text-xs text-muted-foreground text-right">Map data ©Google</p>
    </div>
  )
}
