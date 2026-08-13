import 'server-only'

import type { User } from '@supabase/supabase-js'
import { getAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  bookingDetailPath,
  type BookingAccessMemberView,
  type BookingActivityEventType,
  type BookingActivityView,
  type BookingDetailView,
  type BookingMessageView,
  type BookingRequestStatus,
  type BookingServiceState,
  type CreateBookingRequestInput,
  type ProviderBookingDetailView,
  type ProviderBookingServiceView,
  type ProviderBookingSummaryView,
  type ProviderBookingWorkspaceView,
  type ProviderBusinessProfileView,
  type PublicBookingServiceView,
} from './contracts'
import type { BookingAuthorization } from './access.server'
import { authorizeBookingAccess } from './access.server'
import type { BookingCreateRateLimitInput } from './rate-limit.server'
import {
  bookingSessionCookieName,
  digestBookingToken,
  verifiedCanonicalEmail,
} from './security.server'

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonRecord
  return {}
}

function resultRecord(value: unknown): JsonRecord {
  if (Array.isArray(value)) return record(value[0])
  return record(value)
}

function resultRows(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = record(item)
    return Object.keys(row).length > 0 ? [row] : []
  })
}

function value(row: JsonRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key]
  }
  return undefined
}

function requiredString(row: JsonRecord, ...keys: string[]): string | null {
  const candidate = value(row, ...keys)
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}

function nullableString(row: JsonRecord, ...keys: string[]): string | null {
  const candidate = value(row, ...keys)
  return candidate === null || candidate === undefined
    ? null
    : typeof candidate === 'string' ? candidate : null
}

function positiveInteger(row: JsonRecord, ...keys: string[]): number | null {
  const candidate = Number(value(row, ...keys))
  return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null
}

function nullableBps(row: JsonRecord, ...keys: string[]): number | null {
  const raw = value(row, ...keys)
  if (raw === null || raw === undefined) return null
  const candidate = Number(raw)
  return Number.isSafeInteger(candidate) && candidate >= 1 && candidate <= 10_000
    ? candidate
    : null
}

function normalizeLocalTime(raw: string): string {
  return /^\d{2}:\d{2}/.test(raw) ? raw.slice(0, 5) : raw
}

const ALLOWED_RPC_ERRORS = [
  'booking_not_found',
  'booking_invalid_input',
  'booking_idempotency_conflict',
  'booking_revision_conflict',
  'booking_access_version_conflict',
  'booking_provider_not_allowed',
  'booking_service_unavailable',
  'booking_rate_limited',
  'booking_cancelled',
  'booking_message_rate_limited',
  'booking_last_owner',
  'booking_member_limit',
  'booking_claim_conflict',
  'booking_service_conflict',
] as const

function rpcError(error: { message?: string; code?: string } | null, fallback: string): never {
  const details = `${error?.message ?? ''} ${error?.code ?? ''}`.toLowerCase()
  const allowed = ALLOWED_RPC_ERRORS.find((code) => details.includes(code))
  throw new Error(allowed ?? fallback)
}

async function optionalUser(): Promise<User | null> {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser()
    return user
  } catch {
    return null
  }
}

export interface ResolvedPublicBookingService {
  serviceId: string
  businessProfileSlug: string
  view: Omit<PublicBookingServiceView, 'signedIn'>
}

