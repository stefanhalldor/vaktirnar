'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ChatPreviewList } from '@/components/chat/ChatPreviewList'
import type { AugmentedChatMessage } from '@/components/chat/ChatMessageRow'

interface RoutePulseStation {
  stationId: string
  stationName: string
  routeFraction?: number | null
  distanceFromOriginM?: number | null
}

interface StationMessages {
  stationId: string
  messages: AugmentedChatMessage[]
}

interface VedurstofanRoutePulseSummaryProps {
  stations: RoutePulseStation[]
  returnTo?: string
}

// Route-preview endpoint rejects more than 40 station IDs. Cap in route order so long
// routes never cause a silent 400 and disappear from the UI.
const MAX_STATION_IDS = 40

/**
 * Route-scoped Safnpúls: collapsed disclosure showing the latest pulse messages for each
 * Veðurstofan station on the active route, in route order. Hidden when no messages exist.
 *
 * Not the same as the global Safnpúls in /elta-vedrid — this is scoped to the
 * stations that actually appear on the selected route.
 */
export function VedurstofanRoutePulseSummary({ stations, returnTo }: VedurstofanRoutePulseSummaryProps) {
  const t = useTranslations('teskeid.vedrid.eltaVedrid')
  const [open, setOpen] = useState(false)
  const [stationMessages, setStationMessages] = useState<StationMessages[]>([])
  const [loaded, setLoaded] = useState(false)

  // Sort stations in route order and deduplicate
  const orderedStations = useMemo(() => {
    const sorted = [...stations].sort((a, b) => {
      const af = a.routeFraction ?? (a.distanceFromOriginM != null ? a.distanceFromOriginM / 1_000_000 : 0)
      const bf = b.routeFraction ?? (b.distanceFromOriginM != null ? b.distanceFromOriginM / 1_000_000 : 0)
      return af - bf
    })
    const seen = new Set<string>()
    return sorted.filter(s => {
      if (seen.has(s.stationId)) return false
      seen.add(s.stationId)
      return true
    })
  }, [stations])

  const stationIdsKey = orderedStations.map(s => s.stationId).join(',')

  useEffect(() => {
    if (orderedStations.length === 0) { setLoaded(true); return }
    let cancelled = false
    async function load() {
      try {
        const stationIds = orderedStations.slice(0, MAX_STATION_IDS).map(s => s.stationId)
        const res = await fetch('/api/teskeid/weather/vedurpuls/route-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stationIds, limitPerStation: 3 }),
        })
        if (res.ok && !cancelled) {
          const data = await res.json() as { stations: StationMessages[] }
          setStationMessages(data.stations)
        }
      } catch { /* silent */ } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    load()
    const id = setInterval(load, 30_000)
    function handleRefresh() { void load() }
    window.addEventListener('teskeid:pulse:refresh', handleRefresh)
    return () => {
      cancelled = true
      clearInterval(id)
      window.removeEventListener('teskeid:pulse:refresh', handleRefresh)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationIdsKey])

  if (!loaded) return null

  const kindLabels = {
    field_report: t('pulseKindField'),
    measurement_report: t('pulseKindMeasurement'),
  }

  return (
    <div className="py-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('safnpulsRouteTitle')}
          </span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            {t('safnpulsRouteSummaryStations')}
          </span>
        </span>
        {open
          ? <ChevronUp size={14} className="shrink-0 text-muted-foreground" aria-hidden />
          : <ChevronDown size={14} className="shrink-0 text-muted-foreground" aria-hidden />
        }
      </button>

      {open && (
        <div className="mt-3 flex flex-col divide-y divide-border/60">
          {orderedStations.map(station => {
            const data = stationMessages.find(s => s.stationId === station.stationId)
            if (!data || data.messages.length === 0) return null
            const fullHref = returnTo
              ? `/auth-mvp/vedrid/puls/stod/${station.stationId}?returnTo=${encodeURIComponent(returnTo)}`
              : `/auth-mvp/vedrid/puls/stod/${station.stationId}`
            return (
              <div key={station.stationId} className="py-3 first:pt-0">
                <p className="mb-1.5 text-sm font-medium text-foreground">{station.stationName}</p>
                <div className="border-l border-border/60 pl-3">
                  <ChatPreviewList
                    messages={data.messages}
                    emptyLabel=""
                    deletedLabel={t('pulseDeleted')}
                    kindLabels={kindLabels}
                    loaded={true}
                  />
                  <Link
                    href={fullHref}
                    className="mt-1.5 block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    {t('pulseViewMore')}
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
