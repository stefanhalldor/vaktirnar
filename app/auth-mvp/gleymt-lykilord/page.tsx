'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

export default function AuthMvpForgotPasswordPage() {
  const t = useTranslations('teskeid.auth')
  const tAuth = useTranslations('auth')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth-mvp/nytt-lykilord`,
    })

    if (error) {
      setError(t('genericError'))
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-[#fbf9f4] flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white border border-black/5 rounded-2xl shadow-sm p-8 text-center">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-xl font-semibold text-[#154212] mb-2">{t('resetLinkSent')}</h2>
          <p className="text-sm text-gray-500">{email}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fbf9f4] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs text-[#72796e] mb-1">{t('mvpLabel')}</p>
          <h1 className="text-2xl font-semibold text-[#154212]">Teskeið</h1>
        </div>
        <div className="bg-white border border-black/5 rounded-2xl shadow-sm p-6">
          <h2 className="mb-2 text-center text-xl font-semibold text-[#154212]">{t('forgotPasswordTitle')}</h2>
          <p className="mb-6 text-center text-sm text-gray-500">{t('forgotPasswordDesc')}</p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 h-10 rounded-xl bg-[#154212] text-white text-sm font-medium hover:bg-[#2d5a27] transition-colors disabled:opacity-50"
            >
              {loading ? t('sendingResetLink') : t('sendResetLink')}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-500">
            <Link href="/auth-mvp/innskraning" className="font-medium text-[#154212] hover:underline">
              {t('backToLogin')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
