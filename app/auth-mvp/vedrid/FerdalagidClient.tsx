'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { ChevronLeft, CloudSun, ChevronDown, ChevronUp, MapPin, Route, Caravan, SlidersHorizontal, CheckCircle2, Wind, Droplets } from 'lucide-react'
import type { DeterministicResult, WeatherStatus, RouteWeatherPoint, TravelIssue, CandidatePointStatus, TravelThresholdOverrides, TravelCandidate } from '@/lib/weather/types'
import type { RouteOption } from '@/lib/weather/provider.types'
import { resolveThresholds, validateResolvedThresholdOrdering } from '@/lib/weather/thresholds'
import { TravelAuditMap } from '@/components/weather/TravelAuditMap'
import { DepartureHeatmap, type SlotStatus } from '@/components/weather/DepartureHeatmap'
import { RouteSelectionStep, type RoutePlace } from '@/components/weather/RouteSelectionStep'
import { WeatherResultLoader } from '@/components/weather/WeatherResultLoader'
import { WeatherBetaBanner } from '@/components/weather/WeatherBetaBanner'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { formatKlTime, candidateToIssue, normalizeLocale, formatNum, haversineMeters, estimatePointEtaIso } from '@/components/weather/travelAuditMap.helpers'
import { isVestmannaeyjarDestination, FERRY_PORTS, type FerryPortId } from '@/lib/weather/ferryPorts'
import type { SavedWeatherPlace } from '@/lib/weather/savedPlaces'

type WizardStep = 'route' | 'trailer' | 'thresholds' | 'result'

type TrailerKindValue = 'none' | 'generic_trailer' | 'tent_trailer' | 'folding_camper' | 'caravan' | 'horse_trailer'

const STEP_ORDER: WizardStep[] = ['route', 'trailer', 'thresholds', 'result']

const STATUS_STYLES: Record<WeatherStatus, { dot: string; label: string }> = {
  graent: { dot: 'bg-[#2d5a27]', label: 'text-[#2d5a27]' },
  gult:   { dot: 'bg-amber-500', label: 'text-amber-700' },
  rautt:  { dot: 'bg-destructive', label: 'text-destructive' },
}


