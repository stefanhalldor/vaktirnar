import 'server-only'

import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { BOOKING_FEATURE_KEY } from './contracts'
import { verifiedCanonicalEmail } from './security.server'
import { bookingPublicIdSchema } from './validation'

type JsonRecord = Record<string, unknown>

export type BookingAccessIntent =
  | 'read'
  | 'message'
  | 'cancel'
  | 'claim'
  | 'membership-owner'
  | 'transition'
  | 'provider'

export interface BookingAuthorization {
  user: User | null
  actorUserId: string | null
  canonicalEmail: string | null
  sessionHash: string | null
  actorKind: 'guest' | 'member' | 'provider'
  signedIn: boolean
  permissions: {
    canCancel: boolean
    canClaim: boolean
    canManageMembers: boolean
    canMessage: boolean
    canTransition: boolean
  }
  /** Bounded JSON returned by booking_read_request; repository maps it to a DTO. */
  projection: JsonRecord
}

function resultObject(value: unknown): JsonRecord | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonRecord
  if (Array.isArray(value) && value[0] && typeof value[0] === 'object') {
    return value[0] as JsonRecord
  }
  return null
}

function nestedRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

async function optionalBookingUser(): Promise<User | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
  } catch {
    return null
  }
}

export async function authorizeBookingAccess(input: {
  publicId: string
  intent?: BookingAccessIntent
  sessionHash?: string | null
  user?: User | null
}): Promise<BookingAuthorization | null> {
  if (process.env.BOOKINGS_ENABLED !== 'true') return null
  const parsedId = bookingPublicIdSchema.safeParse(input.publicId)
  if (!parsedId.success) return null

  const user = input.user === undefined ? await optionalBookingUser() : input.user
  const canonicalEmail = verifiedCanonicalEmail(user)
  const actorUserId = canonicalEmail ? user?.id ?? null : null
  const sessionHash = input.sessionHash ?? null

  let data: unknown
  let error: unknown
  try {
    const response = await getAdmin().rpc('booking_read_request', {
      p_public_id: parsedId.data,
      p_actor_user_id: actorUserId,
      p_session_hash: sessionHash,
    })
    data = response.data
    error = response.error
  } catch {
    return null
  }
  if (error) return null
  const projection = resultObject(data)
  if (!projection) return null

  const access = nestedRecord(projection.access)
  const permissionsRow = nestedRecord(projection.permissions)
  const actorKindValue = access.actorKind ?? access.actor_kind
    ?? projection.actorKind ?? projection.actor_kind
  if (actorKindValue !== 'guest' && actorKindValue !== 'member' && actorKindValue !== 'provider') {
    return null
  }
  const permissions = {
    canCancel: permissionsRow.canCancel === true || permissionsRow.can_cancel === true
      || projection.canCancel === true || projection.can_cancel === true,
    canClaim: permissionsRow.canClaim === true || permissionsRow.can_claim === true
      || projection.canClaim === true || projection.can_claim === true,
    canManageMembers: permissionsRow.canManageMembers === true
      || permissionsRow.can_manage_members === true
      || projection.canManageMembers === true
      || projection.can_manage_members === true,
    canMessage: permissionsRow.canMessage === true
      || permissionsRow.canSendMessage === true
      || permissionsRow.can_message === true
      || permissionsRow.can_send_message === true
      || projection.canMessage === true
      || projection.canSendMessage === true
      || projection.can_message === true
      || projection.can_send_message === true,
    canTransition: permissionsRow.canTransition === true
      || permissionsRow.can_transition === true
      || projection.canTransition === true
      || projection.can_transition === true,
  }
  const authorization: BookingAuthorization = {
    user,
    actorUserId,
    canonicalEmail,
    sessionHash,
    actorKind: actorKindValue,
    signedIn: canonicalEmail !== null,
    permissions,
    projection,
  }

  const intent = input.intent ?? 'read'
  const allowed = intent === 'read'
    || (intent === 'message' && permissions.canMessage)
    || (intent === 'cancel' && permissions.canCancel)
    || (intent === 'claim' && actorKindValue === 'guest' && authorization.signedIn && permissions.canClaim)
    || (intent === 'membership-owner' && permissions.canManageMembers)
    || (intent === 'transition' && permissions.canTransition)
    || (intent === 'provider' && actorKindValue === 'provider')
  return allowed ? authorization : null
}

export async function guardBookingProvider(): Promise<{ user: User; spaceId: string }> {
  if (process.env.BOOKINGS_ENABLED !== 'true') redirect('/')
  const { user } = await guardTeskeidSession()
  if (!verifiedCanonicalEmail(user)) redirect('/')
  if (!(await checkFeatureAccess(user.id, user.email!, BOOKING_FEATURE_KEY))) redirect('/')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('ensure_personal_space')
  if (error || typeof data !== 'string') throw new Error('booking_provider_unavailable')
  return { user, spaceId: data }
}

export async function requireBookingProviderApi(): Promise<
  { ok: true; user: User; spaceId: string }
  | { ok: false; status: 401 | 404 }
> {
  if (process.env.BOOKINGS_ENABLED !== 'true') return { ok: false, status: 404 }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, status: 401 }
    if (!verifiedCanonicalEmail(user)) return { ok: false, status: 404 }
    if (!(await checkFeatureAccess(user.id, user.email!, BOOKING_FEATURE_KEY))) {
      return { ok: false, status: 404 }
    }
    const { data, error } = await supabase.rpc('ensure_personal_space')
    if (error || typeof data !== 'string') return { ok: false, status: 404 }
    return { ok: true, user, spaceId: data }
  } catch {
    return { ok: false, status: 404 }
  }
}

/**
 * Workflow writes need a narrower HTTP gate so an exact SQL-owned replay can
 * still return its bounded receipt after entitlement was removed. Fresh writes
 * always re-check exact provider ownership and `bokanir` entitlement in SQL.
 */
export async function requireBookingWorkflowMutationActorApi(): Promise<
  { ok: true; user: User; spaceId: string }
  | { ok: false; status: 401 | 404 }
> {
  if (process.env.BOOKINGS_ENABLED !== 'true') return { ok: false, status: 404 }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, status: 401 }
    if (!verifiedCanonicalEmail(user)) return { ok: false, status: 404 }
    const { data, error } = await supabase.rpc('ensure_personal_space')
    if (error || typeof data !== 'string') return { ok: false, status: 404 }
    return { ok: true, user, spaceId: data }
  } catch {
    return { ok: false, status: 404 }
  }
}
