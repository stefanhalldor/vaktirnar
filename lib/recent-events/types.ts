export type RecentEventType =
  | 'loan_created'
  | 'loan_updated'
  | 'loan_returned'
  | 'loan_return_undone'
  | 'loan_deleted'
  | 'loan_invitation_received'
  | 'loan_invitation_accepted'
  | 'loan_invitation_declined'

export type LoanFieldChangeType = 'changed' | 'added' | 'removed'

export interface LoanFieldChange {
  field: 'item_name' | 'loaned_at' | 'due_at' | 'note'
  changeType: LoanFieldChangeType
  oldValue?: string | null
  newValue?: string | null
}

export interface RecentEventPayload {
  itemName?: string
  changes?: LoanFieldChange[]
}

export interface RecentEventRow {
  id: number
  user_id: string
  source: string
  event_type: RecentEventType
  entity_type: string
  entity_id: string | null
  event_key: string
  payload: RecentEventPayload
  href: string
  occurred_at: string
  ack_at: string | null
}

// Pre-rendered for the client component — no raw payload or event internals
export interface RecentEventDisplay {
  id: number
  label: string
  href: string
  /** Link to the specific item inside its teskeid. Null for deleted items. */
  viewHref: string | null
  isDeleted: boolean
  /** Server-computed localized detail lines for the drawer. */
  detailLines?: string[]
  /** Server-formatted timestamp label, e.g. "Miðvikudaginn 24. júní kl. 7:40". */
  occurredAtLabel: string
}
