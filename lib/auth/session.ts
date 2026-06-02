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
    console.error('[createAdminSession] createUser error:', createError.message)
    return { error: 'session_error' }
  }

  // Generate a magic link server-side
  const { data: linkData, error: linkError } = await getAdmin().auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('[createAdminSession] generateLink error:', linkError?.message)
    return { error: 'session_error' }
  }

  // Exchange the token for a session using the SSR client (sets cookies)
  const supabase = await createClient()
  const { error: otpError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  })

  if (otpError) {
    console.error('[createAdminSession] verifyOtp error:', otpError.message)
    return { error: 'session_error' }
  }

  return {}
}