function mapPublicService(data: unknown): ResolvedPublicBookingService | null {
  const row = resultRecord(data)
  const businessProfile = record(value(row, 'businessProfile', 'business_profile'))
  const service = record(row.service)
  const serviceId = requiredString(service, 'id', 'serviceId', 'service_id')
    ?? requiredString(row, 'serviceId', 'service_id')
  const slug = requiredString(businessProfile, 'slug')
    ?? requiredString(row, 'businessProfileSlug', 'business_profile_slug', 'slug')
  const displayName = requiredString(businessProfile, 'displayName', 'display_name')
    ?? requiredString(row, 'businessProfileDisplayName', 'business_profile_display_name', 'displayName')
  const title = requiredString(service, 'title') ?? requiredString(row, 'serviceTitle', 'service_title', 'title')
  const timezone = requiredString(service, 'timezone') ?? requiredString(row, 'timezone')
  if (!serviceId || !slug || !displayName || !title || !timezone) return null
  return {
    serviceId,
    businessProfileSlug: slug,
    view: {
      businessProfile: {
        slug,
        displayName,
        description: nullableString(businessProfile, 'description')
          ?? nullableString(row, 'businessProfileDescription', 'business_profile_description'),
        websiteUrl: nullableString(businessProfile, 'websiteUrl', 'website_url')
          ?? nullableString(row, 'businessProfileWebsiteUrl', 'business_profile_website_url'),
      },
      service: {
        title,
        summary: nullableString(service, 'summary') ?? nullableString(row, 'serviceSummary', 'service_summary'),
        timezone,
        signedInDiscountBps: nullableBps(service, 'signedInDiscountBps', 'signed_in_discount_bps')
          ?? nullableBps(row, 'signedInDiscountBps', 'signed_in_discount_bps'),
      },
    },
  }
}

export async function resolvePublicBookingService(
  businessProfileSlug: string,
): Promise<ResolvedPublicBookingService | null> {
  if (process.env.BOOKINGS_ENABLED !== 'true') return null
  try {
    const { data, error } = await getAdmin().rpc('booking_resolve_public', {
      p_business_profile_slug: businessProfileSlug,
    })
    if (error) return null
    return mapPublicService(data)
  } catch {
    return null
  }
}

export async function loadPublicBookingService(
  businessProfileSlug: string,
): Promise<PublicBookingServiceView | null> {
  const resolved = await resolvePublicBookingService(businessProfileSlug)
  if (!resolved) return null
  const user = await optionalUser()
  return { ...resolved.view, signedIn: verifiedCanonicalEmail(user) !== null }
}

export interface CreateBookingRequestCommand {
  serviceId: string
  input: CreateBookingRequestInput
  requestedAtUtc: string
  user: User | null
  guestCapabilityDigest: string | null
  rateLimit: BookingCreateRateLimitInput
}

export interface CreatedBookingRecord {
  id: string
  publicId: string
  businessProfileSlug: string
  accessMode: 'link' | 'members'
  accessVersion: number
  status: BookingRequestStatus
  revision: number
  appliedDiscountBps: number | null
  created: boolean
}

function mapCreatedBookingRecord(data: unknown): CreatedBookingRecord {
  const row = resultRecord(data)
  const id = requiredString(row, 'id')
  const publicId = requiredString(row, 'publicId', 'public_id')
  const businessProfileSlug = requiredString(row, 'businessProfileSlug', 'business_profile_slug')
  const accessMode = value(row, 'accessMode', 'access_mode')
  const status = value(row, 'status')
  const accessVersion = positiveInteger(row, 'accessVersion', 'access_version')
  const revision = positiveInteger(row, 'revision')
  if (!id || !publicId || !businessProfileSlug
    || (accessMode !== 'link' && accessMode !== 'members')
    || (status !== 'requested' && status !== 'cancelled') || !accessVersion || !revision) {
    throw new Error('booking_save_failed')
  }
  return {
    id,
    publicId,
    businessProfileSlug,
    accessMode,
    accessVersion,
    status,
    revision,
    appliedDiscountBps: nullableBps(row, 'discountBps', 'discount_bps', 'appliedDiscountBps'),
    created: value(row, 'created') === true,
  }
}

