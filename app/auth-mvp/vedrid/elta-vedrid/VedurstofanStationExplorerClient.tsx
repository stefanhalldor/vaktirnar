'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { ChevronLeft, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import type {
  StationExplorerResponse,
  StationExplorerStation,
} from '@/lib/weather/providers/vedurstofanStationExplorer'
import {
  loadMapsLibrary,
  loadMarkerLibrary,
  loadCoreLibrary,
} from '@/lib/weather/googleMaps.client'
import type { FeedMessageDto } from '@/lib/chat/types'
import { ChatMessageRow } from '@/components/chat/ChatMessageRow'
import { VedurstofanPulseInline } from '@/components/weather/VedurstofanPulseInline'

const STATUS_COLOR: Record<StationExplorerStation['status'], string> = {
  ok: '#16a34a',
  stale: '#d97706',
  unavailable: '#9ca3af',
}

type Filter = 'all' | StationExplorerStation['status']

function makeMarkerIcon(
  status: StationExplorerStation['status'],
  selected: boolean,
): google.maps.Symbol {
  return {
    path: 0 as google.maps.SymbolPath, // CIRCLE
    scale: selected ? 11 : 8,
    fillColor: STATUS_COLOR[status],
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: selected ? 3 : 2,
  }
}

export function VedurstofanStationExplorerClient() {
  const t = useTranslations('teskeid.vedrid.eltaVedrid')
  const router = useRouter()
  const searchParams = useSearchParams()

  const [data, setData] = useState<StationExplorerResponse | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Always-fresh ref so Google Maps marker listeners (created in useEffect closure)
  // can toggle selection and update the URL without stale closure issues.
  const selectStationRef = useRef<(id: string) => void>(() => {})
  selectStationRef.current = (stationId: string) => {
    const newId = selectedId === stationId ? null : stationId
    setSelectedId(newId)
    const url = new URL(window.location.href)
    if (newId) url.searchParams.set('stationId', newId)
    else url.searchParams.delete('stationId')
    router.replace(url.pathname + url.search, { scroll: false })
  }

  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapError, setMapError] = useState(false)

  // Fetch station data on mount
  useEffect(() => {
    fetch('/api/teskeid/weather/vedurstofan/stations')
      .then(res => {
        if (!res.ok) throw new Error('fetch failed')
        return res.json() as Promise<StationExplorerResponse>
      })
      .then(payload => {
        setData(payload)
        setLoading(false)
        // Restore selected station from URL (e.g. returning from full pulse route)
        const urlStationId = searchParams.get('stationId')
        if (urlStationId && payload.stations.some((s: StationExplorerStation) => s.stationId === urlStationId)) {
          setSelectedId(urlStationId)
        }
      })
      .catch(() => {
        setLoadError(true)
        setLoading(false)
      })
  }, [])

  // Init Google Maps once data is loaded
  useEffect(() => {
    if (!data || !mapDivRef.current) return

    let cancelled = false
    const stations = data.stations

    async function initMap() {
      try {
        const [mapsLib, markerLib, coreLib] = await Promise.all([
          loadMapsLibrary(),
          loadMarkerLibrary(),
          loadCoreLibrary(),
        ])
        if (cancelled || !mapDivRef.current) return

        const map = new mapsLib.Map(mapDivRef.current, {
          center: { lat: 64.9, lng: -18.8 },
          zoom: 5,
          mapTypeId: 'roadmap',
          gestureHandling: 'cooperative',
          zoomControl: true,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        })
        mapRef.current = map

        // Fit bounds to stations with coordinates
        const bounds = new coreLib.LatLngBounds()
        stations.forEach(s => {
          if (s.lat !== null && s.lon !== null) bounds.extend({ lat: s.lat, lng: s.lon })
        })
        map.fitBounds(bounds, { top: 32, bottom: 32, left: 32, right: 32 })

        // Create markers only for stations with coordinates
        const newMarkers: google.maps.Marker[] = stations.map((station, idx) => {
          if (station.lat === null || station.lon === null) {
            return new markerLib.Marker({ map: null })
          }
          const marker = new markerLib.Marker({
            position: { lat: station.lat, lng: station.lon },
            map,
            icon: makeMarkerIcon(station.status, false),
            title: station.stationName,
            zIndex: station.status === 'ok' ? 10 : station.status === 'stale' ? 9 : 8,
          })
          marker.addListener('click', () => {
            selectStationRef.current(stations[idx].stationId)
          })
          return marker
        })
        markersRef.current = newMarkers
        setMapLoaded(true)
      } catch {
        if (!cancelled) setMapError(true)
      }
    }

    initMap()

    return () => {
      cancelled = true
      markersRef.current.forEach(m => m.setMap(null))
      markersRef.current = []
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // Sync marker icons/visibility when filter or selection changes
  useEffect(() => {
    if (!mapLoaded || !data) return
    data.stations.forEach((station, idx) => {
      const marker = markersRef.current[idx]
      if (!marker) return
      const visible = filter === 'all' || station.status === filter
      const isSelected = selectedId === station.stationId
      marker.setVisible(visible)
      marker.setIcon(makeMarkerIcon(station.status, isSelected))
      marker.setZIndex(
        isSelected ? 20 : station.status === 'ok' ? 10 : station.status === 'stale' ? 9 : 8,
      )
    })
  }, [filter, selectedId, mapLoaded, data])

  const selectedStation = data?.stations.find(s => s.stationId === selectedId) ?? null
  const visibleStations =
    data?.stations.filter(s => filter === 'all' || s.status === filter) ?? []

  return (
    <div className="flex flex-col gap-4 px-4 py-4 max-w-2xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <Link
          href="/auth-mvp/vedrid"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
        >
          <ChevronLeft className="w-3 h-3" />
          {t('back')}
        </Link>
        <h1 className="text-lg font-semibold">{t('title')}</h1>
        <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">{t('loading')}</p>}
      {loadError && <p className="text-sm text-destructive">{t('loadError')}</p>}

      {data && (
        <>
          {/* Safnpúls — aggregated feed across all station threads */}
          <WeatherPulseFeed />

          {/* Summary strip */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground border border-border rounded-lg px-3 py-2">
            <span>{t('stationsTotal', { count: data.summary.total })}</span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#16a34a] shrink-0" aria-hidden />
              {t('statusOk')} ({data.summary.ok})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#d97706] shrink-0" aria-hidden />
              {t('statusStale')} ({data.summary.stale})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#9ca3af] shrink-0" aria-hidden />
              {t('statusUnavailable')} ({data.summary.unavailable})
            </span>
          </div>

          {/* Map */}
          <div className="relative overflow-hidden rounded-xl border border-border">
            <div ref={mapDivRef} className="h-[280px] sm:h-[360px] w-full" />
            {!mapLoaded && !mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/40">
                <p className="text-xs text-muted-foreground">{t('loading')}</p>
              </div>
            )}
            {mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/40">
                <p className="text-xs text-muted-foreground">{t('mapUnavailable')}</p>
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {(['all', 'ok', 'stale', 'unavailable'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  filter === f
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border text-muted-foreground bg-transparent'
                }`}
              >
                {f === 'all' && t('filterAll')}
                {f === 'ok' && t('filterOk')}
                {f === 'stale' && t('filterStale')}
                {f === 'unavailable' && t('filterUnavailable')}
              </button>
            ))}
          </div>

          {/* Selected station detail */}
          {selectedStation && <StationDetail key={selectedStation.stationId} station={selectedStation} />}

          {/* Station list */}
          <div className="flex flex-col divide-y divide-border border border-border rounded-lg overflow-hidden">
            {visibleStations.map(station => (
              <button
                key={station.stationId}
                type="button"
                onClick={() => selectStationRef.current(station.stationId)}
                className={`flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  selectedId === station.stationId ? 'bg-muted/40' : ''
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: STATUS_COLOR[station.status] }}
                  aria-hidden
                />
                <span className="flex-1 truncate font-medium">{station.stationName}</span>
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {station.stationId}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {station.forecastCount > 0 ? `${station.forecastCount}×` : '–'}
                </span>
              </button>
            ))}
            {visibleStations.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground">{t('noForecastRows')}</p>
            )}
          </div>

        </>
      )}
    </div>
  )
}

