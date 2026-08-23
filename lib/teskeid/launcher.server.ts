import 'server-only'

import type { User } from '@supabase/supabase-js'
import { hasAgentCollaborationBetaAccess } from '@/lib/agent-collaboration/access.server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { resolveAuthenticatedWeatherShellAccess } from '@/lib/weather/weatherBaseAccess.server'
import { listScopedEventParticipationsV3 } from '@/lib/events/participant-identity-v3.repository.server'
import {
  TESKEID_LAUNCHER_CATALOG,
  getTeskeidLauncherItem,
  type TeskeidLauncherCatalogItem,
  type TeskeidLauncherId,
} from './launcherCatalog'
import { readTeskeidLauncherOrder } from './launcherUsage.server'

type LauncherUser = Pick<User, 'id' | 'email'>

export interface TeskeidLauncherResolution {
  items: TeskeidLauncherCatalogItem[]
  featureIds: TeskeidLauncherId[]
  usageAvailable: boolean
  agentCollaborationAvailable: boolean
}

async function resolveFeatureVisibility(
  user: LauncherUser,
  featureId: TeskeidLauncherId,
): Promise<boolean> {
  if (!user.email) return false
  try {
    if (featureId === 'vedrid') {
      return (await resolveAuthenticatedWeatherShellAccess(user)).mode !== 'blocked'
    }
    if (featureId === 'afmaeli-og-vidburdir') {
      if (process.env.EVENTS_ENABLED !== 'true') return false
      if (await checkFeatureAccess(user.id, user.email, featureId)) return true
      const scoped = await listScopedEventParticipationsV3(user.id)
      return scoped.participating.length > 0
    }
    return await checkFeatureAccess(user.id, user.email, featureId)
  } catch {
    return false
  }
}
export async function canAccessTeskeidLauncherFeature(
  user: LauncherUser,
  featureId: TeskeidLauncherId,
): Promise<boolean> {
  return resolveFeatureVisibility(user, featureId)
}

export async function resolveTeskeidLauncherVisibility(
  user: LauncherUser,
): Promise<TeskeidLauncherId[]> {
  const visibility = await Promise.all(
    TESKEID_LAUNCHER_CATALOG.map(async (item) => ({
      id: item.id,
      visible: await resolveFeatureVisibility(user, item.id),
    })),
  )
  return visibility.flatMap(({ id, visible }) => visible ? [id] : [])
}

export async function resolveTeskeidLauncher(user: LauncherUser): Promise<TeskeidLauncherResolution> {
  const [visibleIds, agentCollaborationAvailable] = await Promise.all([
    resolveTeskeidLauncherVisibility(user),
    user.email && process.env.AUTH_MVP_ENABLED === 'true'
      && process.env.AGENT_COLLABORATION_ENABLED === 'true'
      ? hasAgentCollaborationBetaAccess(user.email).catch(() => false)
      : Promise.resolve(false),
  ])
  const usage = await readTeskeidLauncherOrder(user.id, visibleIds)
  return {
    items: usage.ids.map(getTeskeidLauncherItem),
    featureIds: usage.ids,
    usageAvailable: usage.available,
    agentCollaborationAvailable,
  }
}
