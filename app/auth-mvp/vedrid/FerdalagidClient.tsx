'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { CloudSun, ChevronDown, ChevronUp, MapPin, Route, Caravan, SlidersHorizontal, CheckCircle2, Wind, Droplets } from 'lucide-react'
import type { DeterministicResult, WeatherStatus, RouteWeatherPoint, TravelIssue, CandidatePointStatus, TravelThresholdOverrides, TravelCandidate, ForecastDrawerRow, ResolvedTravelThresholds } from '@/lib/weather/types'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'
import { type WeatherProviderKey, selectDecisiveProvider } from '@/lib/weather/providerComparator'
import type { RouteOption } from '@/lib/weather/provider.types'
import { resolveThresholds, validateResolvedThresholdOrdering } from '@/lib/weather/thresholds'
import { classifyWindDistance, type WindDistanceLabel } from '@/lib/weather/assessment'
import {
  type WindDisplayStatus,
  WIND_DISPLAY_STATUS_PRIORITY_ORDER,
  WIND_DISPLAY_STATUS_ORDER,
  classifyCandidateWindDisplayStatus,
  classifyPointWindDisplayStatus,
  worstWindDisplayStatus,
} from '@/lib/weather/windDisplayStatus'
import { WIND_STATUS_UI_META as WIND_STATUS_META_SHARED } from '@/components/weather/windStatusUi'
import { TravelAuditMap, type ProviderMapPoint } from '@/components/weather/TravelAuditMap'
import { ForecastDrawer } from '@/components/weather/ForecastDrawer'
import { DepartureHeatmap } from '@/components/weather/DepartureHeatmap'
import { RouteSelectionStep, type RoutePlace } from '@/components/weather/RouteSelectionStep'
import { WeatherResultLoader } from '@/components/weather/WeatherResultLoader'
import { WeatherBetaBanner } from '@/components/weather/WeatherBetaBanner'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { formatKlTime, candidateToIssue, normalizeLocale, formatNum, estimatePointEtaIso, formatCompactDateTime, formatLongDepartureDateTime, getOriginDisplay, buildPointSummary } from '@/components/weather/travelAuditMap.helpers'
import { RouteWeatherPointDetailCard } from '@/components/weather/RouteWeatherPointDetailCard'
import { WindStatusBadge } from '@/components/weather/WindStatusBadge'
import { VedurstofanPointCard } from '@/components/weather/VedurstofanPointCard'
import { isVestmannaeyjarDestination, FERRY_PORTS, type FerryPortId } from '@/lib/weather/ferryPorts'
import { isVedurstofanCycleFresh, getNextCycleAfterAtimeIso } from '@/lib/weather/vedurstofanFreshness'
import type { SavedWeatherPlace } from '@/lib/weather/savedPlaces'

type VedurstofanAssessment = {
  station: VedurstofanTravelLayer['points'][number]
  row: VedurstofanTravelLayer['points'][number]['forecastRows'][number] | null
  windMs: number | null
  etaIso: string | null
  ftimeIso: string | null
  status: WindDisplayStatus
}

function computeVedurstofanAssessments(
  depIso: string,
  arrIso: string,
  points: VedurstofanTravelLayer['points'],
  thresholds: ResolvedTravelThresholds,
): VedurstofanAssessment[] {
  const depMs = new Date(depIso).getTime()
  const durMs = new Date(arrIso).getTime() - depMs
  return points
    .filter((p): p is typeof p & { lat: number; lon: number } => p.lat !== null && p.lon !== null)
    .map(p => {
      let row: typeof p.forecastRows[0] | null = null
      let windMs: number | null = null
      let etaIso: string | null = null
      if (p.routeFraction !== null && durMs > 0) {
        const etaMs = depMs + p.routeFraction * durMs
        etaIso = new Date(etaMs).toISOString()
        row = p.forecastRows.reduce<typeof p.forecastRows[0] | null>((b, r) => {
          if (!b) return r
          return Math.abs(new Date(r.ftimeIso).getTime() - etaMs) <
            Math.abs(new Date(b.ftimeIso).getTime() - etaMs)
            ? r : b
        }, null)
        windMs = row?.windSpeedMs ?? null
      } else {
        row = p.forecastRows.reduce<typeof p.forecastRows[0] | null>((b, r) =>
          (r.windSpeedMs ?? 0) > (b?.windSpeedMs ?? 0) ? r : b, null)
        windMs = row?.windSpeedMs ?? null
      }
      const status = classifyPointWindDisplayStatus(
        windMs ?? undefined, windMs !== null, thresholds,
      )
      return { station: p, row, windMs, etaIso, ftimeIso: row?.ftimeIso ?? null, status }
    })
}

type WizardStep = 'route' | 'thresholds' | 'result'

type TrailerKindValue = 'none' | 'generic_trailer' | 'tent_trailer' | 'folding_camper' | 'caravan' | 'horse_trailer'

const STEP_ORDER: WizardStep[] = ['route', 'thresholds', 'result']

// sessionStorage key + restore contract for route-result persistence across refresh and pulse login.
const ROUTE_RESTORE_KEY = 'vaktirnar:weather-route-restore'
const ROUTE_RESTORE_SCHEMA_VERSION = 1
const ROUTE_RESTORE_TTL_MS = 30 * 60 * 1000 // 30 minutes

function isValidRouteRestorePayload(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  if (d.schemaVersion !== ROUTE_RESTORE_SCHEMA_VERSION) return false
  if (d.step !== 'result') return false
  if (!d.result || typeof d.result !== 'object') return false
  if (!d.origin || typeof d.origin !== 'object') return false
  if (!d.destination || typeof d.destination !== 'object') return false
  if (typeof d.savedAtIso !== 'string') return false
  const age = Date.now() - Date.parse(d.savedAtIso as string)
  if (!Number.isFinite(age) || age > ROUTE_RESTORE_TTL_MS) return false
  return true
}

const STATUS_STYLES: Record<WeatherStatus, { dot: string; label: string }> = {
  graent: { dot: 'bg-[#2d5a27]', label: 'text-[#2d5a27]' },
  gult:   { dot: 'bg-amber-500', label: 'text-amber-700' },
  rautt:  { dot: 'bg-destructive', label: 'text-destructive' },
}

// WIND_STATUS_META is imported as WIND_STATUS_META_SHARED from lib/weather/windDisplayStatus


