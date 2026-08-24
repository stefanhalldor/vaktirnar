'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'
import { isSafeBookingLoginNext } from '@/lib/auth/loginNext'
import { USER_CODE_RESEND_WINDOW_SECONDS } from '@/lib/auth/user-code-policy'

type Step = 'email' | 'code'
// Milliseconds before showing a "code may take a moment" hint on the email step.
const SLOW_EMAIL_HINT_MS = 8_000
// A bounded request prevents a lost network response from leaving resend
// permanently locked. A timeout is classified as uncertain because the server
// may still have completed the request.
const REQUEST_CODE_TIMEOUT_MS = 30_000

type CodeNoticeKind = 'success' | 'warning'

export function TeskeidLoginForm({ logoHref = '/', nextHref }: { logoHref?: string; nextHref?: string }) {
  const t = useTranslations('teskeid.auth')
  const router = useRouter()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [codeNotice, setCodeNotice] = useState('')
  const [codeNoticeKind, setCodeNoticeKind] = useState<CodeNoticeKind>('success')
  const [showSlowHint, setShowSlowHint] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null)
  const [resendLoading, setResendLoading] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)
  // Prevents double-submit within a single tab before React disables the button.
  const requestInFlight = useRef(false)
  const slowHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (resendAvailableAt === null) return

    const syncCountdown = () => {
      const remaining = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000))
      setResendCountdown(remaining)
      if (remaining === 0) setResendAvailableAt(null)
    }

    syncCountdown()
    const timer = window.setInterval(syncCountdown, 1000)
    window.addEventListener('focus', syncCountdown)
    document.addEventListener('visibilitychange', syncCountdown)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', syncCountdown)
      document.removeEventListener('visibilitychange', syncCountdown)
    }
  }, [resendAvailableAt])

  useEffect(() => {
    if (step === 'code' && !resendLoading) {
      codeInputRef.current?.focus()
    }
  }, [step, resendLoading])

  function fallbackResendDeadline(): number {
    return Date.now() + USER_CODE_RESEND_WINDOW_SECONDS * 1000
  }

  function responseResendDeadline(data: Record<string, unknown>): number {
    const serverNow = typeof data.serverNow === 'string' ? Date.parse(data.serverNow) : Number.NaN
    const availableAt = typeof data.resendAvailableAt === 'string'
      ? Date.parse(data.resendAvailableAt)
      : Number.NaN
    const serverDelay = availableAt - serverNow
    const maximumExpectedDelay = (USER_CODE_RESEND_WINDOW_SECONDS + 5) * 1000

    // Convert the server-authored window to a local absolute deadline so a
    // skewed device clock cannot make resend unlock early or remain locked.
    if (Number.isFinite(serverDelay) && serverDelay >= 0 && serverDelay <= maximumExpectedDelay) {
      return Date.now() + serverDelay
    }
    return fallbackResendDeadline()
  }

  function startResendCooldown(deadline: number) {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    setResendCountdown(remaining)
    setResendAvailableAt(remaining > 0 ? deadline : null)
  }

  function formatRetryTime(isoString: string): string {
    return new Date(isoString).toLocaleTimeString('is-IS', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Atlantic/Reykjavik',
    })
  }

  type RequestCodeResult =
    | { status: 'ok'; delivery: 'active' | 'uncertain'; resendAvailableAt: number }
    | { status: 'rate_limited'; retryAfter: string }
    | { status: 'failed' }
    | { status: 'uncertain'; resendAvailableAt: number }

  async function requestCode(targetEmail: string): Promise<RequestCodeResult> {
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | null = null
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort()
          reject(new Error('request_code_timeout'))
        }, REQUEST_CODE_TIMEOUT_MS)
      })
      const responsePromise = (async () => {
        const res = await fetch('/api/auth-mvp/request-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: targetEmail }),
          signal: controller.signal,
        })
        // Keep response parsing inside the bounded operation too. A response
        // whose body never finishes must not leave the resend action locked.
        const rawData = typeof res.json === 'function'
          ? await res.json().catch(() => ({}))
          : {}
        const data = rawData && typeof rawData === 'object'
          ? rawData as Record<string, unknown>
          : {}
        return { res, data }
      })()
      const { res, data } = await Promise.race([responsePromise, timeoutPromise])

      // Missing response metadata is not a network exception and must not turn
      // a definitive HTTP rejection into an "email may have been sent" outcome.
      if (!res.ok) {
        if (data.success === false) return { status: 'failed' }
        return [408, 425, 502, 503, 504].includes(res.status)
          ? { status: 'uncertain', resendAvailableAt: fallbackResendDeadline() }
          : { status: 'failed' }
      }
      if (data.success !== true) {
        return { status: 'uncertain', resendAvailableAt: fallbackResendDeadline() }
      }
      if (data.rateLimited === true) {
        return typeof data.retryAfter === 'string' && Number.isFinite(Date.parse(data.retryAfter))
          ? { status: 'rate_limited', retryAfter: data.retryAfter }
          : { status: 'uncertain', resendAvailableAt: fallbackResendDeadline() }
      }
      return {
        status: 'ok',
        delivery: data.delivery === 'uncertain' ? 'uncertain' : 'active',
        resendAvailableAt: responseResendDeadline(data),
      }
    } catch {
      return { status: 'uncertain', resendAvailableAt: fallbackResendDeadline() }
    } finally {
      if (timeout !== null) clearTimeout(timeout)
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
    setCodeNoticeKind('warning')
    setStep('code')
    startResendCooldown(result.resendAvailableAt)
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
      const destination = hasName
        ? (nextHref ?? '/auth-mvp/heim')
        : `/auth-mvp/minn-profill${nextHref ? `?next=${encodeURIComponent(nextHref)}` : ''}`
      if (hasName && isSafeBookingLoginNext(nextHref)) {
        window.location.assign(destination)
        return
      }
      router.push(destination)
      router.refresh()
    } catch {
      setError(t('genericError'))
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendCountdown > 0 || loading || resendLoading || requestInFlight.current) return
    requestInFlight.current = true
    setResendLoading(true)
    setError('')
    setCodeNotice('')
    setCode('')
    try {
      const result = await requestCode(email)
      if (result.status === 'rate_limited') {
        setError(t('rateLimited', { time: formatRetryTime(result.retryAfter) }))
        return
      }
      if (result.status === 'failed') {
        setError(t('genericError'))
        return
      }
      if (result.status === 'uncertain' || result.delivery === 'uncertain') {
        setCodeNoticeKind('warning')
        setCodeNotice(t('deliveryUncertain'))
      } else {
        setCodeNoticeKind('success')
        setCodeNotice(t('resendRequested'))
      }
      startResendCooldown(result.resendAvailableAt)
    } catch {
      setError(t('genericError'))
    } finally {
      requestInFlight.current = false
      setResendLoading(false)
    }
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
                <p
                  className={`mb-4 rounded-xl border px-3 py-2 text-sm leading-relaxed ${
                    codeNoticeKind === 'warning'
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : 'border-[#b7d7b2] bg-[#f2f8f0] text-[#154212]'
                  }`}
                  role="status"
                >
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
                    disabled={loading || resendLoading}
                    required
                    className="h-12 rounded-xl border border-gray-200 px-3 text-xl text-center font-mono tracking-[0.4em] outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10 disabled:opacity-50"
                  />
                </label>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || resendLoading || code.length < 6}
                  className="mt-2 h-10 rounded-xl bg-[#154212] text-white text-sm font-medium hover:bg-[#2d5a27] transition-colors disabled:opacity-50"
                >
                  {loading ? t('verifying') : t('verify')}
                </button>
              </form>
              <div className="mt-4 flex justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setStep('email')
                    setCode('')
                    setError('')
                    setCodeNotice('')
                    setResendCountdown(0)
                    setResendAvailableAt(null)
                  }}
                  disabled={loading || resendLoading}
                  className="min-h-10 px-1 text-[#72796e] hover:text-[#154212] transition-colors disabled:opacity-50"
                >
                  {t('backToEmail')}
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCountdown > 0 || loading || resendLoading}
                  className="min-h-10 min-w-[10.5rem] px-1 text-right font-medium text-[#154212] hover:underline disabled:text-gray-300 disabled:no-underline transition-colors"
                >
                  {resendLoading
                    ? t('resending')
                    : resendCountdown > 0
                      ? t('resendIn', { seconds: resendCountdown })
                      : t('resend')}
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
