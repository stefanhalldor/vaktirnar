import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CurrentLocationError,
  getCurrentLocation,
} from '@/lib/places/currentLocation.client'

type GeolocationSuccess = Parameters<Geolocation['getCurrentPosition']>[0]
type GeolocationFailure = Parameters<Geolocation['getCurrentPosition']>[1]

function installGeolocation(
  implementation: (
    success: GeolocationSuccess,
    failure: GeolocationFailure,
    options?: PositionOptions,
  ) => void,
) {
  const getCurrentPosition = vi.fn(implementation)
  const watchPosition = vi.fn()
  const clearWatch = vi.fn()

  vi.stubGlobal('navigator', {
    geolocation: { getCurrentPosition, watchPosition, clearWatch },
  })

  return { getCurrentPosition, watchPosition, clearWatch }
}

function position(
  latitude: number,
  longitude: number,
  accuracy = 18,
): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: 1_785_138_000_000,
    toJSON: () => ({}),
  }
}

function geolocationError(code: number, message: string): GeolocationPositionError {
  return {
    code,
    message,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getCurrentLocation', () => {
  it('performs one one-shot lookup and returns a provider-neutral device place', async () => {
    const geo = installGeolocation((success) => {
      success(position(64.1466, -21.9426, 12))
    })

    await expect(getCurrentLocation({ fallbackName: 'Núverandi staðsetning' })).resolves.toMatchObject({
      source: 'device',
      name: 'Núverandi staðsetning',
      formattedAddress: 'Núverandi staðsetning',
      lat: 64.1466,
      lon: -21.9426,
      accuracyM: 12,
    })

    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(geo.watchPosition).not.toHaveBeenCalled()
    expect(geo.clearWatch).not.toHaveBeenCalled()
    expect(geo.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({
        enableHighAccuracy: false,
        maximumAge: expect.any(Number),
        timeout: expect.any(Number),
      }),
    )
  })

  it('uses only the same-origin POST label endpoint and never persists or logs GPS coordinates', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ location: { name: 'Akureyri' } }),
    })
    const localSetItem = vi.fn()
    const sessionSetItem = vi.fn()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem: localSetItem })
    vi.stubGlobal('sessionStorage', { getItem: vi.fn(), setItem: sessionSetItem })
    installGeolocation((success) => success(position(65.6835, -18.0878)))

    await getCurrentLocation({ fallbackName: 'Núverandi staðsetning' })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/place/reverse-geocode',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: 65.6835, lon: -18.0878 }),
      }),
    )
    expect(localSetItem).not.toHaveBeenCalled()
    expect(sessionSetItem).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
    expect(infoSpy).not.toHaveBeenCalled()
  })

  it.each([
    [1, 'permission_denied'],
    [2, 'position_unavailable'],
    [3, 'timeout'],
  ] as const)('maps browser error %s to %s', async (browserCode, expectedCode) => {
    installGeolocation((_success, failure) => {
      failure?.(geolocationError(browserCode, 'browser detail'))
    })

    const promise = getCurrentLocation({ fallbackName: 'Núverandi staðsetning' })
    await expect(promise).rejects.toBeInstanceOf(CurrentLocationError)
    await expect(promise).rejects.toMatchObject({ code: expectedCode })
  })

  it('fails clearly when the browser has no geolocation API', async () => {
    vi.stubGlobal('navigator', {})

    const promise = getCurrentLocation({ fallbackName: 'Núverandi staðsetning' })
    await expect(promise).rejects.toBeInstanceOf(CurrentLocationError)
    await expect(promise).rejects.toMatchObject({ code: 'unsupported' })
  })

  it('rejects non-finite coordinates as outside the supported service envelope', async () => {
    installGeolocation((success) => success(position(Number.NaN, -21.9)))

    const promise = getCurrentLocation({ fallbackName: 'Núverandi staðsetning' })
    await expect(promise).rejects.toBeInstanceOf(CurrentLocationError)
    await expect(promise).rejects.toMatchObject({ code: 'outside_iceland' })
  })

  it('rejects coordinates outside the Iceland service envelope', async () => {
    installGeolocation((success) => success(position(51.5072, -0.1276)))

    const promise = getCurrentLocation({ fallbackName: 'Núverandi staðsetning' })
    await expect(promise).rejects.toBeInstanceOf(CurrentLocationError)
    await expect(promise).rejects.toMatchObject({ code: 'outside_iceland' })
  })

  it('never turns the device coordinate into a Google placeId', async () => {
    installGeolocation((success) => success(position(64.0049, -22.5624)))

    const result = await getCurrentLocation({ fallbackName: 'Núverandi staðsetning' })

    expect(result).not.toHaveProperty('placeId')
    expect(result.source).toBe('device')
  })

  it('uses exact GPS coordinates even when the display-label request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    installGeolocation((success) => success(position(64.2539, -15.2082, 33)))

    await expect(
      getCurrentLocation({ fallbackName: 'Núverandi staðsetning' }),
    ).resolves.toMatchObject({
      name: 'Núverandi staðsetning',
      formattedAddress: 'Núverandi staðsetning',
      lat: 64.2539,
      lon: -15.2082,
      accuracyM: 33,
      source: 'device',
    })
  })

  it('uses a local reverse label only for display and preserves the GPS point', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        location: {
          name: 'Höfn',
          formattedAddress: 'Höfn, 780 Hornafjörður',
          postalCode: '780',
          municipality: 'Hornafjörður',
        },
      }),
    }))
    installGeolocation((success) => success(position(64.25, -15.2)))

    await expect(
      getCurrentLocation({
        fallbackName: 'Núverandi staðsetning',
        formatNearbyLabel: place => `Nálægt ${place}`,
      }),
    ).resolves.toMatchObject({
      name: 'Núverandi staðsetning',
      formattedAddress: 'Nálægt Höfn, 780 Hornafjörður',
      postalCode: '780',
      municipality: 'Hornafjörður',
      lat: 64.25,
      lon: -15.2,
    })
  })

  it('honours an already-aborted request before asking the browser for GPS', async () => {
    const geo = installGeolocation(() => undefined)
    const controller = new AbortController()
    controller.abort()

    const promise = getCurrentLocation({
      fallbackName: 'Núverandi staðsetning',
      signal: controller.signal,
    })

    await expect(promise).rejects.toMatchObject({ code: 'aborted' })
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
  })
})
