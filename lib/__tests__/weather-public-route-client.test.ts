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

  it('chains RoadMap public candidate discovery to a signed Google route grant', () => {
    const source = readWorkspaceFile('components/weather/RoadMapPrototypeMap.tsx')

    expect(source).toContain('const scopedGoogleResult = await fetchRouteSurfaceChoices(')
    expect(source).toContain('const googleChoicesPromise = Promise.resolve(scopedGoogleResult.choices)')
    expect(source).toContain('resolveAssessmentScope: true')
    expect(source).toContain('places.assessmentOrigin')
    expect(source).toContain('places.assessmentDestination')
    expect(source).toContain('...(accessRouteEnvelope ? { accessRouteEnvelope } : {})')
    expect(source).toContain('resolvePublicTeskeidAccessEnvelope(')
    expect(source).toContain('if (!isAuthenticated && !accessRouteEnvelope)')
    expect(source).toContain('if (!isAuthenticated || !teskeidRouteCandidateEnabled) return')
  })

  it('keeps signed envelopes with legacy public route choices and final submits', () => {
    const source = readWorkspaceFile('app/auth-mvp/vedrid/FerdalagidClient.tsx')
    const submit = source.slice(
      source.indexOf('async function handleSubmit('),
      source.indexOf('function toggleVedurstofan('),
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
})
