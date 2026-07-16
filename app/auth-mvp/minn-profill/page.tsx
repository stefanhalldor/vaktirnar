'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { resolveSafeLoginNext } from '@/lib/auth/loginNext'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
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
  const [facebookAllowed, setFacebookAllowed] = useState(false)
  const [facebookConnected, setFacebookConnected] = useState(false)
  const [facebookStatus, setFacebookStatus] = useState<'idle' | 'linking' | 'unlinking'>('idle')
  const [facebookError, setFacebookError] = useState('')

  const loadProfile = useCallback(async () => {
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
        setFacebookAllowed(data.facebook_oauth_allowed ?? false)
        setFacebookConnected(data.facebook_connected ?? false)
      } else {
        setError(tCommon('error'))
      }
    } catch {
      setError(tCommon('error'))
    } finally {
      setLoading(false)
    }
  }, [router, tCommon])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  // Detect OAuth return from Facebook linking
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const fb = sp.get('facebook')
    if (!fb) return

    const url = new URL(window.location.href)
    url.searchParams.delete('facebook')
    window.history.replaceState({}, '', url.toString())

    if (fb === 'linked') {
      loadProfile()
    } else {
      setFacebookError(t('facebook.error'))
    }
  }, [loadProfile, t])

  async function handleFacebookLink() {
    setFacebookStatus('linking')
    setFacebookError('')
    const supabase = createClient()
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: 'facebook',
      options: {
        redirectTo:
          `${window.location.origin}/auth/callback` +
          `?next=${encodeURIComponent('/auth-mvp/minn-profill?facebook=linked')}`,
      },
    })
    if (linkError) {
      setFacebookError(t('facebook.error'))
      setFacebookStatus('idle')
    }
    // No else — successful linkIdentity redirects the page to Facebook
  }

  async function handleFacebookUnlink() {
    setFacebookStatus('unlinking')
    setFacebookError('')
    const res = await fetch('/api/teskeid/profile/facebook', { method: 'POST' })
    if (res.ok) {
      setFacebookConnected(false)
    } else {
      setFacebookError(t('facebook.unlinkError'))
    }
    setFacebookStatus('idle')
  }

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
      const nextParam = new URLSearchParams(window.location.search).get('next')
      const safeNext = nextParam ? resolveSafeLoginNext(nextParam) : null
      router.push(safeNext ?? '/auth-mvp/heim')
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
          <TeskeidMenu variant="authenticated" />
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
                  className="h-10 rounded-xl border border-gray-200 px-3 text-base outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-[#42493e]">{t('email')}</span>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="h-10 rounded-xl border border-gray-100 bg-gray-50 px-3 text-base text-gray-500 outline-none cursor-default"
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

            {/* ── Facebook section ──────────────────────────────── */}
            {facebookAllowed && (
              <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-[#42493e]">
                    {t('facebook.title')}
                  </span>
                  <span className="text-sm text-[#72796e]">
                    {facebookConnected
                      ? t('facebook.connected')
                      : t('facebook.notConnected')}
                  </span>
                </div>
                {facebookError && (
                  <p className="text-sm text-red-600">{facebookError}</p>
                )}
                {facebookConnected ? (
                  <button
                    type="button"
                    onClick={handleFacebookUnlink}
                    disabled={facebookStatus !== 'idle'}
                    className="w-full h-10 rounded-xl border border-gray-200 text-[#42493e] text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {facebookStatus === 'unlinking'
                      ? t('facebook.unlinking')
                      : t('facebook.unlink')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleFacebookLink}
                    disabled={facebookStatus !== 'idle'}
                    className="w-full h-10 rounded-xl border border-gray-200 text-[#42493e] text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {facebookStatus === 'linking'
                      ? t('facebook.linking')
                      : t('facebook.link')}
                  </button>
                )}
              </div>
            )}

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
