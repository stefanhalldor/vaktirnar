'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { ChevronLeft, CloudSun, ChevronDown, ChevronUp, MapPin, Route, Truck, SlidersHorizontal, CheckCircle2 } from 'lucide-react'
import type { DeterministicResult, WeatherStatus, RouteWeatherPoint, TravelIssue, CandidatePointStatus, TravelThresholdOverrides, TravelCandidate } from '@/lib/weather/types'
import type { RouteOption } from '@/lib/weather/provider.types'
import { resolveThresholds, validateResolvedThresholdOrdering } from '@/lib/weather/thresholds'
import { TravelAuditMap } from '@/components/weather/TravelAuditMap'
import { DepartureHeatmap, type SlotStatus } from '@/components/weather/DepartureHeatmap'
import { RouteSelectionStep, type RoutePlace } from '@/components/weather/RouteSelectionStep'
import { WeatherBetaBanner } from '@/components/weather/WeatherBetaBanner'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { formatKlTime, candidateToIssue, normalizeLocale, formatNum } from '@/components/weather/travelAuditMap.helpers'
import { isVestmannaeyjarDestination, FERRY_PORTS, type FerryPortId } from '@/lib/weather/ferryPorts'
import type { SavedWeatherPlace } from '@/lib/weather/savedPlaces'

