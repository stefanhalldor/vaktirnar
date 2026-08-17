export const EVENT_FEATURE_KEY = 'afmaeli-og-vidburdir' as const
export const EVENTS_PATH = '/auth-mvp/vidburdir' as const

export type EventGuestSourceKind = 'relationship' | 'manual_name' | 'manual_email'

export type EventNewGuestInput =
  | { source_kind: 'relationship'; relationship_id: string }
  | { source_kind: 'manual_name'; display_name: string }
  | { source_kind: 'manual_email'; email: string }

export type EventRosterGuestInput =
  | { event_guest_id: string }
  | EventNewGuestInput

export type EventActionErrorCode =
  | 'invalid_input'
  | 'not_allowed'
  | 'not_found'
  | 'conflict'
  | 'feature_disabled'
  | 'save_failed'

export type EventActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: EventActionErrorCode }

export type EventAttendanceInvitationDelivery =
  | 'sent'
  | 'already_sent'
  | 'failed'
  | 'uncertain'

export type EventAttendanceStatus =
  | 'not_invited'
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'expired'
  | 'left'
  | 'revoked'

export type EventAttendanceInvitationKind = 'access_only' | 'identity_and_access'

export interface EventGuestAttendanceView {
  status: EventAttendanceStatus
  invitationId: string | null
  invitationKind: EventAttendanceInvitationKind | null
  /** Masked owner-safe label. Never a canonical or deliverable email. */
  recipientLabel: string | null
  attemptNumber: number | null
  deliveryStatus: 'not_sent' | 'reserved' | 'sent' | 'failed' | null
  invitedAt: string | null
  expiresAt: string | null
  acceptedAt: string | null
}

interface EventAttendanceInvitationPreviewBase {
  invitationId: string
  eventId: string
  eventName: string
  guestDisplayName: string | null
  inviterDisplayName: string | null
  invitationKind: EventAttendanceInvitationKind
  invitedAt: string
}

export type EventAttendanceInvitationPreviewView =
  | EventAttendanceInvitationPreviewBase & {
  status: 'pending'
  roster: []
  expiresAt: string
  }
  | EventAttendanceInvitationPreviewBase & {
  status: 'accepted'
  roster: []
  expiresAt: null
  }

export interface EventCommittedAttendanceInvitation {
  invitationId: string
  eventGuestId: string
  invitationKind: EventAttendanceInvitationKind
  recipientLabel: string
  invitedAt: string
  expiresAt: string
}

export interface EventSummary {
  id: string
  name: string
  guestCount: number
  rosterRevision: number
  createdAt: string
  updatedAt: string
}

export interface EventViewerSummary extends EventSummary {
  viewerRole: 'owner' | 'attendee'
}

export interface EventPendingInvitationSummary {
  invitationId: string
  eventId: string
  name: string
  guestDisplayName: string | null
  inviterDisplayName: string | null
  invitationKind: EventAttendanceInvitationKind
  status: 'pending'
  expiresAt: string
  invitedAt: string
}

export interface EventDashboardView {
  owned: EventViewerSummary[]
  pending: EventPendingInvitationSummary[]
  attending: EventViewerSummary[]
}

export interface EventGuestView {
  id: string
  displayName: string
  sourceKind: EventGuestSourceKind
  /** Owner-private canonical email, present only for a manual-email guest. */
  email: string | null
  isTeskeidUser: boolean
  /** Additive SQL133 owner-only attendance projection. */
  attendance?: EventGuestAttendanceView
  position: number
}

export interface EventDetailView {
  id: string
  name: string
  rosterRevision: number
  createdAt: string
  updatedAt: string
  guests: EventGuestView[]
}

export interface EventAttendeeDetailView {
  id: string
  name: string
  rosterRevision: number
  viewerRole: 'attendee'
  ownerDisplayName: string | null
  createdAt: string
  updatedAt: string
  guests: Array<{
    id: string
    displayName: string | null
    position: number
    isSelf: boolean
  }>
}

export interface EventDetailsView {
  eventId: string
  eventDate: string | null
  eventTime: string | null
  description: string | null
  agenda: string | null
}

/** Opaque picker projection. It deliberately excludes email and linked identities. */
export interface EventExpenseSourceView {
  id: string
  name: string
  rosterRevision: number
  /** Missing on the SQL132 owner-only projection during the DB-first window. */
  viewerRole?: 'owner' | 'attendee'
  guests: Array<{
    id: string
    displayName: string
    sourceKind: EventGuestSourceKind
    /** SQL137 adds an attendee-safe synthetic organizer option. */
    participantKind?: 'guest' | 'organizer'
  }>
}

export interface ExpenseEventLinkManagementView {
  currentEvent: {
    id: string
    name: string | null
    canOpen: boolean
  } | null
  eligibleEvents: Array<{
    id: string
    name: string
    rosterRevision: number
    viewerRole: 'owner' | 'attendee'
  }>
}

export type EventExpensePreviewCurrencyState =
  | 'settled'
  | 'open'
  | 'pending'
  | 'review_required'
  | 'blocked_manual'

export interface EventExpensePreviewCurrencyView {
  currency: string
  state: EventExpensePreviewCurrencyState
  transfers: Array<{
    fromPartyId: string
    toPartyId: string
    fromDisplayName: string
    toDisplayName: string
    amountMinor: number
  }>
  pendingRepaymentCount: number
  blocked: Array<{
    partyId: string
    displayName: string | null
    reason: 'unresolved_identity'
  }>
}

export interface EventExpensePreviewView {
  eventId: string
  status: 'none_tagged' | 'ready' | 'unavailable'
  taggedExpenseCount: number
  currencies: EventExpensePreviewCurrencyView[]
}

export type EventExpenseActorPositionState = 'owes' | 'owed' | 'zero' | 'pending'

export interface EventExpenseActivityView {
  status: 'none' | 'ready' | 'unavailable'
  expenses: Array<{
    title: string
    description: string | null
    totalMinor: number
    currency: string
    payers: Array<{
      displayName: string | null
      amountMinor: number
    }>
  }>
  positions: Array<{
    currency: string
    state: EventExpenseActorPositionState
    amountMinor: number
  }>
}

export const EXPENSE_PAY_ALL_PATH = '/auth-mvp/utlagt-og-endurgreitt/gera-upp'

export function eventDetailPath(eventId: string): string {
  return `${EVENTS_PATH}/${encodeURIComponent(eventId)}`
}

export function eventExpensePath(eventId: string): string {
  return `/auth-mvp/utlagt-og-endurgreitt/nytt?event=${encodeURIComponent(eventId)}`
}

export function eventSettlementPreviewPath(eventId: string): string {
  void eventId
  return EXPENSE_PAY_ALL_PATH
}

export function eventGuestAttendanceInvitationPath(invitationId: string): string {
  return `${EVENTS_PATH}/bod/thattaka/${encodeURIComponent(invitationId)}`
}
