export const EVENT_FEATURE_KEY = 'afmaeli-og-vidburdir' as const
export const EVENTS_PATH = '/auth-mvp/vidburdir' as const

export type EventParticipantInput =
  | { type: 'guest'; display_name: string }
  | { type: 'relationship'; relationship_id: string }

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
  participantCount: number
  expenseCount: number
  createdAt: string
}

export interface EventParticipantView {
  id: string
  displayName: string
  isTeskeidUser: boolean
  position: number
}

export interface EventDetailView {
  id: string
  name: string
  createdAt: string
  participants: EventParticipantView[]
}

export function eventDetailPath(eventId: string): string {
  return `${EVENTS_PATH}/${encodeURIComponent(eventId)}`
}

export function eventExpensePath(eventId: string): string {
  return `/auth-mvp/utlagt-og-endurgreitt/hopar/${encodeURIComponent(eventId)}/nytt-utgjald`
}
