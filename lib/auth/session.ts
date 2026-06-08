import 'server-only'
import { getAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function createAdminSession(email: string): Promise<{ error?: string }> {
  // Ensure user exists in Supabase Auth
  const { error: createError } = await getAdmin().auth.admin.createUser({
    email,
    email_confirm: true,
  })

  // Ignore "already registered" error
  if (createError && !createError.message.includes('already been registered') && !createError.message.includes('already registered')) {
    console.error('[createAdminSession] createUser failed')
    return { error: 'session_error' }
  }

  // Generate a magic link server-side
  const { data: linkData, error: linkError } = await getAdmin().auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('[createAdminSession] generateLink failed')
    return { error: 'session_error' }
  }

  // Exchange the token for a session using the SSR client (sets cookies)
  const supabase = await createClient()
  const { error: otpError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  })

  if (otpError) {
    console.error('[createAdminSession] verifyOtp failed')
    return { error: 'session_error' }
  }

  return {}
}

/**
 * Create a Supabase session for a Teskeið user after email OTP verification.
 * Creates the user if new (email_confirm: true), then generates a magic link
 * server-side and exchanges it immediately — the token never leaves the server.
 * Cookies are set via the SSR client (httpOnly, Secure).
 */
export async function createUserSession(email: string): Promise<{ error?: string }> {
  // Create user if new; ignore "already registered"
  const { error: createError } = await getAdmin().auth.admin.createUser({
    email,
    email_confirm: true,
  })

  if (createError && !createError.message.includes('already been registered') && !createError.message.includes('already registered')) {
    console.error('[createUserSession] createUser failed')
    return { error: 'session_error' }
  }

  // Generate magic link server-side — Supabase does NOT send an email for this call
  const { data: linkData, error: linkError } = await getAdmin().auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('[createUserSession] generateLink failed')
    return { error: 'session_error' }
  }

  // Exchange token for session server-side — token never sent to client
  const supabase = await createClient()
  const { error: otpError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  })

  if (otpError) {
    console.error('[createUserSession] verifyOtp failed')
    return { error: 'session_error' }
  }

  return {}
}
