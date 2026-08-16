import 'server-only'

import { z } from 'zod'
import { getAdmin } from '@/lib/supabase/admin'
import type { EventDetailView, EventSummary } from './contracts'
import type { CreateEventInput } from './validation'

type JsonRecord = Record<string, unknown>

const eventId = z.string().uuid()
const safeName = z.string().trim().min(1).max(160)
  .refine((value) => !/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value))
const safeParticipantName = z.string().trim().min(1).max(120)
  .refine((value) => !/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value))
const createdAt = z.string().datetime({ offset: true })

const FORBIDDEN_PROJECTION_KEYS = new Set([
  'email',
  'emailcanonical',
  'linkeduserid',
  'owneruserid',
  'participantuserid',
  'pickerlabel',
  'privatedisplayname',
  'relationshipid',
  'userid',
])

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function rows(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    const row = record(candidate)
    return row ? [row] : []
  })
}

function resultRecord(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) return record(value[0])
  return record(value)
}

function assertOwnerSafeProjection(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertOwnerSafeProjection)
    return
  }
  const row = record(value)
  if (!row) return
  for (const [key, nested] of Object.entries(row)) {
    const normalizedKey = key.toLowerCase().replace(/[_-]/g, '')
    if (FORBIDDEN_PROJECTION_KEYS.has(normalizedKey)) throw new Error('event_load_failed')
    assertOwnerSafeProjection(nested)
  }
}

function requiredString(row: JsonRecord, ...keys: string[]): string {
  for (const key of keys) {
    if (typeof row[key] === 'string') return row[key]
  }
  throw new Error('event_load_failed')
}

function requiredInteger(row: JsonRecord, ...keys: string[]): number {
  for (const key of keys) {
    const raw = row[key]
    const value = typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : Number.NaN
    if (Number.isSafeInteger(value)) return value
  }
  throw new Error('event_load_failed')
}

function requiredBoolean(row: JsonRecord, ...keys: string[]): boolean {
  for (const key of keys) {
    if (typeof row[key] === 'boolean') return row[key]
  }
  throw new Error('event_load_failed')
}

function parseEventId(value: string): string {
  const parsed = eventId.safeParse(value)
  if (!parsed.success) throw new Error('event_load_failed')
  return parsed.data
}

function parseName(value: string): string {
  const parsed = safeName.safeParse(value)
  if (!parsed.success) throw new Error('event_load_failed')
  return parsed.data
}

function parseCreatedAt(value: string): string {
  const parsed = createdAt.safeParse(value)
  if (!parsed.success) throw new Error('event_load_failed')
  return parsed.data
}

function parseParticipantName(value: string): string {
  const parsed = safeParticipantName.safeParse(value)
  if (!parsed.success) throw new Error('event_load_failed')
  return parsed.data
}

function mapSummary(row: JsonRecord): EventSummary {
  const participantCount = requiredInteger(row, 'participant_count', 'participantCount')
  const expenseCount = requiredInteger(row, 'expense_count', 'expenseCount')
  if (participantCount < 0 || participantCount > 49 || expenseCount < 0) {
    throw new Error('event_load_failed')
  }
  return {
    id: parseEventId(requiredString(row, 'event_id', 'eventId')),
    name: parseName(requiredString(row, 'name')),
    participantCount,
    expenseCount,
    createdAt: parseCreatedAt(requiredString(row, 'created_at', 'createdAt')),
  }
}

