'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

type Step = 'email' | 'code'
const RESEND_COOLDOWN = 60

export default function AuthMvpLoginPage() {
  const t = useTranslations('teskeid.auth')
  const tAuth = useTranslations('auth')
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

  // Returns true on 200, false on network failure or non-2xx (system error / flag off).
  // Does NOT distinguish rate-limited vs. email-not-found — that's intentional.
  async function requestCode(targetEmail: string): Promise<boolean> {
    try {
      const res = await fetch('/api/auth-mvp/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const ok = await requestCode(email)
    if (!ok) {
      setError(t('genericError'))
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

      router.push('/auth-mvp/heim')
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
    await requestCode(email)
    setResendCountdown(RESEND_COOLDOWN)
    codeInputRef.current?.focus()
  }

  return (
    <div className="min-h-screen bg-[#fbf9f4] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs text-[#72796e] mb-1">{t('mvpLabel')}</p>
          <h1 className="text-2xl font-semibold text-[#154212]">Teskeið</h1>
        </div>
        <div className="bg-white border border-black/5 rounded-2xl shadow-sm p-6">
          {step === 'email' ? (
            <>
              <h2 className="mb-6 text-center text-xl font-semibold text-[#154212]">{t('loginTitle')}</h2>
              <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
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
              <p className="mb-6 text-center text-sm text-gray-500">{t('codeSent', { email })}</p>
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
      </div>
    </div>
  )
}
