'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

type RefreshResult = {
  status: 'ok'
  snapshotId: string
  goldenRoutePassCount: number
  goldenRouteTotalCount: number
  policyFingerprint: string
} | {
  status: 'error'
  reason: string
}

export function RoadGraphAdminSection() {
  const t = useTranslations('teskeid.vedrid.overview')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<RefreshResult | null>(null)

  async function refresh() {
    if (pending) return
    setPending(true)
    setResult(null)
    try {
      const response = await fetch('/api/admin/weather/refresh-road-graph', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      })
      const payload = await response.json().catch(() => null) as RefreshResult | null
      if (!response.ok || !payload) throw new Error('unavailable')
      setResult(payload)
    } catch {
      setResult({ status: 'error', reason: 'unavailable' })
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="rounded-xl border border-[#c2c9bb] bg-white p-5 shadow-sm" aria-labelledby="road-graph-admin-title">
      <h2 id="road-graph-admin-title" className="text-sm font-semibold text-gray-700">
        {t('roadGraphAdminTitle')}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">{t('roadGraphAdminDescription')}</p>
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={pending}
        className="mt-4 min-h-10 rounded-lg bg-[#174f17] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? t('roadGraphAdminRefreshing') : t('roadGraphAdminRefresh')}
      </button>
      {result?.status === 'ok' && (
        <p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-xs leading-relaxed text-green-900">
          {t('roadGraphAdminSuccess', {
            passed: result.goldenRoutePassCount,
            total: result.goldenRouteTotalCount,
          })}
        </p>
      )}
      {result?.status === 'error' && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs leading-relaxed text-red-900">
          {t('roadGraphAdminError')}
        </p>
      )}
    </section>
  )
}
