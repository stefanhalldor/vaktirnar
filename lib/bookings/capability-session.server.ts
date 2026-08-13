import 'server-only'

import type { NextRequest } from 'next/server'
import { authorizeBookingAccess } from './access.server'
import { exchangeBookingCapability } from './repository.server'
import {
  createBookingSession,
  readBookingSessionCookie,
  renewBookingSession,
} from './security.server'

export async function establishBookingCapabilitySession(input: {
  request: NextRequest
  publicId: string
  capabilityDigest: string
}): Promise<{
  token: string
  digest: string
  expiresAt: string
  accessVersion: number
}> {
  const existingToken = readBookingSessionCookie(input.request, input.publicId)
  if (existingToken && /^[A-Za-z0-9_-]{43}$/.test(existingToken)) {
    const existing = renewBookingSession(existingToken)
    const access = await authorizeBookingAccess({
      publicId: input.publicId,
      user: null,
      sessionHash: existing.digest,
      intent: 'read',
    })
    if (access?.actorKind === 'guest') {
      const exchanged = await exchangeBookingCapability({
        publicId: input.publicId,
        capabilityDigest: input.capabilityDigest,
        sessionDigest: existing.digest,
        sessionExpiresAt: existing.expiresAt,
      })
      return { ...existing, accessVersion: exchanged.accessVersion }
    }
  }

  const fresh = createBookingSession()
  const exchanged = await exchangeBookingCapability({
    publicId: input.publicId,
    capabilityDigest: input.capabilityDigest,
    sessionDigest: fresh.digest,
    sessionExpiresAt: fresh.expiresAt,
  })
  return { ...fresh, accessVersion: exchanged.accessVersion }
}