type WizardStep = 'route' | 'trailer' | 'thresholds' | 'result' | 'assumptions'

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
  const [returnToStep, setReturnToStep] = useState<WizardStep | null>(null)
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
  const [selectedHeatmapIdx, setSelectedHeatmapIdx] = useState<number | null>(null)
  const [selectedReturnHeatmapIdx, setSelectedReturnHeatmapIdx] = useState<number | null>(null)
  // Filter state for each leg (lifted from DepartureHeatmap)
  const [outboundHiddenStatuses, setOutboundHiddenStatuses] = useState<Set<SlotStatus>>(() => new Set<SlotStatus>(['graent']))
  const [returnHiddenStatuses, setReturnHiddenStatuses] = useState<Set<SlotStatus>>(() => new Set<SlotStatus>(['graent']))
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

  // Reset departure filters when a new result arrives
  useEffect(() => {
    if (!result) return
    setOutboundHiddenStatuses(new Set<SlotStatus>(['graent']))
    setReturnHiddenStatuses(new Set<SlotStatus>(['graent']))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.id])

  // Clear result/error whenever origin or destination coordinates change
  useEffect(() => {
    setResult(null)
    setError(null)
    setSelectedHeatmapIdx(null)
    setSelectedReturnHeatmapIdx(null)
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
    if (returnToStep) {
      const dest = returnToStep
      setReturnToStep(null)
      setStep(dest)
      return
    }
    const idx = STEP_ORDER.indexOf(from)
    if (idx >= 0 && idx < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[idx + 1])
    }
  }

  function goBack(from: WizardStep) {
    if (returnToStep) {
      const dest = returnToStep
      setReturnToStep(null)
      setStep(dest)
      return
    }
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
    setReturnToStep(null)
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

  function startOver() {
    setStep('route')
    setReturnToStep(null)
    setOrigin(null)
    setDestination(null)
    setTrailerKind('none')
    // Keep thresholdOverrides — user chose them deliberately
    setResult(null)
    setError(null)
    setShowDetails(false)
    setShowExplainer(false)
    setSelectedHeatmapIdx(null)
    setSelectedReturnHeatmapIdx(null)
    setSubmittedThresholds(null)
    setRouteOptions(null)
    setRouteOptionsLoading(false)
    setRouteOptionsError(null)
    setSelectedRouteId(null)
    setRouteRetryCount(0)
    setRouteFallback(false)
    setFerrySelection(null)
  }

  // Auto-select when outbound filter hides the currently selected slot, or when no slot is selected
  useEffect(() => {
    if (outboundDisplayCandidates.length === 0) return
    if (outboundHiddenStatuses.size === 0) return
    // Skip if selected slot is still visible
    if (selectedHeatmapIdx !== null) {
      const sel = outboundDisplayCandidates[selectedHeatmapIdx]
      if (!sel) return
      const st: SlotStatus = sel.reasonCode === 'no_data' ? 'no_data' : sel.status
      if (!outboundHiddenStatuses.has(st)) return
    }
    const visible = (c: TravelCandidate) => {
      const s: SlotStatus = c.reasonCode === 'no_data' ? 'no_data' : c.status
      return !outboundHiddenStatuses.has(s)
    }
    const firstRed = outboundDisplayCandidates.findIndex(c => visible(c) && c.status === 'rautt')
    const firstYellow = outboundDisplayCandidates.findIndex(c => visible(c) && c.status === 'gult')
    const firstAny = outboundDisplayCandidates.findIndex(visible)
    const next = firstRed >= 0 ? firstRed : firstYellow >= 0 ? firstYellow : firstAny
    setSelectedHeatmapIdx(next >= 0 ? next : null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outboundHiddenStatuses])

  // Auto-select when return filter hides the currently selected slot, or when no slot is selected
  useEffect(() => {
    if (returnCandidates.length === 0) return
    if (returnHiddenStatuses.size === 0) return
    // Skip if selected slot is still visible
    if (selectedReturnHeatmapIdx !== null) {
      const sel = returnCandidates[selectedReturnHeatmapIdx]
      if (!sel) return
      const st: SlotStatus = sel.reasonCode === 'no_data' ? 'no_data' : sel.status
      if (!returnHiddenStatuses.has(st)) return
    }
    const visible = (c: TravelCandidate) => {
      const s: SlotStatus = c.reasonCode === 'no_data' ? 'no_data' : c.status
      return !returnHiddenStatuses.has(s)
    }
    const firstRed = returnCandidates.findIndex(c => visible(c) && c.status === 'rautt')
    const firstYellow = returnCandidates.findIndex(c => visible(c) && c.status === 'gult')
    const firstAny = returnCandidates.findIndex(visible)
    const next = firstRed >= 0 ? firstRed : firstYellow >= 0 ? firstYellow : firstAny
    setSelectedReturnHeatmapIdx(next >= 0 ? next : null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnHiddenStatuses])

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

  // Selecting one leg clears the other so at most one is active at a time
  function handleOutboundSelect(idx: number | null) {
    setSelectedHeatmapIdx(idx)
    if (idx !== null) setSelectedReturnHeatmapIdx(null)
  }
  function handleReturnSelect(idx: number | null) {
    setSelectedReturnHeatmapIdx(idx)
    if (idx !== null) setSelectedHeatmapIdx(null)
  }

  // Route distance in meters — needed to flip distances for return leg
  const routeDistanceM = result ? Math.round(result.travelPlan!.route.distanceKm * 1000) : undefined

  const thresholdsUsed = result?.travelPlan?.thresholdsUsed
  const heatmapHighlightedIssue =
    selectedReturnHeatmapIdx !== null && returnCandidates[selectedReturnHeatmapIdx]
      ? (candidateToIssue(returnCandidates[selectedReturnHeatmapIdx], 'return', { routeDistanceM, legStartName: effectiveDestinationName, thresholdsUsed }) ?? result?.travelPlan?.highlightedIssue)
    : selectedHeatmapIdx !== null && outboundDisplayCandidates[selectedHeatmapIdx]
      ? (candidateToIssue(outboundDisplayCandidates[selectedHeatmapIdx], 'outbound', { legStartName: origin?.name, thresholdsUsed }) ?? result?.travelPlan?.highlightedIssue)
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

  // Map filter: use the filter for whichever leg is active
  const mapHiddenStatuses = activeLeg === 'return' ? returnHiddenStatuses : outboundHiddenStatuses

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
  const thresholdRowValue = hasOverrides
    ? tf('thresholdsCustom', {
        caution: effectiveThresholds.cautionWindMs,
        red: effectiveThresholds.redWindMs,
        gust: effectiveThresholds.redGustMs,
        precip: effectiveThresholds.cautionPrecipMmPerHour,
      })
    : tf('thresholdsDefault')

  const mvpNavSteps = [
    { step: 'route' as WizardStep, label: tf('stepNavRoute'), Icon: Route },
    { step: 'trailer' as WizardStep, label: tf('stepNavTrailer'), Icon: Truck },
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
                    if (isCompleted) { setReturnToStep(null); setStep(s.step) }
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
                  <s.Icon size={16} aria-hidden />
                  <span className="text-[10px] leading-none truncate max-w-full">{s.label}</span>
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

        {/* Step: Assumptions */}
        {step === 'assumptions' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium text-foreground">{tf('assumptionsTitle')}</p>
            <div className="flex flex-col gap-2">
              <AssumptionRow
                label={tf('assumptionFrom')}
                value={origin?.name ?? tf('assumptionNotSet')}
                onClick={() => { setReturnToStep('assumptions'); setStep('route') }}
                editLabel={tf('edit')}
              />
              <AssumptionRow
                label={tf('assumptionTo')}
                value={destination?.name ?? tf('assumptionNotSet')}
                onClick={() => { setReturnToStep('assumptions'); setStep('route') }}
                editLabel={tf('edit')}
              />
              <AssumptionRow
                label={tf('assumptionTrailer')}
                value={trailerLabel}
                onClick={() => { setReturnToStep('assumptions'); setStep('trailer') }}
                editLabel={tf('edit')}
              />
              <AssumptionRow
                label={tf('assumptionThresholds')}
                value={thresholdRowValue}
                onClick={() => { setReturnToStep('assumptions'); setStep('thresholds') }}
                editLabel={tf('edit')}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={startOver}
                className="flex-1 h-11 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {tf('startOver')}
              </button>
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={loading || !origin || !destination}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {loading ? tf('submitting') : tf('recompute')}
              </button>
            </div>
          </div>
        )}

        {/* Step: Result */}
        {step === 'result' && (
          <div className="flex flex-col gap-4">
            {origin && destination && (
              <RouteSummary originName={origin.name} destinationName={effectiveDestinationName} />
            )}

            {/* Actions at the top — before result card */}
            {!loading && (
              <div className="flex gap-2">
                {error && (
                  <BackButton onClick={() => goBack('result')} label={tf('back')} />
                )}
                {result && (
                  <button
                    type="button"
                    onClick={() => setStep('assumptions')}
                    className="flex-1 h-11 rounded-xl border border-primary/30 text-sm text-primary hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {tf('editAssumptions')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={startOver}
                  className="flex-1 h-11 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {tf('startOver')}
                </button>
              </div>
            )}

            {loading && (
              <div className="bg-card border border-border rounded-xl px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">{tf('submitting')}</p>
              </div>
            )}

            {error && !loading && (
              <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            {result && statusStyle && !loading && (
              <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusStyle.dot} shrink-0`} aria-hidden />
                  <span className={`text-xs font-medium ${statusStyle.label}`}>
                    {t(`status${status!.charAt(0).toUpperCase()}${status!.slice(1)}` as 'statusGraent' | 'statusGult' | 'statusRautt')}
                  </span>
                </div>

                <p className="text-sm text-foreground leading-relaxed">{result.svar}</p>

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

                {/* Active thresholds display */}
                {result.travelPlan?.thresholdsUsed && (
                  <p className="text-xs text-muted-foreground">
                    {hasOverrides ? tf('thresholdsUsedLabel') : tf('thresholdsDefault')}
                    {hasOverrides && ': ' + tf('thresholdsCustom', {
                      caution: result.travelPlan.thresholdsUsed.cautionWindMs,
                      red: result.travelPlan.thresholdsUsed.redWindMs,
                      gust: result.travelPlan.thresholdsUsed.redGustMs,
                      precip: result.travelPlan.thresholdsUsed.cautionPrecipMmPerHour,
                    })}
                  </p>
                )}

                {/* Next caution with metric + threshold + location */}
                {result.travelPlan?.outbound.nextCaution !== undefined && (() => {
                  const nc = result.travelPlan!.outbound.nextCaution!
                  if (!nc.departureIso) {
                    return (
                      <p className="text-xs text-muted-foreground">
                        {nc.scannedHours >= 3
                          ? tf('nextCautionNone', { hours: nc.scannedHours })
                          : tf('nextCautionInsufficient')}
                      </p>
                    )
                  }
                  const metricLabel =
                    nc.issue?.metric === 'precipitation' ? tf('metricPrecip')
                    : nc.issue?.metric === 'gust' ? tf('metricGust')
                    : nc.issue?.metric === 'wind' ? tf('metricWind')
                    : null
                  const distKm = nc.issue?.distanceFromLegStartM !== undefined
                    ? Math.round(nc.issue.distanceFromLegStartM / 1000)
                    : null
                  const earliestDepDate = result.travelPlan!.outbound.earliestDepartureIso.slice(0, 10)
                  const ncDate = nc.departureIso.slice(0, 10)
                  const ncTimeStr = ncDate !== earliestDepDate
                    ? tf('heatmapSlotDateTime', {
                        date: new Date(nc.departureIso).toLocaleDateString(normalizeLocale(locale), {
                          weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
                        }),
                        time: formatKlTime(nc.departureIso),
                      })
                    : tf('heatmapSlotTime', { time: formatKlTime(nc.departureIso) })
                  return (
                    <p className="text-xs text-muted-foreground">
                      {tf('nextCautionLine', { time: ncTimeStr })}
                      {metricLabel && nc.issue?.value !== undefined ? (
                        <>
                          {' · '}{metricLabel}: {formatNum(nc.issue.value, locale)} {nc.issue.unit ?? ''}
                          {nc.issue.thresholdValue !== undefined && (
                            <> {tf('aboveThresholdWithExcess', { excess: formatNum(nc.issue.value - nc.issue.thresholdValue, locale), threshold: formatNum(nc.issue.thresholdValue, locale), unit: nc.issue.thresholdUnit ?? '' })}</>
                          )}
                          {distKm !== null && nc.issue.legStartName && (
                            <> · {distKm} {tf('kmFrom')} {nc.issue.legStartName}</>
                          )}
                        </>
                      ) : '.'}
                    </p>
                  )
                })()}

                {/* Details toggle */}
                {result.facts && result.facts.length > 0 && (
                  <div className="border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => setShowDetails((v) => !v)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      aria-expanded={showDetails}
                    >
                      {showDetails ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
                      {t('whyLabel')}
                    </button>
                    {showDetails && (
                      <div className="mt-2 flex flex-col gap-2">
                        <ul className="flex flex-col gap-1">
                          {result.facts.map((f, i) => (
                            <li key={i} className="text-xs text-muted-foreground">{f}</li>
                          ))}
                        </ul>
                        {result.travelPlan?.highlightedIssue && (
                          <IssueAuditCard issue={result.travelPlan.highlightedIssue} />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Dev diagnostic */}
            {process.env.NODE_ENV === 'development' && result && !loading &&
              result.travelPlan?.outbound.nextCaution?.departureIso &&
              outboundDisplayCandidates.length <= 1 && (
              <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
                [dev] Timeline data missing despite next caution — check server response shape
              </p>
            )}

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
                hiddenStatuses={mapHiddenStatuses}
                belowMap={outboundDisplayCandidates.length > 1 ? (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <DepartureHeatmap
                      candidates={outboundDisplayCandidates}
                      bestWindow={result.travelPlan!.outbound.windowMode ? result.travelPlan!.outbound.bestWindow : undefined}
                      originName={origin.name}
                      selectedIdx={selectedHeatmapIdx}
                      onSelectIdx={handleOutboundSelect}
                      title={tf('heatmapDeparturePickerTitle')}
                      subtitle={tf('heatmapDeparturePickerSubtitle')}
                      hiddenStatuses={outboundHiddenStatuses}
                      onHiddenStatusesChange={setOutboundHiddenStatuses}
                      thresholdsUsed={thresholdsUsed}
                    />
                  </div>
                ) : undefined}
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
                  hiddenStatuses={returnHiddenStatuses}
                  onHiddenStatusesChange={setReturnHiddenStatuses}
                  thresholdsUsed={thresholdsUsed}
                />
              </div>
            )}

            {/* Deterministic explainer */}
            {result && !loading && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">{tf('howAssessedShort')}</p>
                <button
                  type="button"
                  onClick={() => setShowExplainer((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded self-start"
                  aria-expanded={showExplainer}
                >
                  {showExplainer ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
                  {tf('howAssessedTitle')}
                </button>
                {showExplainer && (
                  <>
                    <p className="text-xs text-muted-foreground leading-relaxed">{tf('howAssessedBody')}</p>
                    {(result.travelPlan?.routeWeatherPoints?.length ?? 0) > 0 && (
                      <div className="flex flex-col gap-3 border-t border-border pt-3 mt-1">
                        <p className="text-xs text-muted-foreground">{tf('betaTransparencyCopy')}</p>
                        {result.travelPlan!.routeWeatherPoints!.map((pt) => (
                          <RoutePointRow key={pt.id} pt={pt} />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Attribution */}
        <p className="text-xs text-muted-foreground text-center">{t('attribution')}</p>

      </main>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function RouteSummary({ originName, destinationName }: { originName: string; destinationName: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <MapPin size={12} aria-hidden />
      <span>{originName} → {destinationName}</span>
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

function AssumptionRow({
  label,
  value,
  onClick,
  editLabel,
}: {
  label: string
  value: string
  onClick: () => void
  editLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${editLabel}: ${label}`}
      className="w-full flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 gap-3 text-left min-h-[44px] hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground font-medium truncate">{value}</p>
      </div>
      <span className="text-xs text-muted-foreground shrink-0">{editLabel}</span>
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
        {issue.thresholdValue !== undefined && issue.value !== undefined && (
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

function RoutePointRow({ pt }: { pt: RouteWeatherPoint }) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const badges: string[] = []
  if (pt.isHighlightedIssue) badges.push(tf('decisivePointLabel'))
  if (pt.isDestinationClosest && !pt.isOrigin) badges.push(tf('nearestDestLabel'))

  return (
    <div className="border border-border rounded-lg px-3 py-2 flex flex-col gap-1 text-xs text-muted-foreground">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-foreground">{tf('pointLabel')} {pt.routeIndex + 1}/{pt.totalRouteWeatherPoints}</span>
        {badges.map(b => (
          <span key={b} className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs">{b}</span>
        ))}
      </div>
      <p>{Math.round(pt.distanceFromOriginM / 1000)} {tf('kmFromOrigin')}</p>
      {pt.summaryForWindow && (
        <p>
          {tf('metricWind')}: {pt.summaryForWindow.worstWindMs.toFixed(1)} m/s
          {pt.summaryForWindow.worstGustMs > pt.summaryForWindow.worstWindMs && (
            <> · {tf('metricGust')}: {pt.summaryForWindow.worstGustMs.toFixed(1)} m/s</>
          )}
          {' · '}{tf('metricPrecip')}: {pt.summaryForWindow.worstPrecipMmPerHour.toFixed(1)} mm/klst
        </p>
      )}
      <p className="text-foreground/60">{tf('metnoCoordLabel')}: {pt.forecastLat}, {pt.forecastLon}</p>
      <div className="flex gap-3 flex-wrap">
        <a href={pt.yrnoUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">{tf('viewForecast')}</a>
        <a href={pt.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">{tf('openOnMap')}</a>
        <a href={pt.metnoUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors text-muted-foreground/60">{tf('viewMetnoRaw')}</a>
      </div>
    </div>
  )
}
