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

/**
 * The domain/targetType scope for all Veðurpúls (weather-pulse) routes.
 * Passed to assertThreadScope / assertMessageScope to enforce that thread and
 * message operations stay within the Veðurstofan station chat surface.
 */
export const WEATHER_PULSE_SCOPE: { domain: ChatDomain; targetType: ChatTargetType } = {
  domain: 'weather',
  targetType: 'vedurstofan_station',
}