export async function resolveBookingCreateReplay(command: {
  input: CreateBookingRequestInput
  user: User | null
  guestCapabilityDigest: string | null
}): Promise<CreatedBookingRecord | null> {
  const actorId = verifiedCanonicalEmail(command.user) ? command.user?.id ?? null : null
  const { data, error } = await getAdmin().rpc('booking_resolve_create_replay', {
    p_request_id: command.input.requestId,
    p_business_profile_slug: command.input.businessProfileSlug,
    p_creator_user_id: actorId,
    p_contact_name: command.input.contactName,
    p_contact_email: command.input.contactEmail,
    p_contact_phone: command.input.contactPhone,
    p_contact_message: command.input.message,
    p_requested_local_date: command.input.requestedDate,
    p_requested_local_time: command.input.requestedTime,
    p_guest_capability_hash: actorId ? null : command.guestCapabilityDigest,
  })
  if (error) rpcError(error, 'booking_save_failed')
  if (data === null || data === undefined) return null
  return mapCreatedBookingRecord(data)
}

export async function createBookingRequest(
  command: CreateBookingRequestCommand,
): Promise<CreatedBookingRecord> {
  const actorId = verifiedCanonicalEmail(command.user) ? command.user?.id ?? null : null
  const { data, error } = await getAdmin().rpc('booking_create_request', {
    p_service_id: command.serviceId,
    p_request_id: command.input.requestId,
    p_creator_user_id: actorId,
    p_contact_name: command.input.contactName,
    p_contact_email: command.input.contactEmail,
    p_contact_phone: command.input.contactPhone,
    p_contact_message: command.input.message,
    p_requested_local_date: command.input.requestedDate,
    p_requested_local_time: command.input.requestedTime,
    p_requested_at: command.requestedAtUtc,
    p_guest_capability_hash: actorId ? null : command.guestCapabilityDigest,
    p_rate_limit_hash: command.rateLimit.hash,
    p_rate_limit_window_date: command.rateLimit.windowDate,
    p_rate_limit_max: command.rateLimit.maxRequests,
  })
  if (error) rpcError(error, 'booking_save_failed')
  return mapCreatedBookingRecord(data)
}

export async function exchangeBookingCapability(input: {
  publicId: string
  capabilityDigest: string
  sessionDigest: string
  sessionExpiresAt: string
}): Promise<{ publicId: string; accessVersion: number; sessionExpiresAt: string }> {
  const { data, error } = await getAdmin().rpc('booking_exchange_capability', {
    p_public_id: input.publicId,
    p_capability_hash: input.capabilityDigest,
    p_session_hash: input.sessionDigest,
    p_session_expires_at: input.sessionExpiresAt,
  })
  if (error) rpcError(error, 'booking_not_found')
  const row = resultRecord(data)
  const publicId = requiredString(row, 'publicId', 'public_id')
  const accessVersion = positiveInteger(row, 'accessVersion', 'access_version')
  const sessionExpiresAt = requiredString(row, 'sessionExpiresAt', 'session_expires_at')
  if (!publicId || !accessVersion || !sessionExpiresAt) throw new Error('booking_not_found')
  return { publicId, accessVersion, sessionExpiresAt }
}

function mapMember(row: JsonRecord): Omit<BookingAccessMemberView, 'isSelf'> | null {
  const id = requiredString(row, 'id')
  const emailCanonical = requiredString(row, 'emailCanonical', 'email_canonical')
  const role = value(row, 'role')
  const status = value(row, 'status')
  const createdAt = requiredString(row, 'createdAt', 'created_at')
  if (!id || !emailCanonical || (role !== 'owner' && role !== 'member')
    || (status !== 'active' && status !== 'revoked') || !createdAt) return null
  return {
    id,
    emailCanonical,
    role,
    status,
    createdAt,
    revokedAt: nullableString(row, 'revokedAt', 'revoked_at'),
  }
}

function mapActivity(row: JsonRecord): BookingActivityView | null {
  const id = requiredString(row, 'id')
  const eventType = value(row, 'eventType', 'event_type') as BookingActivityEventType
  const createdAt = requiredString(row, 'createdAt', 'created_at')
  const allowed = new Set<BookingActivityEventType>([
    'request_submitted', 'request_cancelled', 'booking_claimed',
    'member_added', 'member_revoked', 'discount_applied',
  ])
  if (!id || !allowed.has(eventType) || !createdAt) return null
  return { id, eventType, actorName: nullableString(row, 'actorName', 'actor_name'), createdAt }
}

