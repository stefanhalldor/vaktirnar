import 'server-only'
// Reuse hashing and code generation from codes.ts — no duplication
import { hashCode, generateCode } from '@/lib/auth/codes'
import { getAdmin } from '@/lib/supabase/admin'

const MAX_CODES_PER_HOUR = 20
const CODE_TTL_MINUTES = 10

export type CreateCodeResult =
  | string                                          // plaintext code — send to user
  | { rateLimited: true; retryAfter: string }       // ISO timestamp when window clears

/**
 * Generate and store a new OTP code for the given email.
 * Returns the plaintext code, a rateLimited object with retryAfter time, or
 * null on DB error.
 * The code is stored only as an HMAC-SHA256 hash — never plaintext.
 */
export async function createUserCode(email: string): Promise<CreateCodeResult | null> {
  // Clean up codes older than 24h
  await getAdmin()
    .from('auth_email_codes')
    .delete()
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  // Rate limit: fetch codes in the current 1-hour window, oldest first so we
  // can calculate exactly when the window clears for the user-facing message.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: recentCodes, error: rateError } = await getAdmin()
    .from('auth_email_codes')
    .select('created_at')
    .eq('email', email)
    .gte('created_at', oneHourAgo)
    .order('created_at', { ascending: true })

  if (!rateError && (recentCodes?.length ?? 0) >= MAX_CODES_PER_HOUR) {
    const oldestCreatedAt = recentCodes?.[0]?.created_at
    const retryAfter = new Date(
      (oldestCreatedAt ? new Date(oldestCreatedAt).getTime() : Date.now()) + 60 * 60 * 1000
    ).toISOString()
    return { rateLimited: true, retryAfter }
  }

  const code = generateCode()
  const code_hash = hashCode(email, code)
  const expires_at = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString()

  const { error } = await getAdmin()
    .from('auth_email_codes')
    .insert({ email, code_hash, expires_at })

  if (error) {
    console.error('[user-codes] insert error (no code or user data logged)')
    return null
  }

  return code
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
