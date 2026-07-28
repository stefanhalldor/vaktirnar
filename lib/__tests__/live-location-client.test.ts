import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clampLiveLocationFollowZoom,
  deriveLiveLocationHeading,
  headingAngularDistanceDegrees,
  nearestEquivalentHeadingDegrees,
  reduceLiveLocationFollowMode,
  resolveLiveLocationCameraBearing,
  stabilizeHeadingDegrees,
  watchLiveLocation,
} from '@/lib/places/liveLocation.client'

type WatchSuccess = Parameters<Geolocation['watchPosition']>[0]
type WatchFailure = Parameters<Geolocation['watchPosition']>[1]

function position(
  lat: number,
  lon: number,
  accuracy = 18,
  options: { heading?: number | null; speed?: number | null; timestamp?: number } = {},
): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lon,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: options.heading ?? null,
      speed: options.speed ?? null,
      toJSON: () => ({}),
    },
    timestamp: options.timestamp ?? 1234,
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

function installThrowingGeolocation(thrown: unknown) {
  const watchPosition = vi.fn(() => {
    throw thrown
  })
  const clearWatch = vi.fn()
  vi.stubGlobal('navigator', {
    geolocation: { watchPosition, clearWatch, getCurrentPosition: vi.fn() },
  })
  return { watchPosition, clearWatch }
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
      headingDeg: null,
      headingSource: null,
      speedMps: null,
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

  it.each([
    ['SecurityError', 'permission_denied'],
    ['UnknownError', 'position_unavailable'],
  ] as const)('maps synchronous %s throws without leaking browser details', (name, expected) => {
    const thrown = new DOMException('private browser detail', name)
    const geo = installThrowingGeolocation(thrown)
    const onError = vi.fn()
    const fetchSpy = vi.fn()
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
    const logSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ]
    vi.stubGlobal('fetch', fetchSpy)

    const stop = watchLiveLocation({ onPosition: vi.fn(), onError })
    expect(geo.watchPosition).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(expected)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(storageSpy).not.toHaveBeenCalled()
    for (const logSpy of logSpies) expect(logSpy).not.toHaveBeenCalled()

    stop()
    stop()
    expect(geo.clearWatch).not.toHaveBeenCalled()
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

  it('uses browser course-over-ground only while movement and accuracy are suitable', () => {
    const geo = installGeolocation()
    const onPosition = vi.fn()
    watchLiveLocation({ onPosition, onError: vi.fn() })

    geo.emitPosition(position(64.1, -21.9, 10, {
      heading: 32,
      speed: 3.5,
      timestamp: 10_000,
    }))
    expect(onPosition).toHaveBeenLastCalledWith(expect.objectContaining({
      headingDeg: null,
      headingSource: null,
      speedMps: 3.5,
    }))

    geo.emitPosition(position(64.1, -21.9, 10, {
      heading: 34,
      speed: 3.5,
      timestamp: 11_000,
    }))
    expect(onPosition).toHaveBeenLastCalledWith(expect.objectContaining({
      headingDeg: 33,
      headingSource: 'device',
      speedMps: 3.5,
    }))

    geo.emitPosition(position(64.1, -21.9, 10, {
      heading: 180,
      speed: 0.2,
      timestamp: 12_000,
    }))
    expect(onPosition).toHaveBeenLastCalledWith(expect.objectContaining({
      headingDeg: 33,
      headingSource: 'device',
      speedMps: 0.2,
    }))
  })

  it('rejects opposite browser-course spikes while GPS displacement stays straight', () => {
    const geo = installGeolocation()
    const onPosition = vi.fn()
    watchLiveLocation({ onPosition, onError: vi.fn() })

    const longitudeStep = 0.00052
    const headings = [90, 92, 88, 270, 91, 272, 90]
    headings.forEach((heading, index) => {
      geo.emitPosition(position(64.1, -21.9 + longitudeStep * index, 5, {
        heading,
        speed: 25,
        timestamp: 10_000 + index * 1_000,
      }))
    })

    const emitted = onPosition.mock.calls
      .map(([point]) => point as { headingDeg: number | null })
      .filter(point => point.headingDeg !== null)
    expect(emitted.length).toBeGreaterThan(3)
    expect(emitted.every(point =>
      headingAngularDistanceDegrees(point.headingDeg!, 90) < 20,
    )).toBe(true)
  })

  it('does not accept repeated opposite device-only headings at motorway speed', () => {
    const geo = installGeolocation()
    const onPosition = vi.fn()
    watchLiveLocation({ onPosition, onError: vi.fn() })

    geo.emitPosition(position(64.1, -21.9, 5, { heading: 90, speed: 25, timestamp: 10_000 }))
    geo.emitPosition(position(64.1, -21.9, 5, { heading: 92, speed: 25, timestamp: 11_000 }))
    geo.emitPosition(position(64.1, -21.9, 5, { heading: 270, speed: 25, timestamp: 12_000 }))
    geo.emitPosition(position(64.1, -21.9, 5, { heading: 272, speed: 25, timestamp: 13_000 }))

    const lastPoint = onPosition.mock.calls.at(-1)?.[0] as { headingDeg: number | null }
    expect(lastPoint.headingDeg).not.toBeNull()
    expect(headingAngularDistanceDegrees(lastPoint.headingDeg!, 91)).toBeLessThan(5)
  })

  it('continues to follow a corroborated real bend instead of freezing the course', () => {
    const geo = installGeolocation()
    const onPosition = vi.fn()
    watchLiveLocation({ onPosition, onError: vi.fn() })

    geo.emitPosition(position(64.1, -21.9, 5, { heading: 90, speed: 20, timestamp: 10_000 }))
    geo.emitPosition(position(64.1, -21.89948, 5, { heading: 90, speed: 20, timestamp: 11_000 }))
    const straightHeading = (onPosition.mock.calls.at(-1)?.[0] as { headingDeg: number }).headingDeg

    geo.emitPosition(position(64.1002, -21.89905, 5, {
      heading: 45,
      speed: 20,
      timestamp: 12_000,
    }))
    geo.emitPosition(position(64.10045, -21.89895, 5, {
      heading: 12,
      speed: 20,
      timestamp: 13_000,
    }))
    geo.emitPosition(position(64.1007, -21.89895, 5, {
      heading: 0,
      speed: 20,
      timestamp: 14_000,
    }))

    const bendHeading = (onPosition.mock.calls.at(-1)?.[0] as { headingDeg: number }).headingDeg
    expect(headingAngularDistanceDegrees(bendHeading, 0)).toBeLessThan(
      headingAngularDistanceDegrees(straightHeading, 0),
    )
    expect(headingAngularDistanceDegrees(bendHeading, straightHeading)).toBeGreaterThan(20)
  })

  it('ignores duplicate and out-of-order location callbacks', () => {
    const geo = installGeolocation()
    const onPosition = vi.fn()
    watchLiveLocation({ onPosition, onError: vi.fn() })

    geo.emitPosition(position(64.1, -21.9, 5, { timestamp: 10_000 }))
    geo.emitPosition(position(64.2, -21.8, 5, { timestamp: 10_000 }))
    geo.emitPosition(position(64.3, -21.7, 5, { timestamp: 9_000 }))

    expect(onPosition).toHaveBeenCalledOnce()
    expect(onPosition).toHaveBeenLastCalledWith(expect.objectContaining({
      lat: 64.1,
      lon: -21.9,
    }))
  })

  it('expires an unsupported heading instead of retaining stale direction', () => {
    const geo = installGeolocation()
    const onPosition = vi.fn()
    watchLiveLocation({ onPosition, onError: vi.fn() })

    geo.emitPosition(position(64.1, -21.9, 5, { heading: 90, speed: 5, timestamp: 10_000 }))
    geo.emitPosition(position(64.1, -21.9, 5, { heading: 92, speed: 5, timestamp: 11_000 }))
    geo.emitPosition(position(64.1, -21.9, 5, { timestamp: 21_001 }))

    expect(onPosition).toHaveBeenLastCalledWith(expect.objectContaining({
      headingDeg: null,
      headingSource: null,
    }))
  })

  it('derives a stable bearing after meaningful movement but ignores GPS noise', () => {
    const geo = installGeolocation()
    const onPosition = vi.fn()
    watchLiveLocation({ onPosition, onError: vi.fn() })

    geo.emitPosition(position(64.1, -21.9, 8, { timestamp: 10_000 }))
    geo.emitPosition(position(64.10001, -21.9, 8, { timestamp: 11_000 }))
    expect(onPosition).toHaveBeenLastCalledWith(expect.objectContaining({
      headingDeg: null,
      headingSource: null,
    }))

    geo.emitPosition(position(64.1005, -21.9, 8, { timestamp: 13_000 }))
    expect(onPosition).toHaveBeenLastCalledWith(expect.objectContaining({
      headingDeg: expect.any(Number),
      headingSource: 'derived',
    }))
  })

  it('does not trust non-finite accuracy or invalid speed for heading', () => {
    const geo = installGeolocation()
    const onPosition = vi.fn()
    watchLiveLocation({ onPosition, onError: vi.fn() })

    geo.emitPosition(position(64.1, -21.9, Number.NaN, {
      heading: 90,
      speed: -1,
      timestamp: 10_000,
    }))
    expect(onPosition).toHaveBeenLastCalledWith(expect.objectContaining({
      accuracyM: null,
      headingDeg: null,
      headingSource: null,
      speedMps: null,
    }))
  })
})

