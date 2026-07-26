'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'

type Step = 'email' | 'code'
// Must align with DEDUPE_WINDOW_SECONDS in lib/auth/user-codes.ts (120s).
// If a user resends within this window, the server suppresses a new code
// to avoid invalidating the one already in transit.
const RESEND_COOLDOWN = 120
// Milliseconds before showing a "code may take a moment" hint on the email step.
const SLOW_EMAIL_HINT_MS = 8_000

export function TeskeidLoginForm({ logoHref = '/', nextHref }: { logoHref?: string; nextHref?: string }) {
  const t = useTranslations('teskeid.auth')
  const router = useRouter()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [codeNotice, setCodeNotice] = useState('')
  const [showSlowHint, setShowSlowHint] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const codeInputRef = useRef<HTMLInputElement>(null)
  // Prevents double-submit within a single tab before React disables the button.
  const requestInFlight = useRef(false)
  const slowHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  type RequestCodeResult =
    | { status: 'ok'; delivery: 'active' | 'uncertain' }
    | { status: 'rate_limited'; retryAfter: string }
    | { status: 'failed' }
    | { status: 'uncertain' }

  async function requestCode(targetEmail: string): Promise<RequestCodeResult> {
    try {
      const res = await fetch('/api/auth-mvp/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      })
      // A real Fetch Response has json(), but guards/mocks/proxies can return a
      // response-shaped object without it. Missing response metadata is not a
      // network exception and must not turn a definitive HTTP rejection into
      // an "email may have been sent" outcome.
      const data = typeof res.json === 'function'
        ? await res.json().catch(() => ({}))
        : {}
      if (!res.ok) {
        if (data.success === false) return { status: 'failed' }
        return [408, 425, 502, 503, 504].includes(res.status)
          ? { status: 'uncertain' }
          : { status: 'failed' }
      }
      if (data.rateLimited && data.retryAfter) {
        return { status: 'rate_limited', retryAfter: data.retryAfter }
      }
      return {
        status: 'ok',
        delivery: data.delivery === 'uncertain' ? 'uncertain' : 'active',
      }
    } catch {
      return { status: 'uncertain' }
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (requestInFlight.current) return
    requestInFlight.current = true
    setLoading(true)
    setError('')
    setShowSlowHint(false)
    slowHintTimer.current = setTimeout(() => setShowSlowHint(true), SLOW_EMAIL_HINT_MS)
    const result = await requestCode(email)
    if (slowHintTimer.current) {
      clearTimeout(slowHintTimer.current)
      slowHintTimer.current = null
    }
    setShowSlowHint(false)
    if (result.status === 'rate_limited') {
      setError(t('rateLimited', { time: formatRetryTime(result.retryAfter) }))
      setLoading(false)
      requestInFlight.current = false
      return
    }
    if (result.status === 'failed') {
      setError(t('genericError'))
      setLoading(false)
      requestInFlight.current = false
      return
    }
    setCodeNotice(
      result.status === 'uncertain' || result.delivery === 'uncertain'
        ? t('deliveryUncertain')
        : '',
    )
    setStep('code')
    setResendCountdown(RESEND_COOLDOWN)
    setLoading(false)
    requestInFlight.current = false
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
      router.push(hasName
        ? (nextHref ?? '/auth-mvp/heim')
        : `/auth-mvp/minn-profill${nextHref ? `?next=${encodeURIComponent(nextHref)}` : ''}`
      )
      router.refresh()
    } catch {
      setError(t('genericError'))
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendCountdown > 0 || requestInFlight.current) return
    requestInFlight.current = true
    setError('')
    setCodeNotice('')
    setCode('')
    const result = await requestCode(email)
    requestInFlight.current = false
    if (result.status === 'rate_limited') {
      setError(t('rateLimited', { time: formatRetryTime(result.retryAfter) }))
      return
    }
    if (result.status === 'failed') {
      setError(t('genericError'))
      return
    }
    if (result.status === 'uncertain' || result.delivery === 'uncertain') {
      setCodeNotice(t('deliveryUncertain'))
    }
    setResendCountdown(RESEND_COOLDOWN)
    codeInputRef.current?.focus()
  }

  return (
    <div className="grow bg-[#fbf9f4] flex justify-center px-4 pt-8 pb-10">
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
                {loading && showSlowHint && (
                  <p className="text-xs text-[#72796e]">{t('slowEmailHint')}</p>
                )}
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
              <p className={`${codeNotice ? 'mb-2' : 'mb-6'} text-center text-sm text-[#72796e]`}>{t('emailSubmitted', { email })}</p>
              {codeNotice && (
                <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900" role="status">
                  {codeNotice}
                </p>
              )}
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
                  onClick={() => { setStep('email'); setCode(''); setError(''); setCodeNotice('') }}
                  className="min-h-10 px-1 text-[#72796e] hover:text-[#154212] transition-colors"
                >
                  {t('backToEmail')}
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCountdown > 0}
                  className="min-h-10 px-1 font-medium text-[#154212] hover:underline disabled:text-gray-300 disabled:no-underline transition-colors"
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
