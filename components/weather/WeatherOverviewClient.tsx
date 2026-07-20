'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { StationExplorerResponse } from '@/lib/weather/providers/vedurstofanStationExplorer'
import type {
  VegagerdinCurrentStationDto,
  MeasurementFreshness,
} from '@/lib/weather/providers/vegagerdinCurrentTypes'
import type {
  ProviderMapLayer,
  ProviderMapMarkerTone,
  ResolvedTravelThresholds,
} from '@/lib/weather/types'
import { ConditionsFeedPreview } from '@/components/weather/ConditionsFeedPreview'
import { useConditionsFeedPreview } from '@/lib/weather/useConditionsFeedPreview'
import { vedurstofanPulseHref, vegagerdinPulseHref } from '@/lib/weather/pulseTarget'
import { WeatherThresholdBar } from '@/components/weather/WeatherThresholdBar'
import { useWeatherThresholds } from '@/lib/weather/useWeatherThresholds'
import {
  type WindDisplayStatus,
  classifyObservationWindDisplayStatus,
  classifyForecastWindDisplayStatusAt,
  worstWindDisplayStatus,
  selectForecastRowAt,
  toSimpleWindDisplayStatus,
  WIND_STATUS_MARKER_COLOR,
  WIND_STATUS_META,
  DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES,
} from '@/lib/weather/windDisplayStatus'
import type { ForecastTimeScrubberSlot } from '@/components/weather/ForecastTimeScrubber'
import { WeatherSourceTimeSelector } from '@/components/weather/WeatherSourceTimeSelector'
import { RouteMemoryPicker, type RouteMemoryPlace } from '@/components/weather/RouteMemoryPicker'
import { formatKlTime } from '@/components/weather/travelAuditMap.helpers'
import { vegagerdinHasNoUsableLayer } from '@/lib/weather/vegagerdinFallback'
import {
  writeOverviewRouteDraft,
  clearOverviewRouteDraft,
} from '@/lib/iceland-routes'
import { getCanonicalPlace } from '@/lib/iceland-routes/routePlaces'
import { WindStatusFilterPills, type WindStatusFilterMode } from '@/components/weather/WindStatusFilterPills'
import { cn } from '@/lib/utils'
import {
  WeatherOverviewShell,
  type WeatherOverviewProviderConfig,
  type ProviderContentCtx,
} from '@/components/weather/WeatherOverviewShell'

// ── Vegagerðin API response shape ─────────────────────────────────────────────
// Matches what /api/teskeid/weather/vegagerdin/current returns.
// Discriminated by 'status': 'ok' when cache data exists, 'unavailable' when not.
type VegagerdinCurrentApiData =
  | {
      status: 'ok'
      cacheStatus: 'fresh' | 'stale' | 'history_fallback'
      measurementFreshness: MeasurementFreshness
      fetchedAtIso: string
      oldestMeasuredAtIso: string | null
      stations: VegagerdinCurrentStationDto[]
    }
  | {
      status: 'unavailable'
      stations: []
    }

const STATUS_FILTER_MODE_STORAGE_KEY = 'teskeid:vedrid:status-filter-mode'

function classifyVegagerdinObservationStationWindStatus(
  station: VegagerdinCurrentStationDto,
  thresholds: ResolvedTravelThresholds,
): WindDisplayStatus {
  const status = classifyObservationWindDisplayStatus({
    meanWindMs: station.meanWindMs,
    gustLast10MinMs: station.gustLast10MinMs,
  }, thresholds)
  return status === 'no_data' ? 'no_wind_data' : status
}

// ── Veðurstofan overview adapter ────────────────────────────────────────────
//
// Public API is identical to the pre-B3C WeatherOverviewClient: pages pass
// the same props and get the same rendered output.  Internally, Veðurstofan-
// specific logic is encapsulated here and passed to WeatherOverviewShell
// through the provider-neutral WeatherOverviewProviderConfig contract.

