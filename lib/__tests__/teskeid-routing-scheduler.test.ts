import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock next/server before importing the scheduler
vi.mock('next/server', () => ({
  after: vi.fn((fn: () => unknown) => fn()),
}))

// Mock shadow runner and flag — isolate scheduler logic from provider and runner
vi.mock('@/lib/iceland-routes/routingShadow.server', () => ({
  isTeskeidRoutingShadowEnabled: vi.fn(),
  runIcelandRoutingShadow: vi.fn().mockResolvedValue({ status: 'disabled' }),
}))

// Mock provider — scheduler must not construct it when flag is off
vi.mock('@/lib/iceland-routes/teskeidRoutingProvider.server', () => ({
  TeskeidRoutingProvider: vi.fn(),
}))

import { after } from 'next/server'
import { isTeskeidRoutingShadowEnabled, runIcelandRoutingShadow } from '@/lib/iceland-routes/routingShadow.server'
import { TeskeidRoutingProvider } from '@/lib/iceland-routes/teskeidRoutingProvider.server'
import {
  scheduleTeskeidShadowRun,
  trailerKindToVehicleProfile,
} from '@/lib/iceland-routes/routingScheduler.server'

const RVK = { lat: 64.135, lon: -21.895 }
const AKUREYRI = { lat: 65.686, lon: -18.085 }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('trailerKindToVehicleProfile', () => {
  it('maps caravan to caravan', () => {
    expect(trailerKindToVehicleProfile('caravan')).toBe('caravan')
  })

  it('maps all other trailer kinds to car', () => {
    expect(trailerKindToVehicleProfile('none')).toBe('car')
    expect(trailerKindToVehicleProfile('generic_trailer')).toBe('car')
    expect(trailerKindToVehicleProfile('tent_trailer')).toBe('car')
    expect(trailerKindToVehicleProfile('folding_camper')).toBe('car')
    expect(trailerKindToVehicleProfile('horse_trailer')).toBe('car')
    expect(trailerKindToVehicleProfile(null)).toBe('car')
    expect(trailerKindToVehicleProfile(undefined)).toBe('car')
  })
})

describe('scheduleTeskeidShadowRun — flag off', () => {
  beforeEach(() => {
    vi.mocked(isTeskeidRoutingShadowEnabled).mockReturnValue(false)
  })

  it('does not call after() when flag is off', () => {
    scheduleTeskeidShadowRun({ origin: RVK, destination: AKUREYRI })
    expect(after).not.toHaveBeenCalled()
  })

  it('does not construct TeskeidRoutingProvider when flag is off', () => {
    scheduleTeskeidShadowRun({ origin: RVK, destination: AKUREYRI })
    expect(TeskeidRoutingProvider).not.toHaveBeenCalled()
  })
})

describe('scheduleTeskeidShadowRun — flag on', () => {
  beforeEach(() => {
    vi.mocked(isTeskeidRoutingShadowEnabled).mockReturnValue(true)
  })

  it('calls after() exactly once when flag is on', () => {
    scheduleTeskeidShadowRun({ origin: RVK, destination: AKUREYRI })
    expect(after).toHaveBeenCalledOnce()
  })

  it('calls runIcelandRoutingShadow with correct origin and destination', () => {
    scheduleTeskeidShadowRun({ origin: RVK, destination: AKUREYRI })
    expect(runIcelandRoutingShadow).toHaveBeenCalledOnce()
    const callArg = vi.mocked(runIcelandRoutingShadow).mock.calls[0][0]
    expect(callArg.request.origin.point).toEqual(RVK)
    expect(callArg.request.destination.point).toEqual(AKUREYRI)
  })

  it('passes vehicleProfile car for no trailer', () => {
    scheduleTeskeidShadowRun({ origin: RVK, destination: AKUREYRI, trailerKind: 'none' })
    const callArg = vi.mocked(runIcelandRoutingShadow).mock.calls[0][0]
    expect(callArg.request.vehicleProfile).toBe('car')
  })

  it('passes vehicleProfile caravan for caravan trailer', () => {
    scheduleTeskeidShadowRun({ origin: RVK, destination: AKUREYRI, trailerKind: 'caravan' })
    const callArg = vi.mocked(runIcelandRoutingShadow).mock.calls[0][0]
    expect(callArg.request.vehicleProfile).toBe('caravan')
  })

  it('attaches an onOutcome callback to the shadow run', () => {
    scheduleTeskeidShadowRun({ origin: RVK, destination: AKUREYRI })
    const callArg = vi.mocked(runIcelandRoutingShadow).mock.calls[0][0]
    expect(typeof callArg.onOutcome).toBe('function')
  })
})
