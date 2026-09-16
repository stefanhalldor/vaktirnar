'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { importLegacySplit } from '@/lib/receipt-split/actions'
import { createRequestId, expensePrimaryButtonClass } from '@/components/expenses/ui'

export function LegacyReceiptCopy({ id, version }: { id: string; version: number }) {
  const t = useTranslations('teskeid.receiptSplit')
  const router = useRouter()
  const request = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return <section className="space-y-4">
    <p>{t('legacy')}</p><p className="text-sm text-muted-foreground">{t('legacyImage')}</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <button type="button" disabled={pending} className={expensePrimaryButtonClass + ' w-full'} onClick={() => {
      request.current ??= createRequestId()
      start(async () => {
        try {
          const result = await importLegacySplit({ id, version, requestId: request.current })
          if (!result.ok) setError(t(result.error))
          else router.refresh()
        } catch { setError(t('failed')) }
      })
    }}>{pending ? t('pending') : t('importLegacy')}</button>
  </section>
}
