import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { analyzeIcelandRoadGraph } from '@/lib/iceland-routes/roadGraph'
import { auditIcelandGoldenRoutes } from '@/lib/iceland-routes/goldenRoutes'
import { getIcelandRoadGraph } from '@/lib/iceland-routes/roadGraphRuntime.server'
import { TeskeidRouteLab } from '@/components/weather/TeskeidRouteLab'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Teskeiðarleiðir', robots: 'noindex, nofollow' }

function available(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.TESKEID_ROUTE_LAB_ENABLED === 'true'
}

export default async function TeskeidRouteLabPage() {
  if (!available()) notFound()
  const t = await getTranslations('teskeid.routeLab')
  const graph = await getIcelandRoadGraph()
  const diagnostics = analyzeIcelandRoadGraph(graph)
  const routes = auditIcelandGoldenRoutes(graph)
  const passed = routes.filter(route => route.status === 'ok').length

  return (
    <main className="min-h-screen bg-[#fbf9f4] px-4 py-6 text-[#42493e]">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-medium text-[#7c400c]">{t('experimental')}</p>
          <h1 className="text-xl font-semibold text-[#154212]">{t('title')}</h1>
          <p className="max-w-2xl text-sm text-[#72796e]">{t('description')}</p>
        </header>
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-black/5 bg-black/5 sm:grid-cols-4">
          {[
            [t('passed'), `${passed}/${routes.length}`],
            [t('segments'), diagnostics.segmentCount.toLocaleString('is-IS')],
            [t('nodes'), diagnostics.nodeCount.toLocaleString('is-IS')],
            [t('components'), diagnostics.weakComponentCount.toLocaleString('is-IS')],
          ].map(([label, value]) => <div key={label} className="bg-white p-4"><p className="text-xs text-[#72796e]">{label}</p><p className="mt-1 text-lg font-semibold text-[#154212]">{value}</p></div>)}
        </section>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('warning')}</p>
        <TeskeidRouteLab />
        <section className="grid gap-3 sm:grid-cols-2">
          {routes.map(route => {
            const ok = route.status === 'ok'
            return <article key={route.id} className="rounded-xl border border-black/5 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-[#154212]">{route.fromName} → {route.toName}</h2>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{ok ? t('ok') : t('review')}</span>
              </div>
              {route.distanceKm !== null ? <div className="mt-3 divide-y divide-black/5 text-sm">
                <p className="flex justify-between py-2"><span>{t('distance')}</span><strong>{route.distanceKm.toFixed(1)} km</strong></p>
                <p className="flex justify-between py-2"><span>{t('time')}</span><strong>{Math.round(route.durationMinutes! / 60)} klst. {Math.round(route.durationMinutes! % 60)} mín.</strong></p>
                <p className="flex justify-between py-2"><span>{t('surface')}</span><span>{route.pavedKm.toFixed(0)} / {route.gravelKm.toFixed(0)} / {(route.mixedKm + route.unknownKm).toFixed(0)} km</span></p>
                <p className="flex justify-between py-2"><span>{t('snap')}</span><span>{route.originSnapM} / {route.destinationSnapM} m</span></p>
              </div> : <p className="mt-3 text-sm text-red-700">{t('noRoute', { status: route.status })}</p>}
            </article>
          })}
        </section>
        <p className="pb-[env(safe-area-inset-bottom)] text-xs text-[#72796e]">{t('source')}</p>
      </div>
    </main>
  )
}
