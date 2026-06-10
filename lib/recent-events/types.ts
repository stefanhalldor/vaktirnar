export type RecentEventType =
  | 'loan_created'
  | 'loan_updated'
  | 'loan_returned'
  | 'loan_return_undone'
  | 'loan_deleted'
  | 'loan_invitation_received'

export interface RecentEventPayload {
  itemName?: string
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
}
