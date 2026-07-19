import { describe, it, expect } from 'vitest'
import { resolvePulseBackDestination } from '@/lib/weather/pulseBack'

describe('resolvePulseBackDestination — null/absent', () => {
  it('returns null for null', () => expect(resolvePulseBackDestination(null)).toBeNull())
})

describe('resolvePulseBackDestination — external URLs rejected', () => {
  it('rejects https://', () => expect(resolvePulseBackDestination('https://evil.example')).toBeNull())
  it('rejects http://', () => expect(resolvePulseBackDestination('http://evil.example')).toBeNull())
  it('rejects protocol-relative //', () => expect(resolvePulseBackDestination('//evil.example')).toBeNull())
  it('rejects non-slash path', () => expect(resolvePulseBackDestination('evil.example')).toBeNull())
})

describe('resolvePulseBackDestination — lookalikes rejected', () => {
  it('rejects /auth-mvp/vedrid-anything', () =>
    expect(resolvePulseBackDestination('/auth-mvp/vedrid-anything')).toBeNull())
  it('rejects /auth-mvp/vedrid/puls/stod/123', () =>
    expect(resolvePulseBackDestination('/auth-mvp/vedrid/puls/stod/123')).toBeNull())
  it('rejects /auth-mvp/vedrid/elta-vedrid-fake', () =>
    expect(resolvePulseBackDestination('/auth-mvp/vedrid/elta-vedrid-fake')).toBeNull())
  it('rejects /auth-mvp/vedrid/ferdalagid-fake', () =>
    expect(resolvePulseBackDestination('/auth-mvp/vedrid/ferdalagid-fake')).toBeNull())
})

describe('resolvePulseBackDestination — overview (auth)', () => {
  it('allows /auth-mvp/vedrid', () =>
    expect(resolvePulseBackDestination('/auth-mvp/vedrid')).toEqual({ kind: 'overview', href: '/auth-mvp/vedrid' }))
  it('allows /auth-mvp/vedrid?stationId=32097', () =>
    expect(resolvePulseBackDestination('/auth-mvp/vedrid?stationId=32097')).toEqual({ kind: 'overview', href: '/auth-mvp/vedrid?stationId=32097' }))
  it('allows /auth-mvp/vedrid# fragment', () =>
    expect(resolvePulseBackDestination('/auth-mvp/vedrid#top')).toEqual({ kind: 'overview', href: '/auth-mvp/vedrid#top' }))
  it('decodes encoded overview returnTo', () =>
    expect(resolvePulseBackDestination('%2Fauth-mvp%2Fvedrid')).toEqual({ kind: 'overview', href: '/auth-mvp/vedrid' }))
})

describe('resolvePulseBackDestination — overview (public)', () => {
  it('allows /vedrid', () =>
    expect(resolvePulseBackDestination('/vedrid')).toEqual({ kind: 'overview', href: '/vedrid' }))
  it('allows /vedrid?stationId=32097', () =>
    expect(resolvePulseBackDestination('/vedrid?stationId=32097')).toEqual({ kind: 'overview', href: '/vedrid?stationId=32097' }))
  it('allows /vedrid# fragment', () =>
    expect(resolvePulseBackDestination('/vedrid#top')).toEqual({ kind: 'overview', href: '/vedrid#top' }))
  it('decodes encoded public overview returnTo', () =>
    expect(resolvePulseBackDestination('%2Fvedrid%3FstationId%3D32097')).toEqual({ kind: 'overview', href: '/vedrid?stationId=32097' }))
})

describe('resolvePulseBackDestination — trip', () => {
  it('allows /auth-mvp/vedrid/ferdalagid', () =>
    expect(resolvePulseBackDestination('/auth-mvp/vedrid/ferdalagid')).toEqual({ kind: 'trip', href: '/auth-mvp/vedrid/ferdalagid' }))
  it('allows /auth-mvp/vedrid/ferdalagid?restore=1', () =>
    expect(resolvePulseBackDestination('/auth-mvp/vedrid/ferdalagid?restore=1')).toEqual({ kind: 'trip', href: '/auth-mvp/vedrid/ferdalagid?restore=1' }))
  it('allows /auth-mvp/vedrid/ferdalagid# fragment', () =>
    expect(resolvePulseBackDestination('/auth-mvp/vedrid/ferdalagid#top')).toEqual({ kind: 'trip', href: '/auth-mvp/vedrid/ferdalagid#top' }))
  it('decodes encoded trip returnTo', () =>
    expect(resolvePulseBackDestination('%2Fauth-mvp%2Fvedrid%2Fferdalagid')).toEqual({ kind: 'trip', href: '/auth-mvp/vedrid/ferdalagid' }))
})

describe('resolvePulseBackDestination — stationExplorer', () => {
  it('allows /auth-mvp/vedrid/elta-vedrid', () =>
    expect(resolvePulseBackDestination('/auth-mvp/vedrid/elta-vedrid')).toEqual({ kind: 'stationExplorer', href: '/auth-mvp/vedrid/elta-vedrid' }))
  it('allows /auth-mvp/vedrid/elta-vedrid?stationId=32097', () =>
    expect(resolvePulseBackDestination('/auth-mvp/vedrid/elta-vedrid?stationId=32097')).toEqual({ kind: 'stationExplorer', href: '/auth-mvp/vedrid/elta-vedrid?stationId=32097' }))
  it('decodes encoded stationExplorer returnTo', () => {
    const raw = '%2Fauth-mvp%2Fvedrid%2Felta-vedrid%3FstationId%3D32097'
    expect(resolvePulseBackDestination(raw)).toEqual({ kind: 'stationExplorer', href: '/auth-mvp/vedrid/elta-vedrid?stationId=32097' })
  })
})
