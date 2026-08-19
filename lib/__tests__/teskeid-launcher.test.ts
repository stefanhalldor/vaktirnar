import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  mockGetAdmin,
  mockCheckFeatureAccess,
  mockWeatherAccess,
  mockCollaborationAccess,
  mockReadOrder,
} = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
  mockCheckFeatureAccess: vi.fn(),
  mockWeatherAccess: vi.fn(),
  mockCollaborationAccess: vi.fn(),
  mockReadOrder: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mockCheckFeatureAccess }))
vi.mock('@/lib/weather/weatherBaseAccess.server', () => ({
  resolveAuthenticatedWeatherShellAccess: mockWeatherAccess,
}))
vi.mock('@/lib/agent-collaboration/access.server', () => ({
  hasAgentCollaborationBetaAccess: mockCollaborationAccess,
}))
vi.mock('@/lib/teskeid/launcherUsage.server', async (original) => {
  const actual = await original<typeof import('@/lib/teskeid/launcherUsage.server')>()
  return { ...actual, readTeskeidLauncherOrder: mockReadOrder }
})

import {
  TESKEID_LAUNCHER_IDS,
  isTeskeidLauncherId,
  teskeidLauncherIdFromIdeaSlug,
  teskeidLauncherIdFromPathname,
  trackedTeskeidLauncherIdFromPathname,
} from '@/lib/teskeid/launcherCatalog'
import { resolveTeskeidLauncher, resolveTeskeidLauncherVisibility } from '@/lib/teskeid/launcher.server'
import { orderTeskeidLauncherIds } from '@/lib/teskeid/launcherUsage.server'

const USER = { id: 'user-a', email: 'a@example.com' }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  process.env.AGENT_COLLABORATION_ENABLED = 'true'
  mockCheckFeatureAccess.mockResolvedValue(true)
  mockWeatherAccess.mockResolvedValue({ mode: 'authenticated' })
  mockCollaborationAccess.mockResolvedValue(true)
  mockReadOrder.mockImplementation(async (_userId: string, ids: string[]) => ({ ids, available: true }))
})

describe('canonical launcher catalog', () => {
  it('contains the exact ten stable allowlisted IDs', () => {
    expect(TESKEID_LAUNCHER_IDS).toEqual([
      'lanad-og-skilad', 'utlagt-og-endurgreitt', 'afmaeli-og-vidburdir', 'bokhaldid', 'umonnun',
      'vedrid', 'kviss', 'auglysandi', 'bokanir', 'heimilisverkin',
    ])
    expect(isTeskeidLauncherId('/arbitrary')).toBe(false)
  })

  it.each([
    ['/auth-mvp/lanad-og-skilad/ny', 'lanad-og-skilad'],
    ['/auth-mvp/utlagt-og-endurgreitt/hopar/a', 'utlagt-og-endurgreitt'],
    ['/auth-mvp/vidburdir/a', 'afmaeli-og-vidburdir'],
    ['/auth-mvp/bokhaldid/timabil/a', 'bokhaldid'],
    ['/auth-mvp/umonnun', 'umonnun'],
    ['/auth-mvp/vedrid/puls/stod/1', 'vedrid'],
    ['/auth-mvp/kviss/lota/a', 'kviss'],
    ['/auth-mvp/auglysandi', 'auglysandi'],
    ['/auth-mvp/bokanir/fyrirspurn/a', 'bokanir'],
    ['/auth-mvp/verkefnin/hringir/a', 'heimilisverkin'],
    ['/auth-mvp/heimilisverkin/hringir/a', 'heimilisverkin'],
  ])('maps committed pathname %s to %s', (pathname, id) => {
    expect(teskeidLauncherIdFromPathname(pathname)).toBe(id)
  })

  it('does not treat home, utilities or public weather as feature opens', () => {
    expect(teskeidLauncherIdFromPathname('/auth-mvp/heim')).toBeNull()
    expect(teskeidLauncherIdFromPathname('/auth-mvp/minn-profill')).toBeNull()
    expect(teskeidLauncherIdFromPathname('/vedrid')).toBeNull()
  })

  it('structurally excludes the exact public auth-mvp weather route from MRU tracking', () => {
    expect(teskeidLauncherIdFromPathname('/auth-mvp/vedrid/road-map-prototype')).toBe('vedrid')
    expect(trackedTeskeidLauncherIdFromPathname('/auth-mvp/vedrid/road-map-prototype')).toBeNull()
    expect(trackedTeskeidLauncherIdFromPathname('/auth-mvp/vedrid/road-map-prototype/')).toBeNull()
    expect(trackedTeskeidLauncherIdFromPathname('/auth-mvp/vedrid')).toBe('vedrid')
    expect(trackedTeskeidLauncherIdFromPathname('/auth-mvp/vedrid/puls/stod/1')).toBe('vedrid')
  })

  it('keeps canonical and legacy Tasks consent routes active but excludes them from MRU tracking', () => {
    for (const pathname of [
      '/auth-mvp/verkefnin/adild',
      '/auth-mvp/verkefnin/adild/',
      '/auth-mvp/verkefnin/bod/invitation-id',
      '/auth-mvp/heimilisverkin/adild',
      '/auth-mvp/heimilisverkin/adild/',
      '/auth-mvp/heimilisverkin/bod/invitation-id',
    ]) {
      expect(teskeidLauncherIdFromPathname(pathname)).toBe('heimilisverkin')
      expect(trackedTeskeidLauncherIdFromPathname(pathname)).toBeNull()
    }
    expect(trackedTeskeidLauncherIdFromPathname('/auth-mvp/verkefnin'))
      .toBe('heimilisverkin')
  })

  it('aliases both visible and preserved idea slugs to the internal launcher ID', () => {
    expect(teskeidLauncherIdFromIdeaSlug('fyrsta-vakt-krakkanna')).toBe('heimilisverkin')
    expect(teskeidLauncherIdFromIdeaSlug('verkefnin')).toBe('heimilisverkin')
    expect(teskeidLauncherIdFromIdeaSlug('heimilisverkin')).toBe('heimilisverkin')
    expect(teskeidLauncherIdFromIdeaSlug('unknown')).toBeNull()
  })
})