function mapMessage(publicId: string, row: JsonRecord): BookingMessageView | null {
  const id = requiredString(row, 'id')
  const createdAt = requiredString(row, 'createdAt', 'created_at')
  const senderSide = value(row, 'senderSide', 'sender_side')
  const senderKind = value(row, 'senderKind', 'sender_kind')
  const isDeleted = value(row, 'isDeleted', 'is_deleted') === true
    || value(row, 'deletedAt', 'deleted_at') !== null && value(row, 'deletedAt', 'deleted_at') !== undefined
  const isHidden = value(row, 'isHidden', 'is_hidden') === true
    || value(row, 'hiddenAt', 'hidden_at') !== null && value(row, 'hiddenAt', 'hidden_at') !== undefined
  if (!id || !createdAt || (senderSide !== 'customer' && senderSide !== 'provider')
    || (senderKind !== 'guest' && senderKind !== 'member' && senderKind !== 'provider')) return null
  return {
    id,
    threadId: publicId,
    body: isDeleted || isHidden ? '' : nullableString(row, 'body') ?? '',
    messageKind: 'chat',
    createdAt,
    isDeleted,
    isHidden,
    authorName: nullableString(row, 'authorName', 'author_name'),
    senderSide,
    senderKind,
  }
}

export async function listBookingMessages(
  authorization: BookingAuthorization,
  publicId: string,
  options?: { before?: string; beforeId?: string; limit?: number },
): Promise<BookingMessageView[]> {
  const { data, error } = await getAdmin().rpc('booking_list_messages', {
    p_public_id: publicId,
    p_actor_user_id: authorization.actorUserId,
    p_session_hash: authorization.sessionHash,
    p_before_created_at: options?.before ?? null,
    p_before_id: options?.beforeId ?? null,
    p_limit: Math.min(Math.max(options?.limit ?? 50, 1), 100),
  })
  if (error) rpcError(error, 'booking_not_found')
  return resultRows(data).flatMap((row) => {
    const message = mapMessage(publicId, row)
    return message ? [message] : []
  })
}

export async function listBookingActivity(
  authorization: BookingAuthorization,
  publicId: string,
  options?: { before?: string; beforeId?: string; limit?: number },
): Promise<BookingActivityView[]> {
  const { data, error } = await getAdmin().rpc('booking_list_events', {
    p_public_id: publicId,
    p_actor_user_id: authorization.actorUserId,
    p_session_hash: authorization.sessionHash,
    p_before_created_at: options?.before ?? null,
    p_before_id: options?.beforeId ?? null,
    p_limit: Math.min(Math.max(options?.limit ?? 100, 1), 100),
  })
  if (error) rpcError(error, 'booking_not_found')
  return resultRows(data).flatMap((row) => {
    const event = mapActivity(row)
    return event ? [event] : []
  })
}

