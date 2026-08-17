import type { RecentEventSource } from './types'
import type { TeskeidLauncherId } from '@/lib/teskeid/launcherCatalog'

export type TeskeidUnreadCounts = Partial<Record<TeskeidLauncherId, number>>
export const RECENT_EVENTS_CHANGED_EVENT = 'teskeid:recent-events-changed'

const SOURCE_BY_FEATURE: Partial<Record<TeskeidLauncherId, RecentEventSource>> = {
  'lanad-og-skilad': 'loans',
  'utlagt-og-endurgreitt': 'expenses',
  'afmaeli-og-vidburdir': 'events',
}

export function mapUnreadCountsToLauncher(
  unreadBySource: Partial<Record<RecentEventSource, number>>,
  visibleFeatureIds: readonly TeskeidLauncherId[],
): TeskeidUnreadCounts {
  const result: TeskeidUnreadCounts = {}
  for (const featureId of visibleFeatureIds) {
    const source = SOURCE_BY_FEATURE[featureId]
    const count = source ? unreadBySource[source] : undefined
    if (typeof count === 'number' && Number.isSafeInteger(count) && count > 0) {
      result[featureId] = count
    }
  }
  return result
}
