import 'server-only'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { KVISS_CODE_PATTERN, normalizeKvissCode } from './contracts'

const CAPABILITY_BYTES = 32

export function createParticipantCapability(): { token: string; digest: string } {
  const token = randomBytes(CAPABILITY_BYTES).toString('base64url')
  return { token, digest: digestParticipantCapability(token) }
}

export function digestParticipantCapability(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function createBroadcastTopic(): string {
  return randomBytes(32).toString('base64url')
}

export function capabilityCookieName(code: string): string {
  const normalized = normalizeKvissCode(code)
  if (!KVISS_CODE_PATTERN.test(normalized)) throw new Error('invalid_join_code')
  return `teskeid_kviss_${normalized.toLowerCase()}`
}

export function setCapabilityCookie(response: NextResponse, code: string, token: string): void {
  response.cookies.set(capabilityCookieName(code), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    // One high-entropy cookie name per join code permits multiple concurrent
    // sessions. Path=/ is required because state mutations live under the
    // same-origin /api/kviss namespace; HttpOnly prevents JavaScript access.
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export function readCapabilityCookie(request: NextRequest, code: string): string | null {
  return request.cookies.get(capabilityCookieName(code))?.value ?? null
}

export function assertSameOriginMutation(request: NextRequest): boolean {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim()
  if (contentType !== 'application/json') return false
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin') return false
  const origin = request.headers.get('origin')
  if (!origin) return process.env.NODE_ENV !== 'production'
  try {
    return new URL(origin).origin === request.nextUrl.origin
  } catch {
    return false
  }
}

export function scopedJoinAttemptHash(request: NextRequest, code: string): string {
  const secret = process.env.AUTH_CODE_SECRET
  if (!secret || secret.length < 32) throw new Error('join_rate_limit_unavailable')
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const address = forwarded || request.headers.get('x-real-ip') || 'unknown'
  return createHmac('sha256', secret)
    .update(`kviss-join-v1\0${normalizeKvissCode(code)}\0${address}`)
    .digest('hex')
}

export function safeDigestEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}
