'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { PrivateTeskeidFeedbackDto } from '@/lib/map-notes/contracts'

export function MapFeedbackAdminSection() {
  const t = useTranslations('teskeid.vedrid.overview')
  const locale = useLocale()
  const [items, setItems] = useState<PrivateTeskeidFeedbackDto[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const response = await fetch('/api/admin/map-notes', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('unavailable')
      const payload = await response.json() as { items?: PrivateTeskeidFeedbackDto[] }
      setItems(payload.items ?? [])
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="rounded-xl border border-[#c2c9bb] bg-white p-5 shadow-sm" aria-labelledby="map-feedback-admin-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="map-feedback-admin-title" className="text-sm font-semibold text-gray-700">
            {t('mapNotesAdminTitle')}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{t('mapNotesAdminDescription')}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={status === 'loading'}
          className="min-h-10 rounded-lg border border-[#c2c9bb] px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-60"
        >
          {t('mapNotesAdminRefresh')}
        </button>
      </div>

      {status === 'loading' ? (
        <p role="status" className="mt-4 text-xs text-gray-500">{t('mapNotesAdminLoading')}</p>
      ) : status === 'error' ? (
        <p role="alert" className="mt-4 text-xs text-red-700">{t('mapNotesAdminError')}</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-xs text-gray-500">{t('mapNotesAdminEmpty')}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map(item => (
            <li key={item.id} className="rounded-lg border border-[#d8ddd2] bg-[#fbf9f4] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
                <span>{item.authorName ?? t('mapNotesFeedbackBadge')}</span>
                <time dateTime={item.createdAt}>
                  {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-900">{item.body}</p>
              {item.routeContext && (
                <p className="mt-2 text-xs text-gray-600">
                  <span className="font-semibold">{t('mapNotesAdminRoute')}:</span>{' '}
                  {item.routeContext.from} → {item.routeContext.to}
                </p>
              )}
              {item.anchor?.label && (
                <p className="mt-1 text-xs text-gray-600">
                  <span className="font-semibold">{t('mapNotesAdminPlace')}:</span>{' '}
                  {item.anchor.label}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