export function WeatherOverviewClient({
  backHref,
  backLabel,
  tripHref,
  stationPulseReturnBase = '/auth-mvp/vedrid/elta-vedrid',
  isOverview = false,
  menuVariant,
}: {
  backHref?: string
  backLabel?: string
  tripHref?: string
  stationPulseReturnBase?: string
  isOverview?: boolean
  menuVariant?: 'public' | 'authenticated'
} = {}) {
  const t = useTranslations('teskeid.vedrid.eltaVedrid')
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const tOv = useTranslations('teskeid.vedrid.overview')

  const [data, setData] = useState<StationExplorerResponse | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [providerRestricted, setProviderRestricted] = useState(false)
  const [loading, setLoading] = useState(true)
  // Default: hide low-signal statuses on overview map. Empty set = show all (Sýna allt resets to new Set()).
  const [visibleStatuses, setVisibleStatuses] = useState<Set<WindDisplayStatus>>(
    new Set(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES),
  )
  const [statusFilterMode, setStatusFilterMode] = useState<WindStatusFilterMode>('simple')
  // Unified source/time mode: 'now' = Vegagerðin current layer; number = Veðurstofan forecast at that timeMs.
  const [activeMode, setActiveMode] = useState<'now' | number>('now')
  // Tracks whether the user has explicitly chosen a mode — auto-fallback must not override explicit choices.
  const userHasSelectedMode = useRef(false)
  function handleModeChange(mode: 'now' | number) {
    userHasSelectedMode.current = true
    setActiveMode(mode)
  }
  // User default thresholds — loaded from /api/teskeid/weather/preferences/thresholds on mount.
  // null = no saved defaults; object = saved caution/red values.
  const [savedDefaultThresholds, setSavedDefaultThresholds] = useState<{ cautionWindMs: number; redWindMs: number } | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STATUS_FILTER_MODE_STORAGE_KEY)
      if (stored === 'simple' || stored === 'detailed') {
        setStatusFilterMode(stored)
      }
    } catch {
      // localStorage may be blocked; the in-memory default is enough.
    }
  }, [])

  const handleStatusFilterModeChange = useCallback((nextMode: WindStatusFilterMode) => {
    setStatusFilterMode(nextMode)
    try {
      window.localStorage.setItem(STATUS_FILTER_MODE_STORAGE_KEY, nextMode)
    } catch {
      // Ignore storage failures; this is a display preference only.
    }
    if (menuVariant === 'authenticated') {
      const t = thresholdsRef.current
      fetch('/api/teskeid/weather/preferences/thresholds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cautionWindMs: t.cautionWindMs, redWindMs: t.redWindMs, statusFilterMode: nextMode }),
      }).catch(() => {})
    } else {
      // Public user: store pending mode (sessionStorage backup) and redirect to login.
      // Return URL points to /auth-mvp/vedrid so the authenticated page handles the DB save.
      // ?saveStatusFilterMode param is the primary signal; sessionStorage is backup for flows
      // where the return URL is consumed by a profile-setup step before reaching /auth-mvp/vedrid.
      try { sessionStorage.setItem('teskeid_pending_status_filter_mode', nextMode) } catch {}
      const returnUrl = `/auth-mvp/vedrid?saveStatusFilterMode=${nextMode}`
      window.location.href = `/innskraning?next=${encodeURIComponent(returnUrl)}`
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuVariant])

  // Place selections from RouteMemoryPicker — key/label only, no coordinates required.
  const [fromMemoryPlace, setFromMemoryPlace] = useState<RouteMemoryPlace | null>(null)
  const [toMemoryPlace, setToMemoryPlace] = useState<RouteMemoryPlace | null>(null)

  // Route-memory lookup result — replaces corridor-based station filtering.
  // When resolved: vedurstofanIds/vegagerdinIds are the union across all variants from DB.
  // When miss: no filter applied (full map shown).
  type RouteMemoryVariantData = {
    routeVariantKey: string
    routeVariantLabel: string | null
    vedurstofanStationIds: string[]
    vegagerdinStationIds: string[]
    routeCautionIds: string[]
  }
  type RouteMemoryState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'miss' }
    | { status: 'resolved'; variants: RouteMemoryVariantData[]; vedurstofanIds: Set<string>; vegagerdinIds: Set<string>; routeLabel: string }
  const [routeMemory, setRouteMemory] = useState<RouteMemoryState>({ status: 'idle' })
  // Selected route-variant key — 'all' shows the union of all variants (default).
  const [selectedVariantKey, setSelectedVariantKey] = useState<string | 'all'>('all')

  // Refs keep the latest place values accessible in the stable callback below.
  // This avoids stale-closure issues when the callback is invoked from event listeners.
  const fromMemoryPlaceRef = useRef<RouteMemoryPlace | null>(null)
  const toMemoryPlaceRef = useRef<RouteMemoryPlace | null>(null)
  fromMemoryPlaceRef.current = fromMemoryPlace
  toMemoryPlaceRef.current = toMemoryPlace

  // Stable callback: fetches route-memory for the current pair.
  // Aborts any in-flight request via ref. Safe to call from event listeners.
  const routeMemoryAbortRef = useRef<AbortController | null>(null)
  const fetchRouteMemoryForPair = useCallback(() => {
    const from = fromMemoryPlaceRef.current
    const to = toMemoryPlaceRef.current
    if (!from || !to) return
    routeMemoryAbortRef.current?.abort()
    const controller = new AbortController()
    routeMemoryAbortRef.current = controller
    // Capture keys at request time — used to discard stale responses if pair changed.
    const requestFromKey = from.key
    const requestToKey = to.key
    fetch('/api/teskeid/weather/route-memory/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromName: from.label, toName: to.label }),
      signal: controller.signal,
    })
      .then(r => r.json())
      .then((data: { status: string; routeLabel?: string; variants?: Array<RouteMemoryVariantData> }) => {
        // Discard response if the selected pair has changed since this request started.
        if (fromMemoryPlaceRef.current?.key !== requestFromKey || toMemoryPlaceRef.current?.key !== requestToKey) return
        if (data.status === 'resolved' && data.variants && data.variants.length > 0) {
          const variants = data.variants
          setRouteMemory({
            status: 'resolved',
            variants,
            vedurstofanIds: new Set(variants.flatMap(v => v.vedurstofanStationIds)),
            vegagerdinIds: new Set(variants.flatMap(v => v.vegagerdinStationIds)),
            routeLabel: data.routeLabel ?? '',
          })
        } else {
          setRouteMemory({ status: 'miss' })
        }
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return
        setRouteMemory({ status: 'miss' })
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch route-memory when both places are selected (or clear when deselected).
  useEffect(() => {
    if (!fromMemoryPlace || !toMemoryPlace) {
      routeMemoryAbortRef.current?.abort()
      setRouteMemory({ status: 'idle' })
      return
    }
    setRouteMemory({ status: 'loading' })
    setSelectedVariantKey('all')
    fetchRouteMemoryForPair()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromMemoryPlace?.key, toMemoryPlace?.key])

  // Re-fetch on window focus / page becoming visible — so returning from /ferdalagid
  // after recording a new route picks up any newly stored variant data.
  useEffect(() => {
    const handleFocus = () => fetchRouteMemoryForPair()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchRouteMemoryForPair()
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pageshow', handleFocus)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pageshow', handleFocus)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Write or clear the overview route draft in sessionStorage whenever selected places change.
  // FerdalagidClient reads this on mount to pre-fill origin/destination.
  // Uses canonical coords when available; draft is skipped (cleared) if either place
  // is not in the canonical registry, so FerdalagidClient never receives 0,0 coords.
  useEffect(() => {
    if (fromMemoryPlace && toMemoryPlace) {
      const fromCanon = getCanonicalPlace(fromMemoryPlace.key)
      const toCanon = getCanonicalPlace(toMemoryPlace.key)
      if (fromCanon && toCanon) {
        writeOverviewRouteDraft(
          { name: fromMemoryPlace.label, formattedAddress: fromMemoryPlace.label, lat: fromCanon.lat, lon: fromCanon.lon },
          { name: toMemoryPlace.label, formattedAddress: toMemoryPlace.label, lat: toCanon.lat, lon: toCanon.lon },
        )
      } else {
        clearOverviewRouteDraft()
      }
    } else {
      clearOverviewRouteDraft()
    }
  }, [fromMemoryPlace, toMemoryPlace])

  // When a from-place is selected, ensure "Innan marka" (green) stations are visible
  // so the endpoint focus marker is not hidden by the default status filter.
  useEffect(() => {
    if (!fromMemoryPlace) return
    setVisibleStatuses(prev => {
      if (prev.has('innan-marka')) return prev
      return new Set([...prev, 'innan-marka'])
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromMemoryPlace?.key])

  // Single-place endpoint station IDs — fetched from /place-focus when only a from-place
  // is selected. Replaces the previous haversine nearest-station approach so any place in
  // route-memory self-registers without canonical coordinate entries.
  type PlaceFocusIds = { vedurstofan: Set<string>; vegagerdin: Set<string> }
  const [placeFocusIds, setPlaceFocusIds] = useState<PlaceFocusIds | null>(null)

  useEffect(() => {
    if (!fromMemoryPlace || toMemoryPlace) {
      setPlaceFocusIds(null)
      return
    }
    const controller = new AbortController()
    fetch(`/api/teskeid/weather/route-memory/place-focus?placeKey=${encodeURIComponent(fromMemoryPlace.key)}`, {
      signal: controller.signal,
    })
      .then(r => r.ok ? r.json() : { vedurstofanStationIds: [], vegagerdinStationIds: [] })
      .then((d: { vedurstofanStationIds?: string[]; vegagerdinStationIds?: string[] }) => {
        setPlaceFocusIds({
          vedurstofan: new Set(d.vedurstofanStationIds ?? []),
          vegagerdin: new Set(d.vegagerdinStationIds ?? []),
        })
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return
        setPlaceFocusIds(null)
      })
    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromMemoryPlace?.key, !!toMemoryPlace])

  // Single-place focus filter: when only from-place is selected, narrow map to endpoint stations.
  // Overridden by the exact route-memory filter when both places are selected.
  const singlePlaceVedurstofanIds: Set<string> | null =
    fromMemoryPlace && !toMemoryPlace && placeFocusIds
      ? (placeFocusIds.vedurstofan.size > 0 ? placeFocusIds.vedurstofan : null)
      : null

  // When a specific variant is selected, narrow to that variant's stations; otherwise union all.
  const activeVariant: RouteMemoryVariantData | null =
    routeMemory.status === 'resolved' && selectedVariantKey !== 'all'
      ? (routeMemory.variants.find(v => v.routeVariantKey === selectedVariantKey) ?? null)
      : null

  const vedurstofanRouteFilterIds: Set<string> | null =
    routeMemory.status === 'resolved'
      ? (activeVariant ? new Set(activeVariant.vedurstofanStationIds) : routeMemory.vedurstofanIds)
      : singlePlaceVedurstofanIds

  // Fetch station data on mount.
  // 401/403: provider is access-restricted for this user/mode — omit the layer silently.
  // 404: station layer is disabled (kill-switch flag off) — also omit the layer silently.
  // Any other non-ok response (5xx, network error) is a real error worth showing.
  useEffect(() => {
    fetch('/api/teskeid/weather/vedurstofan/stations')
      .then(res => {
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          setProviderRestricted(true)
          setLoading(false)
          return null
        }
        if (!res.ok) throw new Error('fetch failed')
        return res.json() as Promise<StationExplorerResponse>
      })
      .then(payload => {
        if (!payload) return // providerRestricted handled above
        setData(payload)
        setLoading(false)
        // URL restoration (stationId param) is handled by WeatherOverviewShell
        // once mapLayer becomes non-null.
      })
      .catch(() => {
        setLoadError(true)
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { thresholds, overrides, setOverrides, reset: resetThresholds } = useWeatherThresholds()
  // Always-fresh ref so handleStatusFilterModeChange can read current thresholds without stale closures.
  const thresholdsRef = useRef(thresholds)
  thresholdsRef.current = thresholds

  // Derive sorted unique forecast slot times from all Veðurstofan stations.
  const availableForecastSlots = useMemo<number[]>(() => {
    if (!data) return []
    const timeSet = new Set<number>()
    for (const s of data.stations) {
      for (const f of s.forecasts) {
        timeSet.add(new Date(f.ftimeIso).getTime())
      }
    }
    return Array.from(timeSet).sort((a, b) => a - b)
  }, [data])

  // Effective anchor used for Veðurstofan classification. Only meaningful when typeof activeMode === 'number'.
  const forecastAnchorMs = typeof activeMode === 'number' ? activeMode : Date.now()

  // Worst status per slot across active (route/place-filtered) Veðurstofan stations — drives scrubber dot colors.
  const forecastSlotStatuses = useMemo<ForecastTimeScrubberSlot[]>(() => {
    if (!data || availableForecastSlots.length === 0) return []
    return availableForecastSlots.map(timeMs => {
      let worst: WindDisplayStatus = 'no_data'
      for (const s of data.stations) {
        if (s.lat === null || s.lon === null) continue
        if (vedurstofanRouteFilterIds !== null && !vedurstofanRouteFilterIds.has(s.stationId)) continue
        const status = classifyForecastWindDisplayStatusAt(s.forecasts, thresholds, timeMs)
        worst = worstWindDisplayStatus(worst, status)
      }
      return {
        timeMs,
        worstStatus: worst,
        worstStatusLabel: tf(WIND_STATUS_META[worst].labelKey as 'statusWithinLimits'),
      }
    })
  }, [data, availableForecastSlots, thresholds, tf, vedurstofanRouteFilterIds])

  // In simple mode, collapse near-threshold statuses to their parent color for scrubber dots.
  const displayForecastSlotStatuses: ForecastTimeScrubberSlot[] = statusFilterMode === 'simple'
    ? forecastSlotStatuses.map(slot => ({ ...slot, worstStatus: toSimpleWindDisplayStatus(slot.worstStatus) }))
    : forecastSlotStatuses

  const title = isOverview ? t('overviewTitle') : t('title')
  const subtitle = isOverview ? t('overviewSubtitle') : t('subtitle')

  // ── Vegagerðin current-measurement adapter ──────────────────────────────────
  //
  // Reads from server-side cache only. Never calls the live Vegagerðin endpoint.
  // If no cache data exists (status='unavailable'), shows as 'empty' — no broken UI.
  // If restricted (401/403), shows as 'restricted'.
  // If cache data exists, shows stations as a separate provider map layer.
  //
  // Current measurements, NOT forecast:
  //   - Marker preview says "Núverandi mæling frá Vegagerðinni"
  //   - Shows measured time and fetched time separately
  //   - Does not affect scrubber, worst forecast, selectDecisiveProvider, or trip risk.

  // ── Conditions feed state ──────────────────────────────────────────────────
  // Polls the public feed-preview endpoint every 30s (no auth required).
  // conditionsDrawerOpen is lifted here so isOpen can be passed to the hook:
  // when items arrive via polling while the drawer is open, they are silently
  // acknowledged and the badge does not fire for already-visible content.
  const [conditionsDrawerOpen, setConditionsDrawerOpen] = useState(false)
  const {
    items: conditionsItems,
    loading: conditionsLoading,
    newSinceOpenCount,
    acknowledgeCurrentItems,
  } = useConditionsFeedPreview({ limitItems: 10, isOpen: conditionsDrawerOpen })

  const [vegagerdinData, setVegagerdinData] = useState<VegagerdinCurrentApiData | null>(null)
  const [vegagerdinLoading, setVegagerdinLoading] = useState(true)
  const [vegagerdinLoadError, setVegagerdinLoadError] = useState(false)
  const [vegagerdinRestricted, setVegagerdinRestricted] = useState(false)

  useEffect(() => {
    fetch('/api/teskeid/weather/vegagerdin/current')
      .then(res => {
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          setVegagerdinRestricted(true)
          setVegagerdinLoading(false)
          return null
        }
        if (!res.ok) throw new Error('fetch failed')
        return res.json() as Promise<VegagerdinCurrentApiData>
      })
      .then(payload => {
        if (!payload) return
        setVegagerdinData(payload)
        setVegagerdinLoading(false)
      })
      .catch(() => {
        setVegagerdinLoadError(true)
        setVegagerdinLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load user's saved default thresholds and status-filter mode on mount (authenticated users only).
  // Also consumes any pending status-filter mode left by the public-user login-save flow (sessionStorage backup).
  // Skips sessionStorage consumption when ?saveStatusFilterMode is in the URL — that handler takes priority.
  useEffect(() => {
    if (menuVariant !== 'authenticated') return
    // Skip sessionStorage if the URL param handler will already handle this (avoid double-PUT).
    const hasUrlParam = searchParams.get('saveStatusFilterMode') !== null
    let pendingMode: 'simple' | 'detailed' | null = null
    if (!hasUrlParam) {
      try {
        const raw = sessionStorage.getItem('teskeid_pending_status_filter_mode')
        if (raw === 'simple' || raw === 'detailed') {
          pendingMode = raw
        }
      } catch {}
    }
    fetch('/api/teskeid/weather/preferences/thresholds')
      .then(r => r.ok ? r.json() : null)
      .then((d: { hasPreferences?: boolean; cautionWindMs?: number; redWindMs?: number; statusFilterMode?: 'simple' | 'detailed' | null } | null) => {
        let thresholdsForPut: { cautionWindMs: number; redWindMs: number } = {
          cautionWindMs: thresholdsRef.current.cautionWindMs,
          redWindMs: thresholdsRef.current.redWindMs,
        }
        if (d?.hasPreferences && typeof d.cautionWindMs === 'number' && typeof d.redWindMs === 'number') {
          setSavedDefaultThresholds({ cautionWindMs: d.cautionWindMs, redWindMs: d.redWindMs })
          setOverrides({ cautionWindMs: d.cautionWindMs, redWindMs: d.redWindMs })
          thresholdsForPut = { cautionWindMs: d.cautionWindMs, redWindMs: d.redWindMs }
        }
        // Pending mode takes priority over DB-stored mode.
        const dbMode = d?.statusFilterMode === 'simple' || d?.statusFilterMode === 'detailed' ? d.statusFilterMode : null
        const effectiveMode = pendingMode ?? (hasUrlParam ? null : dbMode)
        if (effectiveMode) {
          setStatusFilterMode(effectiveMode)
          try { window.localStorage.setItem(STATUS_FILTER_MODE_STORAGE_KEY, effectiveMode) } catch {}
        }
        // Persist pending mode to DB combined with current thresholds.
        if (pendingMode) {
          fetch('/api/teskeid/weather/preferences/thresholds', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cautionWindMs: thresholdsForPut.cautionWindMs, redWindMs: thresholdsForPut.redWindMs, statusFilterMode: pendingMode }),
          })
            .then(r => { if (r.ok) { try { sessionStorage.removeItem('teskeid_pending_status_filter_mode') } catch {} } })
            .catch(() => {})
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // After auth flow return (authenticated page): consume pending sessionStorage thresholds.
  // Fires when a user clicks "Vista sem sjálfgefin vindmörk" while logged out, completes
  // login, and the ?saveDefaults URL param is lost mid-flow (e.g. new users going through
  // /auth-mvp/minn-profill before landing on /auth-mvp/heim without the param).
  // Clears sessionStorage immediately to prevent double-save on re-mounts.
  useEffect(() => {
    if (menuVariant !== 'authenticated') return
    let raw: string | null = null
    try { raw = sessionStorage.getItem('teskeid_pending_wind_thresholds') } catch {}
    if (!raw) return
    try { sessionStorage.removeItem('teskeid_pending_wind_thresholds') } catch {}
    let parsed: { cautionWindMs?: unknown; redWindMs?: unknown }
    try { parsed = JSON.parse(raw) } catch { return }
    const caution = Number(parsed.cautionWindMs)
    const red = Number(parsed.redWindMs)
    if (!Number.isFinite(caution) || !Number.isFinite(red) || caution <= 0 || red <= 0 || caution >= red) return
    setOverrides({ cautionWindMs: caution, redWindMs: red })
    fetch('/api/teskeid/weather/preferences/thresholds', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cautionWindMs: caution, redWindMs: red }),
    })
      .then(r => r.ok ? r.json() : null)
      .then((d: { success?: boolean } | null) => {
        if (d?.success) setSavedDefaultThresholds({ cautionWindMs: caution, redWindMs: red })
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // After auth flow return: ?saveDefaults=caution,danger — save to API and apply.
  useEffect(() => {
    const raw = searchParams.get('saveDefaults')
    if (!raw) return
    const parts = raw.split(',')
    const caution = parseFloat(parts[0] ?? '')
    const danger = parseFloat(parts[1] ?? '')
    if (!Number.isFinite(caution) || !Number.isFinite(danger) || caution <= 0 || danger <= 0 || caution >= danger) return
    // Apply to current session
    setOverrides({ cautionWindMs: caution, redWindMs: danger })
    // Save to API (session should be established after auth flow)
    fetch('/api/teskeid/weather/preferences/thresholds', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cautionWindMs: caution, redWindMs: danger }),
    })
      .then(r => r.ok ? r.json() : null)
      .then((d: { success?: boolean } | null) => {
        if (d?.success) setSavedDefaultThresholds({ cautionWindMs: caution, redWindMs: danger })
      })
      .catch(() => {})
    // Clean URL
    router.replace(window.location.pathname)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('saveDefaults')])

  // After auth flow return: ?saveStatusFilterMode=simple|detailed — save mode to API and clean URL.
  // This fires on /auth-mvp/vedrid (authenticated page) after the public-user login redirect.
  // sessionStorage backup is cleared after a successful save.
  useEffect(() => {
    if (menuVariant !== 'authenticated') return
    const raw = searchParams.get('saveStatusFilterMode')
    if (raw !== 'simple' && raw !== 'detailed') return
    const mode = raw
    // Apply mode locally.
    setStatusFilterMode(mode)
    try { window.localStorage.setItem(STATUS_FILTER_MODE_STORAGE_KEY, mode) } catch {}
    // GET current preferences to get the right threshold values, then PUT with mode.
    fetch('/api/teskeid/weather/preferences/thresholds')
      .then(r => r.ok ? r.json() : null)
      .then((d: { hasPreferences?: boolean; cautionWindMs?: number; redWindMs?: number } | null) => {
        const cautionWindMs = (d?.hasPreferences && typeof d.cautionWindMs === 'number') ? d.cautionWindMs : thresholdsRef.current.cautionWindMs
        const redWindMs = (d?.hasPreferences && typeof d.redWindMs === 'number') ? d.redWindMs : thresholdsRef.current.redWindMs
        fetch('/api/teskeid/weather/preferences/thresholds', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cautionWindMs, redWindMs, statusFilterMode: mode }),
        })
          .then(r => {
            if (!r.ok) return
            try { sessionStorage.removeItem('teskeid_pending_status_filter_mode') } catch {}
            setStatusFilterMode(mode)
            try { window.localStorage.setItem(STATUS_FILTER_MODE_STORAGE_KEY, mode) } catch {}
            router.replace(window.location.pathname)
          })
          .catch(() => {})
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('saveStatusFilterMode')])

  // Save current thresholds as the user's defaults.
  // Authenticated: saves directly to API.
  // Public: persists values in sessionStorage (backup) then sends to auth flow with
  // values also encoded in the return URL (primary). sessionStorage backup handles
  // new-user flows where the profile setup step (/auth-mvp/minn-profill) consumes
  // the ?next= chain and the user ends up on /auth-mvp/heim without the saveDefaults param.
  const handleSaveAsDefault = useCallback((cautionWindMs: number, redWindMs: number) => {
    if (menuVariant === 'authenticated') {
      fetch('/api/teskeid/weather/preferences/thresholds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cautionWindMs, redWindMs }),
      })
        .then(r => r.ok ? r.json() : null)
        .then((d: { success?: boolean } | null) => {
          if (d?.success) setSavedDefaultThresholds({ cautionWindMs, redWindMs })
        })
        .catch(() => {})
    } else {
      try {
        sessionStorage.setItem('teskeid_pending_wind_thresholds', JSON.stringify({ cautionWindMs, redWindMs }))
      } catch {}
      const saveParam = encodeURIComponent(`${cautionWindMs},${redWindMs}`)
      const returnUrl = `${window.location.pathname}?saveDefaults=${saveParam}`
      window.location.href = `/innskraning?next=${encodeURIComponent(returnUrl)}`
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuVariant])

  // Maps WindDisplayStatus to ProviderMapMarkerTone for z-index ordering.
  // The actual fill color is supplied via markerColor (from WIND_STATUS_MARKER_COLOR),
  // so the tone here only drives z-index — danger markers appear on top.
  function windStatusToTone(status: WindDisplayStatus): ProviderMapMarkerTone {
    if (status === 'haettulegt' || status === 'nalgast-haettumork') return 'danger'
    if (status === 'othaegilegt' || status === 'nalgast-othaegindi') return 'warning'
    if (status === 'innan-marka') return 'ok'
    return 'unavailable' // no_data
  }

  // Determine unavailableReason for Vegagerðin (declared before map layers).
  const vegagerdinUnavailableReason: WeatherOverviewProviderConfig['unavailableReason'] =
    vegagerdinRestricted
      ? 'restricted'
      : vegagerdinLoadError
        ? 'error'
        : undefined

  // ── Route-memory filter sets (Vegagerðin) ─────────────────────────────────
  // vedurstofanRouteFilterIds is computed above (before forecastSlotStatuses).
  // Vegagerðin single-place filter reuses the same placeFocusIds from /place-focus.
  const singlePlaceVegagerdinIds: Set<string> | null =
    fromMemoryPlace && !toMemoryPlace && placeFocusIds
      ? (placeFocusIds.vegagerdin.size > 0 ? placeFocusIds.vegagerdin : null)
      : null

  const vegagerdinRouteFilterIds: Set<string> | null =
    routeMemory.status === 'resolved'
      ? (activeVariant ? new Set(activeVariant.vegagerdinStationIds) : routeMemory.vegagerdinIds)
      : singlePlaceVegagerdinIds

  // Active Vegagerðin stations after route/place filter — shared source for selector metrics.
  // Using this for newest time and worst status ensures the Núna selector matches the map.
  const filteredVegagerdinStations = useMemo(() => {
    if (!vegagerdinData || vegagerdinData.status !== 'ok') return []
    if (vegagerdinRouteFilterIds === null) return vegagerdinData.stations
    return vegagerdinData.stations.filter(s => vegagerdinRouteFilterIds.has(s.stationId))
  }, [vegagerdinData, vegagerdinRouteFilterIds])

  // Newest measurement timestamp across active Vegagerðin stations (for selector label).
  const vegagerdinNewestMeasuredAtIso = useMemo<string | null>(() => {
    if (filteredVegagerdinStations.length === 0) return null
    let newest: string | null = null
    let newestMs = -Infinity
    for (const s of filteredVegagerdinStations) {
      const ms = new Date(s.measuredAtIso).getTime()
      if (ms > newestMs) { newestMs = ms; newest = s.measuredAtIso }
    }
    return newest
  }, [filteredVegagerdinStations])

  // Worst wind status across active Vegagerðin stations (for selector dot color).
  const vegagerdinWorstStatus = useMemo<WindDisplayStatus>(() => {
    if (filteredVegagerdinStations.length === 0) return 'no_data'
    let worst: WindDisplayStatus = 'no_data'
    for (const s of filteredVegagerdinStations) {
      const status = classifyVegagerdinObservationStationWindStatus(s, thresholds)
      worst = worstWindDisplayStatus(worst, status)
    }
    return worst
  }, [filteredVegagerdinStations, thresholds])

  // Auto-fallback: if the user has not selected a mode and Vegagerðin has no usable layer
  // after settling, switch to the first available forecast slot so /vedrid never looks blank.
  // Fires again when forecast slots arrive (in case Veðurstofan loads after Vegagerðin settles).
  useEffect(() => {
    if (userHasSelectedMode.current) return
    if (activeMode !== 'now') return
    if (vegagerdinLoading) return
    if (!vegagerdinHasNoUsableLayer({
      loading: vegagerdinLoading,
      restricted: vegagerdinRestricted,
      loadError: vegagerdinLoadError,
      data: vegagerdinData,
    })) return
    if (forecastSlotStatuses.length === 0) return
    setActiveMode(forecastSlotStatuses[0].timeMs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vegagerdinLoading, vegagerdinRestricted, vegagerdinLoadError, vegagerdinData, forecastSlotStatuses])

  // Route-aware auto-mode: if a route filter is active and the current provider/time
  // has zero route-visible markers, switch to a usable alternative.
  // - activeMode 'now' + 0 filteredVegagerdinStations + forecast has slots → first forecast slot.
  // - activeMode forecast + 0 forecast-visible route stations + Vegagerðin has stations → 'now'.
  // Intentionally does NOT check userHasSelectedMode: when the route changes, the valid marker
  // universe changes and a blank map is always wrong regardless of prior user selection.
  // Only fires when both providers have finished loading (avoids premature switching on slow load).
  useEffect(() => {
    const routeActive = routeMemory.status === 'resolved'
      && (vegagerdinRouteFilterIds !== null || vedurstofanRouteFilterIds !== null)
    if (!routeActive) return
    if (vegagerdinLoading || !data) return

    if (activeMode === 'now') {
      if (filteredVegagerdinStations.length > 0) return
      if (forecastSlotStatuses.length === 0) return
      setActiveMode(forecastSlotStatuses[0].timeMs)
    } else {
      // Forecast slot active: check if the current slot has any route-visible Vedurstofan stations.
      const currentSlot = forecastSlotStatuses.find(s => s.timeMs === activeMode)
      const slotHasStations = currentSlot !== undefined
        && data.stations.some(s =>
          vedurstofanRouteFilterIds === null || vedurstofanRouteFilterIds.has(s.stationId)
        )
      if (slotHasStations) return
      if (filteredVegagerdinStations.length === 0) return
      setActiveMode('now')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeMemory.status, vegagerdinRouteFilterIds, vedurstofanRouteFilterIds, filteredVegagerdinStations, forecastSlotStatuses, activeMode, vegagerdinLoading, data])

  // ── Route-variant pills — sorted by worst station status for the active source/time ──
  // Only computed when both places are selected and multiple variants are returned.
  // Uses the same status model as the map markers and wind-status filter pills.
  const sortedVariants = useMemo<RouteMemoryVariantData[]>(() => {
    if (routeMemory.status !== 'resolved') return []
    if (routeMemory.variants.length <= 1) return routeMemory.variants
    const getWorstStatus = (vedurstofanIds: string[], vegagerdinIds: string[]): WindDisplayStatus => {
      let worst: WindDisplayStatus = 'no_data'
      if (activeMode === 'now') {
        if (vegagerdinData?.status === 'ok') {
          for (const s of vegagerdinData.stations) {
            if (!vegagerdinIds.includes(s.stationId)) continue
            const status = classifyVegagerdinObservationStationWindStatus(s, thresholds)
            worst = worstWindDisplayStatus(worst, status)
          }
        }
      } else {
        if (data) {
          for (const s of data.stations) {
            if (s.lat === null || s.lon === null) continue
            if (!vedurstofanIds.includes(s.stationId)) continue
            const status = classifyForecastWindDisplayStatusAt(s.forecasts, thresholds, forecastAnchorMs)
            worst = worstWindDisplayStatus(worst, status)
          }
        }
      }
      return worst
    }
    return [...routeMemory.variants].sort((a, b) => {
      const aStatus = getWorstStatus(a.vedurstofanStationIds, a.vegagerdinStationIds)
      const bStatus = getWorstStatus(b.vedurstofanStationIds, b.vegagerdinStationIds)
      if (aStatus === bStatus) return 0
      // Best weather first: if aStatus is worse, sort a after b
      return worstWindDisplayStatus(aStatus, bStatus) === aStatus ? 1 : -1
    })
  }, [routeMemory, data, vegagerdinData, activeMode, forecastAnchorMs, thresholds])

  // ── Status filter visibility helper ───────────────────────────────────────
  // In simple mode, a station is visible if any member of its simple group is in
  // visibleStatuses — so 'innan-marka' markers show when 'nalgast-othaegindi' is
  // active (both belong to the green simple group). Keeps pill counts and marker
  // counts aligned.
  function isVisibleInCurrentFilter(status: WindDisplayStatus): boolean {
    if (visibleStatuses.size === 0) return true
    if (statusFilterMode === 'simple') {
      const simpleStatus = toSimpleWindDisplayStatus(status)
      return [...visibleStatuses].some(st => toSimpleWindDisplayStatus(st) === simpleStatus)
    }
    return visibleStatuses.has(status)
  }

  // ── Veðurstofan map layer ──────────────────────────────────────────────────
  // Declared after filter sets so both are available without TDZ.
  const vedurstofanLayer: ProviderMapLayer | null = data
    ? {
        layerId: 'vedurstofan',
        providerLabel: 'Veðurstofan',
        markers: data.stations
          .filter(s => s.lat !== null && s.lon !== null)
          .map(s => {
            const status = classifyForecastWindDisplayStatusAt(s.forecasts, thresholds, forecastAnchorMs)
            const displayStatus = statusFilterMode === 'simple' ? toSimpleWindDisplayStatus(status) : status
            const isRouteFiltered = vedurstofanRouteFilterIds !== null && !vedurstofanRouteFilterIds.has(s.stationId)
            const isVisible = !isRouteFiltered && isVisibleInCurrentFilter(status)
            return {
              id: s.stationId,
              lat: s.lat as number,
              lon: s.lon as number,
              label: s.stationName,
              tone: windStatusToTone(displayStatus),
              markerColor: WIND_STATUS_MARKER_COLOR[displayStatus],
              statusLabel: tf(WIND_STATUS_META[status].labelKey as 'statusWithinLimits'),
              visible: isVisible,
            }
          }),
      }
    : null

  const vedurstofanProvider: WeatherOverviewProviderConfig = {
    providerId: 'vedurstofan',
    label: 'Veðurstofan',
    loading,
    loadError,
    providerRestricted,
    unavailableReason: providerRestricted ? 'restricted' : loadError ? 'error' : undefined,
    canToggle: false,
    isVisible: typeof activeMode === 'number',
    mapLayer: vedurstofanLayer,

  }

  // ── Vegagerðin map layer ───────────────────────────────────────────────────
  const vegagerdinLayer: ProviderMapLayer | null =
    vegagerdinData && vegagerdinData.status === 'ok' && vegagerdinData.stations.length > 0
      ? {
          layerId: 'vegagerdin',
          providerLabel: tOv('vegagerdinProviderLabel'),
          markers: vegagerdinData.stations
            .map(s => {
              // Stations with neither gust nor wind sensor return no_wind_data (not no_data).
              const status = classifyVegagerdinObservationStationWindStatus(s, thresholds)
              const displayStatus = statusFilterMode === 'simple' ? toSimpleWindDisplayStatus(status) : status
              const isRouteFiltered = vegagerdinRouteFilterIds !== null && !vegagerdinRouteFilterIds.has(s.stationId)
              const isVisible = !isRouteFiltered && isVisibleInCurrentFilter(status)
              return {
                id: s.stationId,
                lat: s.lat,
                lon: s.lon,
                label: s.stationName,
                tone: windStatusToTone(displayStatus),
                markerColor: WIND_STATUS_MARKER_COLOR[displayStatus],
                statusLabel: tf(WIND_STATUS_META[status].labelKey as 'statusWithinLimits'),
                visible: isVisible,
              }
            }),
        }
      : null

  // Aggregate status counts for WindStatusFilterPills — active layer only, route-filtered.
  const overviewStatusCounts = useMemo<Partial<Record<WindDisplayStatus, number>>>(() => {
    const counts: Partial<Record<WindDisplayStatus, number>> = {}
    function tally(status: WindDisplayStatus) {
      counts[status] = (counts[status] ?? 0) + 1
    }
    if (activeMode === 'now') {
      if (vegagerdinData && vegagerdinData.status === 'ok') {
        for (const s of vegagerdinData.stations) {
          if (vegagerdinRouteFilterIds !== null && !vegagerdinRouteFilterIds.has(s.stationId)) continue
          const status = classifyVegagerdinObservationStationWindStatus(s, thresholds)
          tally(status)
        }
      }
    } else {
      if (data) {
        for (const s of data.stations) {
          if (s.lat === null || s.lon === null) continue
          if (vedurstofanRouteFilterIds !== null && !vedurstofanRouteFilterIds.has(s.stationId)) continue
          tally(classifyForecastWindDisplayStatusAt(s.forecasts, thresholds, forecastAnchorMs))
        }
      }
    }
    return counts
  }, [activeMode, data, vegagerdinData, thresholds, forecastAnchorMs, vedurstofanRouteFilterIds, vegagerdinRouteFilterIds])

  // Conditions feed filtered to the active route/place station set.
  // Mirrors the map: if a station is filtered out of the map, its feed items are also hidden.
  // Provider is inferred from targetType when item.provider is null (legacy Veðurstofan rows).
  const filteredConditionsItems = useMemo(() => {
    if (vedurstofanRouteFilterIds === null && vegagerdinRouteFilterIds === null) return conditionsItems
    return conditionsItems.filter(item => {
      const effectiveProvider = item.provider ?? (item.targetType === 'vegagerdin_station' ? 'vegagerdin' : 'vedurstofan')
      if (effectiveProvider === 'vedurstofan') {
        return vedurstofanRouteFilterIds === null || vedurstofanRouteFilterIds.has(item.targetId)
      }
      if (effectiveProvider === 'vegagerdin') {
        return vegagerdinRouteFilterIds === null || vegagerdinRouteFilterIds.has(item.targetId)
      }
      return true
    })
  }, [conditionsItems, vedurstofanRouteFilterIds, vegagerdinRouteFilterIds])

  // True when a STATUS filter is active and hides all route-visible markers.
  // Uses overviewStatusCounts (already route-filtered) to separate status-filter
  // emptiness from route-filter emptiness — fixes v538 conflation bug.
  // Does NOT fire when the route filter itself produces an empty set.
  const allMarkersHiddenByStatusFilter: boolean = (() => {
    if (visibleStatuses.size === 0) return false
    const totalRouteVisible = Object.values(overviewStatusCounts)
      .reduce<number>((sum, n) => sum + (n ?? 0), 0)
    if (totalRouteVisible === 0) return false
    return !(Object.keys(overviewStatusCounts) as WindDisplayStatus[]).some(
      status => (overviewStatusCounts[status] ?? 0) > 0 && isVisibleInCurrentFilter(status),
    )
  })()

  const vegagerdinProvider: WeatherOverviewProviderConfig = {
    providerId: 'vegagerdin',
    label: tOv('vegagerdinProviderLabel'),
    loading: vegagerdinLoading,
    loadError: vegagerdinLoadError,
    providerRestricted: vegagerdinRestricted,
    unavailableReason: vegagerdinUnavailableReason,
    canToggle: false,
    isVisible: activeMode === 'now',
    mapLayer: vegagerdinLayer,

    // Empty-cache state: shown when Vegagerðin is selected but the API returned no station data.
    // Rendered via renderPreMap (active-provider slot, below feedPreMap, above the map).
    // Not shown while loading or when cache has stations.
    renderPreMap: () => {
      if (vegagerdinLoading) return null
      const isEmpty =
        !vegagerdinData ||
        vegagerdinData.status === 'unavailable' ||
        (vegagerdinData.status === 'ok' && vegagerdinData.stations.length === 0)
      if (!isEmpty) return null
      return (
        <p className="text-xs text-muted-foreground">
          {tOv('vegagerdinEmptyCache')}
        </p>
      )
    },

    // Conditions feed — always visible at the top of the page (rendered via renderFeedPreMap
    // which is unconditional). Threshold bar is rendered separately via renderBelowSelector.
    renderFeedPreMap: (ctx: ProviderContentCtx) => (
      <ConditionsFeedPreview
        title={tOv('conditionsFeedTitle')}
        items={filteredConditionsItems}
        loading={conditionsLoading}
        emptyBehavior="message"
        emptyLabel={tOv('conditionsFeedEmpty')}
        collapsible
        defaultOpen={false}
        newSinceOpenCount={newSinceOpenCount}
        newSinceOpenLabel={newSinceOpenCount > 0 ? tOv('conditionsFeedNewSinceOpen', { count: newSinceOpenCount }) : undefined}
        onOpen={acknowledgeCurrentItems}
        onToggle={setConditionsDrawerOpen}
        onSelectTarget={target => {
          const effectiveProvider = target.provider ?? (target.targetType === 'vegagerdin_station' ? 'vegagerdin' : 'vedurstofan')
          ctx.onSelectProviderMarker(effectiveProvider, target.targetId)
        }}
        targetHref={target => {
          const effectiveProvider = target.provider ?? (target.targetType === 'vegagerdin_station' ? 'vegagerdin' : 'vedurstofan')
          return effectiveProvider === 'vegagerdin'
            ? vegagerdinPulseHref(target.targetId, stationPulseReturnBase)
            : vedurstofanPulseHref(target.targetId, `${stationPulseReturnBase}?stationId=${target.targetId}`)
        }}
        viewMoreLabel={tOv('conditionsFeedViewMore')}
        deletedLabel={t('pulseDeleted')}
        kindLabels={{ field_report: t('pulseKindField'), measurement_report: t('pulseKindMeasurement') }}
      />
    ),

    // Cross-provider status filter pills — shown below the map for both providers.
    // Attached to vegagerdinProvider so it is rendered once (first in the providers array).
    renderBelowMap: () => (
      <div className="flex flex-col gap-2">
        <div
          className="inline-flex w-fit rounded-full border border-border bg-background p-0.5"
          role="group"
          aria-label={tOv('statusFilterModeAriaLabel')}
        >
          {(['simple', 'detailed'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => handleStatusFilterModeChange(mode)}
              aria-pressed={statusFilterMode === mode}
              className={cn(
                'rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                statusFilterMode === mode
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {mode === 'simple'
                ? tOv('statusFilterModeSimple')
                : tOv('statusFilterModeDetailed')}
            </button>
          ))}
        </div>
        <WindStatusFilterPills
          mode={statusFilterMode}
          counts={overviewStatusCounts}
          visibleStatuses={visibleStatuses}
          onVisibleStatusesChange={setVisibleStatuses}
          showAllLabel={tf('mapFilterShowAll')}
          showAllButton
        />
        {allMarkersHiddenByStatusFilter && (
          <p className="text-xs text-muted-foreground text-center">
            {tOv('overviewFilterEmpty')}{' '}
            <button
              type="button"
              onClick={() => setVisibleStatuses(new Set())}
              className="underline hover:no-underline"
            >
              {tf('mapFilterShowAll')}
            </button>
          </p>
        )}
      </div>
    ),

  }

  // When both places are selected and canonical coords exist (draft was written),
  // add ?routeDraft=1 so /ferdalagid knows to prefer the sessionStorage draft.
  // Place names and coordinates are NOT put in the URL (privacy + v530 fix).
  const activeTripHref = (() => {
    if (!tripHref) return undefined
    if (!fromMemoryPlace || !toMemoryPlace) return tripHref
    const fromCanon = getCanonicalPlace(fromMemoryPlace.key)
    const toCanon = getCanonicalPlace(toMemoryPlace.key)
    if (fromCanon && toCanon) return `${tripHref}?routeDraft=1`
    return tripHref
  })()

  return (
    <WeatherOverviewShell
      backHref={backHref}
      backLabel={backLabel}
      title={title}
      subtitle={subtitle}
      menuVariant={menuVariant}
      tripHref={activeTripHref}
      providers={[vegagerdinProvider, vedurstofanProvider]}
      requestedSelection={null}
      buildSelectedCallout={(selected, onDeselect) => {
        if (!selected) return null

        if (selected.layerId === 'vedurstofan' && data) {
          const station = data.stations.find(s => s.stationId === selected.markerId)
          if (!station) return null
          const isOnRoute = vedurstofanRouteFilterIds === null || vedurstofanRouteFilterIds.has(station.stationId)
          if (!isOnRoute) return null
          const vedurstofanStatus = classifyForecastWindDisplayStatusAt(station.forecasts, thresholds, forecastAnchorMs)
          if (!isVisibleInCurrentFilter(vedurstofanStatus)) return null
          const forecastRowIdx = selectForecastRowAt(station.forecasts, forecastAnchorMs)
          const windMs = forecastRowIdx !== null ? (station.forecasts[forecastRowIdx]?.windSpeedMs ?? null) : null
          return {
            layerId: 'vedurstofan',
            markerId: station.stationId,
            stationName: station.stationName,
            windMs,
            gustMs: null,
            gustLabel: tOv('overlayGust'),
            notePreviewUrl: `/api/teskeid/weather/vedurpuls/stations/${station.stationId}/preview`,
            detailsHref: vedurstofanPulseHref(station.stationId, `${stationPulseReturnBase}?stationId=${station.stationId}`),
            detailsLabel: tOv('overlayNanar'),
          }
        }

        if (selected.layerId === 'vegagerdin' && vegagerdinData?.status === 'ok') {
          const station = vegagerdinData.stations.find(s => s.stationId === selected.markerId)
          if (!station) return null
          const isOnRoute = vegagerdinRouteFilterIds === null || vegagerdinRouteFilterIds.has(station.stationId)
          if (!isOnRoute) return null
          const vegagerdinStatus = classifyVegagerdinObservationStationWindStatus(station, thresholds)
          if (!isVisibleInCurrentFilter(vegagerdinStatus)) return null
          return {
            layerId: 'vegagerdin',
            markerId: station.stationId,
            stationName: station.stationName,
            windMs: station.meanWindMs,
            gustMs: station.gustLast10MinMs,
            gustLabel: tOv('overlayGust'),
            notePreviewUrl: `/api/teskeid/weather/vedurpuls/vegagerdin/stations/${station.stationId}/preview`,
            detailsHref: vegagerdinPulseHref(station.stationId, stationPulseReturnBase),
            detailsLabel: tOv('overlayNanar'),
          }
        }

        return null
      }}
      renderBanner={() => (
        <div className="rounded-xl border border-border px-4 py-3 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground leading-snug">{tOv('overviewWindBanner')}</p>
          <WeatherThresholdBar
            alwaysOpen
            thresholds={thresholds}
            hasOverrides={Object.keys(overrides).length > 0}
            onApply={({ cautionWindMs, redWindMs }) => {
              setOverrides({ cautionWindMs, redWindMs })
            }}
            onSaveDefault={({ cautionWindMs, redWindMs }) => {
              handleSaveAsDefault(cautionWindMs, redWindMs)
            }}
            savedThresholds={savedDefaultThresholds}
            onReset={resetThresholds}
            labels={{
              title: tOv('thresholdBarTitle'),
              cautionLabel: tOv('thresholdBarCautionLabel'),
              dangerLabel: tOv('thresholdBarDangerLabel'),
              unit: tOv('thresholdBarUnit'),
              applyLabel: savedDefaultThresholds
                ? tOv('thresholdBarApplyUpdate')
                : tOv('thresholdBarApply'),
              resetLabel: tOv('thresholdBarReset'),
              editLabel: tOv('thresholdBarEdit'),
              closeLabel: tOv('thresholdBarClose'),
              orderingError: tOv('thresholdBarOrderingError'),
            }}
          />
        </div>
      )}
      renderProviderSelector={() => (
        <WeatherSourceTimeSelector
          vegagerdinGroupLabel={tOv('vegagerdinProviderLabel')}
          nowLabel={tOv('sourceNowLabel')}
          nowMeasuredAtLabel={
            vegagerdinNewestMeasuredAtIso !== null
              ? tOv('sourceMeasuredAt', { time: formatKlTime(vegagerdinNewestMeasuredAtIso) })
              : undefined
          }
          nowStatusColor={WIND_STATUS_MARKER_COLOR[statusFilterMode === 'simple' ? toSimpleWindDisplayStatus(vegagerdinWorstStatus) : vegagerdinWorstStatus]}
          nowStatusLabel={tf(WIND_STATUS_META[vegagerdinWorstStatus].labelKey as 'statusWithinLimits')}
          nowLoading={vegagerdinLoading}
          nowLoadingLabel={tOv('sourceLoadingNow')}
          nowDisabled={vegagerdinRestricted}
          forecastGroupLabel={tOv('sourceForecastGroupLabel')}
          forecastLabel={tOv('sourceForecastLabel')}
          forecastSlots={displayForecastSlotStatuses}
          prevLabel={tOv('sourceTimePrevious')}
          nextLabel={tOv('sourceTimeNext')}
          forecastLoading={loading}
          forecastLoadingLabel={tOv('sourceLoadingForecast')}
          activeMode={activeMode}
          onModeChange={handleModeChange}
        />
      )}
      renderRouteLens={() => (
        <div className="flex flex-col gap-2">
          <RouteMemoryPicker
            onPlacesChange={(from, to) => {
              setFromMemoryPlace(from)
              setToMemoryPlace(to)
            }}
            labels={{
              titleLabel: tOv('routeMemoryPickerTitle'),
              fromLabel: tOv('routeLensFrom'),
              toLabel: tOv('routeLensTo'),
              clearLabel: tOv('routeLensClear'),
              loadingText: tOv('routeMemoryPickerLoading'),
              emptyText: tOv('routeMemoryPickerEmpty'),
              hintText: tOv('routeMemoryPickerHint'),
              ariaLabel: tOv('routeLensAriaLabel'),
            }}
          />
          {routeMemory.status === 'resolved' && sortedVariants.length > 1 && (
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label={tOv('routeVariantPillsAriaLabel')}
            >
              <button
                type="button"
                onClick={() => setSelectedVariantKey('all')}
                className={cn(
                  'text-[10px] px-2 py-1 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  selectedVariantKey === 'all'
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:border-primary/40',
                )}
              >
                {tOv('routeVariantAllLabel')}
              </button>
              {sortedVariants.map((variant, i) => {
                const isSelected = selectedVariantKey === variant.routeVariantKey
                const labelMap: Record<string, string> = {
                  CURATED_RING_ROAD: tf('routeOptionRingRoad'),
                  CURATED_VIA_HELLISHEIDI: tf('routeOptionViaHellisheidi'),
                  CURATED_VIA_HOLMAVIK: tf('routeOptionViaHolmavik'),
                  CURATED_AVOID_OXI: tf('routeOptionAvoidOxi'),
                  CURATED_VIA_THRENGSLAVEGUR: tf('routeOptionViaThrengslavegur'),
                }
                const label = (variant.routeVariantLabel && labelMap[variant.routeVariantLabel])
                  ? labelMap[variant.routeVariantLabel]
                  : tOv('routeVariantFallbackLabel', { n: i + 1 })
                const hasCaution = variant.routeCautionIds.length > 0
                return (
                  <button
                    key={variant.routeVariantKey}
                    type="button"
                    onClick={() => setSelectedVariantKey(variant.routeVariantKey)}
                    className={cn(
                      'text-[10px] px-2 py-1 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border text-muted-foreground hover:border-primary/40',
                    )}
                  >
                    {hasCaution ? `${label} · ${tOv('routeVariantCautionLabel')}` : label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    />
  )
}
