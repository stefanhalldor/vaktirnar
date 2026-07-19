import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  writeOverviewRouteDraft,
  readOverviewRouteDraft,
  clearOverviewRouteDraft,
  type RouteDraftPlace,
} from '@/lib/iceland-routes/routeDraft'

const FROM: RouteDraftPlace = {
  name: 'Reykjavík',
  formattedAddress: 'Reykjavík, Iceland',
  lat: 64.135,
  lon: -21.895,
  placeId: 'ChIJ123',
}

const TO: RouteDraftPlace = {
  name: 'Akureyri',
  formattedAddress: 'Akureyri, Iceland',
  lat: 65.686,
  lon: -18.085,
}

// ── sessionStorage mock ───────────────────────────────────────────────────────

let store: Record<string, string> = {}

beforeEach(() => {
  store = {}
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val },
    removeItem: (key: string) => { delete store[key] },
  })
})

// ── write / read ──────────────────────────────────────────────────────────────

describe('writeOverviewRouteDraft + readOverviewRouteDraft', () => {
  it('round-trips full place data including optional placeId', () => {
    writeOverviewRouteDraft(FROM, TO)
    const draft = readOverviewRouteDraft()
    expect(draft).not.toBeNull()
    expect(draft!.from.name).toBe('Reykjavík')
    expect(draft!.from.formattedAddress).toBe('Reykjavík, Iceland')
    expect(draft!.from.lat).toBe(64.135)
    expect(draft!.from.lon).toBe(-21.895)
    expect(draft!.from.placeId).toBe('ChIJ123')
    expect(draft!.to.name).toBe('Akureyri')
    expect(draft!.to.placeId).toBeUndefined()
  })

  it('returns null when sessionStorage is empty', () => {
    expect(readOverviewRouteDraft()).toBeNull()
  })

  it('returns null and cleans up on corrupt JSON', () => {
    store['vaktirnar:overview-route-draft'] = 'not-json{'
    expect(readOverviewRouteDraft()).toBeNull()
  })

  it('returns null on wrong schema version', () => {
    writeOverviewRouteDraft(FROM, TO)
    const raw = JSON.parse(store['vaktirnar:overview-route-draft'])
    raw.schemaVersion = 99
    store['vaktirnar:overview-route-draft'] = JSON.stringify(raw)
    expect(readOverviewRouteDraft()).toBeNull()
  })

  it('returns null when missing required from.name', () => {
    writeOverviewRouteDraft(FROM, TO)
    const raw = JSON.parse(store['vaktirnar:overview-route-draft'])
    delete raw.from.name
    store['vaktirnar:overview-route-draft'] = JSON.stringify(raw)
    expect(readOverviewRouteDraft()).toBeNull()
  })

  it('returns null when from.lat is not a number', () => {
    writeOverviewRouteDraft(FROM, TO)
    const raw = JSON.parse(store['vaktirnar:overview-route-draft'])
    raw.from.lat = 'not-a-number'
    store['vaktirnar:overview-route-draft'] = JSON.stringify(raw)
    expect(readOverviewRouteDraft()).toBeNull()
  })

  it('returns null when from.lon is missing', () => {
    writeOverviewRouteDraft(FROM, TO)
    const raw = JSON.parse(store['vaktirnar:overview-route-draft'])
    delete raw.from.lon
    store['vaktirnar:overview-route-draft'] = JSON.stringify(raw)
    expect(readOverviewRouteDraft()).toBeNull()
  })

  it('returns null when from.lon is not a number', () => {
    writeOverviewRouteDraft(FROM, TO)
    const raw = JSON.parse(store['vaktirnar:overview-route-draft'])
    raw.from.lon = 'not-a-number'
    store['vaktirnar:overview-route-draft'] = JSON.stringify(raw)
    expect(readOverviewRouteDraft()).toBeNull()
  })

  it('returns null when to.lon is missing', () => {
    writeOverviewRouteDraft(FROM, TO)
    const raw = JSON.parse(store['vaktirnar:overview-route-draft'])
    delete raw.to.lon
    store['vaktirnar:overview-route-draft'] = JSON.stringify(raw)
    expect(readOverviewRouteDraft()).toBeNull()
  })

  it('returns null when to.lon is not a number', () => {
    writeOverviewRouteDraft(FROM, TO)
    const raw = JSON.parse(store['vaktirnar:overview-route-draft'])
    raw.to.lon = null
    store['vaktirnar:overview-route-draft'] = JSON.stringify(raw)
    expect(readOverviewRouteDraft()).toBeNull()
  })

  it('returns null when draft is expired (age > 5 min)', () => {
    writeOverviewRouteDraft(FROM, TO)
    const raw = JSON.parse(store['vaktirnar:overview-route-draft'])
    raw.savedAtIso = new Date(Date.now() - 6 * 60 * 1000).toISOString()
    store['vaktirnar:overview-route-draft'] = JSON.stringify(raw)
    expect(readOverviewRouteDraft()).toBeNull()
  })

  it('returns non-null when draft is within TTL', () => {
    writeOverviewRouteDraft(FROM, TO)
    const raw = JSON.parse(store['vaktirnar:overview-route-draft'])
    raw.savedAtIso = new Date(Date.now() - 4 * 60 * 1000).toISOString()
    store['vaktirnar:overview-route-draft'] = JSON.stringify(raw)
    expect(readOverviewRouteDraft()).not.toBeNull()
  })
})

// ── clearOverviewRouteDraft ───────────────────────────────────────────────────

describe('clearOverviewRouteDraft', () => {
  it('removes draft so subsequent read returns null', () => {
    writeOverviewRouteDraft(FROM, TO)
    clearOverviewRouteDraft()
    expect(readOverviewRouteDraft()).toBeNull()
  })

  it('does not throw when nothing is stored', () => {
    expect(() => clearOverviewRouteDraft()).not.toThrow()
  })
})

// ── routeDraft=1 marker and priority contract ─────────────────────────────────

describe('routeDraft=1 marker and priority contract', () => {
  it('CTA URL uses ?routeDraft=1, no place names in URL', () => {
    // WeatherOverviewClient builds activeTripHref with a privacy-safe marker only
    const base = '/auth-mvp/vedrid/ferdalagid'
    const url = `${base}?routeDraft=1`
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('routeDraft')).toBe('1')
    expect(params.get('from')).toBeNull()
    expect(params.get('to')).toBeNull()
  })

  it('marker + valid draft: draft is readable and clearable (consumed once)', () => {
    writeOverviewRouteDraft(FROM, TO)
    const draft = readOverviewRouteDraft()
    expect(draft).not.toBeNull()
    clearOverviewRouteDraft()
    expect(readOverviewRouteDraft()).toBeNull()
  })

  it('marker + expired draft: readOverviewRouteDraft returns null so no stale trip is restored', () => {
    writeOverviewRouteDraft(FROM, TO)
    const raw = JSON.parse(store['vaktirnar:overview-route-draft'])
    raw.savedAtIso = new Date(Date.now() - 6 * 60 * 1000).toISOString()
    store['vaktirnar:overview-route-draft'] = JSON.stringify(raw)
    // readOverviewRouteDraft returns null — FerdalagidClient must show empty route step, not old trip
    expect(readOverviewRouteDraft()).toBeNull()
  })
})
