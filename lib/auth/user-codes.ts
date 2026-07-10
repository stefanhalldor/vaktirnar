import 'server-only'
// Reuse hashing and code generation from codes.ts — no duplication
import { hashCode, generateCode } from '@/lib/auth/codes'
import { getAdmin } from '@/lib/supabase/admin'

const MAX_CODES_PER_HOUR = 20
const CODE_TTL_MINUTES = 10
// Dedupe window: suppress new code creation if an unused, unexpired code was
// created within this many seconds. Must align with client resend countdown.
const DEDUPE_WINDOW_SECONDS = 120

export type CreateCodeResult =
  | string                                          // plaintext code — send to user
  | { rateLimited: true; retryAfter: string }       // ISO timestamp when window clears
  | { recentActive: true }                          // recent active code exists; do not send new email

/**
 * Generate and store a new OTP code for the given email, unless a recent
 * active code already exists within the dedupe window.
 *
 * Delegates atomicity, dedupe, and rate-limiting to the
 * create_user_otp_code_if_allowed Postgres RPC, which holds a per-email
 * advisory transaction lock to serialise concurrent requests.
 *
 * Returns:
 *   string              — plaintext code; caller must send it to the user via email
 *   { recentActive: true }           — recent code exists; do not create or send a new one
 *   { rateLimited: true; retryAfter } — hourly limit exceeded
 *   null                — DB/hashing error; caller should surface as generic error
 *
 * The code is stored only as an HMAC-SHA256 hash — never plaintext.
 */
export async function createUserCode(email: string): Promise<CreateCodeResult | null> {
  const code = generateCode()
  let code_hash: string
  try {
    code_hash = hashCode(email, code)
  } catch {
    // AUTH_CODE_SECRET not set or invalid — already logged in hashCode
    return null
  }
  const expires_at = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString()

  const { data, error } = await getAdmin().rpc('create_user_otp_code_if_allowed', {
    p_email:        email,
    p_code_hash:    code_hash,
    p_expires_at:   expires_at,
    p_dedupe_secs:  DEDUPE_WINDOW_SECONDS,
    p_max_per_hour: MAX_CODES_PER_HOUR,
  })

  if (error) {
    console.error('[user-codes] rpc create_user_otp_code_if_allowed failed')
    return null
  }

  const status = (data as { status?: string } | null)?.status
  if (status === 'inserted') {
    return code
  }
  if (status === 'recent_active') {
    return { recentActive: true }
  }
  if (status === 'rate_limited') {
    const retryAfter = (data as { status: string; retry_after?: string }).retry_after
      ?? new Date(Date.now() + 60 * 60 * 1000).toISOString()
    return { rateLimited: true, retryAfter }
  }

  console.error('[user-codes] unexpected rpc status (no code or user data logged)')
  return null
}

/**
 * Verify a submitted code against the latest active code for the email.
 *
 * Delegates all atomicity guarantees to the verify_user_otp_code Postgres RPC:
 * - Row is locked with FOR UPDATE before any mutation
 * - Attempts increment and used_at are set in a single transaction
 * - Concurrent correct submissions produce exactly one true result
 *
 * The HMAC hash is computed here using AUTH_CODE_SECRET; the plaintext code
 * and the secret are never passed to Postgres.
 *
 * Returns true only if the RPC confirms a successful, non-concurrent claim.
 */
export async function verifyUserCode(email: string, code: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim()
  let submittedHash: string
  try {
    submittedHash = hashCode(normalizedEmail, code)
  } catch {
    // AUTH_CODE_SECRET is not set or hashCode failed — already logged in hashCode
    return false
  }

  const { data, error } = await getAdmin()
    .rpc('verify_user_otp_code', { p_email: normalizedEmail, p_submitted_hash: submittedHash })

  if (error) {
    console.error('[user-codes] rpc verify_user_otp_code failed')
    return false
  }

  return data === true
}
