import 'server-only'

import type { User } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authorizeBookingAccess,
  type BookingAccessIntent,
  type BookingAuthorization,
} from './access.server'
import type { BookingActionError } from './contracts'
import { bookingSessionDigestFromRequest } from './security.server'

export async function currentBookingUser(): Promise<User | null> {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser()
    return user
  } catch {
    return null
  }
}

export async function authorizeBookingRequest(
  request: NextRequest,
  publicId: string,
  intent: BookingAccessIntent = 'read',
): Promise<BookingAuthorization | null> {
  return authorizeBookingAccess({
    publicId,
    intent,
    sessionHash: bookingSessionDigestFromRequest(request, publicId),
  })
}

export function bookingActionErrorStatus(error: BookingActionError): number {
  switch (error) {
    case 'invalid_input': return 400
    case 'unauthorized': return 401
    case 'not_found':
    case 'feature_disabled': return 404
    case 'conflict': return 409
    case 'rate_limited': return 429
    case 'save_failed': return 503
  }
}