describe('live-location heading and zoom guards', () => {
  it('keeps north-up explicit even without a device heading', () => {
    expect(resolveLiveLocationCameraBearing('north-up', 147)).toBe(0)
    expect(resolveLiveLocationCameraBearing('north-up', null)).toBe(0)
    expect(resolveLiveLocationCameraBearing('heading-up', 361)).toBe(1)
    expect(resolveLiveLocationCameraBearing('heading-up', null)).toBeNull()
  })

  it('keeps programmatic camera movement in follow, makes user movement free and defers free zoom', () => {
    expect(reduceLiveLocationFollowMode('follow', 'programmatic_camera')).toEqual({
      mode: 'follow',
      moveCamera: false,
    })
    expect(reduceLiveLocationFollowMode('follow', 'user_camera')).toEqual({
      mode: 'free',
      moveCamera: false,
    })
    expect(reduceLiveLocationFollowMode('free', 'zoom_changed')).toEqual({
      mode: 'free',
      moveCamera: false,
    })
    expect(reduceLiveLocationFollowMode('free', 'recenter')).toEqual({
      mode: 'follow',
      moveCamera: true,
    })
    expect(reduceLiveLocationFollowMode('follow', 'zoom_changed')).toEqual({
      mode: 'follow',
      moveCamera: true,
    })
  })

  it('clamps persisted follow zoom to integer levels 5 through 18', () => {
    expect(clampLiveLocationFollowZoom('4')).toBe(5)
    expect(clampLiveLocationFollowZoom('9')).toBe(9)
    expect(clampLiveLocationFollowZoom(14.4)).toBe(14)
    expect(clampLiveLocationFollowZoom('19')).toBe(18)
    expect(clampLiveLocationFollowZoom('invalid')).toBe(14)
    expect(clampLiveLocationFollowZoom(null)).toBe(14)
  })

  it('smooths across geographic north using the shortest angular path', () => {
    const heading = stabilizeHeadingDegrees(359, 1)
    expect(heading).toBeGreaterThan(359)
    expect(heading).toBeLessThan(360)
  })

  it('unwraps viewport headings so CSS takes the short path across north', () => {
    expect(nearestEquivalentHeadingDegrees(359, 1)).toBe(361)
    expect(nearestEquivalentHeadingDegrees(1, 359)).toBe(-1)
    expect(nearestEquivalentHeadingDegrees(null, 361)).toBe(1)
  })

  it('rejects poor accuracy, stale timestamps and implausible jumps for derived headings', () => {
    const origin = { lat: 64.1, lon: -21.9, accuracyM: 8, timestamp: 10_000 }
    expect(deriveLiveLocationHeading(
      origin,
      { lat: 64.101, lon: -21.9, accuracyM: 90, timestamp: 12_000 },
    )).toBeNull()
    expect(deriveLiveLocationHeading(
      origin,
      { lat: 64.101, lon: -21.9, accuracyM: 8, timestamp: 80_001 },
    )).toBeNull()
    expect(deriveLiveLocationHeading(
      origin,
      { lat: 65, lon: -18, accuracyM: 8, timestamp: 11_000 },
    )).toBeNull()
  })
})
