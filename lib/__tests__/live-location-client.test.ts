import { afterEach, describe, expect, it, vi } from 'vitest'
import { watchLiveLocation } from '@/lib/places/liveLocation.client'

type WatchSuccess = Parameters<Geolocation['watchPosition']>[0]
type WatchFailure = Parameters<Geolocation['watchPosition']>[1]

function position(lat: number, lon: number, accuracy = 18): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lon,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: 1234,
    toJSON: () => ({}),
  }
}

function error(code: number): GeolocationPositionError {
  return {
    code,
    message: 'browser detail',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  }
}

function installGeolocation() {
  let success: WatchSuccess | null = null
  let failure: WatchFailure = null
  const watchPosition = vi.fn((nextSuccess: WatchSuccess, nextFailure: WatchFailure) => {
    success = nextSuccess
    failure = nextFailure
    return 42
  })
  const clearWatch = vi.fn()
  vi.stubGlobal('navigator', {
    geolocation: { watchPosition, clearWatch, getCurrentPosition: vi.fn() },
  })
  return {
    watchPosition,
    clearWatch,
    emitPosition: (next: GeolocationPosition) => success?.(next),
    emitError: (next: GeolocationPositionError) => failure?.(next),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('watchLiveLocation', () => {
  it('starts only when called, keeps coordinates local and clears the browser watch once', () => {
    const geo = installGeolocation()
    const onPosition = vi.fn()
    const onError = vi.fn()
    const fetchSpy = vi.fn()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', fetchSpy)

    const stop = watchLiveLocation({ onPosition, onError })
    expect(geo.watchPosition).toHaveBeenCalledOnce()
    expect(geo.watchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: false, maximumAge: 15_000, timeout: 15_000 },
    )

    geo.emitPosition(position(64.1466, -21.9426, 12))
    expect(onPosition).toHaveBeenCalledWith({
      lat: 64.1466,
      lon: -21.9426,
      accuracyM: 12,
      timestamp: 1234,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()

    stop()
    stop()
    expect(geo.clearWatch).toHaveBeenCalledOnce()
    expect(geo.clearWatch).toHaveBeenCalledWith(42)

    geo.emitPosition(position(65, -18))
    expect(onPosition).toHaveBeenCalledTimes(1)
  })

  it.each([
    [1, 'permission_denied'],
    [2, 'position_unavailable'],
    [3, 'timeout'],
  ] as const)('maps browser error %s to %s', (browserCode, expected) => {
    const geo = installGeolocation()
    const onError = vi.fn()
    watchLiveLocation({ onPosition: vi.fn(), onError })

    geo.emitError(error(browserCode))
    expect(onError).toHaveBeenCalledWith(expected)
  })

  it('rejects a watched point outside Iceland without emitting coordinates', () => {
    const geo = installGeolocation()
    const onPosition = vi.fn()
    const onError = vi.fn()
    watchLiveLocation({ onPosition, onError })

    geo.emitPosition(position(51.5072, -0.1276))
    expect(onPosition).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('outside_iceland')
  })
})
