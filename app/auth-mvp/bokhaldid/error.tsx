'use client'

import { LoaderCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { BookkeepingShell } from '@/components/bookkeeping/BookkeepingShell'
import { bookkeepingPrimaryButtonClass } from '@/components/bookkeeping/ui'

export default function BookkeepingError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('teskeid.bookkeeping')
  const [isPending, startTransition] = useTransition()

  return (
    <BookkeepingShell title={t('title')} homeLabel={t('homeLabel')}>
      <section role="alert" className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <p className="text-sm leading-6 text-destructive">{t('errors.load_failed')}</p>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(reset)}
          className={bookkeepingPrimaryButtonClass}
        >
          {isPending ? <LoaderCircle aria-hidden size={18} className="mr-2 animate-spin" /> : null}
          {isPending ? t('errors.retrying') : t('errors.retry')}
        </button>
      </section>
    </BookkeepingShell>
  )
}
