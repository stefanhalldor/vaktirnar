'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LoaderCircle, Trash2 } from 'lucide-react'
import { deleteSplitFromList } from '@/lib/receipt-split/actions'
import type { SplitListItem } from '@/lib/receipt-split/contracts'

export function SplitList({ splits, formattedDates }: { splits: SplitListItem[]; formattedDates: Record<string, string> }) {
  const t = useTranslations('teskeid.receiptSplit')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function remove(split: SplitListItem) {
    if (!window.confirm(t('deleteListConfirm', { title: split.title || t('review') }))) return
    setError(null); setDeletingId(split.id)
    startTransition(async () => {
      const result = await deleteSplitFromList({ id: split.id, version: split.version, requestId: crypto.randomUUID() })
      if (!result.ok) { setError(t(result.error)); setDeletingId(null); return }
      router.refresh()
    })
  }

  return <section className="space-y-3" aria-busy={pending}>
    <h2 className="font-semibold">{t('yourSplits')}</h2>
    {splits.map(split => <div key={split.id} className="flex min-h-11 items-stretch rounded-xl border border-border">
      <Link href={'/auth-mvp/splitta-reikningnum/' + split.id} className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-l-xl p-3 text-primary">
        <span className="min-w-0 break-words font-medium">{split.title || t('review')}</span>
        <time className="shrink-0 text-sm text-muted-foreground" dateTime={split.incurredOn}>{formattedDates[split.id]}</time>
      </Link>
      {split.isOwner && <button type="button" className="flex min-h-11 min-w-11 items-center justify-center rounded-r-xl border-l border-border text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t('deleteFromList', { title: split.title || t('review') })} disabled={pending} onClick={() => remove(split)}>
        {pending && deletingId === split.id ? <LoaderCircle aria-hidden size={18} className="animate-spin" /> : <Trash2 aria-hidden size={18} />}
      </button>}
    </div>)}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}
