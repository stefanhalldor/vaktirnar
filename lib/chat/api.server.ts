import 'server-only'
import { NextResponse } from 'next/server'
import type { ChatAccessResult } from './access.server'
import type { ChatDomain, ChatTargetType } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Returns true for a well-formed UUID string. */
export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/**
 * Returns true for a string that can be parsed as a finite Date.
 * Used to validate pagination cursor values before passing to Supabase.
 */
export function isValidTimestampCursor(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const d = new Date(value)
  return !isNaN(d.getTime())
}

/** Maps ChatAccessResult to an HTTP error response. */
export function chatAccessError(result: ChatAccessResult): NextResponse {
  if (result === 'no-session') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (result === 'chat-disabled') return NextResponse.json({ error: 'Chat disabled' }, { status: 503 })
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/** Domain for all weather-pulse chat threads. */
export const WEATHER_PULSE_DOMAIN: ChatDomain = 'weather'

/**
 * All weather-pulse target types accepted for read, mark-read, and report
 * operations. Both Veðurstofan and Vegagerðin station threads are readable.
 * Veðurstofan threads are read-only; Vegagerðin threads also accept new messages.
 * Used by getThreadProvider / getMessageProvider in messages GET, read, and report routes.
 */
export const WEATHER_PULSE_ALL_TARGET_TYPES: ChatTargetType[] = [
  'vedurstofan_station',
  'vegagerdin_station',
]

/**
 * Target types that accept new pulse content (write / POST messages).
 * Only Vegagerðin station threads accept user messages.
 * Veðurstofan station threads are read-only — POST is rejected with 404.
 * Used by getThreadProvider in messages POST route.
 */
export const WEATHER_PULSE_PRIMARY_TARGET_TYPES: ChatTargetType[] = [
  'vegagerdin_station',
]
