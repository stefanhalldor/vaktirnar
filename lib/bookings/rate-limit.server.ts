import 'server-only'

import type { NextRequest } from 'next/server'
import { bookingRateLimitHash, bookingRateLimitWindowDate } from './security.server'

const DEFAULT_DAILY_LIMIT = 20
const MAX_DAILY_LIMIT = 1_000

function dailyLimit(): number {
  const configured = Number(process.env.BOOKINGS_PUBLIC_IP_DAILY_LIMIT)
  if (!Number.isFinite(configured) || configured < 1) return DEFAULT_DAILY_LIMIT
  return Math.min(Math.floor(configured), MAX_DAILY_LIMIT)
}

export interface BookingCreateRateLimitInput {
  hash: string
  windowDate: string
  maxRequests: number
}

/**
 * Produces only a daily provider-scoped HMAC. The create RPC consumes it after
 * its idempotent-replay check so retries are neither charged nor denied.
 */
export function createBookingRateLimitInput(
  request: NextRequest,
  serviceId: string,
): BookingCreateRateLimitInput | null {
  try {
    const windowDate = bookingRateLimitWindowDate()
    return {
      hash: bookingRateLimitHash(request, serviceId, windowDate),
      windowDate,
      maxRequests: dailyLimit(),
    }
  } catch {
    return null
  }
}
