'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AdvertiserReviewView } from '@/lib/advertiser/contracts'

type ReviewDecision = 'approved' | 'changes_requested' | 'rejected' | 'pause'

export function AdvertiserReviewClient() {
  const t = useTranslations('advertiser')
  const [rows, setRows] = useState<AdvertiserReviewView[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/advertiser', { cache: 'no-store' })
      if (!response.ok) throw new Error('load')
      const payload = await response.json() as { creatives: AdvertiserReviewView[] }
      setRows(payload.creatives)
      setError(null)
    } catch {
      setError(t('loadError'))
    } finally {
      setLoaded(true)
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  async function review(row: AdvertiserReviewView, decision: ReviewDecision) {
    if (pendingId) return
    setPendingId(row.id)
    setError(null)
    try {
      const response = await fetch('/api/admin/advertiser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creativeId: row.id,
          expectedRevision: row.revision,
          decision,
          note: notes[row.id] ?? '',
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      if (!response.ok) throw new Error(response.status === 409 ? 'conflict' : 'save')
      await load()
    } catch (reviewError) {
      setError(reviewError instanceof Error && reviewError.message === 'conflict'
        ? t('conflict')
        : t('saveError'))
    } finally {
      setPendingId(null)
    }
  }

  if (!loaded) {
    return <p role="status" className="text-sm text-muted-foreground">{t('loading')}</p>
  }

  if (!error && rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('noPending')}</p>
  }

  return (
    <div className="grid gap-4">
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {rows.map(row => {
        const pending = pendingId === row.id
        return (
          <article key={row.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{t(row.snapshot.placement === 'public_quiz_lobby' ? 'lobby' : 'results')} · v{row.revision}</span>
              <span>{row.snapshot.advertiserName} · {row.snapshot.advertiserDomain}</span>
            </div>
            <h2 className="mt-3 font-semibold">{row.snapshot.headline}</h2>
            <p className="mt-1 text-sm">{row.snapshot.body}</p>
            <a
              href={row.snapshot.destinationUrl}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="mt-2 block break-all text-sm text-primary underline underline-offset-2"
            >
              {row.snapshot.ctaLabel}: {row.snapshot.destinationUrl}
            </a>
            <label className="mt-3 grid gap-1 text-sm font-medium">
              {t('reviewNote')}
              <textarea
                value={notes[row.id] ?? ''}
                onChange={event => setNotes(current => ({ ...current, [row.id]: event.target.value }))}
                maxLength={500}
                className="min-h-20 rounded-lg border border-border bg-background p-3 text-base"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {row.reviewStatus === 'pending' ? (
                <>
                  <button disabled={pendingId !== null} onClick={() => void review(row, 'approved')} className="min-h-10 rounded-lg bg-primary px-3 text-sm text-primary-foreground disabled:opacity-45">{t('approve')}</button>
                  <button disabled={pendingId !== null} onClick={() => void review(row, 'changes_requested')} className="min-h-10 rounded-lg border border-border px-3 text-sm disabled:opacity-45">{t('requestChanges')}</button>
                  <button disabled={pendingId !== null} onClick={() => void review(row, 'rejected')} className="min-h-10 rounded-lg border border-destructive px-3 text-sm text-destructive disabled:opacity-45">{t('reject')}</button>
                </>
              ) : null}
              {row.deliveryStatus === 'active' ? (
                <button disabled={pendingId !== null} onClick={() => void review(row, 'pause')} className="min-h-10 rounded-lg border border-destructive px-3 text-sm text-destructive disabled:opacity-45">
                  {pending ? t('saving') : t('emergencyPause')}
                </button>
              ) : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}
