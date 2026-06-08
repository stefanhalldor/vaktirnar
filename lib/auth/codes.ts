import 'server-only'
import { createHmac, randomInt } from 'crypto'
import { getAdmin } from '@/lib/supabase/admin'

const MAX_CODES_PER_HOUR = 5
const CODE_TTL_MINUTES = 10

export function generateCode(): string {
  return randomInt(100000, 1000000).toString().padStart(6, '0')
}

export function hashCode(email: string, code: string): string {
  const secret = process.env.AUTH_CODE_SECRET
  if (!secret) {
    console.error('[auth/codes] AUTH_CODE_SECRET is not set')
    throw new Error('AUTH_CODE_SECRET is not configured')
  }
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    console.error('[auth/codes] AUTH_CODE_SECRET is too short')
    throw new Error('AUTH_CODE_SECRET must be at least 32 bytes')
  }
  return createHmac('sha256', secret)
    .update(email.toLowerCase() + ':' + code)
    .digest('hex')
}

export async function createLoginCode(email: string): Promise<string | null> {
  // Clean up old codes (>24h) first
  await getAdmin()
    .from('admin_login_codes')
    .delete()
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  // Rate limit: max 5 codes per email per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await getAdmin()
    .from('admin_login_codes')
    .select('*', { count: 'exact', head: true })
    .eq('email', email)
    .gte('created_at', oneHourAgo)

  if ((count ?? 0) >= MAX_CODES_PER_HOUR) {
    return null // silently rate-limited
  }

  const code = generateCode()
  const code_hash = hashCode(email, code)
  const expires_at = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString()

  const { error } = await getAdmin().from('admin_login_codes').insert({
    email,
    code_hash,
    expires_at,
  })

  if (error) return null
  return code
}

/**
 * Verify a submitted code against the latest active admin login code.
 *
 * Delegates all atomicity guarantees to the verify_admin_otp_code Postgres RPC:
 * - Row is locked with FOR UPDATE before any mutation
 * - Attempts increment and used_at are set in a single transaction
 * - Concurrent correct submissions produce exactly one true result
 *
 * The HMAC hash is computed here using AUTH_CODE_SECRET; the plaintext code
 * and the secret are never passed to Postgres.
 *
 * Returns true only if the RPC confirms a successful, non-concurrent claim.
 */
export async function verifyLoginCode(
  email: string,
  code: string
): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim()
  let submittedHash: string
  try {
    submittedHash = hashCode(normalizedEmail, code)
  } catch {
    // AUTH_CODE_SECRET is not set or hashCode failed — already logged in hashCode
    return false
  }

  const { data, error } = await getAdmin()
    .rpc('verify_admin_otp_code', { p_email: normalizedEmail, p_submitted_hash: submittedHash })

  if (error) {
    console.error('[auth/codes] rpc verify_admin_otp_code failed')
    return false
  }

  return data === true
}