function mapDetail(row: JsonRecord): EventDetailView {
  const rawParticipants = row.participants
  if (!Array.isArray(rawParticipants) || rawParticipants.length > 49) {
    throw new Error('event_load_failed')
  }
  const participants = rawParticipants.map((candidate) => {
    const participant = record(candidate)
    if (!participant) throw new Error('event_load_failed')
    const position = requiredInteger(participant, 'position')
    if (position < 0 || position > 48) throw new Error('event_load_failed')
    return {
      id: parseEventId(requiredString(participant, 'member_id', 'memberId')),
      displayName: parseParticipantName(requiredString(participant, 'display_name', 'displayName')),
      isTeskeidUser: requiredBoolean(participant, 'is_teskeid_user', 'isTeskeidUser'),
      position,
    }
  }).sort((left, right) => left.position - right.position)
  if (participants.some((participant, index) => participant.position !== index)) {
    throw new Error('event_load_failed')
  }
  return {
    id: parseEventId(requiredString(row, 'event_id', 'eventId')),
    name: parseName(requiredString(row, 'name')),
    createdAt: parseCreatedAt(requiredString(row, 'created_at', 'createdAt')),
    participants,
  }
}

function rpcFailure(error: { message?: string; code?: string } | null, fallback: string): never {
  const message = `${error?.message ?? ''} ${error?.code ?? ''}`.toLowerCase()
  if (message.includes('idempotency_conflict') || message.includes('participant_conflict')) {
    throw new Error('event_conflict')
  }
  if (message.includes('invalid_input') || message.includes('participant_invalid')) {
    throw new Error('event_invalid_input')
  }
  if (message.includes('not_allowed')) throw new Error('event_not_allowed')
  if (message.includes('not_found')) throw new Error('event_not_found')
  if (message.includes('unavailable')) throw new Error('event_unavailable')
  throw new Error(fallback)
}

export async function createEventContext(
  actorUserId: string,
  input: CreateEventInput,
): Promise<{ eventId: string }> {
  const { data, error } = await getAdmin().rpc('expense_create_event_context', {
    p_actor_id: actorUserId,
    p_request_id: input.request_id,
    p_name: input.name,
    p_participants: input.participants,
  })
  if (error) rpcFailure(error, 'event_save_failed')
  const result = resultRecord(data)
  if (!result) throw new Error('event_save_failed')
  return { eventId: parseEventId(requiredString(result, 'event_id', 'eventId')) }
}

export async function listEventContexts(actorUserId: string): Promise<EventSummary[]> {
  const { data, error } = await getAdmin().rpc('expense_list_event_contexts', {
    p_actor_id: actorUserId,
  })
  if (error) rpcFailure(error, 'event_load_failed')
  assertOwnerSafeProjection(data)
  if (data !== null && data !== undefined && !Array.isArray(data)) {
    throw new Error('event_load_failed')
  }
  return rows(data).map(mapSummary)
}

export async function listEvents(actorUserId: string): Promise<EventSummary[]> {
  return listEventContexts(actorUserId)
}

export async function getEventContext(
  actorUserId: string,
  requestedEventId: string,
): Promise<EventDetailView | null> {
  const parsedEventId = eventId.safeParse(requestedEventId)
  if (!parsedEventId.success) return null
  const { data, error } = await getAdmin().rpc('expense_get_event_context', {
    p_actor_id: actorUserId,
    p_event_id: parsedEventId.data,
  })
  if (error) {
    const message = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase()
    if (message.includes('not_found') || message.includes('not_allowed')) return null
    rpcFailure(error, 'event_load_failed')
  }
  if (data === null || data === undefined || Array.isArray(data) && data.length === 0) return null
  assertOwnerSafeProjection(data)
  const result = resultRecord(data)
  return result ? mapDetail(result) : null
}

/**
 * Expense-authorized classification only. The SQL RPC deliberately does not
 * require Events entitlement and returns no event metadata or participant data.
 * Callers must establish canonical expense access before using this signal.
 */
export async function isExpenseEventContext(
  actorUserId: string,
  groupId: string,
): Promise<boolean> {
  const parsedGroupId = eventId.safeParse(groupId)
  if (!parsedGroupId.success) return false
  const { data, error } = await getAdmin().rpc('expense_is_event_context', {
    p_actor_id: actorUserId,
    p_group_id: parsedGroupId.data,
  })
  if (error || typeof data !== 'boolean') throw new Error('event_classification_failed')
  return data
}
