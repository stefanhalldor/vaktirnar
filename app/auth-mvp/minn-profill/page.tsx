'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Home } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AuthMvpProfilePage() {
  const t = useTranslations('teskeid.profile')
  const tAuth = useTranslations('teskeid.auth')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/teskeid/profile')
        if (res.status === 401) {
          router.replace('/auth-mvp/innskraning')
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
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      setError(t('errors.saveFailed'))
    }
    setSaving(false)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth-mvp/innskraning')
  }

  return (
    <div className="min-h-screen bg-[#fbf9f4]">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 flex items-center px-5 h-14 border-b border-border bg-background">
        <Link
          href="/auth-mvp/heim"
          className="flex items-center justify-center w-10 h-10 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          aria-label={t('homeLink')}
          title={t('homeLink')}
        >
          <Home size={20} aria-hidden />
        </Link>
      </header>

      {/* ── Main ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-[#72796e]">{tCommon('loading')}</p>
        </div>
      ) : (
        <div className="flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-sm">
            <div className="mb-8 text-center">
              <p className="text-xs text-[#72796e] mb-1">{tAuth('mvpLabel')}</p>
              <h1 className="text-2xl font-semibold text-[#154212]">Teskeið</h1>
            </div>
            <div className="bg-white border border-black/5 rounded-2xl shadow-sm p-6">
              <h2 className="mb-6 text-xl font-semibold text-[#154212]">{t('title')}</h2>
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
                  {saving ? t('saving') : saved ? t('saved') : t('save')}
                </button>
              </form>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-3 w-full h-10 rounded-xl border border-gray-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
              >
                {t('logout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
