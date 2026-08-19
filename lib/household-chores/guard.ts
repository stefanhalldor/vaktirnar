import 'server-only'

import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { HOUSEHOLD_CHORE_FEATURE_KEY } from './contracts'

export interface HouseholdChoreAccess {
  user: User
}

export function isHouseholdChoresGloballyEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.HOUSEHOLD_CHORES_ENABLED === 'true'
}

/** Session-only boundary for invitation consent and `/adild`. */
export async function guardHouseholdChoreSession(): Promise<HouseholdChoreAccess> {
  const { user } = await guardTeskeidSession()
  return { user }
}

export async function canUseHouseholdChores(user: User): Promise<boolean> {
  if (!isHouseholdChoresGloballyEnabled() || !user.email) return false
  return checkFeatureAccess(user.id, user.email, HOUSEHOLD_CHORE_FEATURE_KEY)
}

/** Full content boundary: session + kill-switch + exact per-user entitlement. */
export async function guardHouseholdChoreAccess(): Promise<HouseholdChoreAccess> {
  const { user } = await guardHouseholdChoreSession()
  if (!await canUseHouseholdChores(user)) redirect('/')
  return { user }
}
