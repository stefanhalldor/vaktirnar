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

export interface EventSummary {
  id: string
  name: string
  guestCount: number
  rosterRevision: number
  createdAt: string
  updatedAt: string
}

export interface EventGuestView {
  id: string
  displayName: string
  sourceKind: EventGuestSourceKind
  /** Owner-private canonical email, present only for a manual-email guest. */
  email: string | null
  isTeskeidUser: boolean
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

/** Opaque picker projection. It deliberately excludes email and linked identities. */
export interface EventExpenseSourceView {
  id: string
  name: string
  rosterRevision: number
  guests: Array<{
    id: string
    displayName: string
    sourceKind: EventGuestSourceKind
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
    displayName: string
    reason: 'unresolved_identity'
  }>
}

export interface EventExpensePreviewView {
  eventId: string
  status: 'none_tagged' | 'ready' | 'unavailable'
  taggedExpenseCount: number
  currencies: EventExpensePreviewCurrencyView[]
}

export function eventDetailPath(eventId: string): string {
  return `${EVENTS_PATH}/${encodeURIComponent(eventId)}`
}

export function eventExpensePath(eventId: string): string {
  return `/auth-mvp/utlagt-og-endurgreitt/nytt?event=${encodeURIComponent(eventId)}`
}

export function eventSettlementPreviewPath(eventId: string): string {
  return `/auth-mvp/utlagt-og-endurgreitt/gera-upp?event=${encodeURIComponent(eventId)}`
}