export function FerdalagidClient({
  isGuest = false,
  tripEnabled = false,
}: {
  isGuest?: boolean
  tripEnabled?: boolean
} = {}) {
  const t = useTranslations('teskeid.vedrid')
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const locale = useLocale()

  const [step, setStep] = useState<WizardStep>('route')

  const [origin, setOrigin] = useState<RoutePlace | null>(null)
  const [destination, setDestination] = useState<RoutePlace | null>(null)
  const [trailerKind, setTrailerKind] = useState<TrailerKindValue>('none')
  const [thresholdOverrides, setThresholdOverrides] = useState<TravelThresholdOverrides>({})
  // Draft state for threshold step inputs
  const [draftCautionWind, setDraftCautionWind] = useState('')
  const [draftRedWind, setDraftRedWind] = useState('')
  const [draftRedGust, setDraftRedGust] = useState('')
  const [draftCautionPrecip, setDraftCautionPrecip] = useState('')
  const [thresholdError, setThresholdError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DeterministicResult | null>(null)
  const [vedurstofanLayer, setVedurstofanLayer] = useState<VedurstofanTravelLayer | null>(null)
  const [showVedurstofan, setShowVedurstofan] = useState(false)
  const [showMetno, setShowMetno] = useState(true)
  const [vedurstofanRefreshState, setVedurstofanRefreshState] = useState<'idle' | 'refreshing' | 'fresh' | 'stillStale' | 'running' | 'recentlyAttempted' | 'failed'>('idle')
  const [newerVedurstofanAvailable, setNewerVedurstofanAvailable] = useState(false)
  const [nextManualRefreshIso, setNextManualRefreshIso] = useState<string | null>(null)
  const knownVedurstofanAtimeRef = useRef<string | null>(null)
  const serverInitDoneRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showExplainer, setShowExplainer] = useState(false)
  const [forecastDrawerData, setForecastDrawerData] = useState<{
    rows: ForecastDrawerRow[]
    title: string
    highlightedTimeIso?: string
    yrnoUrl?: string
    googleMapsUrl?: string
    departureContext?: { originDisplay: string; departureIso: string }
  } | null>(null)
  const [compareDrawerOpen, setCompareDrawerOpen] = useState(false)
  const [comparePreset, setComparePreset] = useState<'kl12' | 'morning' | '3h'>('kl12')
  const [selectedHeatmapIdx, setSelectedHeatmapIdx] = useState<number | null>(null)
  const [selectedReturnHeatmapIdx, setSelectedReturnHeatmapIdx] = useState<number | null>(null)
  // True only when the user has explicitly clicked a heatmap slot (not auto-selected on result load).
  // Controls whether RoutePointRow uses active-candidate mode or shows summaryForWindow metrics.
  const [userExplicitSlot, setUserExplicitSlot] = useState(false)
  // Filter state for scrubber (DepartureHeatmap) per leg — empty = show all; non-empty = show only those
  const [outboundVisibleStatuses, setOutboundVisibleStatuses] = useState<Set<WindDisplayStatus>>(() => new Set<WindDisplayStatus>())
  const [returnVisibleStatuses, setReturnVisibleStatuses] = useState<Set<WindDisplayStatus>>(() => new Set<WindDisplayStatus>())
  // Map visibility state — independent from scrubber filters
  const [mapOutboundVisibleStatuses, setMapOutboundVisibleStatuses] = useState<Set<WindDisplayStatus>>(() => new Set<WindDisplayStatus>())
  // Signal to TravelAuditMap to clear manual point selection when departure changes
  const [mapSelectionSignal, setMapSelectionSignal] = useState(0)
  // Track which thresholds were last submitted to detect dirty drafts
  const [submittedThresholds, setSubmittedThresholds] = useState<TravelThresholdOverrides | null>(null)
  // Latest-value ref for combined slot statuses — read in auto-select effect without dep array churn
  const combinedSlotStatusesRef = useRef<WindDisplayStatus[] | null>(null)

  // Holds the origin/destination coords that were just restored from sessionStorage.
  // The route-clear effect uses this to skip the first clear triggered by restore hydration.
  const restoredCoordsRef = useRef<{
    originLat: number | undefined
    originLon: number | undefined
    destLat: number | undefined
    destLon: number | undefined
  } | null>(null)

  // Ferðalag conversion affordance — shown when tripEnabled and result is ready
  const [tripHintVisible, setTripHintVisible] = useState(false)

  // Route selection state
  const [routeOptions, setRouteOptions] = useState<RouteOption[] | null>(null)
  const [routeOptionsLoading, setRouteOptionsLoading] = useState(false)
  const [routeOptionsError, setRouteOptionsError] = useState<string | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [routeRetryCount, setRouteRetryCount] = useState(0)
  const [routeFallback, setRouteFallback] = useState(false)

  // Guest rate limit state — set when server returns 429 for guest requests
  const [guestRateLimited, setGuestRateLimited] = useState(false)

  // Saved places (recent route places)
  const [savedPlaces, setSavedPlaces] = useState<SavedWeatherPlace[]>([])

  // Ferry port selection (Vestmannaeyjar / Herjólfur)
  type FerrySelection = {
    ferryPortId: FerryPortId
    ferryPort: RoutePlace
    finalDestination: RoutePlace
  }
  const [ferrySelection, setFerrySelection] = useState<FerrySelection | null>(null)

  const isVestmannaeyjar = destination ? isVestmannaeyjarDestination(destination) : false
  const effectiveDestinationName = ferrySelection
    ? ferrySelection.ferryPort.name
    : (destination?.name ?? '')

  // Restore route-result context from sessionStorage on mount (normal refresh or pulse-login return).
  // Does not require ?restore=1 — any valid, non-expired payload is restored automatically.
  // sessionStorage is tab-scoped: closed tabs start fresh; same-tab refreshes restore last result.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = sessionStorage.getItem(ROUTE_RESTORE_KEY)
      if (!raw) return
      const state = JSON.parse(raw)
      if (!isValidRouteRestorePayload(state)) {
        sessionStorage.removeItem(ROUTE_RESTORE_KEY)
        return
      }
      if (state.origin) setOrigin(state.origin)
      if (state.destination) setDestination(state.destination)
      // Store the restored coords so the route-clear effect can skip the hydration-triggered clear
      restoredCoordsRef.current = {
        originLat: state.origin?.lat,
        originLon: state.origin?.lon,
        destLat: state.destination?.lat,
        destLon: state.destination?.lon,
      }
      if (state.trailerKind) setTrailerKind(state.trailerKind)
      if (state.thresholdOverrides) setThresholdOverrides(state.thresholdOverrides)
      if (state.selectedRouteId !== undefined) setSelectedRouteId(state.selectedRouteId)
      if (state.result) setResult(state.result)
      if (state.vedurstofanLayer !== undefined) setVedurstofanLayer(state.vedurstofanLayer)
      if (state.showVedurstofan !== undefined) setShowVedurstofan(state.showVedurstofan)
      if (state.showMetno !== undefined) setShowMetno(state.showMetno)
      if (state.selectedHeatmapIdx !== undefined) setSelectedHeatmapIdx(state.selectedHeatmapIdx)
      if (state.selectedReturnHeatmapIdx !== undefined) setSelectedReturnHeatmapIdx(state.selectedReturnHeatmapIdx)
      if (Array.isArray(state.outboundVisibleStatuses)) setOutboundVisibleStatuses(new Set(state.outboundVisibleStatuses))
      if (Array.isArray(state.returnVisibleStatuses)) setReturnVisibleStatuses(new Set(state.returnVisibleStatuses))
      if (state.submittedThresholds !== undefined) setSubmittedThresholds(state.submittedThresholds)
      if (state.ferrySelection !== undefined) setFerrySelection(state.ferrySelection)
      if (state.userExplicitSlot !== undefined) setUserExplicitSlot(state.userExplicitSlot)
      if (state.routeFallback !== undefined) setRouteFallback(state.routeFallback)
      setStep('result')
      // Clean ?restore=1 from URL if coming back from pulse login flow
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        if (params.get('restore') === '1') {
          const url = new URL(window.location.href)
          url.searchParams.delete('restore')
          window.history.replaceState(null, '', url.toString())
        }
      }
    } catch {
      // Corrupt state — remove and start fresh
      try { sessionStorage.removeItem(ROUTE_RESTORE_KEY) } catch {}
    }
  }, []) // mount only

  // Persist route-result context to sessionStorage so it survives refresh and pulse login return.
  // Runs whenever result state changes while result step is active.
  useEffect(() => {
    if (step !== 'result' || !result) return
    try {
      sessionStorage.setItem(ROUTE_RESTORE_KEY, JSON.stringify({
        schemaVersion: ROUTE_RESTORE_SCHEMA_VERSION,
        savedAtIso: new Date().toISOString(),
        step: 'result',
        origin,
        destination,
        trailerKind,
        thresholdOverrides,
        selectedRouteId,
        result,
        vedurstofanLayer,
        showVedurstofan,
        showMetno,
        selectedHeatmapIdx,
        selectedReturnHeatmapIdx,
        outboundVisibleStatuses: [...outboundVisibleStatuses],
        returnVisibleStatuses: [...returnVisibleStatuses],
        submittedThresholds,
        ferrySelection,
        userExplicitSlot,
        routeFallback,
      }))
    } catch { /* sessionStorage may be unavailable */ }
  }, [step, result, origin, destination, trailerKind, thresholdOverrides, selectedRouteId, vedurstofanLayer, showVedurstofan, showMetno, selectedHeatmapIdx, selectedReturnHeatmapIdx, outboundVisibleStatuses, returnVisibleStatuses, submittedThresholds, ferrySelection, userExplicitSlot, routeFallback])

  // Fetch saved places once on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/teskeid/weather/saved-places', { credentials: 'same-origin' })
        if (!cancelled && res.ok) {
          const data = await res.json()
          setSavedPlaces(data.places ?? [])
        }
      } catch {
        // Best-effort — saved places are non-critical
      }
    })()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear the threshold error when entering the thresholds step.
  // Draft inputs are intentionally NOT pre-filled on first entry — user must set them explicitly.
  // When returning after a previous submission, drafts retain the values the user typed.
  useEffect(() => {
    if (step === 'thresholds') {
      setThresholdError(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Reset departure filters and map visibility when a new result arrives
  useEffect(() => {
    if (!result) return
    setOutboundVisibleStatuses(new Set<WindDisplayStatus>())
    setReturnVisibleStatuses(new Set<WindDisplayStatus>())
    setMapOutboundVisibleStatuses(new Set<WindDisplayStatus>())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.id])

  // Clear result/error whenever origin or destination coordinates change.
  // When a restore is in progress (restoredCoordsRef set), waits for coords to hydrate before deciding:
  //   - coords not yet ready → keep ref and return (will re-run after re-render);
  //   - coords match restored values → skip clear and mark restore done;
  //   - coords differ from restored → genuine change, proceed to clear.
  // On genuine route edits the persisted key is also removed so stale data does not return on refresh.
  useEffect(() => {
    const restored = restoredCoordsRef.current
    if (restored !== null) {
      const coordsReady =
        origin?.lat !== undefined &&
        origin?.lon !== undefined &&
        destination?.lat !== undefined &&
        destination?.lon !== undefined
      if (!coordsReady) return // Still hydrating — keep ref, skip clear
      if (
        origin.lat === restored.originLat &&
        origin.lon === restored.originLon &&
        destination.lat === restored.destLat &&
        destination.lon === restored.destLon
      ) {
        restoredCoordsRef.current = null
        return // Hydration complete — skip clear, result is valid
      }
      restoredCoordsRef.current = null
    }
    setResult(null)
    setError(null)
    setSelectedHeatmapIdx(null)
    setSelectedReturnHeatmapIdx(null)
    setUserExplicitSlot(false)
    // Invalidate any persisted result — user changed the route before a new result was calculated
    try { sessionStorage.removeItem(ROUTE_RESTORE_KEY) } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat, origin?.lon, destination?.lat, destination?.lon])

  // Fetch route options whenever both places are set (or on explicit retry).
  // When destination is Vestmannaeyjar, waits until a ferry port is selected.
  useEffect(() => {
    setRouteOptions(null)
    setSelectedRouteId(null)
    setRouteOptionsError(null)
    setRouteFallback(false)

    // Compute effective destination: ferry port if Vestmannaeyjar, otherwise regular destination
    const effectiveDest = (isVestmannaeyjar && ferrySelection)
      ? ferrySelection.ferryPort
      : (!isVestmannaeyjar ? destination : null)

    if (!origin || !effectiveDest) {
      setRouteOptionsLoading(false)
      return
    }

    let cancelled = false
    setRouteOptionsLoading(true)

    ;(async () => {
      try {
        const res = await fetch('/api/teskeid/weather/travel/routes', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin, destination: effectiveDest }),
        })
        if (cancelled) return

        const contentType = res.headers.get('content-type') ?? ''
        if (res.status === 401 || !contentType.includes('application/json')) {
          setRouteOptionsError(tf('errorAuthExpired'))
          return
        }
        if (res.status === 429) {
          setGuestRateLimited(true)
          return
        }

        const data = await res.json()
        if (cancelled) return

        if (!res.ok) {
          setRouteOptionsError(tf('routeOptionsUnavailable'))
          return
        }

        const options = data.routes as RouteOption[]
        setRouteOptions(options)
        if (options.length > 0) setSelectedRouteId(options[0].id)
      } catch {
        if (!cancelled) setRouteOptionsError(tf('routeOptionsUnavailable'))
      } finally {
        if (!cancelled) setRouteOptionsLoading(false)
      }
    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat, origin?.lon, destination?.lat, destination?.lon, routeRetryCount, ferrySelection?.ferryPortId])

  function goNext(from: WizardStep) {
    const idx = STEP_ORDER.indexOf(from)
    if (idx >= 0 && idx < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[idx + 1])
    }
  }

  function goBack(from: WizardStep) {
    const idx = STEP_ORDER.indexOf(from)
    if (idx > 0) setStep(STEP_ORDER[idx - 1])
  }

  async function savePlaceBestEffort(place: RoutePlace) {
    if (isGuest) return
    try {
      const saveRes = await fetch('/api/teskeid/weather/saved-places', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: place.name,
          formattedAddress: place.formattedAddress ?? '',
          lat: place.lat,
          lon: place.lon,
        }),
      })
      if (!saveRes.ok) return
      const listRes = await fetch('/api/teskeid/weather/saved-places', { credentials: 'same-origin' })
      if (listRes.ok) {
        const data = await listRes.json()
        setSavedPlaces(data.places ?? [])
      }
    } catch {
      // Best-effort — never block UX
    }
  }

  async function handleDeleteSavedPlace(id: string) {
    if (isGuest) return
    const previous = savedPlaces
    setSavedPlaces(prev => prev.filter(p => p.id !== id))
    try {
      const res = await fetch(`/api/teskeid/weather/saved-places/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!res.ok) setSavedPlaces(previous)
    } catch {
      setSavedPlaces(previous)
    }
  }

  function handleOriginSelected(place: RoutePlace) {
    setOrigin(place)
    savePlaceBestEffort(place)
  }

  function handleDestinationSelected(place: RoutePlace) {
    setDestination(place)
    // Always clear ferry selection — if new dest is also Vestmannaeyjar, user re-picks port
    setFerrySelection(null)
    savePlaceBestEffort(place)
  }

  function handleFerryPortSelected(portId: FerryPortId) {
    if (!destination) return
    if (ferrySelection?.ferryPortId === portId) return  // same port re-clicked, no-op
    const port = FERRY_PORTS[portId]
    const newFerry: FerrySelection = {
      ferryPortId: portId,
      ferryPort: { name: port.name, lat: port.lat, lon: port.lon },
      finalDestination: destination,
    }
    // Clear route state (re-fetch for new port) and any stale result
    setSelectedRouteId(null)
    setRouteOptions(null)
    setRouteOptionsError(null)
    setRouteFallback(false)
    setResult(null)
    setError(null)
    setShowDetails(false)
    setShowExplainer(false)
    setSelectedHeatmapIdx(null)
    setSelectedReturnHeatmapIdx(null)
    setUserExplicitSlot(false)
    setSubmittedThresholds(null)
    setFerrySelection(newFerry)
    // Invalidate persisted result — ferry port change makes any prior result stale
    try { sessionStorage.removeItem(ROUTE_RESTORE_KEY) } catch {}
  }

  async function handleSubmit(overridesParam?: TravelThresholdOverrides) {
    if (loading) return
    setLoading(true)
    setResult(null)
    setError(null)
    setShowDetails(false)
    setShowExplainer(false)
    setSelectedHeatmapIdx(null)
    setSelectedReturnHeatmapIdx(null)
    setUserExplicitSlot(false)
    setOutboundVisibleStatuses(new Set())
    setReturnVisibleStatuses(new Set())
    setMapOutboundVisibleStatuses(new Set())
    setStep('result')

    const overridesToSend = overridesParam !== undefined ? overridesParam : thresholdOverrides

    try {
      const res = await fetch('/api/teskeid/weather/travel', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin,
          destination: ferrySelection?.ferryPort ?? destination,
          trailerKind,
          selectedRouteId: selectedRouteId ?? undefined,
          thresholdOverrides: Object.keys(overridesToSend).length > 0 ? overridesToSend : undefined,
        }),
      })

      // Guard against auth redirects and non-JSON responses (middleware intercept, CDN error pages).
      const contentType = res.headers.get('content-type') ?? ''
      if (res.status === 401 || !contentType.includes('application/json')) {
        setError(tf('errorAuthExpired'))
        return
      }
      if (res.status === 429) {
        setGuestRateLimited(true)
        return
      }

      const data = await res.json()

      if (!res.ok) {
        const errMap: Record<string, string> = {
          provider_not_configured: tf('errorProviderNotConfigured'),
          route_unavailable: tf('errorRouteUnavailable'),
          selected_route_unavailable: tf('selectedRouteUnavailable'),
          forecast_unavailable: tf('errorForecastUnavailable'),
          times_invalid: tf('errorTimesInvalid'),
          time_constraint_conflict: tf('errorTimeConstraintConflict'),
        }
        if (data?.error === 'thresholds_invalid') {
          // Return to threshold step with field-level error rather than showing an empty result
          setStep('thresholds')
          setThresholdError(tf('thresholdValidationError'))
        } else {
          setError(errMap[data?.error] ?? tf('errorGeneral'))
        }
      } else {
        const travelData = data as DeterministicResult & { vedurstofanLayer?: VedurstofanTravelLayer }
        setVedurstofanLayer(travelData.vedurstofanLayer ?? null)
        setShowVedurstofan(false)
        setShowMetno(true)
        setVedurstofanRefreshState('idle')
        setNextManualRefreshIso(null)
        serverInitDoneRef.current = false
        setResult(travelData)
        setSubmittedThresholds(overridesToSend)
      }
    } catch {
      setError(tf('errorGeneral'))
    } finally {
      setLoading(false)
    }
  }

  function toggleVedurstofan() {
    setForecastDrawerData(null)
    setCompareDrawerOpen(false)
    setShowVedurstofan(v => !v)
  }

  async function handleRefreshVedurstofan() {
    if (vedurstofanRefreshState === 'refreshing') return
    setVedurstofanRefreshState('refreshing')
    try {
      const res = await fetch('/api/teskeid/weather/vedurstofan/refresh', { method: 'POST' })
      if (!res.ok) { setVedurstofanRefreshState('failed'); return }
      const json = await res.json() as { status: string; lastAttemptIso?: string }

      if (json.status === 'fresh' || json.status === 'alreadyFresh' || json.status === 'stillStale') {
        // Reload the displayed layer after any completed warm — the route stations may have updated
        // even if the global endpoint returned stillStale (other stations may still be stale).
        // Stay in 'refreshing' state until the reload completes.
        // A completed warm always starts a cooldown — the button must not reappear immediately.
        const warmCooldownIso = new Date(Date.now() + 10 * 60 * 1000).toISOString()
        try {
          const travelRes = await fetch('/api/teskeid/weather/travel', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              origin,
              destination: ferrySelection?.ferryPort ?? destination,
              trailerKind,
              selectedRouteId: selectedRouteId ?? undefined,
              thresholdOverrides: Object.keys(thresholdOverrides).length > 0 ? thresholdOverrides : undefined,
            }),
          })
          if (travelRes.ok) {
            const travelData = await travelRes.json() as { vedurstofanLayer?: VedurstofanTravelLayer }
            const newLayer = travelData.vedurstofanLayer ?? null
            // Always update the displayed layer with the freshest route data we have,
            // even when the global endpoint is still stale (other unrelated stations may lag).
            if (newLayer) setVedurstofanLayer(newLayer)
            const newAtimeIso = newLayer?.layerAtimeIso ?? null
            if (isVedurstofanCycleFresh(newAtimeIso, new Date())) {
              setVedurstofanRefreshState('fresh')
            } else {
              setVedurstofanRefreshState('stillStale')
              setNextManualRefreshIso(warmCooldownIso)
            }
          } else {
            // Travel refetch failed — warm attempt still happened, so apply cooldown.
            setVedurstofanRefreshState('stillStale')
            setNextManualRefreshIso(warmCooldownIso)
          }
        } catch {
          setVedurstofanRefreshState('stillStale')
          setNextManualRefreshIso(warmCooldownIso)
        }
      } else {
        if (json.status === 'recentlyAttempted') {
          setVedurstofanRefreshState('recentlyAttempted')
          if (json.lastAttemptIso) {
            setNextManualRefreshIso(new Date(Date.parse(json.lastAttemptIso) + 10 * 60 * 1000).toISOString())
          }
        } else if (json.status === 'running') {
          setVedurstofanRefreshState('running')
        } else {
          setVedurstofanRefreshState(json.status === 'stillStale' ? 'stillStale' : 'failed')
        }
      }
    } catch {
      setVedurstofanRefreshState('failed')
    }
  }

  // Sync known atime ref when layer changes; clear notification so stale prompt doesn't linger.
  useEffect(() => {
    knownVedurstofanAtimeRef.current = vedurstofanLayer?.layerAtimeIso ?? null
    setNewerVedurstofanAvailable(false)
  }, [vedurstofanLayer?.layerAtimeIso]) // eslint-disable-line react-hooks/exhaustive-deps

  // On first render of the result step with Veðurstofan enabled, sync refresh state from server
  // so the refresh button hides correctly even before the user interacts.
  useEffect(() => {
    if (step !== 'result' || !showVedurstofan || serverInitDoneRef.current) return
    serverInitDoneRef.current = true
    ;(async () => {
      try {
        const res = await fetch('/api/teskeid/weather/vedurstofan/freshness')
        if (!res.ok) return
        const data = await res.json() as { runState?: string; nextManualRefreshIso?: string | null }
        if (data.runState === 'recentlyAttempted') {
          setVedurstofanRefreshState('recentlyAttempted')
          if (data.nextManualRefreshIso) setNextManualRefreshIso(data.nextManualRefreshIso)
        } else if (data.runState === 'running') {
          setVedurstofanRefreshState('running')
        }
      } catch {
        // best-effort
      }
    })()
  }, [step, showVedurstofan]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for newer Veðurstofan data every 90 s while result is open and tab is visible.
  // Stops polling once a newer atime is detected (notification shown) or provider is off.
  useEffect(() => {
    if (step !== 'result' || !showVedurstofan || newerVedurstofanAvailable) return
    const poll = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const knownAtime = knownVedurstofanAtimeRef.current
      if (!knownAtime) return
      try {
        const res = await fetch('/api/teskeid/weather/vedurstofan/freshness')
        if (!res.ok) return
        const data = await res.json() as { atimeIso: string | null; runState?: string; nextManualRefreshIso?: string | null }
        if (data.atimeIso && data.atimeIso > knownAtime) {
          setNewerVedurstofanAvailable(true)
        }
        // Also update run state so cooldown expires without full reload.
        if (data.runState === 'recentlyAttempted') {
          setVedurstofanRefreshState('recentlyAttempted')
          if (data.nextManualRefreshIso) setNextManualRefreshIso(data.nextManualRefreshIso)
        } else if (data.runState === 'running') {
          setVedurstofanRefreshState('running')
        } else if (data.runState === 'available' || data.runState === 'alreadyFresh') {
          setVedurstofanRefreshState(prev =>
            prev === 'recentlyAttempted' || prev === 'running' ? 'idle' : prev
          )
        }
      } catch {
        // best-effort
      }
    }
    const id = setInterval(poll, 90_000)
    return () => clearInterval(id)
  }, [step, showVedurstofan, newerVedurstofanAvailable]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetches the Veðurstofan layer after the user taps "Uppfæra mat".
  // Data is already fresh in the DB (that's how polling detected it), so no warm needed.
  async function handleUpdateVedurstofan() {
    setNewerVedurstofanAvailable(false)
    setVedurstofanRefreshState('refreshing')
    try {
      const res = await fetch('/api/teskeid/weather/travel', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin,
          destination: ferrySelection?.ferryPort ?? destination,
          trailerKind,
          selectedRouteId: selectedRouteId ?? undefined,
          thresholdOverrides: Object.keys(thresholdOverrides).length > 0 ? thresholdOverrides : undefined,
        }),
      })
      if (res.ok) {
        const data = await res.json() as { vedurstofanLayer?: VedurstofanTravelLayer }
        const newLayer = data.vedurstofanLayer ?? null
        if (newLayer) setVedurstofanLayer(newLayer)
        setVedurstofanRefreshState(
          isVedurstofanCycleFresh(newLayer?.layerAtimeIso ?? null, new Date()) ? 'fresh' : 'stillStale'
        )
      } else {
        setVedurstofanRefreshState('failed')
      }
    } catch {
      setVedurstofanRefreshState('failed')
    }
  }

  function handleThresholdSubmit() {
    const defaults = resolveThresholds('none')
    const cautionWind = parseFloat(draftCautionWind)
    const redWind = parseFloat(draftRedWind)
    // Gust and precipitation thresholds are neutralised in this phase —
    // set to high values so they never influence the visible assessment.
    const redGust = 100
    const cautionPrecip = 100

    // Require both fields to be explicitly filled
    if (draftCautionWind.trim() === '' || draftRedWind.trim() === '') {
      setThresholdError(tf('thresholdRequiredError'))
      return
    }

    if (
      isNaN(cautionWind) || cautionWind < 0 || cautionWind > 40 ||
      isNaN(redWind) || redWind < 0 || redWind > 40
    ) {
      setThresholdError(tf('thresholdValidationError'))
      return
    }

    const orderError = validateResolvedThresholdOrdering({ cautionWindMs: cautionWind, redWindMs: redWind, redGustMs: redGust, cautionPrecipMmPerHour: cautionPrecip })
    if (orderError) {
      setThresholdError(tf('thresholdOrderError'))
      return
    }
    setThresholdError(null)

    const overrides: TravelThresholdOverrides = {}
    if (cautionWind !== defaults.cautionWindMs) overrides.cautionWindMs = cautionWind
    if (redWind !== defaults.redWindMs) overrides.redWindMs = redWind
    overrides.redGustMs = redGust
    overrides.cautionPrecipMmPerHour = cautionPrecip

    setThresholdOverrides(overrides)
    handleSubmit(overrides)
  }


  // Select first outbound slot by default when a new result arrives
  useEffect(() => {
    if (!result) return
    const candidates = result.travelPlan?.outbound.windowMode
      ? (result.travelPlan.outbound.candidates ?? [])
      : (result.travelPlan?.outbound.timelineCandidates ?? [])
    setSelectedHeatmapIdx(candidates.length > 0 ? 0 : null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.id])

  // Auto-select when outbound filter changes and selected slot is no longer visible
  useEffect(() => {
    if (outboundDisplayCandidates.length === 0) return
    if (outboundVisibleStatuses.size === 0) return  // no filter active, show all
    // Resolve the display status for a slot using combined provider statuses when available
    const getSlotStatus = (c: TravelCandidate, idx: number): WindDisplayStatus => {
      const combined = combinedSlotStatusesRef.current
      if (combined && idx >= 0 && idx < combined.length) return combined[idx]
      return classifyCandidateWindDisplayStatus(c, effectiveThresholds)
    }
    // Skip if selected slot is still visible
    if (selectedHeatmapIdx !== null) {
      const sel = outboundDisplayCandidates[selectedHeatmapIdx]
      if (sel && outboundVisibleStatuses.has(getSlotStatus(sel, selectedHeatmapIdx))) return
    }
    const visible = (c: TravelCandidate, i: number) => outboundVisibleStatuses.has(getSlotStatus(c, i))
    let next = -1
    for (const priority of WIND_DISPLAY_STATUS_PRIORITY_ORDER) {
      const idx = outboundDisplayCandidates.findIndex((c, i) => visible(c, i) && getSlotStatus(c, i) === priority)
      if (idx >= 0) { next = idx; break }
    }
    if (next < 0) next = outboundDisplayCandidates.findIndex((c, i) => visible(c, i))
    setSelectedHeatmapIdx(next >= 0 ? next : null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outboundVisibleStatuses])

  // Auto-select when return filter changes and selected slot is no longer visible
  useEffect(() => {
    if (returnCandidates.length === 0) return
    if (returnVisibleStatuses.size === 0) return  // no filter active, show all
    // Skip if selected slot is still visible
    if (selectedReturnHeatmapIdx !== null) {
      const sel = returnCandidates[selectedReturnHeatmapIdx]
      if (sel) {
        const st = classifyCandidateWindDisplayStatus(sel, effectiveThresholds)
        if (returnVisibleStatuses.has(st)) return
      }
    }
    const visible = (c: TravelCandidate) => returnVisibleStatuses.has(classifyCandidateWindDisplayStatus(c, effectiveThresholds))
    let next = -1
    for (const priority of WIND_DISPLAY_STATUS_PRIORITY_ORDER) {
      const idx = returnCandidates.findIndex(c => visible(c) && classifyCandidateWindDisplayStatus(c, effectiveThresholds) === priority)
      if (idx >= 0) { next = idx; break }
    }
    if (next < 0) next = returnCandidates.findIndex(visible)
    setSelectedReturnHeatmapIdx(next >= 0 ? next : null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnVisibleStatuses])

  const trailerOptions: Array<{ value: TrailerKindValue; label: string }> = [
    { value: 'none', label: tf('trailerNone') },
    { value: 'caravan', label: tf('trailerCaravan') },
    { value: 'tent_trailer', label: tf('trailerTent') },
    { value: 'folding_camper', label: tf('trailerFolding') },
    { value: 'horse_trailer', label: tf('trailerHorse') },
    { value: 'generic_trailer', label: tf('trailerGeneric') },
  ]

  const trailerLabel = trailerOptions.find(o => o.value === trailerKind)?.label ?? ''
  const status = result?.stada
  const statusStyle = status ? STATUS_STYLES[status] : null

  // Heatmap candidates per leg
  const outboundCandidates = result?.travelPlan?.outbound.candidates ?? []
  const returnCandidates = result?.travelPlan?.return?.candidates ?? []

  // In single-departure mode use timelineCandidates for the scrubber; window mode uses candidates
  const outboundDisplayCandidates = result?.travelPlan?.outbound.windowMode
    ? outboundCandidates
    : (result?.travelPlan?.outbound.timelineCandidates ?? [])

  // Selecting one leg clears the other so at most one is active at a time.
  // Both handlers set userExplicitSlot so RoutePointRow enters active-candidate mode.
  function handleOutboundSelect(idx: number | null) {
    setSelectedHeatmapIdx(idx)
    if (idx !== null) setSelectedReturnHeatmapIdx(null)
    setUserExplicitSlot(idx !== null)
    setMapSelectionSignal(s => s + 1)
  }
  function handleReturnSelect(idx: number | null) {
    setSelectedReturnHeatmapIdx(idx)
    if (idx !== null) setSelectedHeatmapIdx(null)
    setUserExplicitSlot(idx !== null)
  }

  // Route distance in meters — needed to flip distances for return leg
  const routeDistanceM = result ? Math.round(result.travelPlan!.route.distanceKm * 1000) : undefined

  // Coverage end date — last candidate in the outbound scrubber
  const coverageEndDate = outboundDisplayCandidates.length > 0
    ? outboundDisplayCandidates[outboundDisplayCandidates.length - 1].departureIso
    : undefined

  const thresholdsUsed = result?.travelPlan?.thresholdsUsed
  // When a scrubber slot is selected, use only that candidate's issue (undefined for green slots).
  // Fall back to result-level highlightedIssue only when no slot is selected.
  const heatmapHighlightedIssue =
    selectedReturnHeatmapIdx !== null && returnCandidates[selectedReturnHeatmapIdx]
      ? candidateToIssue(returnCandidates[selectedReturnHeatmapIdx], 'return', { routeDistanceM, legStartName: effectiveDestinationName, thresholdsUsed })
    : selectedHeatmapIdx !== null && outboundDisplayCandidates[selectedHeatmapIdx]
      ? candidateToIssue(outboundDisplayCandidates[selectedHeatmapIdx], 'outbound', { legStartName: origin?.name, thresholdsUsed })
    : result?.travelPlan?.highlightedIssue

  const selectedCandidatePointStatuses: CandidatePointStatus[] | undefined =
    selectedReturnHeatmapIdx !== null
      ? (returnCandidates[selectedReturnHeatmapIdx]?.pointStatuses ?? [])
    : selectedHeatmapIdx !== null
      ? (outboundDisplayCandidates[selectedHeatmapIdx]?.pointStatuses ?? [])
    : undefined

  // Active candidate for dynamic ETA computation
  const activeOutboundCandidate = selectedHeatmapIdx !== null
    ? outboundDisplayCandidates[selectedHeatmapIdx]
    : result?.travelPlan?.outbound.leavingAt
  const activeReturnCandidate = selectedReturnHeatmapIdx !== null
    ? returnCandidates[selectedReturnHeatmapIdx]
    : undefined
  const activeCandidate = activeReturnCandidate ?? activeOutboundCandidate
  const activeLeg: 'outbound' | 'return' = activeReturnCandidate ? 'return' : 'outbound'

  // Map visibility: independent from scrubber filters (return leg out of scope for now)
  const mapVisibleStatuses = mapOutboundVisibleStatuses

  // Threshold dirty: user has changed thresholds since last submitted result
  const thresholdsDirty = result !== null && submittedThresholds !== null && (() => {
    if (JSON.stringify(thresholdOverrides) !== JSON.stringify(submittedThresholds)) return true
    // On the thresholds step, also check if draft wind inputs differ from submitted resolved values
    if (step === 'thresholds') {
      const submittedResolved = resolveThresholds('none', submittedThresholds)
      const dCaution = parseFloat(draftCautionWind)
      const dRed = parseFloat(draftRedWind)
      if (!isNaN(dCaution) && dCaution !== submittedResolved.cautionWindMs) return true
      if (!isNaN(dRed) && dRed !== submittedResolved.redWindMs) return true
    }
    return false
  })()

  const effectiveThresholds = resolveThresholds('none', thresholdOverrides)

  // Whether visible draft wind values differ from defaults (controls reset button visibility)
  const thresholdDraftDiffersFromDefaults = (() => {
    const defaults = resolveThresholds('none')
    const c = parseFloat(draftCautionWind), r = parseFloat(draftRedWind)
    if ([c, r].some(Number.isNaN)) return Object.keys(thresholdOverrides).length > 0
    return c !== defaults.cautionWindMs || r !== defaults.redWindMs
  })()

  // Compact threshold values for the step nav — reflect live drafts while on the step.
  // Computed as a single object so visual content and sr-only text always use the same values.
  const navThreshValues = (() => {
    if (step === 'thresholds') {
      const c = parseFloat(draftCautionWind), r = parseFloat(draftRedWind)
      if (!isNaN(c) && !isNaN(r)) return { caution: c, red: r }
    }
    return { caution: effectiveThresholds.cautionWindMs, red: effectiveThresholds.redWindMs }
  })()
  // Show numeric values only once the user has explicitly submitted thresholds.
  // While on the step, show live draft values. Before any submission, show placeholder.
  const navThreshWind = (() => {
    if (step === 'thresholds') {
      const c = parseFloat(draftCautionWind), r = parseFloat(draftRedWind)
      if (!isNaN(c) && !isNaN(r)) return `${c}/${r}`
      return null
    }
    if (submittedThresholds === null) return null
    return `${navThreshValues.caution}/${navThreshValues.red}`
  })()

  const mvpNavSteps = [
    { step: 'route' as WizardStep, label: tf('stepNavRoute'), Icon: Route },
    { step: 'thresholds' as WizardStep, label: tf('stepNavThresholds'), Icon: SlidersHorizontal },
    { step: 'result' as WizardStep, label: tf('stepNavResult'), Icon: CheckCircle2 },
  ]

  const compareOriginRows = result?.travelPlan?.routeWeatherPoints?.find(p => p.isOrigin)?.forecastRows ?? []
  const compareDestRows = result?.travelPlan?.destinationForecastRows ?? []
  const compareThresholds = result?.travelPlan?.thresholdsUsed
  const comparisonCols: CompareCol[] = (compareOriginRows.length > 0 && compareDestRows.length > 0)
    ? buildCompareColumns(compareOriginRows, compareDestRows, [12], locale, 5)
    : []

  // Generic provider model — ready for Vegagerðin without another prop-level rewrite
  const selectedWeatherProviders: Record<WeatherProviderKey, boolean> = {
    metno: showMetno,
    vedurstofan: showVedurstofan,
    vegagerdin: false,
  }
  const activeProviderKeys = (Object.keys(selectedWeatherProviders) as WeatherProviderKey[])
    .filter(k => selectedWeatherProviders[k])
  const hasNoActiveProvider = activeProviderKeys.length === 0
  const isMetnoOnly = showMetno && !showVedurstofan
  const isVedurstofanOnly = !showMetno && showVedurstofan

  // Provider-aware active MET/Yr points
  const routeWeatherPoints = result?.travelPlan?.routeWeatherPoints ?? []
  const activeMetnoPoints = showMetno ? routeWeatherPoints : []

  // Provider-neutral reference departure — does not use MET/Yr best-window leavingAt in Veðurstofan-only mode
  const referenceDepartureIso: string | null =
    (selectedHeatmapIdx !== null
      ? outboundDisplayCandidates[selectedHeatmapIdx]?.departureIso
      : null)
    ?? outboundDisplayCandidates[0]?.departureIso
    ?? result?.travelPlan?.outbound.leavingAt?.departureIso
    ?? null
  const referenceArrivalIso: string | null =
    (selectedHeatmapIdx !== null
      ? (outboundDisplayCandidates[selectedHeatmapIdx]?.arrivalIso ?? null)
      : null)
    ?? outboundDisplayCandidates[0]?.arrivalIso
    ?? result?.travelPlan?.outbound.leavingAt?.arrivalIso
    ?? null

  // ETA-aware Veðurstofan assessments for the reference departure
  const vedurstofanAssessments: VedurstofanAssessment[] =
    (showVedurstofan && vedurstofanLayer && referenceDepartureIso && referenceArrivalIso)
      ? computeVedurstofanAssessments(
          referenceDepartureIso,
          referenceArrivalIso,
          vedurstofanLayer.points,
          effectiveThresholds,
        )
      : []

  // Worst Veðurstofan station at reference departure
  const worstVedurstofanData: VedurstofanAssessment | null = vedurstofanAssessments.reduce<VedurstofanAssessment | null>(
    (b, a) => (!b || (a.windMs ?? 0) > (b.windMs ?? 0)) ? a : b,
    null,
  )

  // Per-slot Veðurstofan status for the departure scrubber
  const vedurstofanSlotStatuses: WindDisplayStatus[] | null =
    (showVedurstofan && vedurstofanLayer && outboundDisplayCandidates.length > 0)
      ? outboundDisplayCandidates.map(slot => {
          if (!slot.arrivalIso) return 'no_data' as WindDisplayStatus
          const assessments = computeVedurstofanAssessments(
            slot.departureIso, slot.arrivalIso,
            vedurstofanLayer!.points, effectiveThresholds,
          )
          return assessments.reduce<WindDisplayStatus>(
            (worst, a) => worstWindDisplayStatus(worst, a.status),
            'no_data',
          )
        })
      : null

  // Combined slot statuses: worst across all selected providers — drives scrubber and auto-select.
  // null when MET/Yr is the only selected provider (DepartureHeatmap handles it natively).
  const combinedSlotStatuses: WindDisplayStatus[] | null = (() => {
    if (hasNoActiveProvider || isMetnoOnly) return null
    if (outboundDisplayCandidates.length === 0) return null
    return outboundDisplayCandidates.map((slot, idx) => {
      const vedurStatus: WindDisplayStatus = (showVedurstofan && vedurstofanSlotStatuses)
        ? (vedurstofanSlotStatuses[idx] ?? 'no_data')
        : 'no_data'
      if (isVedurstofanOnly) return vedurStatus
      // Both providers: worst of MET/Yr and Veðurstofan
      const metnoStatus = classifyCandidateWindDisplayStatus(slot, effectiveThresholds)
      return worstWindDisplayStatus(metnoStatus, vedurStatus)
    })
  })()
  // Keep ref in sync so auto-select effect can read it without adding it to dep array
  combinedSlotStatusesRef.current = combinedSlotStatuses

  // In both-provider mode: which provider is decisive for the reference slot summary?
  // Uses selectDecisiveProvider (lib/weather/providerComparator) for the v141 tie-break rule.
  const combinedDecisiveProvider: WeatherProviderKey | null = (() => {
    if (!showMetno || !showVedurstofan) return null
    if (!worstVedurstofanData || !activeOutboundCandidate) return null
    const vedurstofanDs = worstVedurstofanData.status
    if (vedurstofanDs === 'no_data') return null
    const metnoDs = classifyCandidateWindDisplayStatus(activeOutboundCandidate, effectiveThresholds)
    const decisive = selectDecisiveProvider(
      { provider: 'vedurstofan', status: vedurstofanDs, windMs: worstVedurstofanData.windMs },
      { provider: 'metno', status: metnoDs, windMs: activeOutboundCandidate.worstWind?.value ?? null },
    )
    return decisive.provider
  })()

  // Provider overlay map points (status-colored, generic shape for all non-MET/Yr providers)
  const providerOverlayPoints: ProviderMapPoint[] = vedurstofanAssessments.map(a => ({
    provider: 'vedurstofan' as WeatherProviderKey,
    lat: a.station.lat!,
    lon: a.station.lon!,
    id: a.station.stationId,
    label: a.station.stationName,
    status: a.status,
    windMs: a.windMs,
    forecastTimeIso: a.ftimeIso,
    etaIso: a.etaIso,
  }))

  // Veðurstofan-only status for the summary (WindDisplayStatus, not WeatherStatus literals)
  const vedurstofanOnlyDisplayStatus: WindDisplayStatus | null =
    isVedurstofanOnly ? (worstVedurstofanData?.status ?? null) : null

  // Veðurstofan banner values
  const layerAtimeIso = vedurstofanLayer?.layerAtimeIso ?? null
  const lastWarmAttemptIso = vedurstofanLayer?.lastWarmAttemptIso ?? null
  const isVedurstofanDataFresh = isVedurstofanCycleFresh(layerAtimeIso, new Date())
  const nextExpectedAfterDataIso = layerAtimeIso ? getNextCycleAfterAtimeIso(layerAtimeIso) : null
  // Only say "was expected" when data is stale — during grace window it still sounds fresh.
  const nextExpectedIsPast = !isVedurstofanDataFresh && nextExpectedAfterDataIso
    ? Date.parse(nextExpectedAfterDataIso) < Date.now()
    : false
  // returnTo passed to Veðurstofan point cards for the pulse login CTA.
  // sessionStorage restores automatically on mount — no ?restore=1 needed.
  const vedurstofanReturnTo = (step === 'result' && result)
    ? '/auth-mvp/vedrid'
    : undefined

  // Show refresh button when data is stale, except while refreshing/running/fresh/cooldown.
  // stillStale also hides the button — the warm attempt just happened and needs a cooldown.
  // Public/guest users cannot call the refresh endpoint, so hide the button entirely for them.
  const showVedurstofanRefreshButton = !isGuest
    && !isVedurstofanDataFresh
    && vedurstofanRefreshState !== 'refreshing'
    && vedurstofanRefreshState !== 'fresh'
    && vedurstofanRefreshState !== 'running'
    && vedurstofanRefreshState !== 'recentlyAttempted'
    && vedurstofanRefreshState !== 'stillStale'

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-lg mx-auto px-4 pt-8 pb-10 flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2">
            <CloudSun size={20} className="text-primary" aria-hidden />
            <h1 className="text-lg font-semibold text-primary">{t('title')}</h1>
          </div>
          <TeskeidMenu variant={isGuest ? 'public' : 'authenticated'} />
        </div>

        {/* Beta banner — visible on all wizard steps */}
        <WeatherBetaBanner />

        {/* New Veðurstofan data notification — shown when polling detects a newer forecast cycle */}
        {step === 'result' && showVedurstofan && newerVedurstofanAvailable && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 flex items-center justify-between gap-3">
            <p className="text-xs text-foreground">{tf('vedurstofanNewDataAvailable')}</p>
            <button
              type="button"
              onClick={handleUpdateVedurstofan}
              className="text-xs font-medium text-primary underline underline-offset-2 shrink-0"
            >
              {tf('vedurstofanUpdateAssessment')}
            </button>
          </div>
        )}

        {/* Veðurstofan freshness banner — shown when Veðurstofan is active and we have layer data */}
        {step === 'result' && showVedurstofan && vedurstofanLayer && layerAtimeIso && (
          <div className={[
            'rounded-lg border px-3 py-2 flex flex-col gap-1',
            !isVedurstofanDataFresh
              ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40'
              : 'border-border/60 bg-muted/30',
          ].join(' ')}>
            {/* Stale headline */}
            {!isVedurstofanDataFresh && (
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                {tf('vedurstofanDataStale')}
              </p>
            )}
            {/* Data provenance line */}
            <p className={`text-xs ${isVedurstofanDataFresh ? 'text-muted-foreground' : 'text-amber-900/80 dark:text-amber-300/80'}`}>
              {tf('vedurstofanBannerDataFrom', { time: formatKlTime(layerAtimeIso) })}
              {nextExpectedAfterDataIso && (
                <span>
                  {' · '}{tf(
                    nextExpectedIsPast ? 'vedurstofanBannerNextExpectedPast' : 'vedurstofanBannerNextExpectedFuture',
                    { time: formatKlTime(nextExpectedAfterDataIso) }
                  )}
                </span>
              )}
              {!isVedurstofanDataFresh && lastWarmAttemptIso && (
                <span className="opacity-70">
                  {' · '}{tf('vedurstofanBannerLastAttempted', { time: formatKlTime(lastWarmAttemptIso) })}
                </span>
              )}
            </p>
            {/* Refresh action / status */}
            {vedurstofanRefreshState === 'refreshing' && (
              <p className="text-xs text-amber-800 dark:text-amber-300">{tf('vedurstofanRefreshing')}</p>
            )}
            {vedurstofanRefreshState === 'running' && (
              <p className="text-xs text-amber-800 dark:text-amber-300">{tf('vedurstofanRefreshRunning')}</p>
            )}
            {vedurstofanRefreshState === 'fresh' && (
              <p className="text-xs text-green-700 dark:text-green-400 font-medium">{tf('vedurstofanRefreshFresh')}</p>
            )}
            {vedurstofanRefreshState === 'stillStale' && (
              <>
                <p className="text-xs text-amber-800 dark:text-amber-300">{tf('vedurstofanRefreshStillStale')}</p>
                {nextManualRefreshIso && (
                  <p className="text-xs text-muted-foreground">{tf('vedurstofanRecentlyAttemptedUntil', { time: formatKlTime(nextManualRefreshIso) })}</p>
                )}
              </>
            )}
            {vedurstofanRefreshState === 'failed' && (
              <p className="text-xs text-destructive">{tf('vedurstofanRefreshFailed')}</p>
            )}
            {vedurstofanRefreshState === 'recentlyAttempted' && nextManualRefreshIso && (
              <p className="text-xs text-muted-foreground">{tf('vedurstofanRecentlyAttemptedUntil', { time: formatKlTime(nextManualRefreshIso) })}</p>
            )}
            {showVedurstofanRefreshButton && (
              <button
                type="button"
                onClick={handleRefreshVedurstofan}
                className="self-start text-xs font-medium text-amber-800 dark:text-amber-300 underline underline-offset-2"
              >
                {tf('vedurstofanRefreshButton')}
              </button>
            )}
          </div>
        )}

        {/* Step navigation — only show on main wizard steps, not the assumptions side-step */}
        {STEP_ORDER.includes(step) && (
          <nav aria-label={tf('stepNavAriaLabel')} className="flex items-start gap-0">
            {mvpNavSteps.map((s) => {
              const sIdx = STEP_ORDER.indexOf(s.step)
              const curIdx = STEP_ORDER.indexOf(step)
              const isCompleted = sIdx < curIdx
              const isCurrent = sIdx === curIdx
              const canReturn = s.step === 'result' && result !== null && !thresholdsDirty
              const canNavigate = isCompleted || canReturn
              return (
                <button
                  key={s.step}
                  type="button"
                  disabled={!canNavigate}
                  onClick={() => {
                    if (isCompleted) { setStep(s.step) }
                    else if (canReturn) { setStep('result') }
                  }}
                  aria-current={isCurrent ? 'step' : undefined}
                  title={s.step === 'result' && result !== null && thresholdsDirty ? tf('thresholdsDirtyNavHint') : undefined}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default ${
                    isCurrent
                      ? 'text-primary'
                      : canNavigate
                        ? 'text-primary/50 hover:text-primary/80'
                        : 'text-muted-foreground/30'
                  }`}
                >
                  {s.step === 'route' && (isCompleted || isCurrent) && origin && destination ? (
                    <>
                      <span className="text-[10px] leading-none truncate max-w-full font-medium">{origin.name}</span>
                      <span className="text-[10px] leading-none truncate max-w-full">{effectiveDestinationName || destination.name}</span>
                    </>
                  ) : s.step === 'thresholds' && (isCompleted || isCurrent) ? (
                    <>
                      <span className="sr-only">
                        {navThreshWind !== null ? tf('stepNavThresholdSummaryAria', navThreshValues) : tf('navThreshChooseLimits')}
                      </span>
                      <span aria-hidden className="flex items-center gap-0.5">
                        <Wind size={10} />
                        <span className="text-[10px] leading-none">{navThreshWind ?? tf('navThreshChooseLimits')}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <s.Icon size={16} aria-hidden />
                      <span className="text-[10px] leading-none truncate max-w-full">{s.label}</span>
                    </>
                  )}
                  {isCurrent && <span className="w-1 h-1 rounded-full bg-primary" aria-hidden />}
                </button>
              )
            })}
          </nav>
        )}

        {/* Step: Route */}
        {step === 'route' && (
          <div className="flex flex-col gap-4">
            {/* Guest added-value hint — subtle, secondary affordance, not a blocking banner */}
            {isGuest && !guestRateLimited && (
              <div className="rounded-xl border border-border px-4 py-3 flex flex-col gap-1.5">
                <p className="text-sm text-muted-foreground leading-snug">{tf('guestHint')}</p>
                <Link
                  href="/innskraning"
                  className="self-start text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  {tf('guestSignIn')}
                </Link>
              </div>
            )}
            {/* Guest rate limit reached */}
            {guestRateLimited ? (
              <div className="rounded-xl border border-border px-4 py-4 flex flex-col gap-3">
                <p className="text-sm text-foreground leading-snug">{tf('errorGuestRateLimited')}</p>
                <Link
                  href="/innskraning"
                  className="self-start text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  {tf('guestSignIn')}
                </Link>
              </div>
            ) : (
              <RouteSelectionStep
                origin={origin}
                destination={destination}
                onOriginSelected={handleOriginSelected}
                onDestinationSelected={handleDestinationSelected}
                onClearOrigin={() => setOrigin(null)}
                onClearDestination={() => { setDestination(null); setFerrySelection(null) }}
                routeOptions={routeOptions}
                routeOptionsLoading={routeOptionsLoading}
                routeOptionsError={routeOptionsError}
                onRetryRoutes={() => setRouteRetryCount(c => c + 1)}
                routeFallback={routeFallback}
                onUseFallback={() => setRouteFallback(true)}
                selectedRouteId={selectedRouteId}
                onRouteSelected={(id) => {
                  setSelectedRouteId(id)
                  try { sessionStorage.removeItem(ROUTE_RESTORE_KEY) } catch {}
                }}
                onConfirm={() => goNext('route')}
                confirmLabel={routeFallback ? tf('routeConfirmFallback') : tf('routeConfirmSelected')}
                confirmDisabled={!origin || !destination || (!selectedRouteId && !routeFallback)}
                isVestmannaeyjar={isVestmannaeyjar}
                ferryPortId={ferrySelection?.ferryPortId ?? null}
                onFerryPortSelected={handleFerryPortSelected}
                ferryFinalDestinationName={ferrySelection?.finalDestination.name ?? destination?.name ?? null}
                savedPlaces={savedPlaces}
                onDeleteSavedPlace={handleDeleteSavedPlace}
              />
            )}
          </div>
        )}

        {/* Step: Trailer */}
        {/* Step: Thresholds */}
        {step === 'thresholds' && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">{tf('stepThresholdsTitle')}</p>
              <p className="text-xs text-muted-foreground mt-1">{tf('thresholdsSubtitle')}</p>
            </div>
            <div className="flex flex-col gap-3">
              <ThresholdInput id="caution-wind" label={tf('thresholdCautionWind')} unit="m/s" value={draftCautionWind} onChange={setDraftCautionWind} />
              <ThresholdInput id="red-wind" label={tf('thresholdRedWind')} unit="m/s" value={draftRedWind} onChange={setDraftRedWind} />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{tf('thresholdGustCautionNote')}</p>
            {thresholdError && (
              <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
                {thresholdError}
              </p>
            )}
            <div className="flex gap-2">
              <BackButton onClick={() => goBack('thresholds')} label={tf('back')} />
              <button
                type="button"
                onClick={handleThresholdSubmit}
                disabled={loading || draftCautionWind.trim() === '' || draftRedWind.trim() === ''}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium shadow-sm cursor-pointer hover:shadow-md hover:opacity-95 active:opacity-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed"
              >
                {loading ? tf('submitting') : (draftCautionWind.trim() === '' || draftRedWind.trim() === '') ? tf('thresholdNotReadyLabel') : tf('thresholdSubmit')}
              </button>
            </div>
          </div>
        )}

        {/* Step: Result */}
        {step === 'result' && (
          <div className="flex flex-col gap-4">
            {origin && destination && (
              <RouteSummary
                originName={origin.name}
                destinationName={effectiveDestinationName}
                distanceKm={result?.travelPlan?.route.distanceKm}
                durationMinutes={result?.travelPlan?.route.durationMinutes}
              />
            )}

            {/* Back button on error */}
            {!loading && error && (
              <BackButton onClick={() => goBack('result')} label={tf('back')} />
            )}

            {loading && (
              <WeatherResultLoader
                title={tf('resultLoadingTitle')}
                bullets={[
                  tf('resultLoadingBullet1'),
                  tf('resultLoadingBullet2'),
                ]}
                routeLabel={
                  origin && destination
                    ? `${origin.name} \u2192 ${destination.name}`
                    : undefined
                }
              />
            )}

            {guestRateLimited && !loading && !result && (
              <div className="rounded-xl border border-border px-4 py-4 flex flex-col gap-3">
                <p className="text-sm text-foreground leading-snug">{tf('errorGuestRateLimited')}</p>
                <Link
                  href="/innskraning"
                  className="self-start text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  {tf('guestSignIn')}
                </Link>
              </div>
            )}
            {error && !loading && !guestRateLimited && (
              <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            {/* Combined card — title, scrubber, status sentence, coverage, disclaimer */}
            {result && !loading && (() => {
              // Map WindDisplayStatus to the coarser WeatherStatus for the summary badge style
              const toWeatherStatus = (st: WindDisplayStatus): WeatherStatus | null => {
                if (st === 'haettulegt' || st === 'nalgast-haettumork') return 'rautt'
                if (st === 'othaegilegt' || st === 'nalgast-othaegindi') return 'gult'
                if (st === 'no_data') return null
                return 'graent'
              }
              // Reflect the worst selected-provider status in the card badge (v141: selected providers aggregate)
              const selectedSlotIdx = selectedHeatmapIdx ?? 0
              const selectedCombinedStatus = combinedSlotStatuses && selectedSlotIdx >= 0 && selectedSlotIdx < combinedSlotStatuses.length
                ? combinedSlotStatuses[selectedSlotIdx]
                : null
              const derivedStatus: WeatherStatus | null = hasNoActiveProvider
                ? null
                : selectedCombinedStatus
                  ? toWeatherStatus(selectedCombinedStatus)
                  : (activeOutboundCandidate?.status ?? result.stada)
              const derivedStyle = derivedStatus ? STATUS_STYLES[derivedStatus] : null
              // Compute fine-grained wind distance label for display (MET/Yr mode)
              const worstWind = activeOutboundCandidate?.worstWind?.value ?? 0
              const windLabel: WindDistanceLabel = classifyWindDistance(
                worstWind,
                effectiveThresholds.cautionWindMs,
                effectiveThresholds.redWindMs,
              )
              const windMeta = WIND_STATUS_META_SHARED[windLabel]
              return (
                <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">

                  {/* Provider filter — only visible when Veðurstofan layer is available */}
                  {vedurstofanLayer && (
                    <div className="flex flex-col gap-2 pb-1 border-b border-border/60">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{tf('providerFilterTitle')}</p>
                      <div className="grid grid-cols-3 gap-2">

                        {/* met.no tile */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={showMetno}
                          aria-label={tf('providerMetnoLabel')}
                          onClick={() => setShowMetno(v => !v)}
                          className={[
                            'flex flex-col gap-1 rounded-lg border p-2 min-h-[72px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors',
                            showMetno ? 'border-primary/40 bg-primary/5' : 'border-border',
                          ].join(' ')}
                        >
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground leading-none">{tf('providerGroupVerified')}</span>
                          <span className="text-[11px] font-medium text-foreground leading-tight">{tf('providerMetnoLabel')}</span>
                          <span className="text-[10px] text-muted-foreground leading-tight">{tf('providerMetnoHelperText')}</span>
                          <span className={['relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors mt-auto', showMetno ? 'bg-primary' : 'bg-input'].join(' ')}>
                            <span className={['pointer-events-none inline-block h-3 w-3 rounded-full bg-background shadow-lg ring-0 transition-transform', showMetno ? 'translate-x-3' : 'translate-x-0'].join(' ')} />
                          </span>
                        </button>

                        {/* Veðurstofan tile */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={showVedurstofan}
                          aria-label={tf('providerVedurstofanLabel')}
                          onClick={toggleVedurstofan}
                          className={[
                            'flex flex-col gap-1 rounded-lg border p-2 min-h-[72px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors',
                            showVedurstofan ? 'border-primary/40 bg-primary/5' : 'border-border',
                          ].join(' ')}
                        >
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground leading-none">{tf('providerGroupTesting')}</span>
                          <span className="text-[11px] font-medium text-foreground leading-tight">{tf('providerVedurstofanLabel')}</span>
                          <span className={['relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors mt-auto', showVedurstofan ? 'bg-primary' : 'bg-input'].join(' ')}>
                            <span className={['pointer-events-none inline-block h-3 w-3 rounded-full bg-background shadow-lg ring-0 transition-transform', showVedurstofan ? 'translate-x-3' : 'translate-x-0'].join(' ')} />
                          </span>
                        </button>

                        {/* Vegagerðin tile — disabled, links to umferdin.is */}
                        <div className="flex flex-col gap-1 rounded-lg border border-border p-2 min-h-[72px] opacity-40" aria-disabled="true">
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground leading-none">{tf('providerGroupUpcoming')}</span>
                          <a
                            href="https://umferdin.is/"
                            target="_blank"
                            rel="noopener noreferrer"
                            tabIndex={-1}
                            className="text-[11px] font-medium text-foreground leading-tight underline underline-offset-2 w-fit"
                          >
                            {tf('providerVegagerdinLabel')}
                          </a>
                          <span className="relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent bg-input mt-auto" aria-hidden>
                            <span className="pointer-events-none inline-block h-3 w-3 rounded-full bg-background shadow-lg ring-0 translate-x-0" />
                          </span>
                        </div>

                      </div>
                    </div>
                  )}

                  {/* No-provider state — toggles above remain visible so user can re-enable */}
                  {hasNoActiveProvider && (
                    <p className="text-sm text-muted-foreground py-2 text-center">
                      {tf('chooseWeatherProvider')}
                    </p>
                  )}

                  {/* Þín veðurmörk — threshold attention box */}
                  {!hasNoActiveProvider && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 dark:border-blue-800 dark:bg-blue-950/30">
                      <p className="text-[10px] font-semibold text-blue-900 dark:text-blue-200">{tf('thresholdBoxTitle')}</p>
                      <p className="text-xs text-blue-800 dark:text-blue-300 mt-0.5">
                        {tf('thresholdSummaryLine', { caution: effectiveThresholds.cautionWindMs, red: effectiveThresholds.redWindMs })}
                      </p>
                    </div>
                  )}

                  {/* Coverage text — at top so user knows the forecast scope before reading scrubber */}
                  {!hasNoActiveProvider && !isVedurstofanOnly && coverageEndDate && (
                    <p className="text-xs text-muted-foreground">
                      {tf('coverageTextUntilDate', { date: formatCoverageDate(coverageEndDate, locale) })}
                    </p>
                  )}

                  {/* Departure scrubber — MET/Yr or Veðurstofan-derived slot statuses */}
                  {!hasNoActiveProvider && outboundDisplayCandidates.length > 1 && (showMetno || showVedurstofan) && (
                    <DepartureHeatmap
                      candidates={outboundDisplayCandidates}
                      bestWindow={!isVedurstofanOnly && result.travelPlan!.outbound.windowMode ? result.travelPlan!.outbound.bestWindow : undefined}
                      originName={origin!.name}
                      selectedIdx={selectedHeatmapIdx}
                      onSelectIdx={handleOutboundSelect}
                      visibleStatuses={outboundVisibleStatuses}
                      onVisibleStatusesChange={setOutboundVisibleStatuses}
                      thresholdsUsed={!isVedurstofanOnly ? thresholdsUsed : undefined}
                      showSelectedDetail={false}
                      firstSlotLabel={!result.travelPlan!.outbound.windowMode ? tf('timelineNowLabel') : undefined}
                      slotStatusOverrides={combinedSlotStatuses ?? undefined}
                    />
                  )}

                  {/* ── Journey summary ── */}
                  {!hasNoActiveProvider && (isVedurstofanOnly ? referenceDepartureIso : activeOutboundCandidate) && (
                    <>
                      {/* Departure context line */}
                      <p className="text-sm text-foreground leading-snug">
                        {tf.rich('departureCalculationContext', {
                          departure: formatLongDepartureDateTime(
                            isVedurstofanOnly ? referenceDepartureIso! : activeOutboundCandidate!.departureIso,
                            locale,
                          ),
                          b: (chunks) => <strong className="font-semibold">{chunks}</strong>,
                          br: () => <br />,
                        })}
                      </p>
                      {!isVedurstofanOnly && ferrySelection && (
                        <p className="text-xs text-muted-foreground">
                          {tf('ferryResultNote', { portName: ferrySelection.ferryPort.name })}
                        </p>
                      )}
                      {!isVedurstofanOnly && result.travelPlan?.outbound.windowMode && result.travelPlan.outbound.bestWindow && (
                        <p className="text-xs text-muted-foreground">
                          {tf('bestWindowLabel')}: {formatWindowRange(result.travelPlan.outbound.bestWindow.fromIso, result.travelPlan.outbound.bestWindow.toIso, locale)}
                        </p>
                      )}
                      {!isVedurstofanOnly && result.travelPlan?.return?.bestWindow && (
                        <p className="text-xs text-muted-foreground">
                          {tf('returnWindowLabel')}: {formatWindowRange(result.travelPlan.return.bestWindow.fromIso, result.travelPlan.return.bestWindow.toIso, locale)}
                        </p>
                      )}

                      <div className="border-y border-border/70 divide-y divide-border/60">

                      {/* Á leiðinni */}
                      {derivedStyle && (() => {
                        // Veðurstofan decisive: both-provider mode when Veðurstofan is decisive, or Veðurstofan-only mode
                        if (
                          worstVedurstofanData &&
                          (isVedurstofanOnly || (showMetno && showVedurstofan && combinedDecisiveProvider === 'vedurstofan'))
                        ) {
                          return (
                            <VedurstofanPointCard
                              variant="compact"
                              station={worstVedurstofanData.station}
                              status={worstVedurstofanData.status}
                              etaIso={worstVedurstofanData.etaIso}
                              departureIso={referenceDepartureIso}
                              ftimeIso={worstVedurstofanData.ftimeIso}
                              windMs={worstVedurstofanData.windMs}
                              originName={origin?.name ?? ''}
                              returnTo={vedurstofanReturnTo}
                            />
                          )
                        }
                        if (!activeOutboundCandidate) return null
                        const dp = activeOutboundCandidate.displayPoint
                        const issue = heatmapHighlightedIssue
                        if (!dp && !issue) return null
                        const distKm = dp
                          ? Math.round(dp.distanceFromOriginM / 1000)
                          : issue?.distanceFromLegStartM !== undefined
                            ? Math.round(issue.distanceFromLegStartM / 1000)
                            : null
                        // ETA at the worst point: use departure/arrival times + routeFraction (outbound only)
                        const etaTimeLabel = dp ? (() => {
                          const depMs = new Date(activeOutboundCandidate.departureIso).getTime()
                          const durMs = new Date(activeOutboundCandidate.arrivalIso).getTime() - depMs
                          return formatKlTime(new Date(depMs + dp.routeFraction * durMs).toISOString())
                        })() : (issue?.timeIso ? formatKlTime(issue.timeIso) : null)
                        const originDisplay = getOriginDisplay(origin?.name ?? '', locale, tf('slotDetailOriginFallback'))
                        const metricLabel = issue?.metric === 'precipitation' ? tf('metricPrecip')
                          : issue?.metric === 'gust' ? tf('metricGust')
                          : tf('metricWind')
                        return (
                          <section className="grid grid-cols-[5.25rem_1fr] gap-3 py-3">
                            <p className="text-[11px] font-semibold text-muted-foreground pt-0.5">{tf('sectionOnWay')}</p>
                            <div className="space-y-1">
                              <WindStatusBadge status={windLabel} variant="line" />
                              {distKm !== null && etaTimeLabel && (
                                <p className="text-xs text-muted-foreground">
                                  {distKm === 0
                                    ? tf('slotDetailWorstAtStart', { time: etaTimeLabel })
                                    : tf('slotDetailWorstDistanceAt', { distance: distKm, origin: originDisplay, time: etaTimeLabel })}
                                </p>
                              )}
                              {dp ? (
                                <p className="text-xs text-muted-foreground">
                                  {tf('metricWind').toLowerCase()} {formatNum(dp.windMs, locale)} m/s{' · '}
                                  {tf('metricPrecip').toLowerCase()} {formatNum(dp.precipMmPerHour, locale)} mm/klst{' · '}
                                  {tf('metricTemp').toLowerCase()} {formatNum(dp.airTemperatureC, locale)}°C
                                </p>
                              ) : issue?.value !== undefined && (
                                <p className="text-xs text-muted-foreground">
                                  {tf('slotDetailMetricLine', { metric: metricLabel.toLowerCase(), value: `${formatNum(issue.value, locale)} ${issue.unit ?? ''}` })}
                                </p>
                              )}
                              <p className="text-[10px] text-muted-foreground/60">{tf('providerMetnoLabel')}</p>
                              <div className="mt-1 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                                {tf.rich('weatherDisclaimer', {
                                  link: (chunks) => (
                                    <a href="https://umferdin.is/" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
                                      {chunks}
                                    </a>
                                  ),
                                })}
                              </div>
                            </div>
                          </section>
                        )
                      })()}

                      {/* Áfangastaður — MET/Yr destination context; shown when any provider is active and arrival data exists */}
                      {!hasNoActiveProvider && activeOutboundCandidate?.arrivalWeather && (
                        <section className="grid grid-cols-[5.25rem_1fr] gap-3 py-3">
                          <p className="text-[11px] font-semibold text-muted-foreground pt-0.5">{tf('sectionDestination')}</p>
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">
                              {formatCompactDateTime(activeOutboundCandidate!.arrivalIso, locale)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {tf('arrivalForecastAtLabel', { forecastTime: formatKlTime(activeOutboundCandidate!.arrivalWeather!.forecastTimeIso) })}{' '}
                              {tf('metricWind').toLowerCase()} {formatNum(activeOutboundCandidate!.arrivalWeather!.windMs, locale)} m/s
                              {' · '}{tf('metricPrecip').toLowerCase()} {formatNum(activeOutboundCandidate!.arrivalWeather!.precipMmPerHour, locale)} mm/klst
                              {activeOutboundCandidate!.arrivalWeather!.airTemperatureC !== undefined && (
                                <> · {tf('metricTemp').toLowerCase()} {formatNum(activeOutboundCandidate!.arrivalWeather!.airTemperatureC, locale)}°C</>
                              )}
                            </p>
                            {result.travelPlan?.destinationForecastRows && result.travelPlan.destinationForecastRows.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setForecastDrawerData({
                                  rows: result.travelPlan!.destinationForecastRows!,
                                  title: tf('arrivalForecastTitle', { destination: effectiveDestinationName }),
                                  highlightedTimeIso: activeOutboundCandidate?.arrivalWeather?.forecastTimeIso,
                                  yrnoUrl: destination ? `https://www.yr.no/en/forecast/daily-table/${destination.lat},${destination.lon}` : undefined,
                                  googleMapsUrl: destination ? `https://www.google.com/maps/search/?api=1&query=${destination.lat},${destination.lon}` : undefined,
                                  departureContext: activeOutboundCandidate ? {
                                    originDisplay: getOriginDisplay(origin?.name ?? '', locale, tf('slotDetailOriginFallback')),
                                    departureIso: activeOutboundCandidate.departureIso,
                                  } : undefined,
                                })}
                                className="self-start text-primary underline hover:text-primary/80 transition-colors text-[11px]"
                              >
                                {tf('viewFullForecast')}
                              </button>
                            )}
                          </div>
                        </section>
                      )}

                    </div>
                    </>
                  )}

                  {/* ── Brottför og áfangastaður ── */}
                  {comparisonCols.length > 0 && (
                    <div className="flex flex-col gap-3 pt-3">
                      <p className="text-[11px] font-semibold text-foreground/70">{tf('weatherCompareSection')}</p>
                      <div className="overflow-x-auto">
                        <div
                          className="inline-grid gap-x-3 gap-y-2.5"
                          style={{ gridTemplateColumns: `5.5rem repeat(${comparisonCols.length}, 4.75rem)` }}
                        >
                          {/* Header row */}
                          <div />
                          {comparisonCols.map(col => (
                            <div key={col.targetIso} className="text-[10px] text-muted-foreground leading-tight">
                              <div>{col.dayLabel}</div>
                              <div className="text-muted-foreground/50">{col.timeLabel}</div>
                            </div>
                          ))}
                          {/* Origin row */}
                          <div className="text-[11px] font-medium text-foreground leading-tight self-start truncate pr-1">
                            {origin?.name}
                          </div>
                          {comparisonCols.map(col => (
                            <div key={col.targetIso}>
                              {col.origin ? (
                                <div className="space-y-0.5">
                                  <div className={`text-[12px] font-medium ${tempMetricClass(col.origin.temperature.value, col.dest?.temperature.value) || 'text-foreground'}`}>
                                    {formatNum(col.origin.temperature.value, locale)}°C
                                  </div>
                                  <div className={`text-[11px] font-medium ${windMetricClass(col.origin.wind.value, col.dest?.wind.value, compareThresholds)}`}>
                                    {formatNum(col.origin.wind.value, locale)} m/s
                                  </div>
                                  <div className={`text-[10px] ${precipMetricClass(col.origin.precipitation.value, col.dest?.precipitation.value, compareThresholds) || 'text-muted-foreground'}`}>
                                    {formatNum(col.origin.precipitation.value, locale)} mm/klst
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[11px] text-muted-foreground/40">–</span>
                              )}
                            </div>
                          ))}
                          {/* Destination row */}
                          <div className="text-[11px] font-medium text-foreground leading-tight self-start truncate pr-1">
                            {effectiveDestinationName}
                          </div>
                          {comparisonCols.map(col => (
                            <div key={col.targetIso}>
                              {col.dest ? (
                                <div className="space-y-0.5">
                                  <div className={`text-[12px] font-medium ${tempMetricClass(col.dest.temperature.value, col.origin?.temperature.value) || 'text-foreground'}`}>
                                    {formatNum(col.dest.temperature.value, locale)}°C
                                  </div>
                                  <div className={`text-[11px] font-medium ${windMetricClass(col.dest.wind.value, col.origin?.wind.value, compareThresholds)}`}>
                                    {formatNum(col.dest.wind.value, locale)} m/s
                                  </div>
                                  <div className={`text-[10px] ${precipMetricClass(col.dest.precipitation.value, col.origin?.precipitation.value, compareThresholds) || 'text-muted-foreground'}`}>
                                    {formatNum(col.dest.precipitation.value, locale)} mm/klst
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[11px] text-muted-foreground/40">–</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCompareDrawerOpen(true)}
                        className="self-start text-[11px] text-primary underline hover:text-primary/80 transition-colors"
                      >
                        {tf('weatherCompareViewMore')}
                      </button>
                    </div>
                  )}

                </div>
              )
            })()}

            {/* Ferðalag conversion affordance — only when tripEnabled, result ready, not loading */}
            {tripEnabled && !isGuest && result && !loading && (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setTripHintVisible(v => !v)}
                  aria-expanded={tripHintVisible}
                  className="self-start flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 min-h-[40px] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Route className="size-4 shrink-0" />
                  {tf('convertToTrip')}
                </button>
                {tripHintVisible && (
                  <p className="text-xs text-muted-foreground pl-[22px]">
                    {tf('tripComingSoon')}
                  </p>
                )}
              </div>
            )}

            {/* Interactive audit map */}
            {result && !loading && origin && destination && !hasNoActiveProvider && (activeMetnoPoints.length > 0 || providerOverlayPoints.length > 0) && (
              <TravelAuditMap
                key={`${result.id}-${showMetno ? 'm' : ''}-${showVedurstofan ? 'v' : ''}`}
                originName={origin.name}
                destinationName={effectiveDestinationName}
                routePoints={result.travelPlan?.route.auditPolylinePoints ?? []}
                weatherPoints={activeMetnoPoints}
                providerOverlayPoints={providerOverlayPoints.length > 0 ? providerOverlayPoints : undefined}
                highlightedOverlayPointId={
                  (isVedurstofanOnly || combinedDecisiveProvider === 'vedurstofan') && worstVedurstofanData
                    ? worstVedurstofanData.station.stationId
                    : undefined
                }
                vedurstofanLayerPoints={vedurstofanLayer?.points}
                referenceDepartureIso={referenceDepartureIso}
                referenceArrivalIso={referenceArrivalIso}
                vedurstofanReturnTo={vedurstofanReturnTo}
                highlightedIssue={heatmapHighlightedIssue}
                staticMapUrl={result.travelPlan?.route.auditMapUrl}
                selectedCandidatePointStatuses={selectedCandidatePointStatuses}
                activeCandidate={activeCandidate}
                activeLeg={activeLeg}
                visibleStatuses={mapVisibleStatuses}
                onVisibleStatusesChange={setMapOutboundVisibleStatuses}
                thresholdsUsed={thresholdsUsed}
                selectionResetSignal={mapSelectionSignal}
                onOpenForecastDrawer={(routeIndex) => {
                  const pt = result.travelPlan?.routeWeatherPoints?.find(p => p.routeIndex === routeIndex)
                  if (!pt?.forecastRows?.length) return
                  const isDisplayPoint = activeCandidate?.displayPoint?.routeIndex === routeIndex
                  const highlightedTimeIso = isDisplayPoint
                    ? activeCandidate!.displayPoint!.forecastTimeIso
                    : activeCandidate
                      ? nearestForecastIso(pt.forecastRows, estimatePointEtaIso(activeCandidate, pt, activeLeg))
                      : pt.summaryForWindow?.forecastTimeIso
                  setForecastDrawerData({
                    rows: pt.forecastRows,
                    title: tf('forecastPointTitle', { index: pt.routeIndex + 1, total: pt.totalRouteWeatherPoints }),
                    highlightedTimeIso,
                    yrnoUrl: pt.yrnoUrl,
                    googleMapsUrl: pt.googleMapsUrl,
                    departureContext: activeCandidate ? {
                      originDisplay: getOriginDisplay(origin?.name ?? '', locale, tf('slotDetailOriginFallback')),
                      departureIso: activeCandidate.departureIso,
                    } : undefined,
                  })
                }}
              />
            )}


            {/* Return departure heatmap — only shown when met.no is active (return leg has no Veðurstofan model yet) */}
            {result && !loading && showMetno && (result.travelPlan?.return?.candidates.length ?? 0) > 0 && (
              <div className="bg-card border border-border rounded-xl p-4">
                <DepartureHeatmap
                  candidates={result.travelPlan!.return!.candidates}
                  bestWindow={result.travelPlan!.return!.bestWindow}
                  originName={effectiveDestinationName}
                  selectedIdx={selectedReturnHeatmapIdx}
                  onSelectIdx={handleReturnSelect}
                  title={tf('heatmapReturnTitle')}
                  leg="return"
                  routeDistanceM={routeDistanceM}
                  visibleStatuses={returnVisibleStatuses}
                  onVisibleStatusesChange={setReturnVisibleStatuses}
                  thresholdsUsed={thresholdsUsed}
                />
              </div>
            )}

            {/* Deterministic explainer */}
            {result && !loading && (
              <div className="flex flex-col gap-2 border-t border-border pt-3 mt-1">
                <p className="text-xs text-muted-foreground leading-relaxed">{tf('howAssessedShort')}</p>
                <button
                  type="button"
                  onClick={() => setShowExplainer((v) => !v)}
                  className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded self-start"
                  aria-expanded={showExplainer}
                >
                  {showExplainer ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
                  {tf('howAssessedTitle')}
                </button>
                {showExplainer && (result.travelPlan?.routeWeatherPoints?.length ?? 0) > 0 && (() => {
                  // Build a combined list of all provider points sorted by travel distance.
                  // When both providers are active this interleaves met.no and Veðurstofan
                  // points in road order instead of showing them in two separate blocks.
                  type CombinedPoint =
                    | { kind: 'metno'; pt: RouteWeatherPoint; distanceFromOriginM: number }
                    | { kind: 'vedurstofan'; vpt: VedurstofanTravelLayer['points'][number]; distanceFromOriginM: number }
                  const combinedPoints: CombinedPoint[] = [
                    ...(showMetno ? result.travelPlan!.routeWeatherPoints!.map(pt => ({
                      kind: 'metno' as const,
                      pt,
                      distanceFromOriginM: pt.distanceFromOriginM ?? 0,
                    })) : []),
                    ...(showVedurstofan && vedurstofanLayer ? vedurstofanLayer.points.map(vpt => ({
                      kind: 'vedurstofan' as const,
                      vpt,
                      distanceFromOriginM: vpt.distanceFromOriginM ?? 0,
                    })) : []),
                  ].sort((a, b) => a.distanceFromOriginM - b.distanceFromOriginM)

                  const metnoCount = showMetno ? (result.travelPlan?.routeWeatherPoints?.length ?? 0) : 0
                  const vedurstofanCount = showVedurstofan && vedurstofanLayer ? vedurstofanLayer.points.length : 0
                  const totalCount = metnoCount + vedurstofanCount
                  const bothActive = metnoCount > 0 && vedurstofanCount > 0

                  return (
                    <div className="flex flex-col gap-3">
                      <p className="text-xs text-muted-foreground">{tf('betaTransparencyCopy')}</p>
                      {totalCount > 0 && (
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">
                          {bothActive
                            ? tf('allProviderPointsSectionLabel', { count: totalCount })
                            : metnoCount > 0
                              ? tf('metnoSectionLabel', { count: metnoCount })
                              : tf('vedurstofanPointsSectionLabel', { count: vedurstofanCount })}
                        </p>
                      )}
                      {combinedPoints.map(item => {
                        if (item.kind === 'metno') {
                          const pt = item.pt
                          return (
                            <RoutePointRow
                              key={pt.id}
                              pt={pt}
                              activeCandidate={userExplicitSlot && selectedCandidatePointStatuses !== undefined ? activeCandidate : undefined}
                              activeLeg={activeLeg}
                              selectedCandidatePointStatuses={selectedCandidatePointStatuses}
                              thresholdsUsed={thresholdsUsed}
                              originName={origin?.name ?? ''}
                              providerLabel={tf('providerMetnoLabel')}
                              onOpenForecast={pt.forecastRows?.length ? () => {
                                const isDisplayPoint = activeCandidate?.displayPoint?.routeIndex === pt.routeIndex
                                const highlightedTimeIso = isDisplayPoint
                                  ? activeCandidate!.displayPoint!.forecastTimeIso
                                  : activeCandidate
                                    ? nearestForecastIso(pt.forecastRows!, estimatePointEtaIso(activeCandidate, pt, activeLeg))
                                    : pt.summaryForWindow?.forecastTimeIso
                                setForecastDrawerData({
                                  rows: pt.forecastRows!,
                                  title: tf('forecastPointTitle', { index: pt.routeIndex + 1, total: pt.totalRouteWeatherPoints }),
                                  highlightedTimeIso,
                                  yrnoUrl: pt.yrnoUrl,
                                  googleMapsUrl: pt.googleMapsUrl,
                                  departureContext: activeCandidate ? {
                                    originDisplay: getOriginDisplay(origin?.name ?? '', locale, tf('slotDetailOriginFallback')),
                                    departureIso: activeCandidate.departureIso,
                                  } : undefined,
                                })
                              } : undefined}
                            />
                          )
                        }
                        const vpt = item.vpt
                        const assessment = vedurstofanAssessments.find(a => a.station.stationId === vpt.stationId)
                        return (
                          <VedurstofanPointCard
                            key={vpt.routePointId}
                            station={vpt}
                            status={assessment?.status ?? 'no_data'}
                            etaIso={assessment?.etaIso ?? null}
                            departureIso={referenceDepartureIso}
                            originName={origin?.name ?? ''}
                            returnTo={vedurstofanReturnTo}
                          />
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}


      </main>

      {/* Forecast drawer */}
      {forecastDrawerData && (
        <ForecastDrawer
          rows={forecastDrawerData.rows}
          title={forecastDrawerData.title}
          highlightedTimeIso={forecastDrawerData.highlightedTimeIso}
          yrnoUrl={forecastDrawerData.yrnoUrl}
          googleMapsUrl={forecastDrawerData.googleMapsUrl}
          departureContext={forecastDrawerData.departureContext}
          onClose={() => setForecastDrawerData(null)}
        />
      )}

      {/* Comparison drawer — vertical stacked per-day view */}
      {compareDrawerOpen && comparisonCols.length > 0 && (() => {
        const PRESET_HOURS: Record<string, number[]> = {
          kl12: [12],
          morning: [9, 12, 18],
          '3h': [0, 3, 6, 9, 12, 15, 18, 21],
        }
        const drawerCols = buildCompareColumns(compareOriginRows, compareDestRows, PRESET_HOURS[comparePreset], locale)
        return (
          <div
            className="fixed inset-0 z-50 flex flex-col justify-end"
            onClick={() => setCompareDrawerOpen(false)}
          >
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="relative w-full max-w-md mx-auto bg-background rounded-t-xl border-t border-border max-h-[75vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-background border-b border-muted/40 px-4 py-3 flex items-center justify-between shrink-0">
                <p className="text-sm font-semibold text-foreground">{tf('weatherCompareSection')}</p>
                <button
                  type="button"
                  onClick={() => setCompareDrawerOpen(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {tf('drawerClose')}
                </button>
              </div>
              <div className="flex gap-1.5 px-4 py-2.5 border-b border-muted/40 shrink-0">
                {(['kl12', 'morning', '3h'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setComparePreset(p)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                      comparePreset === p
                        ? 'bg-foreground text-background border-foreground'
                        : 'text-muted-foreground border-border hover:border-foreground/40'
                    }`}
                  >
                    {p === 'kl12' ? tf('comparePresetKl12') : p === 'morning' ? tf('comparePresetMorning') : tf('comparePreset3h')}
                  </button>
                ))}
              </div>
              <div className="overflow-y-auto px-4 py-2 divide-y divide-border/60">
                {drawerCols.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">{tf('heatmapNoData')}</p>
                ) : drawerCols.map(col => (
                  <div key={col.targetIso} className="py-3 space-y-2">
                    <p className="text-[11px] font-semibold text-muted-foreground">
                      {col.dayLabel} · {col.timeLabel}
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-semibold text-foreground">{origin?.name}</p>
                        {col.origin ? (
                          <>
                            <p className={`text-sm font-medium ${tempMetricClass(col.origin.temperature.value, col.dest?.temperature.value) || 'text-foreground'}`}>
                              {formatNum(col.origin.temperature.value, locale)}°C
                            </p>
                            <p className={`text-xs font-medium ${windMetricClass(col.origin.wind.value, col.dest?.wind.value, compareThresholds)}`}>
                              {formatNum(col.origin.wind.value, locale)} m/s
                            </p>
                            <p className={`text-[11px] ${precipMetricClass(col.origin.precipitation.value, col.dest?.precipitation.value, compareThresholds) || 'text-muted-foreground'}`}>
                              {formatNum(col.origin.precipitation.value, locale)} mm/klst
                            </p>
                          </>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/40">–</p>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-semibold text-foreground">{effectiveDestinationName}</p>
                        {col.dest ? (
                          <>
                            <p className={`text-sm font-medium ${tempMetricClass(col.dest.temperature.value, col.origin?.temperature.value) || 'text-foreground'}`}>
                              {formatNum(col.dest.temperature.value, locale)}°C
                            </p>
                            <p className={`text-xs font-medium ${windMetricClass(col.dest.wind.value, col.origin?.wind.value, compareThresholds)}`}>
                              {formatNum(col.dest.wind.value, locale)} m/s
                            </p>
                            <p className={`text-[11px] ${precipMetricClass(col.dest.precipitation.value, col.origin?.precipitation.value, compareThresholds) || 'text-muted-foreground'}`}>
                              {formatNum(col.dest.precipitation.value, locale)} mm/klst
                            </p>
                          </>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/40">–</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the timeIso of the forecast row closest in time to etaIso. */
function nearestForecastIso(rows: ForecastDrawerRow[], etaIso: string): string | undefined {
  const etaMs = new Date(etaIso).getTime()
  let best: string | undefined
  let bestDiff = Infinity
  for (const r of rows) {
    const diff = Math.abs(new Date(r.timeIso).getTime() - etaMs)
    if (diff < bestDiff) { bestDiff = diff; best = r.timeIso }
  }
  return best
}

type CompareCol = {
  dayLabel: string
  timeLabel: string
  targetIso: string
  origin: ForecastDrawerRow | null
  dest: ForecastDrawerRow | null
}

type CompareThresh = { cautionWindMs: number; redWindMs: number; redGustMs: number; cautionPrecipMmPerHour: number }

function windMetricClass(value: number, otherValue: number | undefined, t: CompareThresh | undefined): string {
  if (t) {
    if (value >= t.redWindMs) return 'text-destructive'
    if (value >= t.cautionWindMs) return 'text-amber-600 dark:text-amber-500'
  }
  if (otherValue !== undefined && value < otherValue) return 'text-emerald-600 dark:text-emerald-500'
  return ''
}

function gustMetricClass(severity: string, value: number, otherValue: number | undefined, t: CompareThresh | undefined): string {
  if (severity === 'danger' || (t && value >= t.redGustMs)) return 'text-destructive'
  if (severity === 'caution' || severity === 'notice') return 'text-amber-600 dark:text-amber-500'
  if (otherValue !== undefined && value < otherValue) return 'text-emerald-600 dark:text-emerald-500'
  return ''
}

function precipMetricClass(value: number, otherValue: number | undefined, t: CompareThresh | undefined): string {
  if (t && value >= t.cautionPrecipMmPerHour) return 'text-amber-600 dark:text-amber-500'
  if (otherValue !== undefined && value < otherValue) return 'text-emerald-600 dark:text-emerald-500'
  return ''
}

function tempMetricClass(value: number, otherValue: number | undefined): string {
  if (otherValue === undefined) return ''
  if (value > otherValue) return 'text-emerald-600 dark:text-emerald-500'
  return ''
}

const CMP_IS_WEEKDAY = ['sun', 'mán', 'þri', 'mið', 'fim', 'fös', 'lau']
const CMP_IS_MONTH = ['jan', 'feb', 'mar', 'apr', 'maí', 'jún', 'júl', 'ágú', 'sep', 'okt', 'nóv', 'des']
const CMP_EN_WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CMP_EN_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Builds comparison columns for origin and destination forecast rows.
 * targetHoursUtc: UTC hours per day (e.g. [12] for noon, [9,12,18] for morning/noon/evening).
 * maxDays: cap number of days (default: all available).
 */
function buildCompareColumns(
  originRows: ForecastDrawerRow[],
  destRows: ForecastDrawerRow[],
  targetHoursUtc: number[],
  locale: string,
  maxDays = Infinity,
): CompareCol[] {
  const TOLERANCE_MS = 90 * 60 * 1000
  const isIs = locale === 'is' || locale.startsWith('is')

  const dateSet = new Set<string>()
  for (const r of [...originRows, ...destRows]) {
    const d = new Date(r.timeIso)
    dateSet.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`)
  }

  const findNearest = (rows: ForecastDrawerRow[], targetMs: number): ForecastDrawerRow | null => {
    let best: ForecastDrawerRow | null = null
    let bestDiff = Infinity
    for (const r of rows) {
      const diff = Math.abs(new Date(r.timeIso).getTime() - targetMs)
      if (diff <= TOLERANCE_MS && diff < bestDiff) { best = r; bestDiff = diff }
    }
    return best
  }

  const cols: CompareCol[] = []
  const dates = Array.from(dateSet).sort().slice(0, maxDays)
  for (const dateStr of dates) {
    for (const hour of targetHoursUtc) {
      const hh = String(hour).padStart(2, '0')
      const targetIso = `${dateStr}T${hh}:00:00.000Z`
      const targetMs = new Date(targetIso).getTime()
      const origin = findNearest(originRows, targetMs)
      const dest = findNearest(destRows, targetMs)
      if (!origin && !dest) continue
      const d = new Date(targetIso)
      const dayLabel = isIs
        ? `${CMP_IS_WEEKDAY[d.getUTCDay()]}. ${d.getUTCDate()}. ${CMP_IS_MONTH[d.getUTCMonth()]}`
        : `${CMP_EN_WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${CMP_EN_MONTH[d.getUTCMonth()]}`
      const timeLabel = isIs ? `kl. ${hh}:00` : `${hh}:00`
      cols.push({ dayLabel, timeLabel, targetIso, origin, dest })
    }
  }
  return cols
}

const IS_WEEKDAY_GENITIVE = [
  'sunnudagsins', 'mánudagsins', 'þriðjudagsins',
  'miðvikudagsins', 'fimmtudagsins', 'föstudagsins', 'laugardagsins',
]

const IS_MONTH_GENITIVE = [
  'janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní',
  'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember',
]

/** Format a coverage end date for the combined card. Returns e.g. "föstudagsins 17. júlí" (IS) or "Friday, July 17" (EN). */
function formatCoverageDate(isoDate: string, locale: string): string {
  const d = new Date(isoDate)
  if (locale === 'is' || locale.startsWith('is')) {
    const weekday = IS_WEEKDAY_GENITIVE[d.getUTCDay()]
    const day = d.getUTCDate()
    const month = IS_MONTH_GENITIVE[d.getUTCMonth()]
    return `${weekday} ${day}. ${month}`
  }
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

function utcHHMM(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`
}

/**
 * Formats a departure window as a date-aware, locale-aware string.
 * Same UTC day: "kl. HH:MM-HH:MM" (IS) or "HH:MM-HH:MM" (EN).
 * Different days: localized date + time label on each end.
 */
function formatWindowRange(fromIso: string, toIso: string, locale: string): string {
  const norm = normalizeLocale(locale)
  const isIcelandic = norm.startsWith('is')
  const timeLabel = isIcelandic ? 'kl.' : 'at'
  const fromDate = fromIso.slice(0, 10)
  const toDate = toIso.slice(0, 10)
  if (fromDate === toDate) {
    return isIcelandic
      ? `kl. ${utcHHMM(fromIso)}–${utcHHMM(toIso)}`
      : `${utcHHMM(fromIso)}–${utcHHMM(toIso)}`
  }
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(norm, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${fmtDate(fromIso)} ${timeLabel} ${utcHHMM(fromIso)} – ${fmtDate(toIso)} ${timeLabel} ${utcHHMM(toIso)}`
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function RouteSummary({ originName, destinationName, distanceKm, durationMinutes }: {
  originName: string
  destinationName: string
  distanceKm?: number
  durationMinutes?: number
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const suffix = distanceKm !== undefined && durationMinutes !== undefined
    ? (() => {
        const rounded = Math.round(durationMinutes)
        const hours = Math.floor(rounded / 60)
        const mins = rounded % 60
        const durStr = hours === 0
          ? `${mins} ${tf('routeDurationMinsUnit')}`
          : mins === 0
            ? tf('routeDurationHoursOnly', { hours })
            : tf('routeDurationHoursAndMins', { hours, mins })
        return ` (${Math.round(distanceKm)} km, ${durStr})`
      })()
    : ''
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <MapPin size={12} aria-hidden />
      <span>{originName} → {destinationName}{suffix}</span>
    </div>
  )
}

function BackButton({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-11 px-4 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {label}
    </button>
  )
}


function ThresholdInput({
  id,
  label,
  unit,
  value,
  onChange,
}: {
  id: string
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-2.5">
      <label htmlFor={id} className="flex-1 text-sm text-foreground">
        {label}
      </label>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-sm text-right text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          style={{ fontSize: '16px' }}
          step="0.5"
          min="0"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  )
}

function IssueAuditCard({ issue }: { issue: TravelIssue }) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const locale = useLocale()
  const legLabel = issue.leg === 'return' ? tf('returnWindowLabel') : tf('outboundLabel')
  const metricLabel =
    issue.metric === 'wind' ? tf('metricWind')
    : issue.metric === 'gust' ? tf('metricGust')
    : issue.metric === 'precipitation' ? tf('metricPrecip')
    : '–'
  return (
    <div className="border border-border rounded-lg px-3 py-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">
        {legLabel} — {metricLabel}
        {issue.value !== undefined ? `: ${formatNum(issue.value, locale)} ${issue.unit ?? ''}` : ''}
        {issue.thresholdValue !== undefined && issue.value !== undefined && issue.value > issue.thresholdValue && (
          <span className="font-normal text-muted-foreground ml-1">
            {tf('aboveThresholdWithExcess', { excess: formatNum(issue.value - issue.thresholdValue, locale), threshold: formatNum(issue.thresholdValue, locale), unit: issue.thresholdUnit ?? '' })}
          </span>
        )}
      </p>
      {issue.timeIso && (
        <p>{tf('timeLabel')}: {new Date(issue.timeIso).toISOString().replace('T', ' ').slice(0, 16)} UTC</p>
      )}
      {(issue.distanceFromLegStartM !== undefined || issue.distanceFromOriginM !== undefined) && (issue.distanceFromLegStartM ?? issue.distanceFromOriginM ?? 0) > 0 && (
        <p>
          {Math.round((issue.distanceFromLegStartM ?? issue.distanceFromOriginM ?? 0) / 1000)} {tf('kmFrom')} {issue.legStartName ?? ''} ({Math.round((issue.routeFraction ?? 0) * 100)}% {tf('routeFractionSuffix')})
        </p>
      )}
      {issue.lat !== undefined && issue.lon !== undefined && (
        <p>{issue.forecastLat !== undefined ? `${tf('metnoCoordLabel')}: ${issue.forecastLat}, ${issue.forecastLon}` : `${tf('coordinatesLabel')}: ${issue.lat.toFixed(4)}, ${issue.lon.toFixed(4)}`}</p>
      )}
      <div className="flex flex-wrap gap-3">
        {issue.yrnoUrl && (
          <a href={issue.yrnoUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
            {tf('viewForecast')}
          </a>
        )}
        {issue.googleMapsUrl && (
          <a href={issue.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
            {tf('openOnMap')}
          </a>
        )}
        {issue.metnoUrl && (
          <a href={issue.metnoUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors text-muted-foreground/60">
            {tf('viewMetnoRaw')}
          </a>
        )}
      </div>
    </div>
  )
}

const ROUTE_POINT_CARD_CLASS: Record<WindDisplayStatus, string> = {
  'innan-marka':        'bg-[#2d5a27]/5 border-[#2d5a27]/35',
  'nalgast-othaegindi': 'bg-amber-50/50 border-amber-200',
  'othaegilegt':        'bg-orange-50/50 border-orange-200',
  'nalgast-haettumork': 'bg-destructive/5 border-destructive/30',
  'haettulegt':         'bg-destructive/5 border-destructive/30',
  'no_data':            'bg-muted/40 border-muted-foreground/20',
}

function RoutePointRow({
  pt,
  activeCandidate,
  activeLeg = 'outbound',
  selectedCandidatePointStatuses,
  thresholdsUsed,
  originName,
  providerLabel,
  onOpenForecast,
}: {
  pt: RouteWeatherPoint
  activeCandidate?: TravelCandidate
  activeLeg?: 'outbound' | 'return'
  selectedCandidatePointStatuses?: CandidatePointStatus[]
  thresholdsUsed?: ResolvedTravelThresholds
  originName: string
  providerLabel?: string
  onOpenForecast?: () => void
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')

  const isActiveMode = activeCandidate !== undefined && selectedCandidatePointStatuses !== undefined
  const summary = buildPointSummary(pt, undefined, isActiveMode ? activeCandidate : undefined, activeLeg)

  // Fine-grained wind status for badge and card styling
  const th = thresholdsUsed ?? resolveThresholds('none')
  const windStatus = classifyPointWindDisplayStatus(summary.windMs, summary.hasData, th)
  const windMeta = WIND_STATUS_META_SHARED[windStatus]
  const cardClass = ROUTE_POINT_CARD_CLASS[windStatus]

  const badges: string[] = []
  if (pt.isHighlightedIssue) badges.push(tf('decisivePointLabel'))
  if (pt.isDestinationClosest && !pt.isOrigin) badges.push(tf('nearestDestLabel'))

  return (
    <div className={`border ${cardClass} rounded-lg px-3 py-2 flex flex-col gap-1 text-xs text-muted-foreground`}>
      <RouteWeatherPointDetailCard
        summary={summary}
        thresholdsUsed={thresholdsUsed}
        originName={originName}
        onOpenForecast={onOpenForecast}
        headerExtra={
          <>
            {providerLabel && (
              <span className="bg-muted/70 text-muted-foreground px-1.5 py-0.5 rounded font-medium text-[10px]">{providerLabel}</span>
            )}
            <WindStatusBadge status={windStatus} variant="chip" />
            {badges.map(b => (
              <span key={b} className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs">{b}</span>
            ))}
          </>
        }
      />
    </div>
  )
}

