import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { TeskeidLoginForm } from '@/components/teskeid/TeskeidLoginForm'
import { createClient } from '@/lib/supabase/server'
import { isAuthMvpAllowedEmail } from '@/lib/auth/allowlist'

export const metadata: Metadata = {
  title: 'Innskráning | Teskeið',
}

export default async function InnskraningPage() {
  if (process.env.AUTH_MVP_ENABLED === 'true') {
    let allowlisted = false
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        allowlisted = await isAuthMvpAllowedEmail(user.email.toLowerCase().trim())
      }
    } catch {
      // Supabase unavailable — show form, never expose whitelist status
    }
    if (allowlisted) redirect('/auth-mvp/heim')
  }
  return <TeskeidLoginForm />
}