describe('per-user MRU ordering', () => {
  it('sorts newest used first and preserves fixed fallback order for never-used', () => {
    expect(orderTeskeidLauncherIds(TESKEID_LAUNCHER_IDS, [
      { feature_key: 'bokanir', created_at: '2026-08-13T12:00:00Z' },
      { feature_key: 'vedrid', created_at: '2026-08-13T12:01:00Z' },
      { feature_key: 'utlagt-og-endurgreitt', created_at: '2026-08-13T12:02:00Z' },
    ])).toEqual([
      'utlagt-og-endurgreitt', 'vedrid', 'bokanir', 'lanad-og-skilad',
      'afmaeli-og-vidburdir', 'bokhaldid', 'umonnun', 'kviss', 'auglysandi',
      'heimilisverkin',
    ])
  })

  it('ignores revoked, unknown and invalid timestamp rows', () => {
    expect(orderTeskeidLauncherIds(['vedrid', 'bokanir'], [
      { feature_key: 'kviss', created_at: '2026-08-13T13:00:00Z' },
      { feature_key: 'unknown', created_at: '2026-08-13T14:00:00Z' },
      { feature_key: 'bokanir', created_at: 'invalid' },
    ])).toEqual(['vedrid', 'bokanir'])
  })

  it('is account-bound because each user is ordered from only their own rows', () => {
    const visible = ['vedrid', 'bokanir'] as const
    expect(orderTeskeidLauncherIds(visible, [
      { feature_key: 'bokanir', created_at: '2026-08-13T13:00:00Z' },
    ])).toEqual(['bokanir', 'vedrid'])
    expect(orderTeskeidLauncherIds(visible, [
      { feature_key: 'vedrid', created_at: '2026-08-13T14:00:00Z' },
    ])).toEqual(['vedrid', 'bokanir'])
  })
})

describe('server visibility resolver', () => {
  it('uses the authoritative weather shell and exact gates for all other features', async () => {
    const ids = await resolveTeskeidLauncherVisibility(USER)
    expect(ids).toEqual(TESKEID_LAUNCHER_IDS)
    expect(mockWeatherAccess).toHaveBeenCalledWith(USER)
    for (const id of TESKEID_LAUNCHER_IDS.filter((id) => id !== 'vedrid')) {
      expect(mockCheckFeatureAccess).toHaveBeenCalledWith(USER.id, USER.email, id)
    }
  })

  it('fails closed per feature without hiding healthy siblings', async () => {
    mockCheckFeatureAccess.mockImplementation(async (_id: string, _email: string, feature: string) => {
      if (feature === 'bokhaldid') throw new Error('lookup failed')
      return feature === 'bokanir' || feature === 'kviss'
    })
    mockWeatherAccess.mockRejectedValue(new Error('weather lookup failed'))
    expect(await resolveTeskeidLauncherVisibility(USER)).toEqual(['kviss', 'bokanir'])
  })

  it('passes the visible set once to MRU and returns that exact ordered projection', async () => {
    mockCheckFeatureAccess.mockImplementation(async (_id: string, _email: string, feature: string) => (
      feature === 'bokanir' || feature === 'kviss'
    ))
    mockWeatherAccess.mockResolvedValue({ mode: 'blocked' })
    mockReadOrder.mockResolvedValue({ ids: ['bokanir', 'kviss'], available: true })
    const result = await resolveTeskeidLauncher(USER)
    expect(mockReadOrder).toHaveBeenCalledWith(USER.id, ['kviss', 'bokanir'])
    expect(result.featureIds).toEqual(['bokanir', 'kviss'])
    expect(result.items.map(({ id }) => id)).toEqual(result.featureIds)
  })
})
