'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'

type Step = 'email' | 'code'
const RESEND_COOLDOWN = 60

export function TeskeidLoginForm({ logoHref = '/' }: { logoHref?: string }) {
  const t = useTranslations('teskeid.auth')
  const router = useRouter()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendCountdown, setResendCountdown] = useState(0)
  const codeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (resendCountdown <= 0) return
    const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCountdown])

  useEffect(() => {
    if (step === 'code') {
      codeInputRef.current?.focus()
    }
  }, [step])

  function formatRetryTime(isoString: string): string {
    return new Date(isoString).toLocaleTimeString('is-IS', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Atlantic/Reykjavik',
    })
  }

  type RequestCodeResult = { ok: true } | { ok: false; rateLimited: true; retryAfter: string } | { ok: false; rateLimited?: false }

  async function requestCode(targetEmail: string): Promise<RequestCodeResult> {
    try {
      const res = await fetch('/api/auth-mvp/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      })
      if (!res.ok) return { ok: false }
      const data = await res.json().catch(() => ({}))
      if (data.rateLimited && data.retryAfter) {
        return { ok: false, rateLimited: true, retryAfter: data.retryAfter }
      }
      return { ok: true }
    } catch {
      return { ok: false }
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await requestCode(email)
    if (!result.ok) {
      if ('rateLimited' in result && result.rateLimited) {
        setError(t('rateLimited', { time: formatRetryTime(result.retryAfter) }))
      } else {
        setError(t('genericError'))
      }
      setLoading(false)
      return
    }
    setStep('code')
    setResendCountdown(RESEND_COOLDOWN)
    setLoading(false)
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth-mvp/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error === 'session_error' ? t('genericError') : t('invalidCode'))
        setLoading(false)
        return
      }

      const profileRes = await fetch('/api/teskeid/profile')
      const profileData = profileRes.ok ? await profileRes.json().catch(() => ({})) : {}
      const hasName = !!profileData.display_name?.trim()
      router.push(hasName ? '/auth-mvp/heim' : '/auth-mvp/minn-profill')
      router.refresh()
    } catch {
      setError(t('genericError'))
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendCountdown > 0) return
    setError('')
    setCode('')
    const result = await requestCode(email)
    if (!result.ok && 'rateLimited' in result && result.rateLimited) {
      setError(t('rateLimited', { time: formatRetryTime(result.retryAfter) }))
      return
    }
    setResendCountdown(RESEND_COOLDOWN)
    codeInputRef.current?.focus()
  }

  return (
    <div className="min-h-screen bg-[#fbf9f4] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs text-[#72796e] mb-3">{t('betaLabel')}</p>
          <h1 className="text-2xl font-semibold text-[#154212]">Teskeið.is</h1>
        </div>
        <div className="mb-5 flex justify-center">
          <span className="inline-flex items-center rounded-full bg-[#e9f4e6] px-4 py-1.5 text-sm font-semibold text-[#154212]">
            {t('freeAccessLabel')}
          </span>
        </div>
        <div className="bg-white border border-black/5 rounded-2xl shadow-sm p-6">
          {step === 'email' ? (
            <>
              <h2 className="mb-4 text-center text-xl font-semibold text-[#154212]">{t('loginTitle')}</h2>
              <p className="mb-5 text-sm text-[#72796e]">{t('emailHint')}</p>
              <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-[#42493e]">{t('emailLabel')}</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('emailPlaceholder')}
                    autoComplete="email"
                    required
                    className="h-10 rounded-xl border border-gray-200 px-3 text-base sm:text-sm outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10"
                  />
                </label>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 h-10 rounded-xl bg-[#154212] text-white text-sm font-medium hover:bg-[#2d5a27] transition-colors disabled:opacity-50"
                >
                  {loading ? t('continuing') : t('continue')}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="mb-2 text-center text-xl font-semibold text-[#154212]">{t('codeTitle')}</h2>
              <p className="mb-6 text-center text-sm text-[#72796e]">{t('emailSubmitted', { email })}</p>
              <form onSubmit={handleCodeSubmit} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-[#42493e]">{t('codeLabel')}</span>
                  <input
                    ref={codeInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    className="h-12 rounded-xl border border-gray-200 px-3 text-xl text-center font-mono tracking-[0.4em] outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10"
                  />
                </label>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || code.length < 6}
                  className="mt-2 h-10 rounded-xl bg-[#154212] text-white text-sm font-medium hover:bg-[#2d5a27] transition-colors disabled:opacity-50"
                >
                  {loading ? t('verifying') : t('verify')}
                </button>
              </form>
              <div className="mt-4 flex justify-between text-sm">
                <button
                  type="button"
                  onClick={() => { setStep('email'); setCode(''); setError('') }}
                  className="text-[#72796e] hover:text-[#154212] transition-colors"
                >
                  {t('backToEmail')}
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCountdown > 0}
                  className="font-medium text-[#154212] hover:underline disabled:text-gray-300 disabled:no-underline transition-colors"
                >
                  {resendCountdown > 0 ? t('resendIn', { seconds: resendCountdown }) : t('resend')}
                </button>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-center pt-6">
          <Link
            href={logoHref}
            aria-label="Teskeið"
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#154212] focus-visible:ring-offset-2"
          >
            <TeskeidLogo size={140} decorative className="sm:hidden" />
            <TeskeidLogo size={160} decorative className="hidden sm:block" />
          </Link>
        </div>
      </div>
    </div>
  )
}
