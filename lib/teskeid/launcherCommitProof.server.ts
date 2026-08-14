import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

const COMMIT_PROOF_CONTEXT = 'teskeid-launcher-commit:v1'
const COMMIT_PROOF_BYTES = 32

function launcherSecret(): string | null {
  const secret = process.env.AUTH_CODE_SECRET
  return secret && Buffer.byteLength(secret, 'utf8') >= 32 ? secret : null
}

function commitProofBytes(userId: string, secret: string): Buffer {
  return createHmac('sha256', secret)
    .update(COMMIT_PROOF_CONTEXT)
    .update('\0')
    .update(userId)
    .digest()
}

/**
 * Opaque account binding for a committed launcher path. The browser never
 * receives the user ID; a queued write is accepted only while the currently
 * authenticated account produces the same proof.
 */
export function issueTeskeidLauncherCommitProof(userId: string): string | null {
  const secret = launcherSecret()
  if (!secret) return null
  return commitProofBytes(userId, secret).toString('base64url')
}

export function verifyTeskeidLauncherCommitProof(userId: string, proof: unknown): boolean {
  const secret = launcherSecret()
  if (!secret || typeof proof !== 'string') return false

  try {
    const received = Buffer.from(proof, 'base64url')
    if (received.length !== COMMIT_PROOF_BYTES) return false
    return timingSafeEqual(received, commitProofBytes(userId, secret))
  } catch {
    return false
  }
}
