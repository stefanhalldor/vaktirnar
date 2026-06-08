'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Home } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'

export default function AuthMvpProfilePage() {
  const t = useTranslations('teskeid.profile')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/teskeid/profile')
        if (res.status === 401) {
          router.replace('/innskraning')
          return
        }
        if (res.ok) {
          const data = await res.json()
          setDisplayName(data.display_name ?? '')
          setEmail(data.email ?? '')
        } else {
          setError(tCommon('error'))
        }
      } catch {
        setError(tCommon('error'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router, tCommon])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/teskeid/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName.trim() }),
    })
    if (res.ok) {
      router.push('/auth-mvp/heim')
    } else {
      setError(t('errors.saveFailed'))
    }
    setSaving(false)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/innskraning')
  }

  return (
    <div className="min-h-screen bg-[#fbf9f4]">
      <main className="max-w-lg mx-auto px-4 pt-6 pb-10 flex flex-col gap-6">

        {/* ── Nav row: title left, Home icon right ─────────────── */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base font-semibold text-[#154212]">{t('title')}</h1>
          <Link
            href="/auth-mvp/heim"
            className="flex items-center justify-center w-11 h-11 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label={t('homeLink')}
          >
            <Home size={20} aria-hidden />
          </Link>
        </div>

        {/* ── Content ──────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-8">
            <p className="text-sm text-[#72796e]">{tCommon('loading')}</p>
          </div>
        ) : (
          <div className="bg-white border border-black/5 rounded-2xl shadow-sm p-6 flex flex-col gap-3">
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-[#42493e]">{t('displayName')}</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={200}
                  className="h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-[#42493e]">{t('email')}</span>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="h-10 rounded-xl border border-gray-100 bg-gray-50 px-3 text-sm text-gray-500 outline-none cursor-default"
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={saving}
                className="mt-2 h-10 rounded-xl bg-[#154212] text-white text-sm font-medium hover:bg-[#2d5a27] transition-colors disabled:opacity-50"
              >
                {saving ? t('saving') : t('save')}
              </button>
            </form>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full h-10 rounded-xl border border-gray-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
            >
              {t('logout')}
            </button>
          </div>
        )}

        {/* ── Bottom logo — clickable, links to /auth-mvp/heim ── */}
        <div className="flex justify-center pt-4">
          <Link
            href="/auth-mvp/heim"
            aria-label={t('homeLink')}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#154212] focus-visible:ring-offset-2"
          >
            <TeskeidLogo size={160} decorative className="sm:hidden" />
            <TeskeidLogo size={200} decorative className="hidden sm:block" />
          </Link>
        </div>

      </main>
    </div>
  )
}
