import 'server-only'
import { createHmac, timingSafeEqual, randomInt } from 'crypto'
import { getAdmin } from '@/lib/supabase/admin'

const MAX_CODES_PER_HOUR = 5
const MAX_ATTEMPTS_PER_CODE = 5
const CODE_TTL_MINUTES = 10

export function generateCode(): string {
  return randomInt(100000, 1000000).toString().padStart(6, '0')
}

export function hashCode(email: string, code: string): string {
  const secret = process.env.AUTH_CODE_SECRET!
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

export async function verifyLoginCode(
  email: string,
  code: string
): Promise<boolean> {
  // Find the most recent unexpired, unused code for this email
  const { data: rows } = await getAdmin()
    .from('admin_login_codes')
    .select('id, code_hash, attempts')
    .eq('email', email)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)

  if (!rows || rows.length === 0) return false

  const row = rows[0]

  // Reject if too many attempts
  if (row.attempts >= MAX_ATTEMPTS_PER_CODE) {
    return false
  }

  // Always increment attempts first (before timing-safe compare)
  await getAdmin()
    .from('admin_login_codes')
    .update({ attempts: row.attempts + 1 })
    .eq('id', row.id)

  // Timing-safe comparison
  const expected = Buffer.from(row.code_hash, 'hex')
  const actual = Buffer.from(hashCode(email, code), 'hex')

  if (expected.length !== actual.length) return false
  const valid = timingSafeEqual(expected, actual)

  if (valid) {
    await getAdmin()
      .from('admin_login_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', row.id)
  }

  return valid
}
