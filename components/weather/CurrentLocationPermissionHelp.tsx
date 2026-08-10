'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

export function CurrentLocationPermissionHelp({ id }: { id?: string }) {
  const t = useTranslations('teskeid.vedrid.placeSearch')
  const locale = useLocale()
  const interfaceUsesEnglish = locale.toLowerCase().startsWith('en')
  const [showEnglish, setShowEnglish] = useState(false)
  const usesEnglish = interfaceUsesEnglish || showEnglish

  return (
    <details id={id} className="overflow-hidden rounded-lg border border-border bg-muted/30 text-muted-foreground">
      <summary className="min-h-10 cursor-pointer px-3 py-2 text-xs font-medium leading-6 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        {t('currentLocationPermissionHelpTitle')}
      </summary>
      <div className="flex flex-col gap-2 border-t border-border px-3 py-2 text-xs leading-relaxed">
        {!interfaceUsesEnglish && (
          <button
            type="button"
            onClick={() => setShowEnglish(current => !current)}
            className="min-h-10 self-start rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showEnglish ? t('currentLocationPermissionShowIcelandic') : t('currentLocationPermissionShowEnglish')}
          </button>
        )}
        <div lang={usesEnglish ? 'en' : 'is'} className="flex flex-col gap-2">
          <p>{t(usesEnglish ? 'currentLocationPermissionIosHelpEnglish' : 'currentLocationPermissionIosHelp')}</p>
          <p>{t(usesEnglish ? 'currentLocationPermissionBrowserHelpEnglish' : 'currentLocationPermissionBrowserHelp')}</p>
        </div>
      </div>
    </details>
  )
}
