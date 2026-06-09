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
    <>
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <div className="max-w-lg mx-auto px-4 pt-8 flex justify-end pointer-events-none">
          <div className="pointer-events-auto">
            <TeskeidMenu variant="public" />
          </div>
        </div>
      </div>
      <TeskeidLoginForm logoHref="/" />
    </>
  )
}
