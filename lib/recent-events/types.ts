import type {
  ExpenseRecentEventEntityType,
  ExpenseRecentEventPayload,
  ExpenseRecentEventType,
} from '@/lib/expenses/events'

export const RECENT_EVENT_SOURCES = ['loans', 'expenses', 'events'] as const
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

export type RecentEventType = LoanRecentEventType | ExpenseRecentEventType | EventRecentEventType

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

export type RecentEventPayload = LoanRecentEventPayload | ExpenseRecentEventPayload | EventRecentEventPayload

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

export type KnownRecentEventRow = LoanRecentEventRow | ExpenseRecentEventRow | EventRecentEventRow

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
