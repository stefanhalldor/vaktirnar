import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function readWorkspaceFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('public Teskeið route client contract', () => {
  it('enables the global route switch on the signed-out Weather page', () => {
    const source = readWorkspaceFile('app/vedrid/page.tsx')

    expect(source).toContain('isTeskeidRouteCandidateEnabled()')
    expect(source).toContain('teskeidRouteCandidateEnabled={isTeskeidRouteCandidateEnabled()}')
  })

  it('keeps the mobile top navigation below the device status area', () => {
    const source = readWorkspaceFile('components/weather/RoadMapPrototypeMap.tsx')

    expect(source).toContain(
      'pt-[calc(env(safe-area-inset-top,0px)+1rem)] sm:pt-2',
    )
  })

  it('makes authenticated weather-place autosave recoverable across navigation and transient failures', () => {
    const source = readWorkspaceFile('components/weather/RoadMapPrototypeMap.tsx')
    const authenticatedPage = readWorkspaceFile('app/auth-mvp/vedrid/page.tsx')

    expect(authenticatedPage).toContain('preferenceOwnerId={user.id}')
    expect(source).toContain('WEATHER_CHASE_AUTH_PENDING_STORAGE_PREFIX')
    expect(source).toContain('persistAuthenticatedWeatherChasePending(payload)')
    expect(source).toContain('window.localStorage.setItem(')
    expect(source).toContain('weatherChaseAutoSaveQueuedRef.current = payload')
    expect(source).toContain("window.addEventListener('pagehide', flushPendingOnExit)")
    expect(source).toContain("document.addEventListener('visibilitychange', flushWhenHidden)")
    expect(source).toContain('keepalive: options.keepalive === true')
    expect(source).toContain('flushWeatherChaseAutoSaveRef.current()')
    expect(source).toContain('retryDelayMs')
    expect(source).toContain('onRetrySave={isAuthenticated ? retryWeatherChaseAutoSave : undefined}')
    expect(source).toContain('onSaveDefault={isAuthenticated ? undefined : handleSaveWeatherChaseDefault}')
  })

  it('resolves RoadMap assessment first and enables only attested scoped candidates', () => {
    const source = readWorkspaceFile('components/weather/RoadMapPrototypeMap.tsx')

    expect(source).toContain('const scopedGoogleResult = await googleResultPromise')
    expect(source).toContain('const googleChoicesPromise = googleResultPromise.then(result => result.choices)')
    expect(source).toContain('resolveAssessmentScope: true')
    expect(source).toContain('places.assessmentOrigin')
    expect(source).toContain('places.assessmentDestination')
    expect(source).toContain('resolveAssessmentScope: true')
    expect(source).toContain('const initialTeskeidResultPromise = teskeidRouteCandidateEnabled')
    expect(source).not.toContain('async function resolveTeskeidAccessEnvelope(')
    expect(source).toContain('includeTeskeidCandidate: false')
    expect(source).toContain('function canRequestTeskeidCandidate(places: ResolvedRoutePlaces)')
    expect(source).toContain('const teskeidCandidateAllowed = teskeidRouteCandidateEnabled')
    const candidatePolicyStart = source.indexOf(
      'function canRequestTeskeidCandidate(places: ResolvedRoutePlaces)',
    )
    const candidatePolicyEnd = source.indexOf('\n}', candidatePolicyStart)
    const candidatePolicy = source.slice(candidatePolicyStart, candidatePolicyEnd)
    expect(candidatePolicy).toContain('assessmentScope.scopeId.length > 0')
    expect(candidatePolicy).toContain("assessmentOrigin.source === 'official'")
    expect(candidatePolicy).toContain('assessmentOrigin.lat === assessmentScope.origin.lat')
    expect(candidatePolicy).not.toContain('return false')
  })

  it('keeps signed envelopes with legacy public route choices and final submits', () => {
    const source = readWorkspaceFile('app/auth-mvp/vedrid/FerdalagidClient.tsx')
    const submit = source.slice(
      source.indexOf('async function handleSubmit('),
      source.indexOf('async function handleRefreshVedurstofan('),
    )
    const refresh = source.slice(
      source.indexOf('async function handleRefreshVedurstofan('),
      source.indexOf('// Sync known atime ref'),
    )
    const update = source.slice(
      source.indexOf('async function handleUpdateVedurstofan('),
      source.indexOf('function handleThresholdSubmit('),
    )

    expect(source).toContain('includeRouteEnvelopes: true')
    expect(source).toContain('const [routeEnvelopes, setRouteEnvelopes]')
    expect(source).toContain('async function selectedRouteRequestPayload(forceRefresh = false)')
    expect(source).toContain('async function postTravelWithSelectedRoute(')
    expect(source).toContain("firstError?.error !== 'route_envelope_invalid'")
    expect(submit).toContain('postTravelWithSelectedRoute({')
    expect(refresh).toContain('postTravelWithSelectedRoute({')
    expect(update).toContain('postTravelWithSelectedRoute({')
    expect(source.match(/fetch\('\/api\/teskeid\/weather\/travel',/g)?.length).toBe(1)
    expect(source).toContain('restoredSelectedRouteIdRef.current = state.selectedRouteId')
    expect(source).not.toContain('resolveAssessmentScope: true')
  })

  it('locks legacy departure slots to Veðurstofan-only status and rejects old restore state', () => {
    const source = readWorkspaceFile('app/auth-mvp/vedrid/FerdalagidClient.tsx')
    const submit = source.slice(
      source.indexOf('async function handleSubmit('),
      source.indexOf('async function handleRefreshVedurstofan('),
    )
    const restore = source.slice(
      source.indexOf('// 1. Try to restore a full route result'),
      source.indexOf('if (sessionRestored) return'),
    )
    const persist = source.slice(
      source.indexOf('// Persist route-result context'),
      source.indexOf('// Fetch saved places once on mount'),
    )
    const providerTiles = source.slice(
      source.indexOf('{/* met.no tile */}'),
      source.indexOf('{/* Vegagerðin tile'),
    )
    const slotPolicy = source.slice(
      source.indexOf('// Future whole-hour statuses are Veðurstofan-only.'),
      source.indexOf('// Keep ref in sync'),
    )

    expect(source).toContain('const ROUTE_RESTORE_SCHEMA_VERSION = 2')
    expect(source).toContain('const [showVedurstofan, setShowVedurstofan] = useState(true)')
    expect(source).toContain('const [showMetno, setShowMetno] = useState(false)')
    expect(source).toContain('d.schemaVersion !== ROUTE_RESTORE_SCHEMA_VERSION')
    expect(submit).toContain('setShowVedurstofan(true)')
    expect(submit).toContain('setShowMetno(false)')
    expect(restore).not.toContain('state.showVedurstofan')
    expect(restore).not.toContain('state.showMetno')
    expect(persist).not.toContain('showVedurstofan,')
    expect(persist).not.toContain('showMetno,')
    expect(providerTiles).toContain('onClick={() => setShowMetno(v => !v)}')
    expect(providerTiles).toContain('disabled')
    expect(slotPolicy).toContain('buildProviderSlotStatusOverrides({')
    expect(slotPolicy).toContain("vedurstofanSlotStatuses[idx] ?? 'no_data'")
    expect(slotPolicy).not.toContain('classifyCandidateWindDisplayStatus(')
    expect(slotPolicy).not.toContain('worstWindDisplayStatus(')
  })
})
