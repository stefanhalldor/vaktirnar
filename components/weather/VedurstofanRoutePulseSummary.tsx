'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ConditionsFeedPreview } from '@/components/weather/ConditionsFeedPreview'
import { useFeedLoader } from '@/lib/weather/useFeedLoader'
import { vedurstofanPulseHref, vegagerdinPulseHref } from '@/lib/weather/pulseTarget'
import type { ConditionFeedPreviewItemDto } from '@/lib/chat/types'
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
 * Route-scoped conditions feed: collapsed disclosure showing the latest conditions report
 * for each Veðurstofan station on the active route, sorted newest-first. Hidden when no
 * messages exist.
 */
export function VedurstofanRoutePulseSummary({ stations, returnTo }: VedurstofanRoutePulseSummaryProps) {
  const t = useTranslations('teskeid.vedrid.eltaVedrid')
  const [open, setOpen] = useState(false)

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

  // Fetcher: POST to route-preview, map response to ConditionFeedPreviewItemDto[].
  // Keyed by stationIdsKey so useFeedLoader resets and re-fetches when stations change.
  const fetcher = useCallback(async (): Promise<ConditionFeedPreviewItemDto[]> => {
    if (orderedStations.length === 0) return []
    const stationIds = orderedStations.slice(0, MAX_STATION_IDS).map(s => s.stationId)
    const res = await fetch('/api/teskeid/weather/vedurpuls/route-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationIds, limitPerStation: 1 }),
    })
    if (!res.ok) return []
    const data = await res.json() as { stations: StationMessages[] }
    // Map to ConditionFeedPreviewItemDto — each station contributes only its newest message.
    return orderedStations
      .flatMap(station => {
        const stationData = data.stations.find(s => s.stationId === station.stationId)
        if (!stationData || stationData.messages.length === 0) return []
        // getPreviewMessagesForStations returns messages oldest-first; last = newest.
        const latestMsg = stationData.messages[stationData.messages.length - 1]
        return [{
          targetId: station.stationId,
          targetName: station.stationName,
          targetType: 'vedurstofan_station' as const,
          provider: null,
          latestMessage: latestMsg,
          latestAt: latestMsg.createdAt,
        }]
      })
      .sort((a, b) => b.latestAt.localeCompare(a.latestAt))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationIdsKey])

  const { items: feedItems, loading: feedLoading, refresh } = useFeedLoader<ConditionFeedPreviewItemDto>({
    fetcher,
    cacheKey: stationIdsKey,
    isOpen: open,
    disabled: orderedStations.length === 0,
  })

  // External refresh trigger — e.g. from the pulse station page after a new report.
  useEffect(() => {
    function handleRefresh() { refresh() }
    window.addEventListener('teskeid:pulse:refresh', handleRefresh)
    return () => window.removeEventListener('teskeid:pulse:refresh', handleRefresh)
  }, [refresh])

  if (feedLoading) return null
  if (feedItems.length === 0) return null

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
        <div className="mt-3">
          <ConditionsFeedPreview
            title=""
            items={feedItems}
            emptyBehavior="hide"
            targetHref={target =>
              target.provider === 'vegagerdin'
                ? vegagerdinPulseHref(target.targetId, returnTo)
                : vedurstofanPulseHref(target.targetId, returnTo)
            }
            viewMoreLabel={t('pulseViewMore')}
            deletedLabel={t('pulseDeleted')}
            kindLabels={{ field_report: t('pulseKindField'), measurement_report: t('pulseKindMeasurement') }}
          />
        </div>
      )}
    </div>
  )
}
