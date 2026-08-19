import type {
  ExpenseRecentEventEntityType,
  ExpenseRecentEventPayload,
  ExpenseRecentEventType,
} from '@/lib/expenses/events'

export const RECENT_EVENT_SOURCES = ['loans', 'expenses', 'events', 'heimilisverkin'] as const
export type RecentEventSource = (typeof RECENT_EVENT_SOURCES)[number]

export type LoanRecentEventType =
  | 'loan_created'
  | 'loan_updated'
  | 'loan_returned'
  | 'loan_return_undone'
  | 'loan_deleted'
  | 'loan_invitation_received'
  | 'loan_invitation_accepted'
  | 'loan_invitation_declined'
  | 'loan_party_added'
  | 'loan_chat_message'
  | 'loan_role_switched'

export type EventRecentEventType = 'event_attendance_invitation_received'

export type HouseholdChoreRecentEventType =
  | 'household_chore_invitation_received'
  | 'household_chore_membership_type_changed'
  | 'household_chore_membership_removed'

export type RecentEventType =
  | LoanRecentEventType
  | ExpenseRecentEventType
  | EventRecentEventType
  | HouseholdChoreRecentEventType

export type LoanFieldChangeType = 'changed' | 'added' | 'removed'

export interface LoanFieldChange {
  field: 'item_name' | 'loaned_at' | 'due_at' | 'note'
  changeType: LoanFieldChangeType
  oldValue?: string | null
  newValue?: string | null
}

export interface LoanRecentEventPayload {
  itemName?: string
  changes?: LoanFieldChange[]
  actorUserId?: string
  recipientRole?: 'lender' | 'borrower'
  newRole?: 'lender' | 'borrower'
}

export interface EventRecentEventPayload {
  eventName: string
  inviterDisplayName?: string
}

export type HouseholdChoreMembershipType = 'member' | 'child'

interface HouseholdChoreRecentEventPayloadBase {
  circleName: string
  displayReference: string
}

export interface HouseholdChoreInvitationRecentEventPayload
  extends HouseholdChoreRecentEventPayloadBase {
  inviterLabel?: string
  requestedType: HouseholdChoreMembershipType
}

export interface HouseholdChoreMembershipTypeRecentEventPayload
  extends HouseholdChoreRecentEventPayloadBase {
  actorLabel?: string
  membershipType: HouseholdChoreMembershipType
}

export interface HouseholdChoreMembershipRemovedRecentEventPayload
  extends HouseholdChoreRecentEventPayloadBase {
  actorLabel?: string
}

export type HouseholdChoreRecentEventPayload =
  | HouseholdChoreInvitationRecentEventPayload
  | HouseholdChoreMembershipTypeRecentEventPayload
  | HouseholdChoreMembershipRemovedRecentEventPayload

export type RecentEventPayload =
  | LoanRecentEventPayload
  | ExpenseRecentEventPayload
  | EventRecentEventPayload
  | HouseholdChoreRecentEventPayload

/**
 * Raw service-role row. Text and JSON columns are deliberately left untrusted;
 * callers must parse the source/event/payload tuple before rendering it.
 */
export interface RecentEventRow {
  id: number
  user_id: string
  source: string
  event_type: string
  entity_type: string
  entity_id: string | null
  event_key: string
  payload: unknown
  href: string
  occurred_at: string
  ack_at: string | null
}

type KnownRecentEventRowBase = Omit<RecentEventRow, 'source' | 'event_type' | 'payload'>

export interface LoanRecentEventRow extends KnownRecentEventRowBase {
  source: 'loans'
  event_type: LoanRecentEventType
  payload: LoanRecentEventPayload
}

export interface ExpenseRecentEventRow extends KnownRecentEventRowBase {
  source: 'expenses'
  event_type: ExpenseRecentEventType
  entity_type: ExpenseRecentEventEntityType
  entity_id: string
  payload: ExpenseRecentEventPayload
}

export interface EventRecentEventRow extends KnownRecentEventRowBase {
  source: 'events'
  event_type: EventRecentEventType
  entity_type: 'attendance_invitation'
  entity_id: string
  payload: EventRecentEventPayload
}

export interface HouseholdChoreInvitationRecentEventRow extends KnownRecentEventRowBase {
  source: 'heimilisverkin'
  event_type: 'household_chore_invitation_received'
  entity_type: 'household_chore_invitation'
  entity_id: string
  payload: HouseholdChoreInvitationRecentEventPayload
}

export interface HouseholdChoreMembershipTypeRecentEventRow extends KnownRecentEventRowBase {
  source: 'heimilisverkin'
  event_type: 'household_chore_membership_type_changed'
  entity_type: 'household_chore_membership_event'
  entity_id: string
  payload: HouseholdChoreMembershipTypeRecentEventPayload
}

export interface HouseholdChoreMembershipRemovedRecentEventRow extends KnownRecentEventRowBase {
  source: 'heimilisverkin'
  event_type: 'household_chore_membership_removed'
  entity_type: 'household_chore_membership_event'
  entity_id: string
  payload: HouseholdChoreMembershipRemovedRecentEventPayload
}

export type HouseholdChoreRecentEventRow =
  | HouseholdChoreInvitationRecentEventRow
  | HouseholdChoreMembershipTypeRecentEventRow
  | HouseholdChoreMembershipRemovedRecentEventRow

export type KnownRecentEventRow =
  | LoanRecentEventRow
  | ExpenseRecentEventRow
  | EventRecentEventRow
  | HouseholdChoreRecentEventRow

// Pre-rendered for the client component — no raw payload or event internals
export interface RecentEventDisplay {
  id: number
  source: RecentEventSource
  label: string
  href: string
  /** Link to the specific item inside its teskeid. Null when current access is absent. */
  viewHref: string | null
  isDeleted: boolean
  /** Server-computed localized detail lines for the drawer. */
  detailLines?: string[]
  /** Server-formatted timestamp label, e.g. "Miðvikudaginn 24. júní kl. 7:40". */
  occurredAtLabel: string
}