export function FerdalagidClient() {
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
  const [error, setError] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showExplainer, setShowExplainer] = useState(false)
  const [showArrivalForecast, setShowArrivalForecast] = useState(false)
  const [selectedHeatmapIdx, setSelectedHeatmapIdx] = useState<number | null>(null)
  const [selectedReturnHeatmapIdx, setSelectedReturnHeatmapIdx] = useState<number | null>(null)
  // True only when the user has explicitly clicked a heatmap slot (not auto-selected on result load).
  // Controls whether RoutePointRow uses active-candidate mode or shows summaryForWindow metrics.
  const [userExplicitSlot, setUserExplicitSlot] = useState(false)
  // Filter state for scrubber (DepartureHeatmap) per leg — empty = show all; non-empty = show only those
  const [outboundVisibleStatuses, setOutboundVisibleStatuses] = useState<Set<SlotStatus>>(() => new Set<SlotStatus>())
  const [returnVisibleStatuses, setReturnVisibleStatuses] = useState<Set<SlotStatus>>(() => new Set<SlotStatus>())
  // Map visibility state — independent from scrubber filters
  const [mapOutboundVisibleStatuses, setMapOutboundVisibleStatuses] = useState<Set<SlotStatus>>(() => new Set<SlotStatus>())
  // Signal to TravelAuditMap to clear manual point selection when departure changes
  const [mapSelectionSignal, setMapSelectionSignal] = useState(0)
  // Track which thresholds were last submitted to detect dirty drafts
  const [submittedThresholds, setSubmittedThresholds] = useState<TravelThresholdOverrides | null>(null)

  // Route selection state
  const [routeOptions, setRouteOptions] = useState<RouteOption[] | null>(null)
  const [routeOptionsLoading, setRouteOptionsLoading] = useState(false)
  const [routeOptionsError, setRouteOptionsError] = useState<string | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [routeRetryCount, setRouteRetryCount] = useState(0)
  const [routeFallback, setRouteFallback] = useState(false)

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

  // Populate threshold draft inputs when entering the thresholds step
  useEffect(() => {
    if (step === 'thresholds') {
      const effective = resolveThresholds(trailerKind, thresholdOverrides)
      setDraftCautionWind(String(effective.cautionWindMs))
      setDraftRedWind(String(effective.redWindMs))
      setDraftRedGust(String(effective.redGustMs))
      setDraftCautionPrecip(String(effective.cautionPrecipMmPerHour))
      setThresholdError(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Reset departure filters and map visibility when a new result arrives
  useEffect(() => {
    if (!result) return
    setOutboundVisibleStatuses(new Set<SlotStatus>())
    setReturnVisibleStatuses(new Set<SlotStatus>())
    setMapOutboundVisibleStatuses(new Set<SlotStatus>())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.id])

  // Clear result/error whenever origin or destination coordinates change
  useEffect(() => {
    setResult(null)
    setError(null)
    setSelectedHeatmapIdx(null)
    setSelectedReturnHeatmapIdx(null)
    setUserExplicitSlot(false)
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

      const data = await res.json()

      if (!res.ok) {
        const errMap: Record<string, string> = {
          provider_not_configured: tf('errorProviderNotConfigured'),
          route_unavailable: tf('errorRouteUnavailable'),
          selected_route_unavailable: tf('selectedRouteUnavailable'),
          forecast_unavailable: tf('errorForecastUnavailable'),
          times_invalid: tf('errorTimesInvalid'),
          thresholds_invalid: tf('thresholdValidationError'),
          time_constraint_conflict: tf('errorTimeConstraintConflict'),
        }
        setError(errMap[data?.error] ?? tf('errorGeneral'))
      } else {
        setResult(data as DeterministicResult)
        setSubmittedThresholds(overridesToSend)
      }
    } catch {
      setError(tf('errorGeneral'))
    } finally {
      setLoading(false)
    }
  }

  function handleThresholdSubmit() {
    const defaults = resolveThresholds(trailerKind)
    const cautionWind = parseFloat(draftCautionWind)
    const redWind = parseFloat(draftRedWind)
    const redGust = parseFloat(draftRedGust)
    const cautionPrecip = parseFloat(draftCautionPrecip)

    if (
      isNaN(cautionWind) || cautionWind < 0 || cautionWind > 40 ||
      isNaN(redWind) || redWind < 0 || redWind > 40 ||
      isNaN(redGust) || redGust < 0 || redGust > 50 ||
      isNaN(cautionPrecip) || cautionPrecip < 0 || cautionPrecip > 20
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
    if (redGust !== defaults.redGustMs) overrides.redGustMs = redGust
    if (cautionPrecip !== defaults.cautionPrecipMmPerHour) overrides.cautionPrecipMmPerHour = cautionPrecip

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
    // Skip if selected slot is still visible
    if (selectedHeatmapIdx !== null) {
      const sel = outboundDisplayCandidates[selectedHeatmapIdx]
      if (sel) {
        const st: SlotStatus = sel.reasonCode === 'no_data' ? 'no_data' : sel.status
        if (outboundVisibleStatuses.has(st)) return
      }
    }
    const visible = (c: TravelCandidate) => {
      const s: SlotStatus = c.reasonCode === 'no_data' ? 'no_data' : c.status
      return outboundVisibleStatuses.has(s)
    }
    const firstRed = outboundDisplayCandidates.findIndex(c => visible(c) && c.status === 'rautt')
    const firstYellow = outboundDisplayCandidates.findIndex(c => visible(c) && c.status === 'gult')
    const firstAny = outboundDisplayCandidates.findIndex(visible)
    const next = firstRed >= 0 ? firstRed : firstYellow >= 0 ? firstYellow : firstAny
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
        const st: SlotStatus = sel.reasonCode === 'no_data' ? 'no_data' : sel.status
        if (returnVisibleStatuses.has(st)) return
      }
    }
    const visible = (c: TravelCandidate) => {
      const s: SlotStatus = c.reasonCode === 'no_data' ? 'no_data' : c.status
      return returnVisibleStatuses.has(s)
    }
    const firstRed = returnCandidates.findIndex(c => visible(c) && c.status === 'rautt')
    const firstYellow = returnCandidates.findIndex(c => visible(c) && c.status === 'gult')
    const firstAny = returnCandidates.findIndex(visible)
    const next = firstRed >= 0 ? firstRed : firstYellow >= 0 ? firstYellow : firstAny
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
    // On the thresholds step, also check if draft inputs differ from submitted resolved values
    if (step === 'thresholds') {
      const submittedResolved = resolveThresholds(trailerKind, submittedThresholds)
      const dCaution = parseFloat(draftCautionWind)
      const dRed = parseFloat(draftRedWind)
      const dGust = parseFloat(draftRedGust)
      const dPrecip = parseFloat(draftCautionPrecip)
      if (!isNaN(dCaution) && dCaution !== submittedResolved.cautionWindMs) return true
      if (!isNaN(dRed) && dRed !== submittedResolved.redWindMs) return true
      if (!isNaN(dGust) && dGust !== submittedResolved.redGustMs) return true
      if (!isNaN(dPrecip) && dPrecip !== submittedResolved.cautionPrecipMmPerHour) return true
    }
    return false
  })()

  // Threshold display for assumptions row
  const hasOverrides = Object.keys(thresholdOverrides).length > 0
  const effectiveThresholds = resolveThresholds(trailerKind, thresholdOverrides)

  // Whether visible draft values on the threshold step differ from current trailer defaults
  const thresholdDraftDiffersFromDefaults = (() => {
    const defaults = resolveThresholds(trailerKind)
    const c = parseFloat(draftCautionWind), r = parseFloat(draftRedWind), g = parseFloat(draftRedGust), p = parseFloat(draftCautionPrecip)
    if ([c, r, g, p].some(Number.isNaN)) return Object.keys(thresholdOverrides).length > 0
    return c !== defaults.cautionWindMs || r !== defaults.redWindMs || g !== defaults.redGustMs || p !== defaults.cautionPrecipMmPerHour
  })()

  // Compact threshold values for the step nav — reflect live drafts while on the step.
  // Computed as a single object so visual content and sr-only text always use the same values.
  const navThreshValues = (() => {
    if (step === 'thresholds') {
      const c = parseFloat(draftCautionWind), r = parseFloat(draftRedWind), g = parseFloat(draftRedGust), p = parseFloat(draftCautionPrecip)
      if (!isNaN(c) && !isNaN(r) && !isNaN(g) && !isNaN(p)) return { caution: c, red: r, gust: g, precip: p }
    }
    return { caution: effectiveThresholds.cautionWindMs, red: effectiveThresholds.redWindMs, gust: effectiveThresholds.redGustMs, precip: effectiveThresholds.cautionPrecipMmPerHour }
  })()
  const navThreshWind = `${navThreshValues.caution}/${navThreshValues.red}/${navThreshValues.gust}`
  const navThreshPrecip = String(navThreshValues.precip)

  const mvpNavSteps = [
    { step: 'route' as WizardStep, label: tf('stepNavRoute'), Icon: Route },
    { step: 'trailer' as WizardStep, label: tf('stepNavTrailer'), Icon: Caravan },
    { step: 'thresholds' as WizardStep, label: tf('stepNavThresholds'), Icon: SlidersHorizontal },
    { step: 'result' as WizardStep, label: tf('stepNavResult'), Icon: CheckCircle2 },
  ]

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-lg mx-auto px-4 pt-8 pb-10 flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center gap-2">
          <Link
            href="/auth-mvp/heim"
            aria-label={t('backLink')}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft size={20} aria-hidden />
          </Link>
          <div className="flex-1 flex items-center gap-2">
            <CloudSun size={20} className="text-primary" aria-hidden />
            <h1 className="text-lg font-semibold text-primary">{t('title')}</h1>
          </div>
          <TeskeidMenu variant="authenticated" />
        </div>

        {/* Beta banner — visible on all wizard steps */}
        <WeatherBetaBanner />

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
                  ) : s.step === 'trailer' && (isCompleted || isCurrent) ? (
                    <>
                      <s.Icon size={14} aria-hidden />
                      <span className="text-[10px] leading-none truncate max-w-full">{trailerLabel}</span>
                    </>
                  ) : s.step === 'thresholds' && (isCompleted || isCurrent) ? (
                    <>
                      <span className="sr-only">{tf('stepNavThresholdSummaryAria', navThreshValues)}</span>
                      <span aria-hidden className="flex flex-col items-center gap-0.5">
                        <span className="flex items-center gap-0.5">
                          <Wind size={10} />
                          <span className="text-[10px] leading-none">{navThreshWind}</span>
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Droplets size={10} />
                          <span className="text-[10px] leading-none">{navThreshPrecip}</span>
                        </span>
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
              onRouteSelected={setSelectedRouteId}
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
          </div>
        )}

        {/* Step: Trailer */}
        {step === 'trailer' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium text-foreground">{tf('stepTrailerTitle')}</p>
            <div className="flex flex-col gap-2">
              {trailerOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTrailerKind(opt.value)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    trailerKind === opt.value
                      ? 'border-primary bg-primary/10 text-foreground font-medium'
                      : 'border-border bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <BackButton onClick={() => goBack('trailer')} label={tf('back')} />
              <button
                type="button"
                onClick={() => goNext('trailer')}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {tf('next')}
              </button>
            </div>
          </div>
        )}

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
              <ThresholdInput id="red-gust" label={tf('thresholdRedGust')} unit="m/s" value={draftRedGust} onChange={setDraftRedGust} />
              <ThresholdInput id="caution-precip" label={tf('thresholdCautionPrecip')} unit="mm/klst" value={draftCautionPrecip} onChange={setDraftCautionPrecip} />
            </div>
            {thresholdError && (
              <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
                {thresholdError}
              </p>
            )}
            {thresholdDraftDiffersFromDefaults && (
              <button
                type="button"
                onClick={() => {
                  const defaults = resolveThresholds(trailerKind)
                  setDraftCautionWind(String(defaults.cautionWindMs))
                  setDraftRedWind(String(defaults.redWindMs))
                  setDraftRedGust(String(defaults.redGustMs))
                  setDraftCautionPrecip(String(defaults.cautionPrecipMmPerHour))
                  setThresholdError(null)
                }}
                className="w-full text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring py-1"
              >
                {tf('thresholdReset')}
              </button>
            )}
            <div className="flex gap-2">
              <BackButton onClick={() => goBack('thresholds')} label={tf('back')} />
              <button
                type="button"
                onClick={handleThresholdSubmit}
                disabled={loading}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {loading ? tf('submitting') : tf('thresholdSubmit')}
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
                subtitle={tf('resultLoadingSubtitle')}
                steps={[
                  tf('resultLoadingStepRoute'),
                  tf('resultLoadingStepWeather'),
                  tf('resultLoadingStepWindow'),
                ]}
                routeLabel={
                  origin && destination
                    ? `${origin.name} \u2192 ${destination.name}`
                    : undefined
                }
              />
            )}

            {error && !loading && (
              <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            {/* Combined card — title, scrubber, status sentence, coverage, disclaimer */}
            {result && !loading && (() => {
              const derivedStatus = activeOutboundCandidate?.status ?? result.stada
              const derivedStyle = derivedStatus ? STATUS_STYLES[derivedStatus] : null
              const statusKey = derivedStatus === 'graent' ? 'departureStatusGreen'
                : derivedStatus === 'gult' ? 'departureStatusYellow'
                : 'departureStatusRed'
              return (
                <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">

                  {/* Coverage text — at top so user knows the forecast scope before reading scrubber */}
                  {coverageEndDate && (
                    <p className="text-xs text-muted-foreground">
                      {tf('coverageTextUntilDate', { date: formatCoverageDate(coverageEndDate, locale) })}
                    </p>
                  )}

                  {/* Departure scrubber — no redundant title */}
                  {outboundDisplayCandidates.length > 1 && (
                    <DepartureHeatmap
                      candidates={outboundDisplayCandidates}
                      bestWindow={result.travelPlan!.outbound.windowMode ? result.travelPlan!.outbound.bestWindow : undefined}
                      originName={origin!.name}
                      selectedIdx={selectedHeatmapIdx}
                      onSelectIdx={handleOutboundSelect}
                      visibleStatuses={outboundVisibleStatuses}
                      onVisibleStatusesChange={setOutboundVisibleStatuses}
                      thresholdsUsed={thresholdsUsed}
                      title={null}
                    />
                  )}

                  {/* Dynamic status sentence */}
                  {activeOutboundCandidate && derivedStyle && (
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${derivedStyle.dot}`} aria-hidden />
                      <p className={`text-sm font-medium ${derivedStyle.label}`}>
                        {tf(statusKey as 'departureStatusGreen' | 'departureStatusYellow' | 'departureStatusRed', { time: formatKlTime(activeOutboundCandidate.departureIso) })}
                      </p>
                    </div>
                  )}

                  {/* Ferry context note */}
                  {ferrySelection && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 leading-relaxed">
                      {tf('ferryResultNote', { portName: ferrySelection.ferryPort.name })}
                    </p>
                  )}

                  {/* Best departure window badge */}
                  {result.travelPlan?.outbound.windowMode && result.travelPlan.outbound.bestWindow && (
                    <p className="text-xs text-muted-foreground">
                      {tf('bestWindowLabel')}: {formatWindowRange(result.travelPlan.outbound.bestWindow.fromIso, result.travelPlan.outbound.bestWindow.toIso, locale)}
                    </p>
                  )}

                  {/* Return best window */}
                  {result.travelPlan?.return?.bestWindow && (
                    <p className="text-xs text-muted-foreground">
                      {tf('returnWindowLabel')}: {formatWindowRange(result.travelPlan.return.bestWindow.fromIso, result.travelPlan.return.bestWindow.toIso, locale)}
                    </p>
                  )}

                  {/* Active thresholds display — only when user has set custom thresholds */}
                  {result.travelPlan?.thresholdsUsed && hasOverrides && (
                    <p className="text-xs text-muted-foreground">
                      {tf('thresholdsUsedLabel')}: {tf('thresholdsCustom', {
                        caution: result.travelPlan.thresholdsUsed.cautionWindMs,
                        red: result.travelPlan.thresholdsUsed.redWindMs,
                        gust: result.travelPlan.thresholdsUsed.redGustMs,
                        precip: result.travelPlan.thresholdsUsed.cautionPrecipMmPerHour,
                      })}
                    </p>
                  )}

                  {/* Arrival weather block */}
                  {activeOutboundCandidate?.arrivalWeather && (
                    <div className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-xs flex flex-col gap-1">
                      <span className="font-medium text-foreground flex items-center gap-1">
                        <CheckCircle2 size={12} aria-hidden />
                        {tf('arrivalAtDestination', { destination: effectiveDestinationName, time: formatKlTime(activeOutboundCandidate.arrivalIso) })}
                      </span>
                      <span className="text-muted-foreground">
                        {tf('arrivalWeatherAt', { time: formatKlTime(activeOutboundCandidate.arrivalWeather.forecastTimeIso) })}{': '}
                        {tf('metricWind')}: {formatNum(activeOutboundCandidate.arrivalWeather.windMs, locale)} m/s
                        {activeOutboundCandidate.arrivalWeather.gustMs > activeOutboundCandidate.arrivalWeather.windMs && (
                          <> · {tf('metricGust')}: {formatNum(activeOutboundCandidate.arrivalWeather.gustMs, locale)} m/s</>
                        )}
                        {' · '}{tf('metricPrecip')}: {formatNum(activeOutboundCandidate.arrivalWeather.precipMmPerHour, locale)} mm/klst
                        {activeOutboundCandidate.arrivalWeather.airTemperatureC !== undefined && (
                          <> · {tf('metricTemp')}: {formatNum(activeOutboundCandidate.arrivalWeather.airTemperatureC, locale)}°C</>
                        )}
                      </span>
                      {result.travelPlan?.destinationForecastHours && result.travelPlan.destinationForecastHours.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowArrivalForecast(true)}
                          className="self-start text-primary underline hover:text-primary/80 transition-colors text-[11px]"
                        >
                          {tf('viewFullForecast')}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Disclaimer */}
                  <p className="text-xs text-muted-foreground">
                    {tf.rich('weatherDisclaimer', {
                      link: (chunks) => (
                        <a href="https://umferdin.is" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
                          {chunks}
                        </a>
                      ),
                    })}
                  </p>
                </div>
              )
            })()}

            {/* Interactive audit map */}
            {result && !loading && origin && destination && (result.travelPlan?.routeWeatherPoints?.length ?? 0) > 0 && (
              <TravelAuditMap
                key={result.id}
                originName={origin.name}
                destinationName={effectiveDestinationName}
                routePoints={result.travelPlan?.route.auditPolylinePoints ?? []}
                weatherPoints={result.travelPlan!.routeWeatherPoints!}
                highlightedIssue={heatmapHighlightedIssue}
                staticMapUrl={result.travelPlan?.route.auditMapUrl}
                selectedCandidatePointStatuses={selectedCandidatePointStatuses}
                activeCandidate={activeCandidate}
                activeLeg={activeLeg}
                visibleStatuses={mapVisibleStatuses}
                onVisibleStatusesChange={setMapOutboundVisibleStatuses}
                selectionResetSignal={mapSelectionSignal}
              />
            )}

            {/* Return departure heatmap */}
            {result && !loading && (result.travelPlan?.return?.candidates.length ?? 0) > 0 && (
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
                {showExplainer && (result.travelPlan?.routeWeatherPoints?.length ?? 0) > 0 && (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground">{tf('betaTransparencyCopy')}</p>
                    {result.travelPlan!.routeWeatherPoints!.map((pt) => (
                      <RoutePointRow
                        key={pt.id}
                        pt={pt}
                        activeCandidate={userExplicitSlot && selectedCandidatePointStatuses !== undefined ? activeCandidate : undefined}
                        activeLeg={activeLeg}
                        selectedCandidatePointStatuses={selectedCandidatePointStatuses}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Attribution */}
        <p className="text-xs text-muted-foreground text-center">{t('attribution')}</p>

      </main>

      {/* Arrival forecast drawer */}
      {showArrivalForecast && result?.travelPlan?.destinationForecastHours && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40"
          onClick={() => setShowArrivalForecast(false)}
        >
          <div
            className="bg-background border-t w-full max-h-[75vh] overflow-y-auto rounded-t-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-sm font-semibold">{tf('arrivalForecastTitle', { destination: effectiveDestinationName })}</h2>
              <button
                type="button"
                onClick={() => setShowArrivalForecast(false)}
                className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
                aria-label="Loka"
              >
                ×
              </button>
            </div>
            <div className="px-4 pb-6">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="py-2 pr-3 font-medium">{tf('forecastColDateTime')}</th>
                    <th className="py-2 pr-3 font-medium text-right">{tf('forecastColTemp')}</th>
                    <th className="py-2 pr-3 font-medium text-right">{tf('forecastColWind')}</th>
                    <th className="py-2 font-medium text-right">{tf('forecastColPrecip')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.travelPlan.destinationForecastHours.map(h => {
                    const d = new Date(h.time)
                    const dateLabel = d.toLocaleDateString(locale === 'is' ? 'is-IS' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                    const timeLabel = d.toLocaleTimeString(locale === 'is' ? 'is-IS' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
                    const isArrivalHour = activeOutboundCandidate?.arrivalWeather?.forecastTimeIso === h.time
                    return (
                      <tr key={h.time} className={`border-b border-muted/40 ${isArrivalHour ? 'bg-primary/5 font-medium' : ''}`}>
                        <td className="py-1.5 pr-3 text-foreground">{dateLabel} {timeLabel}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{formatNum(h.airTemperatureC, locale)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{formatNum(h.windSpeedMs, locale)}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatNum(h.precipitationMmPerHour, locale)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    ? ` (${Math.round(distanceKm)} km, ${Math.round(durationMinutes)} ${tf('routeDurationMinsUnit')})`
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

function RoutePointRow({
  pt,
  activeCandidate,
  activeLeg = 'outbound',
  selectedCandidatePointStatuses,
}: {
  pt: RouteWeatherPoint
  activeCandidate?: TravelCandidate
  activeLeg?: 'outbound' | 'return'
  selectedCandidatePointStatuses?: CandidatePointStatus[]
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const locale = useLocale()
  const badges: string[] = []
  if (pt.isHighlightedIssue) badges.push(tf('decisivePointLabel'))
  if (pt.isDestinationClosest && !pt.isOrigin) badges.push(tf('nearestDestLabel'))

  const forecastDistanceM = Math.round(haversineMeters({ lat: pt.lat, lng: pt.lon }, { lat: pt.forecastLat, lng: pt.forecastLon }))

  // When a heatmap slot is explicitly selected, use active-candidate-aware rendering.
  // selectedCandidatePointStatuses being defined (even empty) means a slot is selected.
  const isActiveMode = activeCandidate !== undefined && selectedCandidatePointStatuses !== undefined

  // Delta encoding: absent entry means green; stored entry carries the non-green status.
  const candidatePointEntry = selectedCandidatePointStatuses?.find(s => s.routeIndex === pt.routeIndex)
  const activeStatus: 'graent' | 'gult' | 'rautt' | 'no_data' = isActiveMode
    ? (candidatePointEntry?.status ?? 'graent')
    : (pt.summaryForWindow?.status ?? 'no_data')

  const status = isActiveMode ? activeStatus : pt.summaryForWindow?.status

  const cardClass = status === 'rautt' ? 'bg-destructive/5 border-destructive/30'
    : status === 'gult' ? 'bg-amber-50 border-amber-300'
    : status === 'graent' ? 'bg-[#2d5a27]/5 border-[#2d5a27]/35'
    : 'bg-muted/40 border-muted-foreground/20'

  const badgeClass = status === 'rautt' ? 'bg-destructive/10 text-destructive'
    : status === 'gult' ? 'bg-amber-100 text-amber-700'
    : status === 'graent' ? 'bg-[#2d5a27]/10 text-[#2d5a27]'
    : 'bg-muted text-muted-foreground'

  const statusLabel = status === 'rautt' ? tf('heatmapLegendRed')
    : status === 'gult' ? tf('heatmapLegendYellow')
    : status === 'graent' ? tf('heatmapLegendGreen')
    : tf('heatmapNoData')

  // ETA: use active-candidate estimate when a slot is selected, otherwise summaryForWindow
  const etaIso = isActiveMode
    ? estimatePointEtaIso(activeCandidate, pt, activeLeg)
    : pt.summaryForWindow?.etaIso

  return (
    <div className={`border ${cardClass} rounded-lg px-3 py-2 flex flex-col gap-1 text-xs text-muted-foreground`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-foreground">{tf('pointLabel')} {pt.routeIndex + 1}/{pt.totalRouteWeatherPoints}</span>
        <span className={`px-1.5 py-0.5 rounded font-medium text-[10px] ${badgeClass}`}>{statusLabel}</span>
        {badges.map(b => (
          <span key={b} className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs">{b}</span>
        ))}
      </div>
      <span>{Math.round(pt.distanceFromOriginM / 1000)} {tf('kmFromOrigin')}</span>
      {etaIso && (
        <span>{tf('pointEtaLabel')}: {tf('pointTimeLine', { time: formatKlTime(etaIso) })}</span>
      )}
      <span>
        {forecastDistanceM < 1000
          ? tf('forecastPointDistanceMeters', { meters: forecastDistanceM })
          : tf('forecastPointDistanceKilometers', { kilometers: formatNum(forecastDistanceM / 1000, locale) })}
      </span>
      {isActiveMode ? (() => {
        // Active-candidate mode: suppress summaryForWindow metrics (different time window).
        // Show active-safe metrics only from displayPoint when the route index matches.
        if (activeStatus === 'no_data') return <p>{tf('heatmapNotAssessedDetail')}</p>
        const dp = activeCandidate?.displayPoint?.routeIndex === pt.routeIndex ? activeCandidate!.displayPoint! : undefined
        if (!dp) return null
        return (
          <>
            <span>{tf('pointForecastHereAt', { time: formatKlTime(dp.forecastTimeIso) })}</span>
            <p>
              {tf('metricWind')}: {formatNum(dp.windMs, locale)} m/s
              {dp.gustMs > dp.windMs && (
                <> · {tf('metricGust')}: {formatNum(dp.gustMs, locale)} m/s</>
              )}
              {' · '}{tf('metricPrecip')}: {formatNum(dp.precipMmPerHour, locale)} mm/klst
              {dp.airTemperatureC !== undefined && (
                <> · {tf('metricTemp')}: {formatNum(dp.airTemperatureC, locale)}°C</>
              )}
            </p>
          </>
        )
      })() : (
        <>
          {pt.summaryForWindow?.forecastTimeIso && (
            <span>{tf('pointForecastHereAt', { time: formatKlTime(pt.summaryForWindow.forecastTimeIso) })}</span>
          )}
          {pt.summaryForWindow ? (
            <p>
              {tf('metricWind')}: {formatNum(pt.summaryForWindow.worstWindMs, locale)} m/s
              {pt.summaryForWindow.worstGustMs > pt.summaryForWindow.worstWindMs && (
                <> · {tf('metricGust')}: {formatNum(pt.summaryForWindow.worstGustMs, locale)} m/s</>
              )}
              {' · '}{tf('metricPrecip')}: {formatNum(pt.summaryForWindow.worstPrecipMmPerHour, locale)} mm/klst
              {pt.summaryForWindow.decisiveTempC !== undefined && (
                <> · {tf('metricTemp')}: {formatNum(pt.summaryForWindow.decisiveTempC, locale)}°C</>
              )}
            </p>
          ) : (
            <p>{tf('heatmapNoData')}</p>
          )}
        </>
      )}
      <div className="flex gap-3 flex-wrap">
        <a href={pt.yrnoUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">{tf('viewForecast')}</a>
        <a href={pt.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">{tf('openOnMap')}</a>
        <a href={pt.metnoUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors text-muted-foreground/60">{tf('viewMetnoRaw')}</a>
      </div>
    </div>
  )
}