function mapBookingDetail(
  authorization: BookingAuthorization,
  activity: BookingActivityView[],
  messages: BookingMessageView[],
): BookingDetailView | null {
  const row = authorization.projection
  const booking = record(value(row, 'booking', 'request'))
  const source = Object.keys(booking).length > 0 ? booking : row
  const provider = record(value(row, 'provider', 'businessProfile', 'business_profile'))
  const service = record(row.service)
  const requested = record(row.requested)
  const contact = record(row.contact)
  const discount = record(row.discount)
  const publicId = requiredString(source, 'publicId', 'public_id')
  const businessProfileSlug = requiredString(provider, 'slug')
    ?? requiredString(row, 'businessProfileSlug', 'business_profile_slug')
  const providerDisplayName = requiredString(provider, 'displayName', 'display_name')
    ?? requiredString(row, 'providerDisplayName', 'provider_display_name')
  const serviceTitle = requiredString(service, 'title')
    ?? requiredString(row, 'serviceTitle', 'service_title')
  const serviceTimezone = requiredString(service, 'timezone')
    ?? requiredString(source, 'timezone', 'providerTimezone', 'provider_timezone')
  const status = value(source, 'status')
  const accessMode = value(source, 'accessMode', 'access_mode')
  const revision = positiveInteger(source, 'revision')
  const accessVersion = positiveInteger(source, 'accessVersion', 'access_version')
  const date = requiredString(requested, 'date')
    ?? requiredString(source, 'requestedDate', 'requestedLocalDate', 'requested_local_date')
  const timeRaw = requiredString(requested, 'time')
    ?? requiredString(source, 'requestedTime', 'requestedLocalTime', 'requested_local_time')
  const startsAtUtc = requiredString(requested, 'startsAtUtc', 'starts_at_utc')
    ?? requiredString(source, 'requestedAt', 'requested_at')
  const contactName = requiredString(contact, 'name') ?? requiredString(source, 'contactName', 'contact_name')
  const contactEmail = requiredString(contact, 'email') ?? requiredString(source, 'contactEmail', 'contact_email')
  const createdAt = requiredString(source, 'createdAt', 'created_at')
  if (!publicId || !businessProfileSlug || !providerDisplayName || !serviceTitle || !serviceTimezone
    || (status !== 'requested' && status !== 'cancelled')
    || (accessMode !== 'link' && accessMode !== 'members') || !revision || !accessVersion
    || !date || !timeRaw || !startsAtUtc || !contactName || !contactEmail || !createdAt) return null

  const memberRows = Array.isArray(row.members) ? resultRows(row.members) : []
  return {
    publicId,
    businessProfileSlug,
    provider: {
      displayName: providerDisplayName,
      websiteUrl: nullableString(provider, 'websiteUrl', 'website_url')
        ?? nullableString(row, 'providerWebsiteUrl', 'provider_website_url'),
    },
    service: {
      title: serviceTitle,
      summary: nullableString(service, 'summary') ?? nullableString(row, 'serviceSummary', 'service_summary'),
      timezone: serviceTimezone,
    },
    status,
    accessMode,
    revision,
    accessVersion,
    requested: { date, time: normalizeLocalTime(timeRaw), timezone: serviceTimezone, startsAtUtc },
    contact: {
      name: contactName,
      email: contactEmail,
      phone: nullableString(contact, 'phone') ?? nullableString(source, 'contactPhone', 'contact_phone'),
      message: nullableString(contact, 'message')
        ?? nullableString(source, 'contactMessage', 'contact_message')
        ?? '',
    },
    discount: {
      eligibleBps: nullableBps(discount, 'eligibleBps', 'eligible_bps')
        ?? nullableBps(source, 'discountEligibleBps', 'discount_eligible_bps'),
      appliedBps: nullableBps(discount, 'appliedBps', 'applied_bps')
        ?? nullableBps(source, 'discountAppliedBps', 'discount_applied_bps'),
    },
    createdAt,
    cancelledAt: nullableString(source, 'cancelledAt', 'cancelled_at'),
    permissions: {
      actorKind: authorization.actorKind,
      signedIn: authorization.signedIn,
      canCancel: authorization.permissions.canCancel,
      canClaim: accessMode === 'link'
        && status === 'requested'
        && authorization.signedIn
        && authorization.permissions.canClaim,
      canManageMembers: authorization.permissions.canManageMembers,
      canMessage: authorization.permissions.canMessage,
    },
    members: memberRows.flatMap((memberRow) => {
      const member = mapMember(memberRow)
      return member ? [{
        ...member,
        isSelf: authorization.canonicalEmail === member.emailCanonical,
      }] : []
    }),
    activity,
    messages,
  }
}

