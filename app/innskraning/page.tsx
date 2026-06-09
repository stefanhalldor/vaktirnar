import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { TeskeidLoginForm } from '@/components/teskeid/TeskeidLoginForm'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Innskráning | Teskeið',
}

export default async function InnskraningPage() {
  if (process.env.AUTH_MVP_ENABLED === 'true') {
    let hasSession = false
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      hasSession = !!user?.email
    } catch {
      // Supabase unavailable — show form
    }
    if (hasSession) redirect('/auth-mvp/heim')
  }
  return (
    <div className="relative">
      <div className="absolute top-3 right-3 z-10">
        <TeskeidMenu variant="public" />
      </div>
      <TeskeidLoginForm logoHref="/" />
    </div>
  )
}
