export const BOOKING_FEATURE_KEY = 'bokanir' as const

export const BOOKING_SERVICE_STATES = ['draft', 'published', 'paused'] as const
export type BookingServiceState = (typeof BOOKING_SERVICE_STATES)[number]

export const BOOKING_REQUEST_STATUSES = ['requested', 'cancelled'] as const
export type BookingRequestStatus = (typeof BOOKING_REQUEST_STATUSES)[number]

export const BOOKING_WORKFLOW_ATTENTION_SIDES = ['provider', 'customer', 'none'] as const
export type BookingWorkflowAttentionSide = (typeof BOOKING_WORKFLOW_ATTENTION_SIDES)[number]

export const BOOKING_WORKFLOW_SEMANTIC_KINDS = ['active', 'confirmed'] as const
export type BookingWorkflowSemanticKind = (typeof BOOKING_WORKFLOW_SEMANTIC_KINDS)[number]

export const BOOKING_WORKFLOW_SYSTEM_LABEL_KEYS = [
  'new_request',
  'under_review',
  'waiting_customer',
  'waiting_provider',
  'confirmed',
] as const
export type BookingWorkflowSystemLabelKey = (typeof BOOKING_WORKFLOW_SYSTEM_LABEL_KEYS)[number]

export const BOOKING_CANCELLATION_REASONS = [
  'customer_cancelled',
  'provider_unavailable',
  'other',
] as const
export type BookingCancellationReason = (typeof BOOKING_CANCELLATION_REASONS)[number]
export type StoredBookingCancellationReason = BookingCancellationReason | 'legacy_unspecified'

export const BOOKING_ACCESS_MODES = ['link', 'members'] as const
export type BookingAccessMode = (typeof BOOKING_ACCESS_MODES)[number]

export const BOOKING_MEMBER_ROLES = ['owner', 'member'] as const
export type BookingMemberRole = (typeof BOOKING_MEMBER_ROLES)[number]

export const BOOKING_MEMBER_STATUSES = ['active', 'revoked'] as const
export type BookingMemberStatus = (typeof BOOKING_MEMBER_STATUSES)[number]

export const BOOKING_ACTIVITY_EVENT_TYPES = [
  'request_submitted',
  'request_cancelled',
  'workflow_state_changed',
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
  /** Whether the browser that submitted the request can open the private detail now. */
  currentActorHasAccess: boolean
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
  /** Audience-safe label snapshots. Never includes workflow or state IDs. */
  workflowTransition: {
    from: BookingWorkflowLabelView
    to: BookingWorkflowLabelView
  } | null
  cancellationReason: StoredBookingCancellationReason | null
}

export interface BookingWorkflowLabelView {
  /** Only allowlisted Teskeið defaults are translated. Custom labels use label verbatim as React text. */
  systemLabelKey: BookingWorkflowSystemLabelKey | null
  /** Custom plain-text label. Null when systemLabelKey supplies the localized default. */
  label: string | null
}

export interface CustomerBookingWorkflowStateView extends BookingWorkflowLabelView {
  audience: 'customer'
  attentionSide: BookingWorkflowAttentionSide
  semanticKind: BookingWorkflowSemanticKind
}

export interface ProviderBookingWorkflowTargetView extends BookingWorkflowLabelView {
  stateId: string
  logicalKey: string
  attentionSide: BookingWorkflowAttentionSide
  semanticKind: BookingWorkflowSemanticKind
}

export interface ProviderBookingWorkflowStateView extends BookingWorkflowLabelView {
  audience: 'provider'
  workflowId: string
  versionId: string
  stateId: string
  logicalKey: string
  attentionSide: BookingWorkflowAttentionSide
  semanticKind: BookingWorkflowSemanticKind
  allowedNextStates: ProviderBookingWorkflowTargetView[]
}

export type BookingWorkflowStateView =
  | CustomerBookingWorkflowStateView
  | ProviderBookingWorkflowStateView

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
  /** Reserved system lifecycle. Provider-authored workflow labels never enter this field. */
  lifecycleStatus: BookingRequestStatus
  /** Null when cancelled; cancellation presentation always dominates the pinned workflow state. */
  workflowState: BookingWorkflowStateView | null
  cancellationReason: StoredBookingCancellationReason | null
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
    canTransition: boolean
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
  workflow: {
    id: string
    revision: number
    activeVersionId: string
    activeVersionNumber: number
  }
}

export interface ProviderBookingSummaryView {
  publicId: string
  businessProfileSlug: string
  providerDisplayName: string
  serviceTitle: string
  lifecycleStatus: BookingRequestStatus
  cancellationReason: StoredBookingCancellationReason | null
  workflowState: Omit<ProviderBookingWorkflowStateView, 'audience' | 'versionId' | 'stateId' | 'allowedNextStates'> | null
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
  facets: {
    states: Array<BookingWorkflowLabelView & {
      key: string
      workflowId: string
      logicalKey: string
      count: number
    }>
    attention: Array<{
      attentionSide: BookingWorkflowAttentionSide
      count: number
    }>
  }
}

export type ProviderBookingDetailView = BookingDetailView

export interface ProviderBookingWorkflowStateEditorView {
  id: string
  logicalKey: string
  systemLabelKey: BookingWorkflowSystemLabelKey | null
  /** Null while an allowlisted Teskeið default supplies the translated label. */
  providerLabel: string | null
  /** Null while an allowlisted Teskeið default supplies the translated label. */
  customerLabel: string | null
  sortOrder: number
  isInitial: boolean
  semanticKind: BookingWorkflowSemanticKind
  attentionSide: BookingWorkflowAttentionSide
}

export interface ProviderBookingWorkflowTransitionView {
  fromStateId: string
  toStateId: string
}

export interface ProviderBookingWorkflowGraphView {
  id: string
  versionNumber: number
  status: 'draft' | 'published'
  revision: number
  graphFingerprint: string
  publishedAt: string | null
  states: ProviderBookingWorkflowStateEditorView[]
  transitions: ProviderBookingWorkflowTransitionView[]
}

export interface ProviderBookingWorkflowView {
  service: {
    id: string
    title: string
  }
  workflow: {
    id: string
    serviceId: string
    revision: number
  }
  activeVersion: ProviderBookingWorkflowGraphView
  draftVersion: ProviderBookingWorkflowGraphView | null
  limits: {
    maxStates: 20
    maxTransitions: 100
  }
}

export interface BookingWorkflowMutationAck {
  workflowId: string
  versionId: string
  activeVersionId?: string
  workflowRevision: number
  versionRevision: number
  created?: boolean
  replayed: boolean
}

export function bookingPublicServicePath(slug: string): string {
  return `/bokanir/${encodeURIComponent(slug)}`
}

export function bookingDetailPath(slug: string, publicId: string): string {
  return `${bookingPublicServicePath(slug)}/fyrirspurn/${encodeURIComponent(publicId)}`
}

export function bookingGuestShareUrl(path: string, capability: string): string {
  return `${path}#access=${encodeURIComponent(capability)}`
}