export async function loadBookingDetail(input: {
  publicId: string
  sessionHash?: string | null
  user?: User | null
  intent?: 'read' | 'provider'
}): Promise<BookingDetailView | null> {
  const authorization = await authorizeBookingAccess({
    publicId: input.publicId,
    sessionHash: input.sessionHash,
    user: input.user,
    intent: input.intent ?? 'read',
  })
  if (!authorization) return null
  try {
    const [activity, messages] = await Promise.all([
      listBookingActivity(authorization, input.publicId),
      listBookingMessages(authorization, input.publicId),
    ])
    return mapBookingDetail(authorization, activity, messages)
  } catch {
    return null
  }
}

export async function sendBookingMessage(
  authorization: BookingAuthorization,
  publicId: string,
  input: { body: string; clientMessageId: string; idempotencyKey: string },
): Promise<BookingMessageView> {
  const { data, error } = await getAdmin().rpc('booking_send_message', {
    p_public_id: publicId,
    p_actor_user_id: authorization.actorUserId,
    p_session_hash: authorization.sessionHash,
    p_body: input.body,
    p_client_message_id: input.clientMessageId,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) rpcError(error, 'booking_save_failed')
  const message = mapMessage(publicId, resultRecord(data))
  if (!message) throw new Error('booking_save_failed')
  return message
}

export async function cancelBookingRequest(
  authorization: Pick<BookingAuthorization, 'actorUserId' | 'sessionHash'>,
  publicId: string,
  input: { expectedRevision: number; idempotencyKey: string },
): Promise<void> {
  const { error } = await getAdmin().rpc('booking_cancel_request', {
    p_public_id: publicId,
    p_actor_user_id: authorization.actorUserId,
    p_session_hash: authorization.sessionHash,
    p_expected_revision: input.expectedRevision,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) rpcError(error, 'booking_save_failed')
}

export async function claimBookingRequest(
  authorization: BookingAuthorization,
  publicId: string,
  input: { expectedAccessVersion: number; additionalEmails: string[]; idempotencyKey: string },
): Promise<void> {
  if (!authorization.actorUserId) throw new Error('booking_unauthorized')
  const { error } = await getAdmin().rpc('booking_claim_request', {
    p_public_id: publicId,
    p_actor_user_id: authorization.actorUserId,
    p_session_hash: authorization.sessionHash,
    p_expected_access_version: input.expectedAccessVersion,
    p_additional_emails: input.additionalEmails,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) rpcError(error, 'booking_save_failed')
}

export async function manageBookingMember(
  actorUserId: string,
  publicId: string,
  input: (
    | {
      expectedAccessVersion: number
      targetEmail: string
      action: 'add_member' | 'add_owner'
      idempotencyKey: string
    }
    | {
      expectedAccessVersion: number
      targetMemberId: string
      action: 'revoke'
      idempotencyKey: string
    }
  ),
): Promise<void> {
  const { error } = await getAdmin().rpc('booking_manage_member', {
    p_public_id: publicId,
    p_actor_user_id: actorUserId,
    p_expected_access_version: input.expectedAccessVersion,
    p_target_selector: input.action === 'revoke' ? input.targetMemberId : input.targetEmail,
    p_action: input.action,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) rpcError(error, 'booking_save_failed')
}

function mapProviderProfile(row: JsonRecord): ProviderBusinessProfileView | null {
  const id = requiredString(row, 'id')
  const slug = requiredString(row, 'slug')
  const displayName = requiredString(row, 'displayName', 'display_name')
  if (!id || !slug || !displayName) return null
  return {
    id,
    slug,
    displayName,
    description: nullableString(row, 'description'),
    websiteUrl: nullableString(row, 'websiteUrl', 'website_url'),
  }
}

function mapProviderService(row: JsonRecord): ProviderBookingServiceView | null {
  const id = requiredString(row, 'id')
  const businessProfileId = requiredString(row, 'businessProfileId', 'business_profile_id')
  const revision = positiveInteger(row, 'revision')
  const title = requiredString(row, 'title')
  const timezone = requiredString(row, 'timezone')
  const status = value(row, 'status') as BookingServiceState
  const updatedAt = requiredString(row, 'updatedAt', 'updated_at')
  if (!id || !businessProfileId || !revision || !title || !timezone
    || !['draft', 'published', 'paused'].includes(status) || !updatedAt) return null
  return {
    id,
    businessProfileId,
    revision,
    title,
    summary: nullableString(row, 'summary'),
    timezone,
    signedInDiscountBps: nullableBps(row, 'signedInDiscountBps', 'signed_in_discount_bps'),
    status,
    updatedAt,
  }
}

function mapProviderRequest(row: JsonRecord): ProviderBookingSummaryView | null {
  const publicId = requiredString(row, 'publicId', 'public_id')
  const businessProfileSlug = requiredString(row, 'businessProfileSlug', 'business_profile_slug')
  const providerDisplayName = requiredString(row, 'providerDisplayName', 'provider_display_name')
  const serviceTitle = requiredString(row, 'serviceTitle', 'service_title')
  const status = value(row, 'status')
  const requestedDate = requiredString(row, 'requestedDate', 'requested_local_date')
  const requestedTime = requiredString(row, 'requestedTime', 'requested_local_time')
  const timezone = requiredString(row, 'timezone', 'provider_timezone')
  const contactName = requiredString(row, 'contactName', 'contact_name')
  const createdAt = requiredString(row, 'createdAt', 'created_at')
  if (!publicId || !businessProfileSlug || !providerDisplayName || !serviceTitle
    || (status !== 'requested' && status !== 'cancelled') || !requestedDate
    || !requestedTime || !timezone || !contactName || !createdAt) return null
  return {
    publicId,
    businessProfileSlug,
    providerDisplayName,
    serviceTitle,
    status,
    requestedDate,
    requestedTime: normalizeLocalTime(requestedTime),
    timezone,
    contactName,
    createdAt,
    lastMessageAt: nullableString(row, 'lastMessageAt', 'last_message_at'),
  }
}

export async function loadProviderBookingWorkspace(
  actorId: string,
  spaceId: string,
): Promise<ProviderBookingWorkspaceView> {
  const admin = getAdmin()
  // This RPC performs the authoritative entitlement + exact space-owner
  // assertion before any direct service-role profile read can occur.
  const servicesResult = await admin.rpc('booking_provider_list_services', {
    p_actor_id: actorId,
    p_space_id: spaceId,
  })
  if (servicesResult.error) throw new Error('booking_provider_load_failed')
  const [profilesResult, requestsResult] = await Promise.all([
    admin.from('business_profiles')
      .select('id,slug,display_name,description,website_url')
      .eq('space_id', spaceId)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(100),
    admin.rpc('booking_provider_list_requests', {
      p_actor_id: actorId,
      p_space_id: spaceId,
      p_service_id: null,
      p_before_created_at: null,
      p_before_id: null,
      p_limit: 100,
    }),
  ])
  if (profilesResult.error || requestsResult.error) {
    throw new Error('booking_provider_load_failed')
  }
  return {
    profiles: resultRows(profilesResult.data).flatMap((row) => {
      const profile = mapProviderProfile(row)
      return profile ? [profile] : []
    }),
    services: resultRows(servicesResult.data).flatMap((row) => {
      const service = mapProviderService(row)
      return service ? [service] : []
    }),
    requests: resultRows(requestsResult.data).flatMap((row) => {
      const request = mapProviderRequest(row)
      return request ? [request] : []
    }),
  }
}

export async function saveBookingServiceSettings(actorId: string, spaceId: string, input: {
  id?: string | null
  expectedRevision?: number | null
  businessProfileId: string
  title: string
  summary: string | null
  timezone: string
  signedInDiscountBps: number | null
}): Promise<ProviderBookingServiceView> {
  const workspace = await loadProviderBookingWorkspace(actorId, spaceId)
  const current = input.id
    ? workspace.services.find((service) => service.id === input.id) ?? null
    : workspace.services.find((service) => service.businessProfileId === input.businessProfileId) ?? null
  if (input.id && !current) throw new Error('booking_not_found')
  if (current && current.businessProfileId !== input.businessProfileId) {
    throw new Error('booking_not_found')
  }
  if (!input.id && current) {
    const exactReplay = current.title === input.title
      && current.summary === input.summary
      && current.timezone === input.timezone
      && current.signedInDiscountBps === input.signedInDiscountBps
    if (exactReplay) return current
    throw new Error('booking_service_conflict')
  }
  return upsertBookingService(actorId, spaceId, {
    ...input,
    id: current?.id ?? null,
    expectedRevision: current ? input.expectedRevision : null,
    status: current?.status ?? 'draft',
  })
}

export async function upsertBookingService(actorId: string, spaceId: string, input: {
  id?: string | null
  expectedRevision?: number | null
  businessProfileId: string
  title: string
  summary: string | null
  timezone: string
  signedInDiscountBps: number | null
  status: BookingServiceState
  idempotencyKey?: string | null
}): Promise<ProviderBookingServiceView> {
  const { data, error } = await getAdmin().rpc('booking_upsert_service', {
    p_actor_id: actorId,
    p_space_id: spaceId,
    p_business_profile_id: input.businessProfileId,
    p_service_id: input.id ?? null,
    p_expected_revision: input.expectedRevision ?? null,
    p_title: input.title,
    p_summary: input.summary,
    p_timezone: input.timezone,
    p_signed_in_discount_bps: input.signedInDiscountBps,
    p_status: input.status,
    p_idempotency_key: input.idempotencyKey ?? null,
  })
  if (error) rpcError(error, 'booking_save_failed')
  const service = mapProviderService(resultRecord(data))
  if (!service) throw new Error('booking_save_failed')
  return service
}

export async function transitionBookingService(actorId: string, spaceId: string, input: {
  serviceId: string
  expectedRevision: number
  transition: 'publish' | 'pause'
  idempotencyKey: string
}): Promise<ProviderBookingServiceView> {
  const workspace = await loadProviderBookingWorkspace(actorId, spaceId)
  const current = workspace.services.find((service) => service.id === input.serviceId)
  if (!current) throw new Error('booking_not_found')
  const desired: BookingServiceState = input.transition === 'publish' ? 'published' : 'paused'
  if (current.revision === input.expectedRevision && current.status === desired) return current
  return upsertBookingService(actorId, spaceId, {
    id: current.id,
    expectedRevision: input.expectedRevision,
    businessProfileId: current.businessProfileId,
    title: current.title,
    summary: current.summary,
    timezone: current.timezone,
    signedInDiscountBps: current.signedInDiscountBps,
    status: desired,
    idempotencyKey: input.idempotencyKey,
  })
}

export async function loadBookingDetailForPage(input: {
  publicId: string
  sessionHash?: string | null
  user?: User | null
}): Promise<BookingDetailView | null> {
  let sessionHash = input.sessionHash
  if (sessionHash === undefined) {
    try {
      const { cookies } = await import('next/headers')
      const token = (await cookies()).get(bookingSessionCookieName(input.publicId))?.value
      sessionHash = token ? digestBookingToken(token) : null
    } catch {
      sessionHash = null
    }
  }
  return loadBookingDetail({ ...input, sessionHash })
}

export async function loadProviderBookingDetail(
  actorId: string,
  spaceId: string,
  publicId: string,
): Promise<ProviderBookingDetailView | null> {
  const user = await optionalUser()
  if (!user || user.id !== actorId) return null
  const services = await getAdmin().rpc('booking_provider_list_services', {
    p_actor_id: actorId,
    p_space_id: spaceId,
  })
  if (services.error) return null
  return loadBookingDetail({ publicId, user, sessionHash: null, intent: 'provider' })
}

export function createdBookingPath(slug: string, publicId: string): string {
  return bookingDetailPath(slug, publicId)
}