// ── Safnpúls (aggregated feed) ────────────────────────────────────────────────

function WeatherPulseFeed() {
  const t = useTranslations('teskeid.vedrid.eltaVedrid')
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [messages, setMessages] = useState<FeedMessageDto[]>([])
  const [loading, setLoading] = useState(false)

  async function loadFeed() {
    try {
      const res = await fetch('/api/auth-mvp/vedurpuls/feed?limit=50')
      if (res.status === 401 || res.status === 403 || res.status === 503) {
        setAccessDenied(true)
        setOpen(false)
        return
      }
      if (!res.ok) return
      const data: FeedMessageDto[] = await res.json()
      setMessages(data)
    } catch { /* silent */ }
  }

  useEffect(() => {
    if (!open) return
    setLoading(true)
    loadFeed().finally(() => setLoading(false))
    const id = setInterval(loadFeed, 30_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (accessDenied) return null

  const kindLabels = {
    field_report: t('pulseKindField'),
    measurement_report: t('pulseKindMeasurement'),
  }

  return (
    <div className="border border-border rounded-xl px-3 py-3 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-sm font-medium hover:text-muted-foreground transition-colors self-start"
      >
        <MessageSquare className="w-4 h-4" />
        {t('feedTitle')}
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-0.5">
          {loading ? (
            <p className="text-xs text-muted-foreground">{t('pulseLoading')}</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('feedEmpty')}</p>
          ) : (
            messages.map(msg => (
              <ChatMessageRow
                key={msg.id}
                msg={msg}
                deletedLabel={t('pulseDeleted')}
                kindLabels={kindLabels}
                targetName={msg.target.targetName}
                locale={locale}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Station detail card ────────────────────────────────────────────────────────

function StationDetail({ station }: { station: StationExplorerStation }) {
  const t = useTranslations('teskeid.vedrid.eltaVedrid')

  return (
    <div className="border border-border rounded-xl px-3 py-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ background: STATUS_COLOR[station.status] }}
          aria-hidden
        />
        <span className="font-semibold text-sm">{station.stationName}</span>
      </div>

      <VedurstofanPulseInline
        stationId={station.stationId}
        returnTo={`/auth-mvp/vedrid/elta-vedrid?stationId=${station.stationId}`}
      />

      {/* Registry metadata */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t('stationId')}</dt>
        <dd className="font-mono">{station.stationId || '–'}</dd>
        {station.wmoNumber && (
          <>
            <dt className="text-muted-foreground">{t('wmoNumber')}</dt>
            <dd className="font-mono">{station.wmoNumber}</dd>
          </>
        )}
        {station.abbreviation && (
          <>
            <dt className="text-muted-foreground">{t('abbreviation')}</dt>
            <dd className="font-mono">{station.abbreviation}</dd>
          </>
        )}
        {station.stationType && (
          <>
            <dt className="text-muted-foreground">{t('stationType')}</dt>
            <dd>{station.stationType}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t('owner')}</dt>
        <dd>{station.owner ?? '–'}</dd>
        {station.forecastAreaName && (
          <>
            <dt className="text-muted-foreground">{t('forecastArea')}</dt>
            <dd>{station.forecastAreaName}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t('coordinates')}</dt>
        <dd className="font-mono">
          {station.lat !== null && station.lon !== null
            ? `${station.lat.toFixed(4)}, ${station.lon.toFixed(4)}`
            : '–'}
        </dd>
        {station.elevationM !== null && (
          <>
            <dt className="text-muted-foreground">{t('elevation')}</dt>
            <dd>{station.elevationM} m</dd>
          </>
        )}
        {station.startYear !== null && (
          <>
            <dt className="text-muted-foreground">{t('startYear')}</dt>
            <dd>{station.startYear}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t('mappingStatusLabel')}</dt>
        <dd className="text-muted-foreground">{station.mappingStatus}</dd>
        {/* Cache data fields */}
        {station.atimeIso && (
          <>
            <dt className="text-muted-foreground">{t('forecastGenerated')}</dt>
            <dd className="font-mono break-all">{station.atimeIso}</dd>
          </>
        )}
        {station.fetchedAtIso && (
          <>
            <dt className="text-muted-foreground">{t('fetchedAt')}</dt>
            <dd className="font-mono break-all">{station.fetchedAtIso}</dd>
          </>
        )}
        {station.expiresAtIso && (
          <>
            <dt className="text-muted-foreground">{t('expiresAt')}</dt>
            <dd className="font-mono break-all">{station.expiresAtIso}</dd>
          </>
        )}
      </dl>
      {/* Official source link */}
      <a
        href={station.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-muted-foreground underline underline-offset-2 self-start"
      >
        {t('officialPage')}
      </a>

      {/* Forecast rows */}
      <div>
        <p className="text-xs font-medium mb-1.5">{t('forecastRows')}</p>
        {station.forecasts.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('noForecastRows')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-[11px] w-full min-w-[460px]">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="pb-1 pr-2 text-left font-normal">{t('colTime')}</th>
                  <th className="pb-1 pr-2 text-left font-normal">{t('colWind')}</th>
                  <th className="pb-1 pr-2 text-left font-normal">{t('colDirection')}</th>
                  <th className="pb-1 pr-2 text-left font-normal">{t('colPrecipitation')}</th>
                  <th className="pb-1 pr-2 text-left font-normal">{t('colTemp')}</th>
                  <th className="pb-1 text-left font-normal">{t('colWeather')}</th>
                </tr>
              </thead>
              <tbody>
                {station.forecasts.map(row => (
                  <tr key={row.ftimeIso} className="border-b border-border/40 last:border-0">
                    <td className="py-0.5 pr-2 font-mono whitespace-nowrap">
                      {row.ftimeIso.replace('T', ' ').slice(0, 16)}
                    </td>
                    <td className="py-0.5 pr-2 whitespace-nowrap">
                      {row.windSpeedMs != null ? `${row.windSpeedMs} m/s` : '–'}
                    </td>
                    <td className="py-0.5 pr-2">{row.windDirectionText ?? '–'}</td>
                    <td className="py-0.5 pr-2 whitespace-nowrap">
                      {row.precipitationMmPerHour != null
                        ? `${row.precipitationMmPerHour} mm/klst`
                        : '–'}
                    </td>
                    <td className="py-0.5 pr-2 whitespace-nowrap">
                      {row.temperatureC != null ? `${row.temperatureC}°C` : '–'}
                    </td>
                    <td className="py-0.5">{row.weatherText ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {station.parseErrors.length > 0 && (
        <details className="text-[10px] text-muted-foreground">
          <summary className="cursor-pointer">
            {t('parseErrors', { count: station.parseErrors.length })}
          </summary>
          <ul className="mt-1 space-y-0.5 list-disc list-inside">
            {station.parseErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}

    </div>
  )
}
