'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

type RefreshResult = {
  status: 'ok'
  snapshotId: string
  goldenRoutePassCount: number
  goldenRouteTotalCount: number
  policyFingerprint: string
} | {
  status: 'skipped'
  reason: 'already_running' | 'unchanged'
  activeSnapshotId?: string
  policyFingerprint?: string
} | {
  status: 'error'
  reason: string
}

type ActiveStatus = {
  status: 'ready'
  snapshotId: string
  policyFingerprint: string | null
  isV4: boolean
  goldenRoutePassCount: number
  goldenRouteTotalCount: number
  promotedAtIso: string
} | { status: 'missing' | 'error' }

export function RoadGraphAdminSection() {
  const t = useTranslations('teskeid.vedrid.overview')
  const locale = useLocale()
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<RefreshResult | null>(null)
  const [active, setActive] = useState<ActiveStatus | null>(null)

  const loadActive = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/weather/refresh-road-graph', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => null) as ActiveStatus | null
      if (!response.ok || !payload) throw new Error('unavailable')
      setActive(payload)
    } catch {
      setActive({ status: 'error' })
    }
  }, [])

  useEffect(() => {
    void loadActive()
  }, [loadActive])

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
      await loadActive()
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
      {active === null ? (
        <p role="status" className="mt-3 text-xs text-gray-500">{t('roadGraphAdminStatusLoading')}</p>
      ) : active.status === 'ready' ? (
        <div className={`mt-3 rounded-lg p-3 text-xs leading-relaxed ${
          active.isV4 ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-950'
        }`}>
          <p className="font-semibold">
            {active.isV4 ? t('roadGraphAdminStatusV4') : t('roadGraphAdminStatusLegacy')}
          </p>
          <p className="mt-1 break-all">{active.policyFingerprint ?? t('roadGraphAdminStatusUnknownPolicy')}</p>
          <p className="mt-1">
            {t('roadGraphAdminStatusDetails', {
              passed: active.goldenRoutePassCount,
              total: active.goldenRouteTotalCount,
              date: new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(active.promotedAtIso)),
            })}
          </p>
        </div>
      ) : (
        <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-950">
          {active.status === 'missing'
            ? t('roadGraphAdminStatusMissing')
            : t('roadGraphAdminStatusError')}
        </p>
      )}
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
      {result?.status === 'skipped' && (
        <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
          {result.reason === 'already_running'
            ? t('roadGraphAdminAlreadyRunning')
            : t('roadGraphAdminUnchanged')}
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
