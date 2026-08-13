import 'server-only'

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { User } from '@supabase/supabase-js'
import type { NextRequest, NextResponse } from 'next/server'
import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'
import { bookingPublicIdSchema } from './validation'

const TOKEN_BYTES = 32
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

function bookingSecret(): string {
  const secret = process.env.AUTH_CODE_SECRET
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('booking_security_unavailable')
  }
  return secret
}

/**
 * Deterministic for a semantic create retry, but computationally random to a
 * client without the server secret. This lets a lost guest-create response be
 * retried without orphaning the original capability.
 */
export function createGuestCapabilityForRequest(slug: string, requestId: string): {
  token: string
  digest: string
} {
  const token = createHmac('sha256', bookingSecret())
    .update(`teskeid-booking-capability-v1\0${slug}\0${requestId}`)
    .digest('base64url')
  return { token, digest: digestBookingToken(token) }
}

export function createBookingSession(): { token: string; digest: string; expiresAt: string } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  return renewBookingSession(token)
}

export function renewBookingSession(token: string): {
  token: string
  digest: string
  expiresAt: string
} {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('booking_invalid_session')
  return {
    token,
    digest: digestBookingToken(token),
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1_000).toISOString(),
  }
}

export function digestBookingToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function safeDigestEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8')
  const rightBytes = Buffer.from(right, 'utf8')
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

export function bookingSessionCookieName(publicId: string): string {
  const parsed = bookingPublicIdSchema.safeParse(publicId)
  if (!parsed.success) throw new Error('booking_invalid_public_id')
  return `teskeid_booking_${parsed.data.replaceAll('-', '')}`
}

export function setBookingSessionCookie(
  response: NextResponse,
  publicId: string,
  token: string,
): void {
  response.cookies.set(bookingSessionCookieName(publicId), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export function clearBookingSessionCookie(response: NextResponse, publicId: string): void {
  response.cookies.set(bookingSessionCookieName(publicId), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

export function readBookingSessionCookie(request: NextRequest, publicId: string): string | null {
  try {
    return request.cookies.get(bookingSessionCookieName(publicId))?.value ?? null
  } catch {
    return null
  }
}

export function bookingSessionDigestFromRequest(request: NextRequest, publicId: string): string | null {
  const token = readBookingSessionCookie(request, publicId)
  return token ? digestBookingToken(token) : null
}

export function verifiedCanonicalEmail(user: User | null): string | null {
  if (!user?.email || !user.email_confirmed_at) return null
  return normalizeEmailForAccess(user.email)
}

export function bookingRateLimitHash(request: NextRequest, serviceId: string, windowDate: string): string {
  const firstAddress = (header: string) => request.headers.get(header)?.split(',')[0]?.trim() || null
  // Vercel documents x-vercel-forwarded-for as its platform-authored client
  // address header. In production, fail closed outside that known trust
  // boundary instead of accepting a caller-supplied generic proxy header.
  const address = process.env.NODE_ENV === 'production'
    ? process.env.VERCEL === '1' ? firstAddress('x-vercel-forwarded-for') : null
    : firstAddress('x-vercel-forwarded-for')
      ?? firstAddress('x-forwarded-for')
      ?? firstAddress('x-real-ip')
      ?? 'unknown'
  if (!address) throw new Error('booking_request_address_unavailable')
  const scopedKey = createHmac('sha256', bookingSecret())
    .update(`teskeid-booking-intake-v1\0${serviceId}\0${windowDate}`)
    .digest()
  return createHmac('sha256', scopedKey).update(address).digest('hex')
}

export function bookingRateLimitWindowDate(now = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })
}
