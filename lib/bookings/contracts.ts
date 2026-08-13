export const BOOKING_FEATURE_KEY = 'bokanir' as const

export const BOOKING_SERVICE_STATES = ['draft', 'published', 'paused'] as const
export type BookingServiceState = (typeof BOOKING_SERVICE_STATES)[number]

export const BOOKING_REQUEST_STATUSES = ['requested', 'cancelled'] as const
export type BookingRequestStatus = (typeof BOOKING_REQUEST_STATUSES)[number]

export const BOOKING_ACCESS_MODES = ['link', 'members'] as const
export type BookingAccessMode = (typeof BOOKING_ACCESS_MODES)[number]

export const BOOKING_MEMBER_ROLES = ['owner', 'member'] as const
export type BookingMemberRole = (typeof BOOKING_MEMBER_ROLES)[number]

export const BOOKING_MEMBER_STATUSES = ['active', 'revoked'] as const
export type BookingMemberStatus = (typeof BOOKING_MEMBER_STATUSES)[number]

export const BOOKING_ACTIVITY_EVENT_TYPES = [
  'request_submitted',
  'request_cancelled',
  'booking_claimed',
  'member_added',
  'member_revoked',
  'discount_applied',
] as const
export type BookingActivityEventType = (typeof BOOKING_ACTIVITY_EVENT_TYPES)[number]

export const BOOKING_ACTION_ERRORS = [
  'invalid_input',
  'not_found',
  'unauthorized',
  'conflict',
  'rate_limited',
  'feature_disabled',
  'save_failed',
] as const
export type BookingActionError = (typeof BOOKING_ACTION_ERRORS)[number]

export type BookingActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: BookingActionError }

export interface PublicBookingServiceView {
  businessProfile: {
    slug: string
    displayName: string
    description: string | null
    websiteUrl: string | null
  }
  service: {
    title: string
    summary: string | null
    timezone: string
    signedInDiscountBps: number | null
  }
  signedIn: boolean
}

export interface CreateBookingRequestInput {
  businessProfileSlug: string
  requestId: string
  requestedDate: string
  requestedTime: string
  contactName: string
  contactEmail: string
  contactPhone: string
  message: string
  /** Honeypot. Real users leave this absent or empty. */
  website?: string
}

export interface CreateBookingRequestResult {
  publicId: string
  businessProfileSlug: string
  bookingPath: string
  accessMode: BookingAccessMode
  status: BookingRequestStatus
  appliedDiscountBps: number | null
  /** Present only for a guest/link-mode request. Never persist this in a URL query. */
  guestCapability: string | null
}

export interface BookingAccessMemberView {
  id: string
  emailCanonical: string
  /** Derived server-side from the current verified session email. */
  isSelf: boolean
  role: BookingMemberRole
  status: BookingMemberStatus
  createdAt: string
  revokedAt: string | null
}

export interface BookingActivityView {
  id: string
  eventType: BookingActivityEventType
  actorName: string | null
  createdAt: string
}

/** Structurally compatible with ScopedChatPanel's MessageDto contract. */
export interface BookingMessageView {
  id: string
  threadId: string
  body: string
  messageKind: 'chat'
  createdAt: string
  isDeleted: boolean
  isHidden: boolean
  authorName: string | null
  senderSide: 'customer' | 'provider'
  senderKind: 'guest' | 'member' | 'provider'
}

export interface BookingDetailView {
  publicId: string
  businessProfileSlug: string
  provider: {
    displayName: string
    websiteUrl: string | null
  }
  service: {
    title: string
    summary: string | null
    timezone: string
  }
  status: BookingRequestStatus
  accessMode: BookingAccessMode
  revision: number
  accessVersion: number
  requested: {
    date: string
    time: string
    timezone: string
    startsAtUtc: string
  }
  contact: {
    name: string
    email: string
    phone: string | null
    message: string
  }
  discount: {
    eligibleBps: number | null
    appliedBps: number | null
  }
  createdAt: string
  cancelledAt: string | null
  permissions: {
    actorKind: 'guest' | 'member' | 'provider'
    signedIn: boolean
    canCancel: boolean
    canClaim: boolean
    canManageMembers: boolean
    canMessage: boolean
  }
  members: BookingAccessMemberView[]
  activity: BookingActivityView[]
  messages: BookingMessageView[]
}

export interface ProviderBusinessProfileView {
  id: string
  slug: string
  displayName: string
  description: string | null
  websiteUrl: string | null
}

export interface ProviderBookingServiceView {
  id: string
  businessProfileId: string
  revision: number
  title: string
  summary: string | null
  timezone: string
  signedInDiscountBps: number | null
  status: BookingServiceState
  updatedAt: string
}

export interface ProviderBookingSummaryView {
  publicId: string
  businessProfileSlug: string
  providerDisplayName: string
  serviceTitle: string
  status: BookingRequestStatus
  requestedDate: string
  requestedTime: string
  timezone: string
  contactName: string
  createdAt: string
  lastMessageAt: string | null
}

export interface ProviderBookingWorkspaceView {
  profiles: ProviderBusinessProfileView[]
  services: ProviderBookingServiceView[]
  requests: ProviderBookingSummaryView[]
}

export type ProviderBookingDetailView = BookingDetailView

export function bookingPublicServicePath(slug: string): string {
  return `/bokanir/${encodeURIComponent(slug)}`
}

export function bookingDetailPath(slug: string, publicId: string): string {
  return `${bookingPublicServicePath(slug)}/fyrirspurn/${encodeURIComponent(publicId)}`
}

export function bookingGuestShareUrl(path: string, capability: string): string {
  return `${path}#access=${encodeURIComponent(capability)}`
}
