import 'server-only'
import { timingSafeEqual } from 'crypto'
// Reuse hashing and code generation from codes.ts — no duplication
import { hashCode, generateCode } from '@/lib/auth/codes'
import { getAdmin } from '@/lib/supabase/admin'

const MAX_CODES_PER_HOUR = 5
const MAX_ATTEMPTS_PER_CODE = 5
const CODE_TTL_MINUTES = 10

/**
 * Generate and store a new OTP code for the given email.
 * Returns the plaintext code (to be emailed), or null if rate-limited or on error.
 * The code is stored only as an HMAC-SHA256 hash — never plaintext.
 */
export async function createUserCode(email: string): Promise<string | null> {
  // Clean up codes older than 24h
  await getAdmin()
    .from('auth_email_codes')
    .delete()
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  // Rate limit: max 5 codes per email per hour (silently deny if exceeded)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await getAdmin()
    .from('auth_email_codes')
    .select('*', { count: 'exact', head: true })
    .eq('email', email)
    .gte('created_at', oneHourAgo)

  if ((count ?? 0) >= MAX_CODES_PER_HOUR) {
    return null
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
 * - Pre-increments attempt counter before comparison (prevents timing oracle)
 * - Uses timing-safe comparison
 * - Marks code as used on success
 * Returns true only if code is valid, unexpired, and within attempt limit.
 */
export async function verifyUserCode(email: string, code: string): Promise<boolean> {
  const { data: rows } = await getAdmin()
    .from('auth_email_codes')
    .select('id, code_hash, attempts')
    .eq('email', email)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)

  if (!rows || rows.length === 0) return false

  const row = rows[0]

  if (row.attempts >= MAX_ATTEMPTS_PER_CODE) return false

  // TODO: move attempts increment + used_at update into a single Postgres RPC/transaction
  // to make verification atomic before this route goes public. Currently two separate
  // writes — acceptable for hidden MVP but a race condition under concurrent requests.

  // Increment attempts before comparison — always, regardless of outcome
  await getAdmin()
    .from('auth_email_codes')
    .update({ attempts: row.attempts + 1 })
    .eq('id', row.id)

  // Timing-safe comparison
  const expected = Buffer.from(row.code_hash, 'hex')
  const actual = Buffer.from(hashCode(email, code), 'hex')

  if (expected.length !== actual.length) return false
  const valid = timingSafeEqual(expected, actual)

  if (valid) {
    await getAdmin()
      .from('auth_email_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', row.id)
  }

  return valid
}
