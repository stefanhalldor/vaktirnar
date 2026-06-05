'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

export default function AuthMvpLoginPage() {
  const t = useTranslations('teskeid.auth')
  const tAuth = useTranslations('auth')
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(tAuth('errors.invalidCredentials'))
      setLoading(false)
      return
    }

    router.push('/auth-mvp/minn-profill')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#fbf9f4] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs text-[#72796e] mb-1">{t('mvpLabel')}</p>
          <h1 className="text-2xl font-semibold text-[#154212]">Teskeið</h1>
        </div>
        <div className="bg-white border border-black/5 rounded-2xl shadow-sm p-6">
          <h2 className="mb-6 text-center text-xl font-semibold text-[#154212]">{t('loginTitle')}</h2>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[#42493e]">{tAuth('email')}</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[#42493e]">{tAuth('password')}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 h-10 rounded-xl bg-[#154212] text-white text-sm font-medium hover:bg-[#2d5a27] transition-colors disabled:opacity-50"
            >
              {loading ? tAuth('loggingIn') : tAuth('login')}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-500">
            {t('noAccount')}{' '}
            <Link href="/auth-mvp/nyr-adgangur" className="font-medium text-[#154212] hover:underline">
              {tAuth('signup')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
