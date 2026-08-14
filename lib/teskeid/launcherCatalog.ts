export const TESKEID_LAUNCHER_IDS = [
  'lanad-og-skilad',
  'utlagt-og-endurgreitt',
  'bokhaldid',
  'umonnun',
  'vedrid',
  'kviss',
  'auglysandi',
  'bokanir',
] as const

export type TeskeidLauncherId = typeof TESKEID_LAUNCHER_IDS[number]

export type TeskeidLauncherIcon =
  | 'handshake'
  | 'wallet'
  | 'book-open'
  | 'heart'
  | 'cloud-sun'
  | 'trophy'
  | 'megaphone'
  | 'calendar'

export interface TeskeidLauncherCatalogItem {
  id: TeskeidLauncherId
  href: string
  activePrefixes: readonly string[]
  fallbackRank: number
  icon: TeskeidLauncherIcon
  navKey: string
  titleKey: string
  descriptionKey: string
}

export const TESKEID_LAUNCHER_CATALOG: readonly TeskeidLauncherCatalogItem[] = [
  {
    id: 'lanad-og-skilad',
    href: '/auth-mvp/lanad-og-skilad',
    activePrefixes: ['/auth-mvp/lanad-og-skilad'],
    fallbackRank: 0,
    icon: 'handshake',
    navKey: 'loans',
    titleKey: 'loansCardTitle',
    descriptionKey: 'loansCardDescription',
  },
  {
    id: 'utlagt-og-endurgreitt',
    href: '/auth-mvp/utlagt-og-endurgreitt',
    activePrefixes: ['/auth-mvp/utlagt-og-endurgreitt'],
    fallbackRank: 1,
    icon: 'wallet',
    navKey: 'expenses',
    titleKey: 'expensesCardTitle',
    descriptionKey: 'expensesCardDescription',
  },
  {
    id: 'bokhaldid',
    href: '/auth-mvp/bokhaldid',
    activePrefixes: ['/auth-mvp/bokhaldid'],
    fallbackRank: 2,
    icon: 'book-open',
    navKey: 'bookkeeping',
    titleKey: 'bookkeepingCardTitle',
    descriptionKey: 'bookkeepingCardDescription',
  },
  {
    id: 'umonnun',
    href: '/auth-mvp/umonnun',
    activePrefixes: ['/auth-mvp/umonnun'],
    fallbackRank: 3,
    icon: 'heart',
    navKey: 'care',
    titleKey: 'careCardTitle',
    descriptionKey: 'careCardDescription',
  },
  {
    id: 'vedrid',
    href: '/auth-mvp/vedrid',
    activePrefixes: ['/auth-mvp/vedrid'],
    fallbackRank: 4,
    icon: 'cloud-sun',
    navKey: 'weather',
    titleKey: 'weatherCardTitle',
    descriptionKey: 'weatherCardDescription',
  },
  {
    id: 'kviss',
    href: '/auth-mvp/kviss',
    activePrefixes: ['/auth-mvp/kviss'],
    fallbackRank: 5,
    icon: 'trophy',
    navKey: 'quiz',
    titleKey: 'quizCardTitle',
    descriptionKey: 'quizCardDescription',
  },
  {
    id: 'auglysandi',
    href: '/auth-mvp/auglysandi',
    activePrefixes: ['/auth-mvp/auglysandi'],
    fallbackRank: 6,
    icon: 'megaphone',
    navKey: 'advertiser',
    titleKey: 'advertiserCardTitle',
    descriptionKey: 'advertiserCardDescription',
  },
  {
    id: 'bokanir',
    href: '/auth-mvp/bokanir',
    activePrefixes: ['/auth-mvp/bokanir'],
    fallbackRank: 7,
    icon: 'calendar',
    navKey: 'bookings',
    titleKey: 'bookingsCardTitle',
    descriptionKey: 'bookingsCardDescription',
  },
] as const

const CATALOG_BY_ID = new Map(TESKEID_LAUNCHER_CATALOG.map((item) => [item.id, item]))

export function isTeskeidLauncherId(value: unknown): value is TeskeidLauncherId {
  return typeof value === 'string' && CATALOG_BY_ID.has(value as TeskeidLauncherId)
}

export function getTeskeidLauncherItem(id: TeskeidLauncherId): TeskeidLauncherCatalogItem {
  return CATALOG_BY_ID.get(id)!
}

export function teskeidLauncherIdFromPathname(pathname: string): TeskeidLauncherId | null {
  for (const item of TESKEID_LAUNCHER_CATALOG) {
    if (item.activePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return item.id
    }
  }
  return null
}

const PUBLIC_AUTH_MVP_WEATHER_PATHS = new Set([
  '/auth-mvp/vedrid/road-map-prototype',
])

/** Path mapping for authenticated MRU writes, excluding public exceptions. */
export function trackedTeskeidLauncherIdFromPathname(pathname: string): TeskeidLauncherId | null {
  const normalizedPathname = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname
  if (PUBLIC_AUTH_MVP_WEATHER_PATHS.has(normalizedPathname)) return null
  return teskeidLauncherIdFromPathname(normalizedPathname)
}
