import { describe, expect, it, vi } from 'vitest'
import type {
  IcelandRoutingProvider,
  IcelandRoutingRequest,
} from '@/lib/iceland-routes/routingProvider'
import {
  isTeskeidRoutingShadowEnabled,
  runIcelandRoutingShadow,
} from '@/lib/iceland-routes/routingShadow.server'

const request: IcelandRoutingRequest = {
  origin: { point: { lat: 64.1466, lon: -21.9426 } },
  destination: { point: { lat: 65.6826, lon: -18.0907 } },
  vehicleProfile: 'car',
}

function provider(calculateRoutes: IcelandRoutingProvider['calculateRoutes']): IcelandRoutingProvider {
  return { id: 'teskeid_routes', calculateRoutes }
}

describe('Teskeid routing shadow flag', () => {
  it('is fail-closed and accepts only the exact true value', () => {
    expect(isTeskeidRoutingShadowEnabled({})).toBe(false)
    expect(isTeskeidRoutingShadowEnabled({ TESKEID_ROUTING_SHADOW_ENABLED: 'TRUE' })).toBe(false)
    expect(isTeskeidRoutingShadowEnabled({ TESKEID_ROUTING_SHADOW_ENABLED: 'true' })).toBe(true)
  })
})

describe('runIcelandRoutingShadow', () => {
  it('does not call the provider while disabled', async () => {
    const calculateRoutes = vi.fn()

    const outcome = await runIcelandRoutingShadow({
      provider: provider(calculateRoutes),
      request,
      enabled: false,
    })

    expect(outcome).toEqual({ status: 'disabled' })
    expect(calculateRoutes).not.toHaveBeenCalled()
  })

  it('returns a provider-neutral completed outcome with durationMs', async () => {
    const result = {
      provider: 'teskeid_routes' as const,
      calculatedAt: '2026-07-25T12:00:00.000Z',
      paths: [{
        id: 'teskeid-1',
        geometry: [request.origin.point, request.destination.point],
        distanceM: 388_000,
        durationS: 17_400,
        segmentIds: ['ring-road-west'],
        confidence: 'experimental' as const,
      }],
    }
    const calculateRoutes = vi.fn().mockResolvedValue(result)

    const outcome = await runIcelandRoutingShadow({
      provider: provider(calculateRoutes),
      request,
      enabled: true,
    })

    expect(outcome).toMatchObject({ status: 'completed', result })
    expect((outcome as { durationMs: number }).durationMs).toBeGreaterThanOrEqual(0)
    expect(calculateRoutes).toHaveBeenCalledWith(request)
  })

  it('contains provider failures instead of throwing', async () => {
    const error = new Error('experimental engine unavailable')
    const onOutcome = vi.fn()

    const outcome = await runIcelandRoutingShadow({
      provider: provider(vi.fn().mockRejectedValue(error)),
      request,
      enabled: true,
      onOutcome,
    })

    expect(outcome).toMatchObject({ status: 'failed', error })
    expect(onOutcome).toHaveBeenCalledOnce()
    expect(onOutcome).toHaveBeenCalledWith(outcome)
  })

  it('does not call onOutcome twice when provider succeeds and callback throws', async () => {
    const result = {
      provider: 'teskeid_routes' as const,
      calculatedAt: '2026-07-25T12:00:00.000Z',
      paths: [],
    }
    const calculateRoutes = vi.fn().mockResolvedValue(result)
    let callCount = 0
    const onOutcome = vi.fn(() => {
      callCount++
      if (callCount === 1) throw new Error('callback boom')
    })

    // Must not throw and must not call onOutcome a second time with a failed outcome
    const outcome = await runIcelandRoutingShadow({
      provider: provider(calculateRoutes),
      request,
      enabled: true,
      onOutcome,
    })

    expect(outcome).toMatchObject({ status: 'completed', result })
    expect(onOutcome).toHaveBeenCalledOnce()
  })

  it('does not reclassify a failed outcome when the failure callback also throws', async () => {
    const providerError = new Error('provider down')
    const calculateRoutes = vi.fn().mockRejectedValue(providerError)
    const onOutcome = vi.fn(() => { throw new Error('callback boom') })

    const outcome = await runIcelandRoutingShadow({
      provider: provider(calculateRoutes),
      request,
      enabled: true,
      onOutcome,
    })

    expect(outcome).toMatchObject({ status: 'failed', error: providerError })
    expect(onOutcome).toHaveBeenCalledOnce()
  })
})
