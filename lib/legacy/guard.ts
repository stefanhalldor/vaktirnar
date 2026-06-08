import 'server-only'
import { NextResponse } from 'next/server'

/**
 * Defense-in-depth guard for legacy Krakkavaktin API routes.
 * Returns a 404 NextResponse when LEGACY_ENABLED is not 'true'.
 * The middleware is the primary guard; this is a second layer.
 *
 * Usage in every legacy route handler:
 *   const g = legacyGuard()
 *   if (g) return g
 */
export function legacyGuard(): NextResponse | null {
  if (process.env.LEGACY_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return null
}
